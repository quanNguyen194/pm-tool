// Đọc bảng tính ngay trong trình duyệt (không gửi file đi đâu): .xlsx (giải nén bằng fflate) và CSV/TSV/dán từ Excel.
import { unzipSync, strFromU8 } from 'fflate';

/** Một sheet đã chuẩn hóa: mọi ô là chuỗi đã cắt khoảng trắng, ô trống là ''. */
export interface RawSheet {
  name: string;
  rows: string[][];
}

export const MAX_ROWS = 5000;
export const MAX_COLS = 60;

const decodeEntities = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&');

/** Gộp khoảng trắng/xuống dòng thừa nhưng giữ xuống dòng (cần cho luồng đánh số 1. 2. 3.). */
const tidy = (s: string) => s.replace(/\r/g, '').replace(/[ \t ]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{2,}/g, '\n').trim();

const textOf = (xml: string) => {
  const parts: string[] = [];
  const clean = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
  const re = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(clean))) parts.push(decodeEntities(m[1]));
  return parts.join('');
};

const colIndex = (ref: string) => {
  let n = 0;
  for (const ch of ref.replace(/[^A-Za-z]/g, '').toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

const attr = (attrs: string, name: string) => {
  const m = new RegExp(`\\b${name}="([^"]*)"`).exec(attrs);
  return m ? decodeEntities(m[1]) : undefined;
};

export interface Workbook {
  names: string[];
  read: (name: string) => RawSheet;
}

/** Đọc cấu trúc .xlsx. Ném lỗi tiếng Việt nếu file không hợp lệ. */
export function openXlsx(data: Uint8Array): Workbook {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(data);
  } catch {
    throw new Error('Không đọc được file. Hãy chọn file .xlsx hợp lệ (file .xls cũ cần lưu lại thành .xlsx).');
  }
  const wbXml = files['xl/workbook.xml'];
  if (!wbXml) throw new Error('File không phải bảng tính Excel (.xlsx).');

  const rels = new Map<string, string>();
  const relXml = files['xl/_rels/workbook.xml.rels'];
  if (relXml) {
    const re = /<Relationship\b([^>]*)\/?>/g;
    let m: RegExpExecArray | null;
    const text = strFromU8(relXml);
    while ((m = re.exec(text))) {
      const id = attr(m[1], 'Id');
      const target = attr(m[1], 'Target');
      if (id && target) rels.set(id, target.startsWith('/') ? target.slice(1) : `xl/${target}`);
    }
  }

  const sheets: { name: string; path: string; hidden: boolean }[] = [];
  const re = /<sheet\b([^>]*)\/?>/g;
  const wbText = strFromU8(wbXml);
  let m: RegExpExecArray | null;
  while ((m = re.exec(wbText))) {
    const name = attr(m[1], 'name');
    const rid = attr(m[1], 'r:id');
    const path = rid ? rels.get(rid) : undefined;
    if (name && path) sheets.push({ name, path, hidden: attr(m[1], 'state') === 'hidden' || attr(m[1], 'state') === 'veryHidden' });
  }
  if (sheets.length === 0) throw new Error('File không có sheet nào.');

  let shared: string[] | null = null;
  const sharedStrings = () => {
    if (shared) return shared;
    shared = [];
    const x = files['xl/sharedStrings.xml'];
    if (x) {
      const text = strFromU8(x);
      const r = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
      let s: RegExpExecArray | null;
      while ((s = r.exec(text))) shared.push(textOf(s[1]));
    }
    return shared;
  };

  const read = (name: string): RawSheet => {
    const sh = sheets.find(s => s.name === name);
    const raw = sh && files[sh.path];
    if (!sh || !raw) throw new Error(`Không tìm thấy sheet "${name}".`);
    const xml = strFromU8(raw);
    const rows: string[][] = [];
    const rowRe = /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g;
    let rm: RegExpExecArray | null;
    let autoRow = 0;
    while ((rm = rowRe.exec(xml))) {
      const rIdx = (Number(attr(rm[1], 'r')) || autoRow + 1) - 1;
      autoRow = rIdx + 1;
      if (rIdx >= MAX_ROWS) break;
      const cells = rm[2];
      if (!cells) continue;
      const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
      let cm: RegExpExecArray | null;
      let autoCol = 0;
      while ((cm = cellRe.exec(cells))) {
        const ref = attr(cm[1], 'r');
        const c = ref ? colIndex(ref) : autoCol;
        autoCol = c + 1;
        if (c >= MAX_COLS || !cm[2]) continue;
        const type = attr(cm[1], 't');
        let value = '';
        if (type === 'inlineStr') value = textOf(cm[2]);
        else {
          const v = /<v>([\s\S]*?)<\/v>/.exec(cm[2]);
          if (!v) continue;
          if (type === 's') value = sharedStrings()[Number(v[1])] ?? '';
          else if (type === 'b') value = v[1] === '1' ? 'TRUE' : 'FALSE';
          else if (type === 'str' || type === 'e') value = decodeEntities(v[1]);
          else value = /^-?\d+\.0+$/.test(v[1]) ? v[1].replace(/\.0+$/, '') : v[1];
        }
        value = tidy(value);
        if (value === '') continue;
        while (rows.length <= rIdx) rows.push([]);
        const row = rows[rIdx];
        while (row.length <= c) row.push('');
        row[c] = value;
      }
    }
    const width = Math.min(MAX_COLS, rows.reduce((w, r) => Math.max(w, r.length), 0));
    return { name, rows: rows.map(r => Array.from({ length: width }, (_, i) => r[i] ?? '')) };
  };

  return { names: sheets.filter(s => !s.hidden).map(s => s.name), read };
}

/** CSV/TSV (tự đoán dấu phân cách; hỗ trợ ô trong ngoặc kép có xuống dòng). */
export function parseDelimited(text: string, name = 'Dữ liệu dán'): RawSheet {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.split('\n', 1)[0];
  const delim = [',', ';', '\t'].map(d => [d, firstLine.split(d).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const endCell = () => {
    row.push(tidy(cell));
    cell = '';
  };
  const endRow = () => {
    endCell();
    if (row.some(c => c !== '')) rows.push(row.slice(0, MAX_COLS));
    row = [];
  };
  for (let i = 0; i < src.length && rows.length < MAX_ROWS; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === delim) endCell();
    else if (ch === '\n') endRow();
    else if (ch !== '\r') cell += ch;
  }
  if (cell !== '' || row.length) endRow();
  const width = rows.reduce((w, r) => Math.max(w, r.length), 0);
  return { name, rows: rows.map(r => Array.from({ length: width }, (_, i) => r[i] ?? '')) };
}

/** Đọc file người dùng chọn: trả về các sheet (CSV chỉ có một). */
export async function openFile(file: File): Promise<{ names: string[]; read: (name: string) => RawSheet }> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const isZip = buf[0] === 0x50 && buf[1] === 0x4b;
  if (isZip) return openXlsx(buf);
  if (/\.xls$/i.test(file.name)) throw new Error('File .xls (định dạng cũ) chưa được hỗ trợ. Hãy mở bằng Excel và lưu thành .xlsx.');
  const sheet = parseDelimited(new TextDecoder('utf-8').decode(buf), file.name.replace(/\.[^.]+$/, ''));
  return { names: [sheet.name], read: () => sheet };
}
