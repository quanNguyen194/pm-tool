import type { Role } from '../types';
import { can, type PermissionId } from './permissions';

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

/** Vai trò nào được tick bước nào (lấy từ ma trận phân quyền duy nhất; DB là nơi chốt quyền thật). */
export function canTickStage(role: Role, stage: StageKey): boolean {
  return can(role, ('stage_' + stage) as PermissionId);
}

/** Mức tiến độ = số bước đầu tiên liên tiếp đã xong (0..5). */
export function stageLevel(done: StageKey[]): number {
  let n = 0;
  for (const s of STAGES) {
    if (!done.includes(s.key)) break;
    n++;
  }
  return n;
}

/**
 * 5 bước làm tuần tự: tick một bước thì các bước trước tự được tick, bỏ một bước thì các bước sau cũng bị bỏ.
 * Trả về lý do không thể thao tác (người dùng không có quyền với các bước liên quan) hoặc null nếu làm được.
 * (DB kiểm tra lại với cùng quy tắc.)
 */
export function stageBlockReason(role: Role, done: StageKey[], stage: StageKey, wantDone: boolean): string | null {
  const idx = STAGES.findIndex(s => s.key === stage);
  if (!canTickStage(role, stage)) return `Bước này do ${STAGES[idx].who} (hoặc PM/Admin) cập nhật`;
  if (wantDone) {
    const need = STAGES.slice(0, idx).find(s => !done.includes(s.key) && !canTickStage(role, s.key));
    return need ? `Cần ${need.who} (hoặc PM/Admin) hoàn thành bước "${need.label}" trước` : null;
  }
  const later = STAGES.slice(idx + 1).find(s => done.includes(s.key) && !canTickStage(role, s.key));
  return later ? `Bước "${later.label}" phía sau đã xong (do ${later.who}); hãy nhờ ${later.who} hoặc PM/Admin bỏ trước` : null;
}

export const stagesPercent =(done: StageKey[]) =>
  Math.min(100, STAGES.filter(s => done.includes(s.key)).reduce((sum, s) => sum + s.weight, 0));
