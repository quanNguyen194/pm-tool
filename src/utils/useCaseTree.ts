import type { UseCase } from '../types';

export const MAX_USE_CASE_DEPTH = 3;

export interface UseCaseNode {
  useCase: UseCase;
  /** 1 = gốc, 2 = con, 3 = cháu. */
  depth: number;
  childCount: number;
  /** Số use case lá nằm dưới nhánh này (nhánh lá = 1). */
  leafCount: number;
}

const byCode = (a: UseCase, b: UseCase) => a.code.localeCompare(b.code, 'vi', { numeric: true });

/** Danh sách use case theo thứ tự cây (cha trước, con ngay sau, sắp theo mã tự nhiên). Use case mồ côi coi như gốc. */
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

  const leafCount = (u: UseCase, guard = 0): number => {
    const kids = children.get(u.id);
    if (!kids || kids.length === 0 || guard > MAX_USE_CASE_DEPTH) return 1;
    return kids.reduce((s, k) => s + leafCount(k, guard + 1), 0);
  };

  const out: UseCaseNode[] = [];
  const walk = (list: UseCase[], depth: number) => {
    [...list].sort(byCode).forEach(u => {
      const kids = children.get(u.id) || [];
      out.push({ useCase: u, depth, childCount: kids.length, leafCount: leafCount(u) });
      if (depth < MAX_USE_CASE_DEPTH) walk(kids, depth + 1);
    });
  };
  walk(roots, 1);
  return out;
}

/** Chỉ các use case lá: dùng để đếm/tính tiến độ (use case cha chỉ tổng hợp từ con). */
export function leafUseCases(useCases: UseCase[]): UseCase[] {
  const parents = new Set(useCases.map(u => u.parentId).filter(Boolean));
  return useCases.filter(u => !parents.has(u.id));
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

/** Gợi ý mã cho use case mới: con của UC-01 -> UC-01.1, UC-01.2...; gốc -> UC-01, UC-02... */
export function suggestUseCaseCode(parent: UseCase | undefined, useCases: UseCase[]): string {
  const taken = new Set(useCases.map(u => u.code));
  if (parent) {
    const kids = useCases.filter(u => u.parentId === parent.id).length;
    for (let n = kids + 1; n < kids + 1000; n++) {
      const code = `${parent.code}.${n}`;
      if (!taken.has(code)) return code;
    }
  }
  const roots = useCases.filter(u => !u.parentId).length;
  for (let n = roots + 1; n < roots + 1000; n++) {
    const code = `UC-${String(n).padStart(2, '0')}`;
    if (!taken.has(code)) return code;
  }
  return 'UC-' + Date.now();
}
