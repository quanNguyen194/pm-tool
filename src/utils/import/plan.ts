// Nhập danh sách use case từ bảng tính: dò cấu trúc (heuristic hoặc AI) -> kế hoạch (plan) -> bản xem trước -> dòng gửi lên DB.
// AI chỉ đề xuất KẾ HOẠCH (cột nào là gì, dòng tiêu đề nào là module/nhóm/nhãn); mọi dòng dữ liệu do code xử lý nên không thể bị bịa/mất.
import type { UseCase, UseCaseComplexity } from '../../types.ts';
import type { RawSheet } from './sheet.ts';

export type GroupRole = 'module' | 'group' | 'tag' | 'skip';
export const GROUP_ROLES: GroupRole[] = ['module', 'group', 'tag', 'skip'];
export const ROLE_LABEL: Record<GroupRole, string> = { module: 'Module', group: 'Nhóm', tag: 'Nhãn', skip: 'Bỏ qua' };

export type Field = 'label' | 'code' | 'title' | 'actor' | 'description' | 'necessity' | 'transactions' | 'complexity' | 'tags';
export const FIELDS: Field[] = ['label', 'code', 'title', 'actor', 'description', 'necessity', 'transactions', 'complexity', 'tags'];
export const FIELD_LABEL: Record<Field, string> = {
  label: 'STT / đánh số cấp',
  code: 'Mã use case',
  title: 'Tên use case',
  actor: 'Tác nhân',
  description: 'Mô tả / luồng',
  necessity: 'Mức độ cần thiết',
  transactions: 'Số transaction',
  complexity: 'Độ phức tạp',
  tags: 'Nhãn'
};

export type ColumnMap = Partial<Record<Field, number>>;
export type ImportMode = 'outline' | 'columns' | 'flat';

export interface ImportPlan {
  /** Chỉ số dòng tiêu đề (0-based); -1 nếu file không có dòng tiêu đề. */
  headerRow: number;
  mode: ImportMode;
  columns: ColumnMap;
  /** mode 'columns': các cột chứa tên module/nhóm/nhãn (từ lớn đến nhỏ). */
  groupColumns: { col: number; role: GroupRole }[];
  /** mode 'outline': vai trò của từng dòng tiêu đề (khóa = chỉ số dòng trong sheet). Dòng thiếu thì dùng mặc định đoán sẵn. */
  rowRoles: Record<number, GroupRole>;
  /** mode 'outline': đặt lại tên nhãn cho dòng có vai trò 'tag'. */
  rowTags: Record<number, string>;
}

// ------------------------------------------------------------------ tiện ích văn bản

export const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim();

const COMPLEXITY_WORDS: [RegExp, UseCaseComplexity][] = [
  [/^(don gian|simple|low|thap|s)$/, 'simple'],
  [/^(trung binh|medium|tb|vua|m)$/, 'medium'],
  [/^(phuc tap|complex|high|cao|kho|l)$/, 'complex']
];
export function parseComplexity(raw: string): UseCaseComplexity | undefined {
  const v = norm(raw);
  if (!v) return undefined;
  return COMPLEXITY_WORDS.find(([re]) => re.test(v))?.[1];
}

/** Tách "1. ...\n2. ..." thành danh sách bước; dòng không có số được nối vào bước trước. */
export function parseFlow(text: string): string[] {
  if (!text) return [];
  const steps: string[] = [];
  let numbered = false;
  for (const raw of text.replace(/\r/g, '').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const m = /^(\d+)\s*[.)]\s*(.*)$/.exec(line);
    if (m) {
      numbered = true;
      steps.push(m[2].trim());
    } else if (steps.length) steps[steps.length - 1] += ' ' + line;
    else steps.push(line);
  }
  if (!numbered) return []; // văn bản thường: giữ ở ô mô tả, không xé thành bước
  return steps.map((s, i) => `${i + 1}. ${oneLine(s)}`).filter(s => !/^\d+\.\s*$/.test(s));
}

