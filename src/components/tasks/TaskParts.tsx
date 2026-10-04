import React from 'react';
import type { Task, TaskAssessment, User } from '../../types';
import { ASSESSMENT_LABELS, ASSESSMENT_STYLES, effectiveAssessment } from '../../utils/taskAssessment';

/** Huy hiệu đánh giá tiến độ; dấu "~" nghĩa là hệ thống tự gợi ý (người dùng chưa chọn). */
export const AssessmentBadge: React.FC<{ task: Task; compact?: boolean }> = ({ task, compact }) => {
  const { value, auto } = effectiveAssessment(task);
  return (
    <span
      className={`inline-flex items-center rounded border font-semibold whitespace-nowrap ${ASSESSMENT_STYLES[value]} ${
        compact ? 'text-[10px] px-1.5 py-0.5' : 'text-[11px] px-2 py-0.5'
      }`}
      title={auto ? 'Hệ thống tự gợi ý từ ngày tháng và % hoàn thành' : 'Do người dùng đánh giá'}
    >
      {auto && <span aria-hidden="true">~&nbsp;</span>}
      {ASSESSMENT_LABELS[value]}
    </span>
  );
};

export const assessmentBarColor = (a: TaskAssessment) =>
  a === 'delayed' ? 'bg-rose-600' : a === 'at_risk' ? 'bg-amber-600' : a === 'ahead' ? 'bg-emerald-600' : 'bg-indigo-600';

/** Thanh tiến độ (%) của nhiệm vụ. */
export const TaskProgress: React.FC<{ task: Task; showLabel?: boolean }> = ({ task, showLabel = true }) => {
  const { value } = effectiveAssessment(task);
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div
        className="flex-1 min-w-[48px] bg-slate-100 h-1.5 rounded-full overflow-hidden"
        role="img"
        aria-label={`Tiến độ ${task.progressPercent}%`}
      >
        <div className={`h-full rounded-full ${assessmentBarColor(value)}`} style={{ width: `${task.progressPercent}%` }} />
      </div>
      {showLabel && (
        <span className="font-mono text-[10px] tabular-nums text-slate-700 w-8 text-right shrink-0">
          {task.progressPercent}%
        </span>
      )}
    </div>
  );
};

/** Avatar người chủ trì + số người phối hợp. */
export const OwnerAvatars: React.FC<{
  task: Task;
  userMap: Map<string, User>;
  showName?: boolean;
  nameClass?: string;
}> = ({ task, userMap, showName = true, nameClass = 'max-w-[100px]' }) => {
  const owner = userMap.get(task.assigneeId);
  const collabs = task.collaboratorIds.map(id => userMap.get(id)).filter(Boolean) as User[];
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <div
        className={`w-5 h-5 rounded-full text-white text-[9px] font-bold flex items-center justify-center shrink-0 ${owner?.avatarColor || 'bg-zinc-700'}`}
        title={owner ? `Chủ trì: ${owner.name}` : 'Chưa có người chủ trì'}
      >
        {owner?.name.charAt(0) || '?'}
      </div>
      {showName && <span className={`text-slate-700 truncate ${nameClass}`}>{owner?.name || 'Chưa phân công'}</span>}
      {collabs.length > 0 && (
        <span
          className="text-[10px] font-mono text-slate-500 shrink-0"
          title={`Phối hợp: ${collabs.map(c => c.name).join(', ')}`}
        >
          +{collabs.length}
        </span>
      )}
    </div>
  );
};
