/** pm = Quản lý dự án, dev = Lập trình, ba = Phân tích nghiệp vụ, tester = Kiểm thử, viewer = Quan sát (chỉ xem). */
export type Role = 'admin' | 'pm' | 'dev' | 'ba' | 'tester' | 'viewer';
/** Vai trò gán theo từng dự án (quản trị viên là quyền toàn hệ thống, không nằm ở đây). */
export type MemberRole = Exclude<Role, 'admin'>;
/** Bộ phận thực hiện nhiệm vụ. */
export type Department = 'pm' | 'ba' | 'dev' | 'tester';
export const DEPARTMENTS: Department[] = ['pm', 'ba', 'dev', 'tester'];

export interface User {
  id: string;
  name: string;
  email: string;
  avatarColor: string;
  /** Vai trò hiệu lực trong dự án đang chọn: 'admin' nếu là quản trị viên toàn hệ thống. */
  role: Role;
  isAdmin: boolean;
  department: string;
}

export type ProjectStatus = 'planning' | 'in_progress' | 'review' | 'completed' | 'on_hold';
export type Priority = 'low' | 'medium' | 'high' | 'urgent';

/** criteria = tiến độ use case theo tiêu chí nghiệm thu; stages = theo 5 bước chuẩn (Phân tích → Nghiệm thu). */
export type ProgressModel = 'criteria' | 'stages';

export interface Project {
  id: string;
  code: string;
  name: string;
  description: string;
  status: ProjectStatus;
  priority: Priority;
  managerId: string;
  startDate: string;
  targetEndDate: string;
  budget: number; // VND
  progressPercent: number;
  currentPhase: 'phase_1' | 'phase_2' | 'phase_3' | 'phase_4' | 'phase_5';
  progressModel: ProgressModel;
  memberIds: string[];
}

export type TaskStatus = 'todo' | 'in_progress' | 'review' | 'done';
/** Đánh giá tiến độ: vượt tiến độ / đúng tiến độ / rủi ro chậm / chậm tiến độ. */
export type TaskAssessment = 'ahead' | 'on_track' | 'at_risk' | 'delayed';

export interface Task {
  id: string;
  projectId: string;
  code: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: Priority;
  /** Người chủ trì (1 người). */
  assigneeId: string;
  /** Người phối hợp (nhiều người). */
  collaboratorIds: string[];
  department?: Department;
  phase: string;
  /** Nỗ lực tính theo ngày công (man-day). */
  estimatedEffort: number;
  actualEffort: number;
  /** Ngày bắt đầu dự kiến. */
  startDate: string;
  /** Ngày kết thúc (deadline). */
  dueDate: string;
  /** Ngày hoàn thành thực tế (tự ghi khi chuyển sang Hoàn thành). */
  actualEndDate?: string;
  progressPercent: number;
  /** Đánh giá do người dùng chọn; để trống thì hệ thống gợi ý (xem utils/taskAssessment.ts). */
  assessment?: TaskAssessment;
  /** Mô tả yêu cầu đầu ra. */
  deliverable: string;
  notes: string;
  tags?: string[];
  useCaseId?: string;
}

export type UseCaseStatus = 'draft' | 'in_review' | 'approved' | 'developing' | 'tested' | 'completed';
/** group = module/nhóm chức năng (chỉ để gom), usecase = use case thật. */
export type UseCaseKind = 'group' | 'usecase';
export type UseCaseComplexity = 'simple' | 'medium' | 'complex';

export interface UseCase {
  id: string;
  projectId: string;
  /** Use case cha (phân tối đa 3 cấp). */
  parentId?: string;
  kind: UseCaseKind;
  /** Nhãn phân loại (Web, Mobile, Tích hợp dữ liệu...). */
  tags: string[];
  complexity?: UseCaseComplexity;
  /** Số transaction của use case. */
  transactions?: number;
  /** Mức độ cần thiết (B, M, T). */
  necessity: string;
  /** Các bước chuẩn đã hoàn thành (chỉ dùng khi dự án có progressModel = stages). */
  stagesDone: { stage: 'analysis' | 'design' | 'coding' | 'testing' | 'acceptance'; doneBy?: string; doneAt: string }[];
  code: string;
  title: string;
  actor: string;
  description: string;
  priority: Priority;
  status: UseCaseStatus;
  progressPercent: number;
  mainFlow: string[];
  alternateFlow?: string[];
  acceptanceCriteria: {
    id: string;
    description: string;
    completed: boolean;
  }[];
  assignedTo?: string;
  updatedAt: string;
}

export interface QualityCheckItem {
  id: string;
  title: string;
  description: string;
  isMandatory: boolean;
  isPassed: boolean;
  checkedBy?: string;
  checkedAt?: string;
  notes?: string;
}

export interface QualityGatePhase {
  id: 'phase_1' | 'phase_2' | 'phase_3' | 'phase_4' | 'phase_5';
  name: string;
  shortName: string;
  description: string;
  items: QualityCheckItem[];
}

export interface ProjectQualityGates {
  id?: string;
  projectId: string;
  phases: QualityGatePhase[];
}

export type NotificationType = 'overdue' | 'deadline_warning' | 'quality_alert' | 'system';

export interface NotificationItem {
  id: string;
  projectId: string;
  type: NotificationType;
  title: string;
  message: string;
  taskId?: string;
  useCaseId?: string;
  createdAt: string;
  isRead: boolean;
}

/** Ảnh chụp tiến độ dự án theo ngày (bảng progress_snapshots), dùng cho biểu đồ. */
export interface ProgressSnapshot {
  date: string;
  progressPercent: number;
  tasksTotal: number;
  tasksDone: number;
  qualityTotal: number;
  qualityPassed: number;
}

export type ReportFrequency = 'weekly' | 'monthly' | 'sprint';

export interface ReportSchedule {
  id: string;
  projectId: string;
  frequency: Exclude<ReportFrequency, 'sprint'>;
  enabled: boolean;
  lastRunOn?: string;
}

/** Bản tóm tắt JSON do DB dựng (hàm build_report_summary). */
export interface ReportSummary {
  project: { code: string; name: string; phase: string };
  progress: { start: number | null; end: number; delta: number | null };
  tasks: {
    total: number;
    done: number;
    inProgress: number;
    review: number;
    todo: number;
    overdue: number;
    doneInPeriod: number | null;
  };
  useCases: { total: number; completed: number };
  quality: { total: number; passed: number };
  attention: { code: string; title: string; dueDate: string; status: TaskStatus }[];
}

export interface ReportRun {
  id: string;
  projectId: string;
  frequency: ReportFrequency;
  periodStart: string;
  periodEnd: string;
  createdAt: string;
  summary: ReportSummary;
}

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

export type NavigationTab =
  | 'dashboard' 
  | 'projects' 
  | 'tasks' 
  | 'usecases' 
  | 'quality' 
  | 'reports' 
  | 'team';
