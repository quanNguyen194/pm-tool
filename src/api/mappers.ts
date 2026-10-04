import {
  MemberRole,
  NotificationItem,
  Project,
  ProgressSnapshot,
  ProjectQualityGates,
  ReportRun,
  ReportSchedule,
  QualityCheckItem,
  QualityGatePhase,
  Task,
  UseCase
} from '../types';

// Các class màu avatar do DB gán (profiles.avatar_color). Liệt kê nguyên văn ở đây
// để Tailwind không loại bỏ chúng khi build.
export const AVATAR_COLORS = [
  'bg-indigo-600',
  'bg-emerald-700',
  'bg-blue-600',
  'bg-amber-700',
  'bg-zinc-700'
];

// Giá trị cũ trong DB -> màu đủ tương phản với chữ trắng (zinc không bị đổi khi bật chế độ tối, slate thì có).
const LEGACY_AVATAR: Record<string, string> = {
  'bg-emerald-600': 'bg-emerald-700',
  'bg-amber-600': 'bg-amber-700',
  'bg-slate-600': 'bg-zinc-700'
};

// Hàng dữ liệu thô từ PostgREST. Schema nằm ở supabase/migrations.
/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

export interface Profile {
  id: string;
  name: string;
  email: string;
  department: string;
  avatarColor: string;
  isAdmin: boolean;
}

export interface MemberRow {
  projectId: string;
  userId: string;
  role: MemberRole;
}

export const mapProfile = (r: Row): Profile => ({
  id: r.id,
  name: r.name,
  email: r.email ?? '',
  department: r.department ?? '',
  avatarColor: LEGACY_AVATAR[r.avatar_color] || r.avatar_color || AVATAR_COLORS[0],
  isAdmin: !!r.is_admin
});

export const mapMember = (r: Row): MemberRow => ({
  projectId: r.project_id,
  userId: r.user_id,
  role: r.role
});

export const mapProject = (r: Row, members: MemberRow[]): Project => ({
  id: r.id,
  code: r.code,
  name: r.name,
  description: r.description ?? '',
  status: r.status,
  priority: r.priority,
  managerId: r.manager_id ?? '',
  startDate: r.start_date,
  targetEndDate: r.target_end_date,
  budget: Number(r.budget ?? 0),
  progressPercent: r.progress_percent ?? 0,
  currentPhase: r.current_phase,
  progressModel: r.progress_model === 'stages' ? 'stages' : 'criteria',
  memberIds: members.filter(m => m.projectId === r.id).map(m => m.userId)
});

export const mapTask = (r: Row, collaborators: Row[] = []): Task => ({
  id: r.id,
  projectId: r.project_id,
  code: r.code,
  title: r.title,
  description: r.description ?? undefined,
  status: r.status,
  priority: r.priority,
  assigneeId: r.assignee_id ?? '',
  collaboratorIds: collaborators.filter(c => c.task_id === r.id).map(c => c.user_id),
  department: r.department ?? undefined,
  phase: r.phase ?? '',
  estimatedEffort: Number(r.estimated_effort ?? 0),
  actualEffort: Number(r.actual_effort ?? 0),
  startDate: r.start_date,
  dueDate: r.due_date,
  actualEndDate: r.actual_end_date ?? undefined,
  progressPercent: r.progress_percent ?? 0,
  assessment: r.assessment ?? undefined,
  deliverable: r.deliverable_description ?? '',
  notes: r.notes ?? '',
  tags: r.tags ?? [],
  useCaseId: r.use_case_id ?? undefined
});

export const mapUseCase = (r: Row, criteria: Row[], stages: Row[] = []): UseCase => ({
  id: r.id,
  projectId: r.project_id,
  parentId: r.parent_id ?? undefined,
  kind: r.kind === 'group' ? 'group' : 'usecase',
  tags: r.tags ?? [],
  complexity: r.complexity ?? undefined,
  transactions: r.transactions ?? undefined,
  necessity: r.necessity ?? 'B',
  origin: r.origin === 'added' || r.origin === 'adjusted' ? r.origin : 'contract',
  changeNote: r.change_note ?? '',
  agreedWhen: r.agreed_when ?? '',
  stagesDone: stages
    .filter(s => s.use_case_id === r.id)
    .map(s => ({ stage: s.stage, doneBy: s.done_by ?? undefined, doneAt: s.done_at })),
  code: r.code,
  title: r.title,
  actor: r.actor ?? '',
  description: r.description ?? '',
  priority: r.priority,
  status: r.status,
  progressPercent: r.progress_percent ?? 0,
  mainFlow: r.main_flow ?? [],
  alternateFlow: r.alternate_flow ?? [],
  acceptanceCriteria: criteria
    .filter(c => c.use_case_id === r.id)
    .sort((a, b) => a.sort - b.sort || String(a.created_at).localeCompare(String(b.created_at)))
    .map(c => ({ id: c.id, description: c.description, completed: !!c.completed })),
  assignedTo: r.assigned_to ?? undefined,
  updatedAt: String(r.updated_at ?? '').slice(0, 10)
});

export const mapNotification = (r: Row): NotificationItem => ({
  id: r.id,
  projectId: r.project_id ?? '',
  type: r.type,
  title: r.title,
  message: r.message,
  taskId: r.task_id ?? undefined,
  useCaseId: r.use_case_id ?? undefined,
  createdAt: new Date(r.created_at).toLocaleString('vi-VN'),
  isRead: !!r.is_read
});

export const mapReportSchedule = (r: Row): ReportSchedule => ({
  id: r.id,
  projectId: r.project_id,
  frequency: r.frequency,
  enabled: !!r.enabled,
  lastRunOn: r.last_run_on ?? undefined
});

export const mapReportRun = (r: Row): ReportRun => ({
  id: r.id,
  projectId: r.project_id,
  frequency: r.frequency,
  periodStart: r.period_start,
  periodEnd: r.period_end,
  createdAt: r.created_at,
  summary: r.summary
});

export const mapSnapshot =(r: Row): ProgressSnapshot & { projectId: string } => ({
  projectId: r.project_id,
  date: r.snap_date,
  progressPercent: r.progress_percent ?? 0,
  tasksTotal: r.tasks_total ?? 0,
  tasksDone: r.tasks_done ?? 0,
  qualityTotal: r.quality_total ?? 0,
  qualityPassed: r.quality_passed ?? 0
});

const mapQualityItem =(r: Row): QualityCheckItem => ({
  id: r.id,
  title: r.title,
  description: r.description ?? '',
  isMandatory: !!r.is_mandatory,
  isPassed: !!r.is_passed,
  checkedBy: r.checked_by ?? undefined,
  checkedAt: r.checked_at ?? undefined,
  notes: r.notes ?? undefined
});

/** Ghép quality_phase_defs + quality_items thành cấu trúc ProjectQualityGates mà UI đang dùng. */
export function buildQualityGates(projectIds: string[], defs: Row[], items: Row[]): ProjectQualityGates[] {
  const sortedDefs = [...defs].sort((a, b) => a.sort - b.sort);
  return projectIds.map(projectId => ({
    projectId,
    phases: sortedDefs.map(
      (d): QualityGatePhase => ({
        id: d.key,
        name: d.name,
        shortName: d.short_name,
        description: d.description,
        items: items
          .filter(i => i.project_id === projectId && i.phase_key === d.key)
          .sort((a, b) => a.sort - b.sort || String(a.created_at).localeCompare(String(b.created_at)))
          .map(mapQualityItem)
      })
    )
  }));
}
