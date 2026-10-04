import type { UseCase, UseCaseComplexity } from '../types';

export const MAX_USE_CASE_DEPTH = 3;

/** Trọng số điểm use case (UCP) theo độ phức tạp. */
export const COMPLEXITY_WEIGHT: Record<UseCaseComplexity, number> = { simple: 5, medium: 10, complex: 15 };
/** Trọng số dùng để tổng hợp tiến độ: chưa đánh giá độ phức tạp thì coi như trung bình (khớp DB). */
export const progressWeight = (c?: UseCaseComplexity) => (c ? COMPLEXITY_WEIGHT[c] : 10);

export const COMPLEXITY_LABEL: Record<UseCaseComplexity, string> = {
  simple: 'Đơn giản',
  medium: 'Trung bình',
  complex: 'Phức tạp'
};
// Chữ đậm (700+) để đủ tương phản ở cả chế độ sáng và tối.
export const COMPLEXITY_STYLE: Record<UseCaseComplexity, string> = {
  simple: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  medium: 'bg-blue-50 text-blue-700 border-blue-200',
  complex: 'bg-amber-50 text-amber-700 border-amber-200'
};

export interface UseCaseNode {
  useCase: UseCase;
  /** 1 = gốc, 2 = con, 3 = cháu. */
  depth: number;
  childCount: number;
  /** Số use case thật (kind = usecase, không có con) nằm dưới nhánh này; use case lá thì tính chính nó. */
  leafCount: number;
  /** Tổng điểm UCP của các use case lá bên dưới. */
  ucp: number;
  /** Số use case lá đã hoàn thành / kiểm thử. */
  doneCount: number;
  /** Tiến độ trung bình CÓ TRỌNG SỐ độ phức tạp của các use case lá bên dưới (làm tròn). */
  avgProgress: number;
  /** Tổng trọng số của các use case lá bên dưới (dùng để gộp tiến độ nhiều nhánh). */
  weight: number;
  /** Id các use case lá bên dưới (dùng để chọn hàng loạt). */
  leafIds: string[];
}

const byCode = (a: UseCase, b: UseCase) => a.code.localeCompare(b.code, 'vi', { numeric: true });
/** Use case thật còn hiệu lực (không phải module/nhóm, không phải "Không thực hiện"). */
const isCounted = (u: UseCase) => u.kind !== 'group' && u.status !== 'cancelled';

/** Số thứ tự trong mã dạng UC-123 (theo Excel); NaN nếu mã không theo dạng đó. */
const ucNumber = (u: UseCase) => {
  const m = /^UC-(\d+)$/.exec(u.code);
  return m ? Number(m[1]) : NaN;
};

/**
 * Danh sách use case theo thứ tự cây (cha trước, con ngay sau).
 * Anh em được xếp theo số UC nhỏ nhất trong nhánh (giữ đúng thứ tự file Excel), còn lại theo mã tự nhiên.
 * Use case mồ côi coi như gốc.
 */
export function flattenUseCaseTree(useCases: UseCase[]): UseCaseNode[] {
  const ids = new Set(useCases.map(u => u.id));
  const children = new Map<string, UseCase[]>();
  const roots: UseCase[] = [];
  useCases.forEach(u => {
    if (u.parentId && ids.has(u.parentId)) {
      const list = children.get(u.parentId) || [];
      list.push(u);
      children.set(u.parentId, list);
    } else {
      roots.push(u);
    }
  });

  interface Agg { leaves: UseCase[]; minNo: number }
  const memo = new Map<string, Agg>();
  const aggregate = (u: UseCase, guard = 0): Agg => {
    const hit = memo.get(u.id);
    if (hit) return hit;
    const kids = children.get(u.id) || [];
    let res: Agg;
    if (kids.length === 0 || guard > MAX_USE_CASE_DEPTH) {
      const n = ucNumber(u);
      res = { leaves: isCounted(u) ? [u] : [], minNo: Number.isNaN(n) ? Infinity : n };
    } else {
      const parts = kids.map(k => aggregate(k, guard + 1));
      res = { leaves: parts.flatMap(p => p.leaves), minNo: Math.min(...parts.map(p => p.minNo)) };
    }
    memo.set(u.id, res);
    return res;
  };

  const sortSiblings = (list: UseCase[]) =>
    [...list].sort((a, b) => {
      const d = aggregate(a).minNo - aggregate(b).minNo;
      return Number.isNaN(d) || d === 0 ? byCode(a, b) : d;
    });

  const out: UseCaseNode[] = [];
  const walk = (list: UseCase[], depth: number) => {
    sortSiblings(list).forEach(u => {
      const kids = children.get(u.id) || [];
      const { leaves } = aggregate(u);
      out.push({
        useCase: u,
        depth,
        childCount: kids.length,
        leafCount: leaves.length,
        ucp: leaves.reduce((s, l) => s + (l.complexity ? COMPLEXITY_WEIGHT[l.complexity] : 0), 0),
        doneCount: leaves.filter(l => l.status === 'completed' || l.status === 'tested').length,
        avgProgress: leaves.length
          ? Math.round(
              leaves.reduce((s, l) => s + l.progressPercent * progressWeight(l.complexity), 0) /
                leaves.reduce((s, l) => s + progressWeight(l.complexity), 0)
            )
          : 0,
        weight: leaves.reduce((s, l) => s + progressWeight(l.complexity), 0),
        leafIds: leaves.map(l => l.id)
      });
      if (depth < MAX_USE_CASE_DEPTH) walk(kids, depth + 1);
    });
  };
  walk(roots, 1);
  return out;
}

