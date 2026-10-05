import type { Task } from '../types';

export type PeriodMode = 'all' | 'week' | 'month';

export interface PeriodRange {
  /** YYYY-MM-DD, gồm cả hai đầu */
  from: string;
  to: string;
}

const pad = (n: number) => String(n).padStart(2, '0');
export const toIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromIso = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/** Tuần Thứ Hai → Chủ Nhật chứa ngày `anchor`. */
export function weekRange(anchor: Date): PeriodRange {
  const start = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return { from: toIso(start), to: toIso(end) };
}

/** Cả tháng chứa ngày `anchor`. */
export function monthRange(anchor: Date): PeriodRange {
  return {
    from: toIso(new Date(anchor.getFullYear(), anchor.getMonth(), 1)),
    to: toIso(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0))
  };
}

export function periodRange(mode: PeriodMode, anchor: Date): PeriodRange | null {
  if (mode === 'week') return weekRange(anchor);
  if (mode === 'month') return monthRange(anchor);
  return null;
}

/** Dời mốc sang kỳ trước (-1) / kỳ sau (+1). */
export function shiftAnchor(mode: PeriodMode, anchor: Date, dir: -1 | 1): Date {
  const d = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  if (mode === 'week') d.setDate(d.getDate() + 7 * dir);
  if (mode === 'month') {
    d.setDate(1); // tránh tràn tháng (31 → tháng 30 ngày)
    d.setMonth(d.getMonth() + dir);
  }
  return d;
}

const fmtDM = (s: string) => {
  const d = fromIso(s);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
};

export function periodLabel(mode: PeriodMode, r: PeriodRange): string {
  if (mode === 'month') {
    const d = fromIso(r.from);
    return `Tháng ${d.getMonth() + 1}/${d.getFullYear()}`;
  }
  return `${fmtDM(r.from)} – ${fmtDM(r.to)}/${fromIso(r.to).getFullYear()}`;
}

/**
 * Nhiệm vụ thuộc kỳ nếu khoảng [bắt đầu, hạn] giao với kỳ.
 * Thiếu ngày bắt đầu thì coi như làm trong đúng ngày hạn.
 * `includeOverdue`: kèm việc đã quá hạn (hạn trước kỳ) mà chưa hoàn thành.
 */
export function taskInPeriod(task: Pick<Task, 'startDate' | 'dueDate' | 'status'>, r: PeriodRange, includeOverdue: boolean): boolean {
  const end = task.dueDate || task.startDate;
  if (!end) return false;
  const start = task.startDate && task.startDate <= end ? task.startDate : end;
  if (start <= r.to && end >= r.from) return true;
  return includeOverdue && task.status !== 'done' && end < r.from;
}
