import type { Task, TaskAssessment } from '../types';

export const ASSESSMENT_OPTIONS: TaskAssessment[] = ['ahead', 'on_track', 'at_risk', 'delayed'];

export const ASSESSMENT_LABELS: Record<TaskAssessment, string> = {
  ahead: 'Vượt tiến độ',
  on_track: 'Đúng tiến độ',
  at_risk: 'Rủi ro chậm',
  delayed: 'Chậm tiến độ'
};

// Chữ đậm (700+) để đủ tương phản ở cả chế độ sáng và tối.
export const ASSESSMENT_STYLES: Record<TaskAssessment, string> = {
  ahead: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  on_track: 'bg-blue-50 text-blue-700 border-blue-200',
  at_risk: 'bg-amber-50 text-amber-700 border-amber-200',
  delayed: 'bg-rose-50 text-rose-700 border-rose-200'
};

const DAY = 86400000;
const dayNumber = (iso: string) => Math.floor(Date.parse(iso + 'T00:00:00Z') / DAY);
const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

type AssessInput = Pick<Task, 'status' | 'startDate' | 'dueDate' | 'progressPercent' | 'actualEndDate'>;

/** Gợi ý đánh giá tiến độ từ ngày tháng và % hoàn thành (người dùng có thể chọn đè). */
export function suggestAssessment(t: AssessInput, today: string = localToday()): TaskAssessment {
  const due = dayNumber(t.dueDate);
  if (t.status === 'done') {
    const end = dayNumber(t.actualEndDate || today);
    if (end > due) return 'delayed';
    return end < due ? 'ahead' : 'on_track';
  }
  const now = dayNumber(today);
  if (now > due) return 'delayed';
  const start = dayNumber(t.startDate);
  if (now < start) return 'on_track';
  const planned = due <= start ? 100 : Math.round(((now - start) / (due - start)) * 100);
  const diff = t.progressPercent - planned;
  if (diff >= 10) return 'ahead';
  if (diff >= -10) return 'on_track';
  return 'at_risk';
}

/** Đánh giá hiển thị: giá trị người dùng chọn, nếu trống thì dùng gợi ý. */
export function effectiveAssessment(t: AssessInput & { assessment?: TaskAssessment }): {
  value: TaskAssessment;
  auto: boolean;
} {
  return t.assessment ? { value: t.assessment, auto: false } : { value: suggestAssessment(t), auto: true };
}