/** Chỉ các use case thật ở lá: dùng để đếm/tính tiến độ (use case cha và nhóm chỉ tổng hợp từ con). */
export function leafUseCases(useCases: UseCase[]): UseCase[] {
  const parents = new Set(useCases.map(u => u.parentId).filter(Boolean));
  return useCases.filter(u => !parents.has(u.id) && isCounted(u));
}

/** Độ sâu (1..3) của một use case; 0 nếu không tìm thấy. */
export function useCaseDepth(id: string, useCases: UseCase[]): number {
  const byId = new Map(useCases.map(u => [u.id, u]));
  let depth = 0;
  let cur = byId.get(id);
  while (cur && depth <= MAX_USE_CASE_DEPTH + 1) {
    depth++;
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return depth;
}

/** Chiều cao nhánh con của một use case (0 nếu là lá). */
export function subtreeHeight(id: string, useCases: UseCase[]): number {
  const kids = useCases.filter(u => u.parentId === id);
  if (kids.length === 0) return 0;
  return 1 + Math.max(...kids.map(k => subtreeHeight(k.id, useCases)));
}

/** Id của use case và mọi hậu duệ (dùng để chặn chọn làm cha của chính nhánh mình). */
export function descendantIds(id: string, useCases: UseCase[]): Set<string> {
  const out = new Set<string>([id]);
  let grew = true;
  while (grew) {
    grew = false;
    useCases.forEach(u => {
      if (u.parentId && out.has(u.parentId) && !out.has(u.id)) {
        out.add(u.id);
        grew = true;
      }
    });
  }
  return out;
}

/** Chuỗi tên cha → con để làm ngữ cảnh (vd "Quản lý định danh › Cấu hình thông số"). */
export function useCasePath(uc: UseCase, byId: Map<string, UseCase>): string {
  const names: string[] = [];
  let cur = uc.parentId ? byId.get(uc.parentId) : undefined;
  while (cur && names.length < MAX_USE_CASE_DEPTH) {
    names.unshift(cur.title);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return names.join(' › ');
}

/**
 * Gợi ý mã cho nút mới.
 * - Dự án đã có mã dạng UC-001 (nhập từ Excel): use case mới nối tiếp số lớn nhất (UC-185...).
 * - Module/nhóm: con của W-I -> W-I.1...; gốc -> MOD-1, MOD-2...
 * - Còn lại: con của UC-01 -> UC-01.1; gốc -> UC-01, UC-02...
 */
export function suggestUseCaseCode(
  parent: UseCase | undefined,
  useCases: UseCase[],
  kind: 'group' | 'usecase' = 'usecase'
): string {
  const taken = new Set(useCases.map(u => u.code));
  const free = (make: (n: number) => string, from: number) => {
    for (let n = from; n < from + 5000; n++) if (!taken.has(make(n))) return make(n);
    return make(Date.now());
  };
  if (kind === 'group') {
    if (parent) return free(n => `${parent.code}.${n}`, useCases.filter(u => u.parentId === parent.id).length + 1);
    return free(n => `MOD-${n}`, useCases.filter(u => !u.parentId && u.kind === 'group').length + 1);
  }
  const numbered = useCases.map(ucNumber).filter(n => !Number.isNaN(n));
  if (numbered.length > 0) return free(n => `UC-${String(n).padStart(3, '0')}`, Math.max(...numbered) + 1);
  if (parent) return free(n => `${parent.code}.${n}`, useCases.filter(u => u.parentId === parent.id).length + 1);
  return free(n => `UC-${String(n).padStart(2, '0')}`, useCases.filter(u => !u.parentId).length + 1);
}
