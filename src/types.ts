export type Role = 'admin' | 'pm' | 'developer' | 'qa' | 'viewer';
/** Vai trò gán theo từng dự án (quản trị viên là quyền toàn hệ thống, không nằm ở đây). */
export type MemberRole = Exclude<Role, 'admin'>;

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
  memberIds: string[];
}

export type TaskStatus = 'todo' | 'in_progress' | 'review' | 'done';

export interface Task {
  id: string;
  projectId: string;
  code: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: Priority;
  assigneeId: string;
  phase: string;
  estimatedHours: number;
  actualHours: number;
  startDate: string;
  dueDate: string;
  tags?: string[];
  useCaseId?: string;
}

export type UseCaseStatus = 'draft' | 'in_review' | 'approved' | 'developing' | 'tested' | 'completed';

export interface UseCase {
  id: string;
  projectId: string;
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

export type NavigationTab = 
  | 'dashboard' 
  | 'projects' 
  | 'tasks' 
  | 'usecases' 
  | 'quality' 
  | 'reports' 
  | 'team';
