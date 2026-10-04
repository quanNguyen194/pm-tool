import type { Role } from '../types';

/** 5 bước chuẩn của một use case (khớp hàm stage_weight / can_tick_stage trong migration 0010). */
export type StageKey = 'analysis' | 'design' | 'coding' | 'testing' | 'acceptance';

export const STAGES: { key: StageKey; label: string; weight: number; who: string }[] = [
  { key: 'analysis', label: 'Phân tích', weight: 10, who: 'BA' },
  { key: 'design', label: 'Thiết kế', weight: 10, who: 'BA' },
  { key: 'coding', label: 'Lập trình', weight: 40, who: 'DEV' },
  { key: 'testing', label: 'Kiểm thử', weight: 25, who: 'Tester' },
  { key: 'acceptance', label: 'Nghiệm thu', weight: 15, who: 'PM' }
];

export const STAGE_LABEL: Record<StageKey, string> = Object.fromEntries(
  STAGES.map(s => [s.key, s.label])
) as Record<StageKey, string>;

/** Vai trò nào được tick bước nào (DB là nơi chốt quyền thật). */
export function canTickStage(role: Role, stage: StageKey): boolean {
  if (role === 'admin' || role === 'pm') return true;
  if (role === 'ba') return stage === 'analysis' || stage === 'design';
  if (role === 'dev') return stage === 'coding';
  if (role === 'tester') return stage === 'testing';
  return false;
}

export const stagesPercent = (done: StageKey[]) =>
  Math.min(100, STAGES.filter(s => done.includes(s.key)).reduce((sum, s) => sum + s.weight, 0));
