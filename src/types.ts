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
  /** Tài khoản ảo: người do admin thêm vào dự án nhưng chưa đăng ký. */
  isPlaceholder: boolean;
}

/** Gợi ý tài khoản khi thêm thành viên vào dự án. */
export interface AccountSuggestion {
  id: string;
  name: string;
  email: string;
  avatarColor: string;
  isPlaceholder: boolean;
}

/** Yêu cầu hợp nhất tài khoản ảo vào tài khoản thật vừa đăng ký trùng tên (chỉ admin thấy). */
export interface MergeRequest {
  id: string;
  placeholderId: string;
  userId: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
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
  /** Riêng tư: chỉ thành viên. Công khai: ai biết địa chỉ cũng xem được (chỉ đọc, với tư cách Khách). */
  visibility: 'private' | 'public';
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
  /** Các use case liên kết (nhiều). */
  useCaseIds: string[];
}

export type UseCaseStatus = 'draft' | 'in_review' | 'approved' | 'developing' | 'tested' | 'completed' | 'cancelled';
/** Nguồn gốc: theo hợp đồng / bổ sung sau hợp đồng / điều chỉnh so với hợp đồng. */
export type UseCaseOrigin = 'contract' | 'added' | 'adjusted';
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
  origin: UseCaseOrigin;
  /** Lý do bổ sung / không thực hiện / giải trình điều chỉnh. */
  changeNote: string;
  /** Thời điểm thống nhất với khách hàng (văn bản tự do). */
  agreedWhen: string;
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

export type NotificationType = 'overdue' | 'deadline_warning' | 'quality_alert' | 'system' | 'issue';

export interface NotificationItem {
  id: string;
  projectId: string;
  type: NotificationType;
  title: string;
  message: string;
  taskId?: string;
  useCaseId?: string;
  issueId?: string;
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
  | 'issues'
  | 'reports' 
  | 'team'
  | 'accounts';

/** Liên kết Telegram của người dùng hiện tại (RPC get_my_telegram). */
export interface TelegramInfo {
  chatId: string;
  enabled: boolean;
  /** Quản trị viên đã lưu token bot vào Vault chưa. */
  configured: boolean;
  botUsername: string | null;
}

// ---------- Quản lý issue (bug / yêu cầu thay đổi) ----------
export type IssueColor = 'indigo' | 'emerald' | 'blue' | 'amber' | 'rose' | 'purple' | 'slate';
export type IssueStatusCategory = 'open' | 'in_progress' | 'closed';
export type IssueSeverity = 'minor' | 'major' | 'critical' | 'blocker';

export interface IssueTypeDef {
  id: string;
  projectId: string;
  name: string;
  color: IssueColor;
  sort: number;
  active: boolean;
}

export interface IssueStatusDef {
  id: string;
  projectId: string;
  name: string;
  color: IssueColor;
  /** open: còn mở; in_progress: đang xử lý; closed: đã đóng (không tính vào "còn mở"). */
  category: IssueStatusCategory;
  sort: number;
  active: boolean;
  /** Trạng thái gán cho issue mới (đúng một trạng thái đang bật). */
  initial: boolean;
}

export interface IssuePriorityDef {
  id: string;
  projectId: string;
  name: string;
  color: IssueColor;
  /** Thứ tự từ cao xuống thấp (số nhỏ = ưu tiên cao hơn). */
  sort: number;
  active: boolean;
  /** Mức gán cho issue mới (đúng một mức đang bật). */
  isDefault: boolean;
}

export interface Issue {
  id: string;
  projectId: string;
  /** Số thứ tự trong dự án (hiển thị #12). */
  number: number;
  typeId: string;
  statusId: string;
  title: string;
  description: string;
  priorityId: string;
  severity?: IssueSeverity;
  environment: string;
  reporterId?: string;
  assigneeId?: string;
  dueDate?: string;
  useCaseId?: string;
  taskId?: string;
  closedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface IssueJournalDetail {
  id: number;
  field: string;
  oldValue?: string;
  newValue?: string;
}

/** Ảnh / video đính kèm issue (tệp thật nằm trong kho riêng tư của Supabase Storage). */
export interface IssueAttachment {
  id: string;
  issueId: string;
  projectId: string;
  journalId?: string;
  uploaderId?: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  kind: 'image' | 'video';
  storagePath: string;
  createdAt: string;
}

export interface AttachmentUsage {
  projectBytes: number;
  projectCount: number;
  /** Chỉ Admin thấy tổng toàn hệ thống. */
  totalBytes?: number;
  capBytes: number;
}

/** Một dòng nhật ký (kiểu Redmine): ai làm gì lúc nào, ghi chú, các trường đã đổi; có thể trả lời lồng nhau (tối đa 3 cấp). */
export interface IssueJournal {
  id: string;
  issueId: string;
  parentId?: string;
  userId?: string;
  notes: string;
  createdAt: string;
  editedAt?: string;
  deletedAt?: string;
  details: IssueJournalDetail[];
}
