import type { Issue, IssueColor, IssueJournal, IssueSeverity } from '../../types';

/** Màu huy hiệu theo khóa màu cấu hình (viết nguyên văn để Tailwind và bộ sinh giao diện tối nhận ra). */
export const COLOR_BADGE: Record<IssueColor, string> = {
  indigo: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  emerald: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  blue: 'bg-blue-100 text-blue-800 border-blue-200',
  amber: 'bg-amber-100 text-amber-800 border-amber-200',
  rose: 'bg-rose-100 text-rose-800 border-rose-200',
  purple: 'bg-purple-100 text-purple-800 border-purple-200',
  slate: 'bg-slate-100 text-slate-700 border-slate-200'
};
export const COLOR_DOT: Record<IssueColor, string> = {
  indigo: 'bg-indigo-600',
  emerald: 'bg-emerald-600',
  blue: 'bg-blue-600',
  amber: 'bg-amber-600',
  rose: 'bg-rose-600',
  purple: 'bg-purple-600',
  slate: 'bg-slate-500'
};
export const COLOR_KEYS: IssueColor[] = ['indigo', 'emerald', 'blue', 'amber', 'rose', 'purple', 'slate'];
export const COLOR_NAME: Record<IssueColor, string> = {
  indigo: 'Tím chàm',
  emerald: 'Xanh lá',
  blue: 'Xanh dương',
  amber: 'Vàng cam',
  rose: 'Đỏ hồng',
  purple: 'Tím',
  slate: 'Xám'
};

export const SEVERITY_LABEL: Record<IssueSeverity, string> = {
  minor: 'Nhẹ',
  major: 'Nghiêm trọng',
  critical: 'Rất nghiêm trọng',
  blocker: 'Chặn tiến độ'
};

/** Nhãn hiển thị cho các trường trong nhật ký. */
export const FIELD_LABEL: Record<string, string> = {
  status: 'Trạng thái',
  assignee: 'Người xử lý',
  type: 'Loại',
  priority: 'Độ ưu tiên',
  severity: 'Mức nghiêm trọng',
  title: 'Tiêu đề',
  description: 'Mô tả',
  environment: 'Môi trường',
  due_date: 'Hạn xử lý',
  use_case: 'Use case',
  task: 'Nhiệm vụ',
  attachment: 'Tệp đính kèm'
};

export const issueCode = (i: Pick<Issue, 'number'>) => `#${i.number}`;

/** Dựng cây nhật ký từ danh sách phẳng (đã xếp theo thời gian). Nút mồ côi coi như gốc. */
export interface JournalNode {
  journal: IssueJournal;
  children: JournalNode[];
}
export function buildJournalTree(journals: IssueJournal[]): JournalNode[] {
  const nodes = new Map(journals.map(j => [j.id, { journal: j, children: [] as JournalNode[] }]));
  const roots: JournalNode[] = [];
  journals.forEach(j => {
    const node = nodes.get(j.id)!;
    const parent = j.parentId ? nodes.get(j.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  });
  return roots;
}

/** Tìm theo mã (#12 hoặc 12) hoặc theo tên (không phân biệt hoa thường/dấu). */
export function matchesQuery(issue: Pick<Issue, 'number' | 'title'>, normTitle: string, raw: string, normalize: (s: string) => string): boolean {
  const q = raw.trim();
  if (!q) return true;
  const m = /^#?(\d+)$/.exec(q);
  if (m && issue.number === Number(m[1])) return true;
  const nq = normalize(q.replace(/^#/, ''));
  return nq === '' || normTitle.includes(nq) || `#${issue.number}`.includes(q);
}
