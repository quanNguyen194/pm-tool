import { ProgressSnapshot, Task, User } from '../types';

export interface MemberWorkload {
  user: User;
  total: number;
  /** Việc chưa xong. */
  active: number;
  done: number;
  overdue: number;
  urgentActive: number;
  estimatedEffort: number;
  actualEffort: number;
}

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const isOverdue = (t: Task, today: Date) => {
  if (t.status === 'done') return false;
  const due = new Date(t.dueDate);
  due.setHours(0, 0, 0, 0);
  return due < today;
};

/** Khối lượng theo từng thành viên của dự án, sắp xếp người nhiều việc đang mở nhất lên đầu. */
export function computeWorkload(users: User[], tasks: Task[]): MemberWorkload[] {
  const today = startOfToday();
  return users
    .map(user => {
      const mine = tasks.filter(t => t.assigneeId === user.id);
      const open = mine.filter(t => t.status !== 'done');
      return {
        user,
        total: mine.length,
        active: open.length,
        done: mine.length - open.length,
        overdue: mine.filter(t => isOverdue(t, today)).length,
        urgentActive: open.filter(t => t.priority === 'urgent').length,
        estimatedEffort: mine.reduce((s, t) => s + (t.estimatedEffort || 0), 0),
        actualEffort: mine.reduce((s, t) => s + (t.actualEffort || 0), 0)
      };
    })
    .sort((a, b) => b.active - a.active || a.user.name.localeCompare(b.user.name, 'vi'));
}

/** Việc chưa có người phụ trách (hoặc người phụ trách đã rời dự án). */
export function countUnassigned(users: User[], tasks: Task[]): number {
  const ids = new Set(users.map(u => u.id));
  return tasks.filter(t => !t.assigneeId || !ids.has(t.assigneeId)).length;
}

export function countOverdue(tasks: Task[]): number {
  const today = startOfToday();
  return tasks.filter(t => isOverdue(t, today)).length;
}

export interface Forecast {
  /** Số việc hoàn thành trong 7 ngày qua; null nếu chưa đủ lịch sử. */
  doneLast7: number | null;
  remaining: number;
  /** Ngày dự kiến xong (YYYY-MM-DD) theo tốc độ 7 ngày qua; null nếu không ước tính được. */
  etaDate: string | null;
  /** Số ngày chênh so với hạn chót (dương = trễ). */
  slackDays: number | null;
}

const DAY_MS = 86400000;
const toIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Dự báo hoàn thành dựa trên tốc độ làm xong việc trong 7 ngày gần nhất (từ lịch sử tiến độ). */
export function computeForecast(snapshots: ProgressSnapshot[], tasks: Task[], targetEndDate: string): Forecast {
  const remaining = tasks.filter(t => t.status !== 'done').length;
  const sorted = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));
  const today = startOfToday();
  const weekAgo = toIso(new Date(today.getTime() - 7 * DAY_MS));
  const base = [...sorted].reverse().find(s => s.date <= weekAgo);
  const last = sorted[sorted.length - 1];

  const doneLast7 = base && last ? Math.max(last.tasksDone - base.tasksDone, 0) : null;
  if (remaining === 0 || doneLast7 === null || doneLast7 === 0) {
    return { doneLast7, remaining, etaDate: null, slackDays: null };
  }
  const eta = new Date(today.getTime() + Math.ceil(remaining / (doneLast7 / 7)) * DAY_MS);
  const target = new Date(targetEndDate + 'T00:00:00');
  return {
    doneLast7,
    remaining,
    etaDate: toIso(eta),
    slackDays: Math.round((eta.getTime() - target.getTime()) / DAY_MS)
  };
}