// ------------------------------------------------------------------ dò tiêu đề cột

const HEADER_RULES: [RegExp, Field | 'ignore' | 'groupcol'][] = [
  [/^(stt|tt|no\.?|so thu tu|#)$/, 'label'],
  [/tac nhan phu|secondary actor|actor phu/, 'ignore'],
  [/tac nhan|actor/, 'actor'],
  [/mo ta|description|dien giai|luong chinh|luong su kien|main flow|kich ban|noi dung xu ly/, 'description'],
  [/muc do can thiet|can thiet|necessity/, 'necessity'],
  [/transaction|giao dich/, 'transactions'],
  [/phan loai|do phuc tap|muc do phuc tap|complexity/, 'complexity'],
  [/^(nhan|tags?|labels?)$/, 'tags'],
  [/^(ma|code|id|ma uc|ma use ?case|ma chuc nang|ma yeu cau|uc id|ma so)$/, 'code'],
  [/^(use ?case|usecase|uc|ten use ?case|ten usecase|ten uc|ten chuc nang|chuc nang|ten yeu cau|yeu cau|name|title|ten)$/, 'title'],
  [/^(module|phan he|linh vuc|nhom chuc nang|nhom|phan he\/module|module\/phan he)$/, 'groupcol']
];

export function classifyHeader(h: string): Field | 'ignore' | 'groupcol' | null {
  const v = norm(h);
  if (!v) return null;
  return HEADER_RULES.find(([re]) => re.test(v))?.[1] ?? null;
}

export interface HeaderGuess {
  row: number;
  columns: ColumnMap;
  groupCols: number[];
  score: number;
}

export function detectHeader(rows: string[][]): HeaderGuess {
  let best: HeaderGuess = { row: -1, columns: {}, groupCols: [], score: 0 };
  for (let r = 0; r < Math.min(rows.length, 40); r++) {
    const columns: ColumnMap = {};
    const groupCols: number[] = [];
    let score = 0;
    rows[r].forEach((cell, c) => {
      const f = classifyHeader(cell);
      if (!f || f === 'ignore') return;
      if (f === 'groupcol') {
        groupCols.push(c);
        score += 1;
      } else if (columns[f] === undefined) {
        columns[f] = c;
        score += 1;
      }
    });
    if (columns.title === undefined && groupCols.length === 0) continue;
    if (score >= 2 && score > best.score) best = { row: r, columns, groupCols, score };
  }
  if (best.row === -1) {
    // Không thấy dòng tiêu đề: lấy cột có văn bản dài nhất làm tên use case.
    const width = rows.reduce((w, r) => Math.max(w, r.length), 0);
    let col = 0;
    let bestLen = -1;
    for (let c = 0; c < width; c++) {
      const sample = rows.slice(0, 30).map(r => (r[c] ?? '').length);
      const avg = sample.reduce((a, b) => a + b, 0) / Math.max(1, sample.length);
      if (avg > bestLen) {
        bestLen = avg;
        col = c;
      }
    }
    best = { row: -1, columns: { title: col }, groupCols: [], score: 0 };
  }
  return best;
}

// ------------------------------------------------------------------ đánh số cấp (outline)

type LabelClass = 'alpha' | 'alphaDot' | 'roman' | 'romanDot' | 'numDot' | 'other';
const ROMAN_RE = /^[IVXL]+$/;
const romanValue = (s: string) => {
  const v: Record<string, number> = { I: 1, V: 5, X: 10, L: 50 };
  let total = 0;
  for (let i = 0; i < s.length; i++) {
    const cur = v[s[i]];
    const next = v[s[i + 1]] ?? 0;
    total += cur < next ? -cur : cur;
  }
  return total;
};

export function labelInfo(label: string): { cls: LabelClass; ord: number } {
  const l = label.trim();
  if (/^[A-Z]$/.test(l) && !ROMAN_RE.test(l)) return { cls: 'alpha', ord: l.charCodeAt(0) - 64 };
  if (ROMAN_RE.test(l)) return { cls: 'roman', ord: romanValue(l) };
  if (/^[IVXL]+(\.\d+)+$/.test(l)) return { cls: 'romanDot', ord: Number(l.split('.').pop()) };
  if (/^[A-Z](\.\d+)+$/.test(l)) return { cls: 'alphaDot', ord: Number(l.split('.').pop()) };
  if (/^\d+(\.\d+)+$/.test(l)) return { cls: 'numDot', ord: Number(l.split('.').pop()) };
  return { cls: 'other', ord: 0 };
}

export const isLeafLabel = (label: string) => /^\d+$/.test(label.trim());

export interface OutlineRow {
  row: number;
  label: string;
  title: string;
  cls: LabelClass;
  ord: number;
  /** Vai trò đoán sẵn theo quy luật đánh số. */
  defaultRole: GroupRole;
  /** Số use case trực tiếp ngay sau dòng này (đến dòng nhóm kế tiếp). */
  leafCount: number;
}

/** Danh sách dòng tiêu đề (module/nhóm) của sheet theo cột đánh số, kèm vai trò đoán sẵn. */
export function outlineRows(sheet: RawSheet, plan: Pick<ImportPlan, 'headerRow' | 'columns'>): OutlineRow[] {
  const { label: lc, title: tc } = plan.columns;
  if (lc === undefined || tc === undefined) return [];
  const list: OutlineRow[] = [];
  for (let r = plan.headerRow + 1; r < sheet.rows.length; r++) {
    const row = sheet.rows[r];
    const label = (row[lc] ?? '').trim();
    const title = oneLine(row[tc] ?? '');
    if (!label) continue;
    if (isLeafLabel(label)) {
      if (list.length) list[list.length - 1].leafCount++;
      continue;
    }
    const { cls, ord } = labelInfo(label);
    list.push({ row: r, label, title, cls, ord, defaultRole: 'group', leafCount: 0 });
  }
  list.forEach((g, i) => {
    const next = list[i + 1];
    const adjacent = !!next && g.leafCount === 0; // dòng kế là nhóm con/cùng cấp ngay sau, không có use case xen giữa
    const restart = adjacent && next.cls === 'roman' && next.ord === 1;
    const container = g.cls === 'alpha' || g.cls === 'alphaDot' || (g.cls === 'roman' && g.ord > 1 && restart);
    if (g.cls === 'romanDot' || g.cls === 'numDot' || g.cls === 'other') g.defaultRole = 'group';
    else if (g.cls === 'roman') g.defaultRole = container ? 'tag' : 'module';
    else {
      const nextIsContainer = adjacent && (next.cls === 'alpha' || next.cls === 'alphaDot');
      g.defaultRole = nextIsContainer ? 'skip' : 'tag';
    }
  });
  return list;
}

const TAG_PREFIXES = ['cac hang muc thuc hien tren', 'nhom chuc nang', 'phan he', 'chuc nang', 'module', 'linh vuc'];
export function tagFromTitle(title: string): string {
  let t = oneLine(title);
  const n = norm(t);
  for (const p of TAG_PREFIXES) {
    if (n.startsWith(p + ' ') && t.length > p.length + 1) {
      t = t.slice(p.length).trim();
      break;
    }
  }
  t = t.replace(/^(tren|cua|la)\s+/i, '');
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : oneLine(title);
}

// ------------------------------------------------------------------ kế hoạch mặc định (heuristic)

export function guessPlan(sheet: RawSheet): ImportPlan {
  const h = detectHeader(sheet.rows);
  const columns = h.columns;
  const base: ImportPlan = { headerRow: h.row, mode: 'flat', columns, groupColumns: [], rowRoles: {}, rowTags: {} };

  if (columns.label !== undefined && columns.title !== undefined) {
    const rows = outlineRows(sheet, base);
    const hasLeaves = sheet.rows.slice(h.row + 1).some(r => isLeafLabel(r[columns.label!] ?? ''));
    if (rows.length > 0 && hasLeaves) return { ...base, mode: 'outline' };
  }
  if (h.groupCols.length > 0 && columns.title !== undefined) {
    const roles: GroupRole[] = h.groupCols.length === 1 ? ['module'] : h.groupCols.length === 2 ? ['module', 'group'] : ['tag', 'module', 'group'];
    return { ...base, mode: 'columns', groupColumns: h.groupCols.map((col, i) => ({ col, role: roles[i] ?? 'group' })) };
  }
  // Cột đánh số không phải cấp bậc (1, 2, 3...) -> dùng làm mã nếu chưa có cột mã? Không: để người dùng quyết, mặc định bỏ qua.
  return base;
}

/** Áp dụng đề xuất của AI lên kế hoạch hiện có, chỉ nhận phần hợp lệ. */
export function mergeAiPlan(base: ImportPlan, sheet: RawSheet, ai: Partial<{ headerRow: number; mode: string; columns: Record<string, number | null>; groupColumns: { col: number; role: string }[] }>): ImportPlan {
  const width = sheet.rows.reduce((w, r) => Math.max(w, r.length), 0);
  const validCol = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n < width;
  const next: ImportPlan = { ...base, columns: { ...base.columns } };
  if (typeof ai.headerRow === 'number' && Number.isInteger(ai.headerRow) && ai.headerRow >= -1 && ai.headerRow < Math.min(sheet.rows.length, 60)) next.headerRow = ai.headerRow;
  if (ai.columns) {
    const cols: ColumnMap = {};
    for (const f of FIELDS) {
      const v = ai.columns[f];
      if (validCol(v)) cols[f] = v;
    }
    if (cols.title !== undefined) next.columns = cols;
  }
  if (ai.mode === 'outline' || ai.mode === 'columns' || ai.mode === 'flat') next.mode = ai.mode;
  if (Array.isArray(ai.groupColumns)) {
    next.groupColumns = ai.groupColumns
      .filter(g => validCol(g.col) && (GROUP_ROLES as string[]).includes(g.role))
      .map(g => ({ col: g.col, role: g.role as GroupRole }));
  }
  if (next.mode === 'outline' && (next.columns.label === undefined || next.columns.title === undefined)) next.mode = base.mode;
  if (next.mode === 'columns' && next.groupColumns.length === 0) next.mode = base.mode === 'columns' ? 'columns' : 'flat';
  next.rowRoles = {};
  next.rowTags = {};
  return next;
}

// ------------------------------------------------------------------ xem trước

export interface PreviewRow {
  ref: string;
  kind: 'group' | 'usecase';
  parentRef: string | null;
  /** Cha là use case/nhóm đã có trong dự án (khi gộp vào nhóm sẵn có). */
  parentId?: string;
  code: string;
  title: string;
  actor: string;
  description: string;
  mainFlow: string[];
  tags: string[];
  complexity?: UseCaseComplexity;
  transactions?: number;
  necessity: string;
  /** Số dòng trong sheet (bắt đầu từ 1) để người dùng đối chiếu. */
  srcRow: number;
  depth: 1 | 2 | 3;
  /** 'exists': đã có trong dự án (cùng tên trong cùng module) -> mặc định bỏ qua. */
  status: 'new' | 'exists';
  existingId?: string;
  warnings: string[];
}

export interface Preview {
  rows: PreviewRow[];
  /** Cảnh báo chung (dòng bị bỏ qua, nhóm rỗng...). */
  notes: string[];
  stats: { modules: number; groups: number; useCases: number; existing: number; skipped: number; warnings: number };
}

const NUM = /^-?\d+([.,]\d+)?$/;

export function buildPreview(sheet: RawSheet, plan: ImportPlan, existing: UseCase[] = []): Preview {
  const rows: PreviewRow[] = [];
  const notes: string[] = [];
  let skipped = 0;
  const cell = (row: string[], f: Field) => (plan.columns[f] === undefined ? '' : row[plan.columns[f]!] ?? '');

  // Bộ sinh mã: tiếp nối số lớn nhất đang có trong dự án để không trùng.
  const taken = new Set(existing.map(u => u.code));
  const counters: Record<string, number> = { UC: 0, MOD: 0, GRP: 0 };
  existing.forEach(u => {
    const m = /^(UC|MOD|GRP)-(\d+)$/.exec(u.code);
    if (m) counters[m[1]] = Math.max(counters[m[1]], Number(m[2]));
  });
  const nextCode = (prefix: 'UC' | 'MOD' | 'GRP') => {
    let code = '';
    do {
      counters[prefix]++;
      code = `${prefix}-${String(counters[prefix]).padStart(prefix === 'UC' ? 3 : 2, '0')}`;
    } while (taken.has(code));
    taken.add(code);
    return code;
  };
  const uniqueGivenCode = (given: string, row: PreviewRow) => {
    let code = given;
    let i = 2;
    while (taken.has(code)) code = `${given}-${i++}`;
    if (code !== given) row.warnings.push(`Mã "${given}" bị trùng, đổi thành ${code}`);
    taken.add(code);
    return code;
  };

  // Tra cứu use case đã có theo (cha, tên chuẩn hóa) để gộp thay vì tạo trùng.
  const existingKey = (parentId: string | null, title: string, kind: string) => `${parentId ?? ''}|${kind}|${norm(title)}`;
  const existingMap = new Map<string, UseCase>();
  existing.forEach(u => existingMap.set(existingKey(u.parentId ?? null, u.title, u.kind), u));

  let nextRef = 1;
  const newRef = () => `r${nextRef++}`;

  // Ngữ cảnh khi duyệt từ trên xuống.
  let curTag = '';
  let moduleNode: PreviewRow | null = null;
  let groupNode: PreviewRow | null = null;
  const tagModules = new Map<string, PreviewRow>(); // module tổng hợp theo nhãn cho use case "mồ côi"

  const place = (node: PreviewRow, parent: PreviewRow | null) => {
    node.parentRef = parent ? parent.ref : null;
    node.depth = (parent ? parent.depth + 1 : 1) as 1 | 2 | 3;
    if (parent?.status === 'exists' && parent.existingId) node.parentId = parent.existingId;
    // Gộp vào nhóm/use case đã có nếu trùng tên trong cùng cha đã có
    const parentExistingId = parent ? (parent.status === 'exists' ? parent.existingId ?? null : undefined) : null;
    if (parentExistingId !== undefined) {
      const hit = existingMap.get(existingKey(parentExistingId, node.title, node.kind));
      if (hit) {
        node.status = 'exists';
        node.existingId = hit.id;
      }
    }
    rows.push(node);
  };

  const makeGroup = (title: string, srcRow: number, kind: 'module' | 'group'): PreviewRow => {
    const node: PreviewRow = {
      ref: newRef(), kind: 'group', parentRef: null, code: '', title, actor: '', description: '', mainFlow: [],
      tags: curTag ? [curTag] : [], necessity: 'B', srcRow, depth: 1, status: 'new', warnings: []
    };
    node.code = nextCode(kind === 'module' ? 'MOD' : 'GRP');
    return node;
  };

  const makeLeaf = (row: string[], srcRow: number): PreviewRow | null => {
    const title = oneLine(cell(row, 'title'));
    if (!title) {
      skipped++;
      notes.push(`Dòng ${srcRow}: thiếu tên use case, bỏ qua.`);
      return null;
    }
    const flowText = cell(row, 'description');
    const flow = parseFlow(flowText);
    const cx = cell(row, 'complexity');
    const tx = cell(row, 'transactions').trim();
    const tagCell = cell(row, 'tags');
    const warnings: string[] = [];
    const complexity = parseComplexity(cx);
    if (cx && !complexity) warnings.push(`Không hiểu độ phức tạp "${cx}"`);
    let transactions: number | undefined;
    if (tx) {
      if (NUM.test(tx)) transactions = Math.max(0, Math.round(Number(tx.replace(',', '.'))));
      else warnings.push(`Số transaction không hợp lệ: "${tx}"`);
    }
    if (title.length < 4) warnings.push('Tên quá ngắn');
    const tags = [...new Set([...(curTag ? [curTag] : []), ...tagCell.split(/[,;]/).map(oneLine).filter(Boolean)])];
    const necessity = oneLine(cell(row, 'necessity')).toUpperCase();
    const node: PreviewRow = {
      ref: newRef(), kind: 'usecase', parentRef: null, code: '', title, actor: oneLine(cell(row, 'actor').replace(/\n/g, ', ')),
      description: flow.length ? '' : flowText.trim(), mainFlow: flow, tags, complexity, transactions,
      necessity: necessity && necessity.length <= 3 ? necessity : 'B', srcRow, depth: 1, status: 'new', warnings
    };
    const given = oneLine(cell(row, 'code'));
    node.code = given ? uniqueGivenCode(given, node) : nextCode('UC');
    return node;
  };

  const leafParent = (): PreviewRow | null => {
    if (groupNode) return groupNode;
    if (moduleNode) return moduleNode;
    if (curTag) {
      // Use case nằm ngay dưới nhãn (không có module): tạo module cùng tên nhãn.
      let m = tagModules.get(curTag);
      if (!m) {
        m = makeGroup(curTag, 0, 'module');
        place(m, null);
        tagModules.set(curTag, m);
      }
      return m;
    }
    return null;
  };

  const start = plan.headerRow + 1;
  const outline = plan.mode === 'outline' ? outlineRows(sheet, plan) : [];
  const outlineByRow = new Map(outline.map(o => [o.row, o]));
  const lastValues: string[] = [];

  for (let r = start; r < sheet.rows.length; r++) {
    const row = sheet.rows[r];
    if (row.every(c => c === '')) continue;
    const srcRow = r + 1;

    if (plan.mode === 'outline') {
      const g = outlineByRow.get(r);
      if (g) {
        const role = plan.rowRoles[r] ?? g.defaultRole;
        const title = g.title || g.label;
        if (role === 'skip') continue;
        if (role === 'tag') {
          curTag = (plan.rowTags[r] ?? '').trim() || tagFromTitle(title);
          moduleNode = null;
          groupNode = null;
        } else if (role === 'module' || (role === 'group' && !moduleNode)) {
          moduleNode = makeGroup(title, srcRow, 'module');
          place(moduleNode, null);
          groupNode = null;
        } else {
          groupNode = makeGroup(title, srcRow, 'group');
          place(groupNode, moduleNode);
        }
        continue;
      }
      const label = (cell(row, 'label') || '').trim();
      if (!label || !isLeafLabel(label)) {
        if (cell(row, 'title').trim()) {
          skipped++;
          notes.push(`Dòng ${srcRow}: không nhận ra cấp "${label || '(trống)'}", bỏ qua.`);
        }
        continue;
      }
    } else if (plan.mode === 'columns') {
      // Điền tiếp giá trị ô trống (ô gộp) cho các cột nhóm; đổi giá trị thì mở nút mới.
      let changed = false;
      for (let i = 0; i < plan.groupColumns.length; i++) {
        const { col, role } = plan.groupColumns[i];
        const v = oneLine(row[col] ?? '');
        if (v && v !== lastValues[i]) {
          lastValues[i] = v;
          for (let j = i + 1; j < plan.groupColumns.length; j++) lastValues[j] = '';
          changed = true;
          if (role === 'tag') {
            curTag = v;
          } else if (role === 'module' || (role === 'group' && !moduleNode)) {
            moduleNode = makeGroup(v, srcRow, 'module');
            place(moduleNode, null);
            groupNode = null;
          } else if (role === 'group') {
            groupNode = makeGroup(v, srcRow, 'group');
            place(groupNode, moduleNode);
          }
        }
      }
      void changed;
      if (!oneLine(cell(row, 'title'))) continue; // dòng chỉ có tên nhóm
    }

    const leaf = makeLeaf(row, srcRow);
    if (!leaf) continue;
    place(leaf, leafParent());
  }

  // Bỏ nhóm không có use case nào bên dưới.
  const hasChild = new Set<string>();
  rows.forEach(n => n.parentRef && hasChild.add(n.parentRef));
  const empty = rows.filter(n => n.kind === 'group' && !hasChild.has(n.ref));
  if (empty.length) {
    // lặp để dọn cả nhóm cha chỉ chứa nhóm rỗng
    let drop = new Set(empty.map(n => n.ref));
    for (;;) {
      const kept = rows.filter(n => !drop.has(n.ref));
      const parents = new Set(kept.map(n => n.parentRef).filter(Boolean) as string[]);
      const more = kept.filter(n => n.kind === 'group' && !parents.has(n.ref));
      if (more.length === 0) break;
      drop = new Set([...drop, ...more.map(n => n.ref)]);
    }
    notes.push(`Bỏ ${drop.size} nhóm không có use case bên dưới: ${rows.filter(n => drop.has(n.ref)).slice(0, 5).map(n => n.title).join('; ')}${drop.size > 5 ? '…' : ''}`);
    for (let i = rows.length - 1; i >= 0; i--) if (drop.has(rows[i].ref)) rows.splice(i, 1);
  }

  // Cảnh báo trùng tên trong cùng cha.
  const seen = new Map<string, PreviewRow>();
  rows.forEach(n => {
    const key = `${n.parentRef ?? n.parentId ?? ''}|${n.kind}|${norm(n.title)}`;
    if (seen.has(key)) n.warnings.push(`Trùng tên với dòng ${seen.get(key)!.srcRow} trong cùng nhóm`);
    else seen.set(key, n);
  });

  // Use case thật gặp nhóm "exists" -> trùng hay không đã xử lý ở place(); thống kê.
  const stats = {
    modules: rows.filter(n => n.kind === 'group' && n.depth === 1).length,
    groups: rows.filter(n => n.kind === 'group' && n.depth > 1).length,
    useCases: rows.filter(n => n.kind === 'usecase').length,
    existing: rows.filter(n => n.status === 'exists' && n.kind === 'usecase').length,
    skipped,
    warnings: rows.reduce((s, n) => s + n.warnings.length, 0)
  };
  return { rows, notes, stats };
}

/** Chọn các dòng sẽ gửi lên DB: bỏ dòng đã tắt, dòng "đã có", nhóm không còn con được chọn; giữ thứ tự cha trước con. */
export function selectRowsToImport(preview: Preview, excluded: Set<string>) {
  const byRef = new Map(preview.rows.map(r => [r.ref, r]));
  const wanted = new Set<string>();
  preview.rows.forEach(r => {
    if (r.kind !== 'usecase' || r.status === 'exists' || excluded.has(r.ref)) return;
    let cur: PreviewRow | undefined = r;
    while (cur && !wanted.has(cur.ref)) {
      wanted.add(cur.ref);
      cur = cur.parentRef ? byRef.get(cur.parentRef) : undefined;
    }
  });
  return preview.rows
    .filter(r => wanted.has(r.ref) && r.status === 'new')
    .map(r => ({
      ref: r.ref,
      ...(r.parentId ? { parent_id: r.parentId } : r.parentRef && wanted.has(r.parentRef) && byRef.get(r.parentRef)!.status === 'new' ? { parent_ref: r.parentRef } : {}),
      kind: r.kind,
      code: r.code,
      title: r.title,
      actor: r.actor,
      description: r.description,
      main_flow: r.mainFlow,
      tags: r.tags,
      complexity: r.complexity ?? null,
      transactions: r.transactions ?? null,
      necessity: r.necessity
    }));
}
