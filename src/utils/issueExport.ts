import type {
  Issue, IssuePriorityDef, IssueStatusDef, IssueTypeDef, Project, Task, UseCase, User
} from '../types';
import { downloadCSV } from './exportUtils';
import { SEVERITY_LABEL } from '../components/issues/issueUi';

const CATEGORY_LABEL = { open: 'Còn mở', in_progress: 'Đang xử lý', closed: 'Đã đóng' } as const;
const day = (iso?: string) => (iso ? iso.slice(0, 10) : '');

interface Ctx {
  project: Project;
  types: IssueTypeDef[];
  statuses: IssueStatusDef[];
  priorities: IssuePriorityDef[];
  users: User[];
  useCases: UseCase[];
  tasks: Task[];
  attachmentCount: (issueId: string) => number;
}

/** Xuất đúng danh sách issue được truyền vào (đã lọc, đã sắp xếp) ra CSV mở được bằng Excel. */
export function exportIssuesToCSV(issues: Issue[], c: Ctx) {
  const type = new Map(c.types.map(t => [t.id, t.name]));
  const status = new Map(c.statuses.map(s => [s.id, s]));
  const prio = new Map(c.priorities.map(p => [p.id, p.name]));
  const user = new Map(c.users.map(u => [u.id, u.name]));
  const uc = new Map(c.useCases.map(u => [u.id, `${u.code} ${u.title}`]));
  const task = new Map(c.tasks.map(t => [t.id, `${t.code} ${t.title}`]));
  const today = new Date().toISOString().slice(0, 10);

  const rows: (string | number)[][] = [
    [
      'Mã', 'Loại', 'Tiêu đề', 'Trạng thái', 'Nhóm trạng thái', 'Độ ưu tiên', 'Mức nghiêm trọng', 'Người báo', 'Người xử lý',
      'Hạn xử lý', 'Quá hạn', 'Môi trường', 'Use case', 'Nhiệm vụ', 'Ngày tạo', 'Cập nhật', 'Ngày đóng', 'Số tệp đính kèm', 'Mô tả'
    ]
  ];
  for (const i of issues) {
    const st = status.get(i.statusId);
    const late = !!i.dueDate && i.dueDate < today && st?.category !== 'closed';
    rows.push([
      `#${i.number}`,
      type.get(i.typeId) ?? '',
      i.title,
      st?.name ?? '',
      st ? CATEGORY_LABEL[st.category] : '',
      prio.get(i.priorityId) ?? '',
      i.severity ? SEVERITY_LABEL[i.severity] : '',
      user.get(i.reporterId ?? '') ?? '',
      user.get(i.assigneeId ?? '') ?? '',
      i.dueDate ?? '',
      late ? 'Có' : 'Không',
      i.environment,
      uc.get(i.useCaseId ?? '') ?? '',
      task.get(i.taskId ?? '') ?? '',
      day(i.createdAt),
      day(i.updatedAt),
      day(i.closedAt),
      c.attachmentCount(i.id),
      i.description
    ]);
  }
  const stamp = today.replace(/-/g, '');
  downloadCSV(`issues_${c.project.code}_${stamp}.csv`, rows);
}
