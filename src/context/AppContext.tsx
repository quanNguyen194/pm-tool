import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode
} from 'react';
import {
  User,
  Project,
  Task,
  UseCase,
  ProjectQualityGates,
  QualityCheckItem,
  NotificationItem,
  NavigationTab,
  TaskStatus,
  Role,
  MemberRole,
  ProgressSnapshot,
  ReportFrequency,
  ReportRun,
  ReportSchedule,
  Toast,
  AccountSuggestion,
  MergeRequest,
  TelegramInfo,
  AttachmentUsage,
  Issue,
  IssueAttachment,
  IssueJournal,
  IssuePriorityDef,
  IssueStatusDef,
  IssueTypeDef
} from '../types';
import { supabase, describeError, fetchAll } from '../lib/supabase';
import { can, setEffectiveMatrix, AccessReport, MatrixData, PermissionId } from '../utils/permissions';
import {
  Profile,
  MemberRow,
  mapProfile,
  mapMember,
  mapProject,
  mapTask,
  mapUseCase,
  mapIssue,
  mapIssueAttachment,
  mapIssueJournal,
  mapIssuePriority,
  mapIssueStatus,
  mapIssueType,
  mapMergeRequest,
  mapNotification,
  mapSnapshot,
  mapReportSchedule,
  mapReportRun,
  buildQualityGates
} from '../api/mappers';
import { useAuth } from './AuthContext';
import { sound } from '../utils/soundAlert';
import { useRouter } from '../router/Router';
import { buildPath, parsePath, PathTarget } from '../router/paths';
import { ATTACH_BUCKET, checkPrepared, extForMime, mimeOf } from '../utils/attachments';
import { StageKey, STAGES, STAGE_LABEL, canTickStage as roleCanTickStage } from '../utils/stages';

/** Đích của một liên kết nội bộ. Có mã mục (nhiệm vụ / issue / use case) thì tab và dự án suy ra từ mục đó. */
export interface LinkTarget {
  tab?: NavigationTab;
  projectId?: string;
  taskId?: string;
  issueId?: string;
  useCaseId?: string;
}

interface AppContextType {
  /** Tab đang xem, lấy từ địa chỉ (URL). */
  activeTab: NavigationTab;
  /** Chuyển tab của dự án đang chọn (đổi địa chỉ). */
  setActiveTab: (tab: NavigationTab) => void;
  /** Mã của mục đang mở theo địa chỉ: mã nhiệm vụ, số issue hoặc mã use case. null = không mở mục nào. */
  routeItemCode: string | null;
  /** Dự án trong địa chỉ không tồn tại hoặc bạn không có quyền xem. */
  routeProjectMissing: boolean;
  /** Đường dẫn (tương đối) tới một màn hình hoặc một mục, theo mã dễ đọc. */
  hrefFor: (target: LinkTarget) => string;
  /** Sao chép địa chỉ đầy đủ của một đường dẫn vào clipboard và báo bằng thông báo. */
  copyLink: (href: string) => Promise<void>;
  /** Đóng chi tiết đang mở và về danh sách của tab. */
  closeItem: () => void;
  /** Mở chi tiết nhiệm vụ (đổi dự án và tab nếu cần). */
  openTask: (taskId: string, projectId?: string) => void;
  /** Mở một use case trong cây use case (tự mở nhánh cha và cuộn tới). */
  openUseCase: (useCaseId: string) => void;

  /** Thành viên của dự án đang chọn (kèm vai trò hiệu lực trong dự án đó). */
  users: User[];
  /** Mọi người dùng mà bạn nhìn thấy (dùng khi chọn PM cho dự án). */
  allUsers: User[];
  currentUser: User;
  signOut: () => Promise<void>;

  projects: Project[];
  activeProjectId: string;
  activeProject: Project;
  setActiveProjectId: (id: string) => void;
  tasks: Task[];
  projectTasks: Task[];
  useCases: UseCase[];
  projectUseCases: UseCase[];
  qualityGates: ProjectQualityGates[];
  projectQualityGates: ProjectQualityGates | undefined;
  notifications: NotificationItem[];
  unreadNotificationCount: number;
  /** Lịch sử tiến độ của dự án đang chọn (cũ -> mới), dùng vẽ biểu đồ. */
  projectSnapshots: ProgressSnapshot[];
  /** Lịch báo cáo định kỳ + các bản báo cáo đã tạo của dự án đang chọn (mới nhất trước). */
  reportSchedules: ReportSchedule[];
  reportRuns: ReportRun[];

  // Trạng thái tải dữ liệu
  isLoading: boolean;
  loadError: string | null;
  reload: () => void;
  /** Thông báo nổi (thành công / lỗi / thông tin). Tự ẩn sau vài giây. */
  toasts: Toast[];
  dismissToast: (id: string) => void;

  // Quyền (tính từ vai trò trong dự án đang chọn; DB (RLS) mới là nơi chốt quyền thật)
  isAdmin: boolean;
  canManageProject: boolean;
  canManageProjectId: (projectId: string) => boolean;
  canManageTasks: boolean;
  /** Tạo/sửa/xóa use case + tiêu chí (admin, PM, DEV, BA). */
  canManageUseCases: boolean;
  canApproveQuality: boolean;
  /** Thêm/sửa/xóa tiêu chuẩn Quality Gates (khác với thẩm định Đạt/Chưa đạt). */
  canEditQualityItems: boolean;
  // --- Issue (bug / yêu cầu thay đổi) ---
  /** false khi DB chưa chạy migration 0023: tab hiện hướng dẫn thay vì dữ liệu. */
  issuesAvailable: boolean;
  /** Cách xem tab Lỗi & Yêu cầu: danh sách hoặc Kanban (lưu theo trình duyệt). */
  issueView: 'list' | 'board';
  setIssueView: (v: 'list' | 'board') => void;
  projectIssues: Issue[];
  issueTypes: IssueTypeDef[];
  issueStatuses: IssueStatusDef[];
  /** Độ ưu tiên của dự án đang chọn, từ cao xuống thấp (gồm cả mức đã ẩn). */
  issuePriorities: IssuePriorityDef[];
  /** Nhật ký của một issue (đã xếp theo thời gian; dựng cây bằng parentId). */
  getIssueJournals: (issueId: string) => IssueJournal[];
  canCreateIssue: boolean;
  canUpdateIssue: boolean;
  canEditIssue: boolean;
  canAssignIssue: boolean;
  canDeleteIssue: boolean;
  canConfigIssueTypes: boolean;
  canConfigIssueStatuses: boolean;
  /** Ghi nhận issue; trả về { id, number } hoặc null nếu lỗi (đã báo bằng thông báo). */
  createIssue: (input: {
    typeId: string;
    title: string;
    description: string;
    priorityId?: string;
    severity?: string;
    environment: string;
    assigneeId?: string;
    dueDate?: string;
    useCaseId?: string;
    taskId?: string;
  }, files?: File[]) => Promise<{ id: string; number: number } | null>;
  /** Cập nhật issue + ghi nhật ký. changes dùng khóa DB: status_id, assignee_id, type_id, priority_id, severity, title, description, environment, due_date, use_case_id, task_id. */
  updateIssue: (issueId: string, changes: Record<string, string | null>, notes?: string, parentId?: string, files?: File[]) => Promise<boolean>;
  editIssueNote: (journalId: string, notes: string) => Promise<boolean>;
  deleteIssueNote: (journalId: string) => Promise<boolean>;
  deleteIssue: (issueId: string) => Promise<boolean>;
  /** Ảnh / video đính kèm. attachmentsAvailable=false khi DB chưa chạy migration 0024. */
  attachmentsAvailable: boolean;
  getIssueAttachments: (issueId: string) => IssueAttachment[];
  /** Link xem có hạn (signed URL) cho các tệp; tệp lỗi sẽ vắng mặt trong kết quả. */
  getAttachmentUrls: (paths: string[]) => Promise<Record<string, string>>;
  deleteIssueAttachment: (attachmentId: string) => Promise<boolean>;
  getAttachmentUsage: () => Promise<AttachmentUsage | null>;
  saveIssueTypes: (items: { id?: string; name: string; color: string; active: boolean }[], removeIds: string[]) => Promise<string | null>;
  saveIssuePriorities: (items: { id?: string; name: string; color: string; active: boolean; isDefault: boolean }[], removeIds: string[]) => Promise<string | null>;
  saveIssueStatuses: (
    items: { id?: string; name: string; color: string; category: string; active: boolean; initial: boolean }[],
    removeIds: string[]
  ) => Promise<string | null>;
  /** Mở chi tiết issue (đổi dự án và tab nếu cần). */
  openIssue: (issueId: string, projectId?: string) => void;
  canApproveUseCase: boolean;
  /** Vai trò hiện tại có được tick bước chuẩn này của use case không. */
  canTickStage: (stage: StageKey) => boolean;
  isViewer: boolean;

  // Dự án
  createProject: (project: Omit<Project, 'id' | 'progressPercent'>) => void;
  updateProject: (project: Project) => void;
  deleteProject: (id: string) => void;
  // Thành viên
  addMember: (email: string, role: MemberRole) => Promise<boolean>;
  /** Gợi ý tài khoản (chưa thuộc dự án) theo tên/email khi gõ trong ô thêm thành viên. */
  suggestAccounts: (query: string) => Promise<AccountSuggestion[]>;
  addMemberById: (userId: string, role: MemberRole) => Promise<boolean>;
  /** Admin: thêm người chưa đăng ký (tạo tài khoản ảo hoặc dùng lại tài khoản ảo cùng tên). */
  createPlaceholderMember: (name: string, role: MemberRole) => Promise<boolean>;
  deletePlaceholder: (userId: string) => void;
  /** Yêu cầu hợp nhất tài khoản ảo đang chờ admin duyệt (chỉ admin có dữ liệu). */
  mergeRequests: MergeRequest[];
  resolveMerge: (requestId: string, approve: boolean) => void;
  setMemberRole: (userId: string, role: MemberRole) => void;
  removeMember: (userId: string) => void;
  // Nhiệm vụ
  createTask: (task: Omit<Task, 'id'>) => void;
  updateTask: (task: Task) => void;
  deleteTask: (id: string) => void;
  moveTaskStatus: (taskId: string, newStatus: TaskStatus) => void;
  // Use case
  createUseCase: (useCase: Omit<UseCase, 'id' | 'updatedAt' | 'stagesDone'>) => void;
  updateUseCase: (useCase: UseCase) => void;
  deleteUseCase: (id: string) => void;
  toggleAcceptanceCriteria: (useCaseId: string, criteriaId: string) => void;
  /** Đánh dấu/bỏ đánh dấu một bước chuẩn cho một hoặc nhiều use case lá. */
  setUseCaseStages: (useCaseIds: string[], stage: StageKey, done: boolean, actorId?: string) => Promise<boolean>;
  /** Đưa các use case lá về một mức tiến độ (0 = chưa bắt đầu ... 5 = xong nghiệm thu): vừa đánh dấu vừa bỏ đánh dấu đúng thứ tự. */
  setUseCaseLevel: (useCaseIds: string[], level: number, actorId?: string) => Promise<boolean>;
  /** Quyền thực tế của chính mình trong dự án đang chọn, theo CSDL (kèm số dòng đọc được). */
  getAccessReport: () => Promise<AccessReport>;
  /** Admin/PM: quyền thực tế của một thành viên theo CSDL. */
  getMemberAccessReport: (userId: string) => Promise<AccessReport>;
  /** Ma trận phân quyền hiệu lực của dự án đang chọn (kèm nguồn: mặc định / toàn hệ thống / riêng dự án). */
  permissionMatrix: MatrixData | null;
  /** Ma trận ở phạm vi toàn hệ thống (null = dự án) để quản trị viên chỉnh. */
  getPermissionMatrix: (scope: 'global' | 'project') => Promise<MatrixData>;
  /** Admin: lưu thay đổi ma trận. Trả về thông báo lỗi hoặc null nếu thành công. */
  savePermissions: (scope: 'global' | 'project', changes: { role: string; permission: PermissionId; allowed: boolean }[]) => Promise<string | null>;
  /** Admin: xóa mọi ghi đè của phạm vi, trả về số ghi đè đã xóa hoặc thông báo lỗi. */
  resetPermissions: (scope: 'global' | 'project') => Promise<{ removed: number } | { error: string }>;
  /** Admin: nhật ký thay đổi của phạm vi. */
  getPermissionLog: (scope: 'global' | 'project') => Promise<{ role: string; permission: string; from: boolean; to: boolean; by: string; at: string }[]>;
  // Quality gates
  /** actorId: chỉ admin được chọn người thực hiện khác (ghi nhận người duyệt). */
  toggleQualityItemPassed: (phaseId: string, itemId: string, notes?: string, actorId?: string) => void;
  updateQualityNotes: (itemId: string, notes: string) => void;
  addQualityItem: (phaseId: string, item: Omit<QualityCheckItem, 'id' | 'isPassed'>) => void;
  /** Sửa tên/mô tả/bắt buộc của một tiêu chuẩn (kể cả mặc định). */
  editQualityItem: (itemId: string, patch: { title: string; description: string; isMandatory: boolean }) => void;
  /** Xóa một tiêu chuẩn của dự án này (mẫu gốc của hệ thống không bị ảnh hưởng). */
  deleteQualityItem: (itemId: string) => void;
  // Thông báo
  sendDeadlineReminder: (taskId: string) => void;
  // Nhắc nhở qua Telegram (liên kết của chính người đăng nhập)
  getTelegram: () => Promise<TelegramInfo>;
  /** Lưu Chat ID (rỗng = gỡ liên kết). Trả về thông báo lỗi hoặc null nếu thành công. */
  saveTelegram: (chatId: string, enabled: boolean) => Promise<string | null>;
  /** Gửi tin thử tới Telegram của mình và chờ kết quả. */
  testTelegram: () => Promise<{ ok: boolean; message: string }>;
  markNotificationAsRead: (id: string) => void;
  markAllNotificationsAsRead: () => void;
  // Quản trị
  seedDemoData: () => void;
  /** Admin: quét ngay các task quá hạn / sắp đến hạn và tạo thông báo (cron cũng chạy việc này hằng ngày). */
  scanDeadlines: () => void;
  // Báo cáo định kỳ
  setReportSchedule: (frequency: 'weekly' | 'monthly', enabled: boolean) => void;
  generateReportNow: (frequency: ReportFrequency) => void;
  soundMuted: boolean;
  toggleSound: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const STORAGE_KEYS = {
  ACTIVE_PROJECT: 'omni_active_proj_id_v2',
  SOUND_MUTED: 'omni_sound_muted_v1',
  ISSUE_VIEW: 'omni_issue_view_v1'
};

const safeGet = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const safeSet = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* bỏ qua: chế độ riêng tư / bị chặn lưu trữ */
  }
};

type Slice =
  | 'profiles'
  | 'members'
  | 'projects'
  | 'tasks'
  | 'usecases'
  | 'quality'
  | 'notifications'
  | 'snapshots'
  | 'reports'
  | 'merges'
  | 'permissions'
  | 'issues';
const ALL_SLICES: Slice[] = [
  'profiles',
  'members',
  'projects',
  'tasks',
  'usecases',
  'quality',
  'notifications',
  'snapshots',
  'reports',
  'merges',
  'permissions',
  'issues'
];

// Bảng nào thay đổi thì tải lại những phần dữ liệu nào.
const TABLE_SLICES: Record<string, Slice[]> = {
  projects: ['projects'],
  project_members: ['members', 'projects', 'profiles'],
  tasks: ['tasks'],
  task_collaborators: ['tasks'],
  task_use_cases: ['tasks'],
  use_cases: ['usecases'],
  acceptance_criteria: ['usecases'],
  use_case_stages: ['usecases'],
  quality_items: ['quality'],
  notifications: ['notifications'],
  progress_snapshots: ['snapshots'],
  report_schedules: ['reports'],
  report_runs: ['reports'],
  account_merge_requests: ['merges', 'profiles'],
  role_permissions: ['permissions'],
  issues: ['issues'],
  issue_journals: ['issues'],
  issue_journal_details: ['issues'],
  issue_attachments: ['issues'],
  issue_types: ['issues'],
  issue_statuses: ['issues'],
  issue_priorities: ['issues']
};

type Row = Record<string, any>;

const LEGACY_AVATAR_FALLBACK = (c: string | null | undefined) =>
  ({ 'bg-emerald-600': 'bg-emerald-700', 'bg-amber-600': 'bg-amber-700', 'bg-slate-600': 'bg-zinc-700' } as Record<string, string>)[c || ''] ||
  c ||
  'bg-indigo-600';

const toUser = (p: Profile, role: Role): User => ({
  id: p.id,
  name: p.name,
  email: p.email,
  avatarColor: p.avatarColor,
  role,
  isAdmin: p.isAdmin,
  department: p.department,
  isPlaceholder: p.isPlaceholder
});

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { profile, signOut } = useAuth();
  if (!profile) throw new Error('AppProvider requires a signed-in profile');

  // Địa chỉ (URL) là nguồn sự thật của tab, dự án và mục đang mở.
  const { pathname, search, navigate, closeTo, query, setQuery } = useRouter();
  const route = useMemo(() => parsePath(pathname), [pathname]);
  const activeTab: NavigationTab = route.kind === 'app' ? route.tab : 'dashboard';
  const routeItemCode = route.kind === 'app' ? route.itemCode ?? null : null;
  const [soundMuted, setSoundMuted] = useState<boolean>(() => safeGet(STORAGE_KEYS.SOUND_MUTED) === 'true');

  const toggleSound = () => {
    const next = !soundMuted;
    setSoundMuted(next);
    sound.setMuted(next);
    safeSet(STORAGE_KEYS.SOUND_MUTED, String(next));
  };

  // --- Dữ liệu thô từ DB ---
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [projectRows, setProjectRows] = useState<Row[]>([]);
  const [taskRows, setTaskRows] = useState<Row[]>([]);
  const [collabRows, setCollabRows] = useState<Row[]>([]);
  const [taskUcRows, setTaskUcRows] = useState<Row[]>([]);
  const [ucRows, setUcRows] = useState<Row[]>([]);
  const [criteriaRows, setCriteriaRows] = useState<Row[]>([]);
  const [stageRows, setStageRows] = useState<Row[]>([]);
  const [qualityDefs, setQualityDefs] = useState<Row[]>([]);
  const [qualityRows, setQualityRows] = useState<Row[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [snapshotRows, setSnapshotRows] = useState<(ProgressSnapshot & { projectId: string })[]>([]);
  const [scheduleRows, setScheduleRows] = useState<ReportSchedule[]>([]);
  const [runRows, setRunRows] = useState<ReportRun[]>([]);
  const [mergeRows, setMergeRows] = useState<MergeRequest[]>([]);
  // Quản lý issue (bug / yêu cầu thay đổi). issuesAvailable=false khi DB chưa chạy migration 0023.
  const [issueRows, setIssueRows] = useState<Issue[]>([]);
  const [issueJournals, setIssueJournals] = useState<IssueJournal[]>([]);
  const [issueTypeRows, setIssueTypeRows] = useState<IssueTypeDef[]>([]);
  const [issueStatusRows, setIssueStatusRows] = useState<IssueStatusDef[]>([]);
  const [issuePriorityRows, setIssuePriorityRows] = useState<IssuePriorityDef[]>([]);
  const [issuesAvailable, setIssuesAvailable] = useState(true);
  // Cách xem tab Lỗi & Yêu cầu: tham số ?view= trên địa chỉ ưu tiên, không có thì theo lựa chọn đã lưu của trình duyệt
  const [issueViewPref, setIssueViewPref] = useState<'list' | 'board'>(() => (safeGet(STORAGE_KEYS.ISSUE_VIEW) === 'board' ? 'board' : 'list'));
  const issueView: 'list' | 'board' = query.get('view') === 'board' ? 'board' : query.get('view') === 'list' ? 'list' : issueViewPref;
  const setIssueView = (v: 'list' | 'board') => {
    setIssueViewPref(v);
    safeSet(STORAGE_KEYS.ISSUE_VIEW, v);
    setQuery('view', v === 'board' ? 'board' : null);
  };
  const [issueAttachmentRows, setIssueAttachmentRows] = useState<IssueAttachment[]>([]);
  const [attachmentsAvailable, setAttachmentsAvailable] = useState(false);
  // Ma trận phân quyền hiệu lực của dự án đang chọn (null = chưa nạp được: dùng mặc định có sẵn)
  const [permMatrix, setPermMatrix] = useState<MatrixData | null>(null);
  const activeProjectIdRef = useRef('');

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastSeq = useRef(0);
  // Thông báo thành công của thao tác sắp chạy (do run() đọc và xóa ngay khi bắt đầu).
  const pendingSuccess = useRef<string | undefined>(undefined);
  const announce = (message: string) => {
    pendingSuccess.current = message;
  };

  const dismissToast = useCallback((id: string) => setToasts(prev => prev.filter(t => t.id !== id)), []);
  const pushToast = useCallback(
    (type: Toast['type'], message: string) => {
      const id = `toast-${++toastSeq.current}`;
      setToasts(prev => [...prev.slice(-3), { id, type, message }]);
      setTimeout(() => dismissToast(id), type === 'success' ? 4500 : 8000);
    },
    [dismissToast]
  );
  const [activeProjectIdState, setActiveProjectIdState] = useState<string>(
    () => safeGet(STORAGE_KEYS.ACTIVE_PROJECT) || ''
  );

  const fetchers = useMemo<Record<Slice, () => Promise<void>>>(
    () => ({
      profiles: async () => {
        const { data, error } = await supabase.from('profiles').select('*').order('created_at');
        if (error) throw error;
        setProfiles((data || []).map(mapProfile));
      },
      members: async () => {
        const { data, error } = await fetchAll<MemberRow>((a, b) =>
          supabase.from('project_members').select('*').order('project_id').order('user_id').range(a, b)
        );
        if (error) throw error;
        setMembers(data.map(mapMember));
      },
      projects: async () => {
        const { data, error } = await supabase
          .from('projects')
          .select('*')
          .order('created_at', { ascending: false })
          .order('code'); // tiêu chí phụ: bản ghi tạo cùng giao dịch có created_at trùng nhau
        if (error) throw error;
        setProjectRows(data || []);
      },
      tasks: async () => {
        const [tk, co, tu] = await Promise.all([
          fetchAll<any>((a, b) => supabase.from('tasks').select('*').order('created_at', { ascending: false }).order('code').order('id').range(a, b)),
          fetchAll<any>((a, b) => supabase.from('task_collaborators').select('*').order('task_id').order('user_id').range(a, b)),
          fetchAll<any>((a, b) => supabase.from('task_use_cases').select('*').order('task_id').order('use_case_id').range(a, b))
        ]);
        if (tk.error) throw tk.error;
        if (co.error) throw co.error;
        // Liên kết nhiều use case là phần phụ: lỗi (vd chưa chạy migration 0012) thì dùng cột cũ use_case_id.
        if (tu.error) console.warn('Không tải được liên kết use case của nhiệm vụ:', tu.error.message);
        setTaskRows(tk.data);
        setCollabRows(co.data);
        setTaskUcRows(tu.error ? [] : tu.data);
      },
      usecases: async () => {
        const [uc, cr, st] = await Promise.all([
          fetchAll<any>((a, b) => supabase.from('use_cases').select('*').order('created_at', { ascending: false }).order('code').order('id').range(a, b)),
          fetchAll<any>((a, b) => supabase.from('acceptance_criteria').select('*').order('id').range(a, b)),
          fetchAll<any>((a, b) => supabase.from('use_case_stages').select('*').order('use_case_id').order('stage').range(a, b))
        ]);
        if (uc.error) throw uc.error;
        if (cr.error) throw cr.error;
        // Bảng bước chuẩn là phần phụ: lỗi (vd chưa chạy migration 0010) chỉ làm trống phần này.
        if (st.error) console.warn('Không tải được các bước use case:', st.error.message);
        setUcRows(uc.data);
        setCriteriaRows(cr.data);
        setStageRows(st.error ? [] : st.data);
      },
      quality: async () => {
        const [defs, items] = await Promise.all([
          supabase.from('quality_phase_defs').select('*'),
          supabase.from('quality_items').select('*')
        ]);
        if (defs.error) throw defs.error;
        if (items.error) throw items.error;
        setQualityDefs(defs.data || []);
        setQualityRows(items.data || []);
      },
      notifications: async () => {
        const { data, error } = await supabase
          .from('notifications')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(100);
        if (error) throw error;
        setNotifications((data || []).map(mapNotification));
      },
      snapshots: async () => {
        const { data, error } = await supabase
          .from('progress_snapshots')
          .select('*')
          .order('snap_date')
          .limit(5000);
        // Biểu đồ là phần phụ: lỗi (vd chưa chạy migration 0005) chỉ làm biểu đồ trống, không chặn cả app.
        if (error) {
          console.warn('Không tải được lịch sử tiến độ:', error.message);
          setSnapshotRows([]);
          return;
        }
        setSnapshotRows((data || []).map(mapSnapshot));
      },
      issues: async () => {
        const [ty, st, is, jo, de, at, pr] = await Promise.all([
          fetchAll<any>((a, b) => supabase.from('issue_types').select('*').order('project_id').order('sort').range(a, b)),
          fetchAll<any>((a, b) => supabase.from('issue_statuses').select('*').order('project_id').order('sort').range(a, b)),
          fetchAll<any>((a, b) => supabase.from('issues').select('*').order('project_id').order('number', { ascending: false }).range(a, b)),
          fetchAll<any>((a, b) => supabase.from('issue_journals').select('*').order('created_at').order('id').range(a, b)),
          fetchAll<any>((a, b) => supabase.from('issue_journal_details').select('*').order('id').range(a, b)),
          fetchAll<any>((a, b) => supabase.from('issue_attachments').select('*').order('created_at').order('id').range(a, b)),
          fetchAll<any>((a, b) => supabase.from('issue_priorities').select('*').order('project_id').order('sort').range(a, b))
        ]);
        // Bản DB cũ chưa có migration 0023: tắt chức năng, không làm hỏng cả ứng dụng.
        const err = ty.error || st.error || is.error || jo.error || de.error || pr.error;
        if (err) {
          console.warn('Không tải được dữ liệu issue:', err.message);
          setIssuesAvailable(false);
          setIssueRows([]);
          setIssueAttachmentRows([]);
          setAttachmentsAvailable(false);
          setIssueJournals([]);
          setIssueTypeRows([]);
          setIssueStatusRows([]);
          setIssuePriorityRows([]);
          return;
        }
        setIssuesAvailable(true);
        setIssueTypeRows(ty.data.map(mapIssueType));
        setIssueStatusRows(st.data.map(mapIssueStatus));
        setIssuePriorityRows(pr.data.map(mapIssuePriority));
        setIssueRows(is.data.map(mapIssue));
        setIssueJournals(jo.data.map((r: any) => mapIssueJournal(r, de.data)));
        // Chưa chạy migration 0024: chỉ tắt phần đính kèm, issue vẫn dùng bình thường.
        if (at.error) {
          setAttachmentsAvailable(false);
          setIssueAttachmentRows([]);
        } else {
          setAttachmentsAvailable(true);
          setIssueAttachmentRows(at.data.map(mapIssueAttachment));
        }
      },
      permissions: async () => {
        // Bản DB cũ chưa có migration 0021: bỏ qua, dùng mặc định có sẵn.
        const res = await supabase.rpc('get_permission_matrix', { pid: activeProjectIdRef.current || null });
        if (res.error) {
          console.warn('Không tải được cấu hình phân quyền:', res.error.message);
          setPermMatrix(null);
          return;
        }
        setPermMatrix(res.data as MatrixData);
      },
      merges: async () => {
        // Chỉ admin đọc được; người khác nhận danh sách rỗng. Lỗi (vd chưa chạy migration 0013) không chặn app.
        const { data, error } = await supabase
          .from('account_merge_requests')
          .select('*')
          .eq('status', 'pending')
          .order('created_at', { ascending: false });
        if (error) {
          console.warn('Không tải được yêu cầu hợp nhất:', error.message);
          setMergeRows([]);
          return;
        }
        setMergeRows((data || []).map(mapMergeRequest));
      },
      reports: async () => {
        // Phần phụ như biểu đồ: lỗi (vd chưa chạy migration 0007) không được chặn cả app.
        const [sch, runs] = await Promise.all([
          supabase.from('report_schedules').select('*'),
          supabase.from('report_runs').select('*').order('created_at', { ascending: false }).limit(200)
        ]);
        if (sch.error || runs.error) {
          console.warn('Không tải được báo cáo định kỳ:', (sch.error || runs.error)?.message);
          setScheduleRows([]);
          setRunRows([]);
          return;
        }
        setScheduleRows((sch.data || []).map(mapReportSchedule));
        setRunRows((runs.data || []).map(mapReportRun));
      }
    }),
    []
  );

  const refresh = useCallback(
    async (slices: Slice[]) => {
      // Dự án đổi tiến độ thì lịch sử tiến độ cũng đổi theo.
      const wanted = new Set<Slice>(slices);
      if (wanted.has('projects')) wanted.add('snapshots');
      await Promise.all([...wanted].map(s => fetchers[s]()));
    },
    [fetchers]
  );

  const reload = useCallback(() => {
    setIsLoading(true);
    setLoadError(null);
    refresh(ALL_SLICES)
      .catch(e => setLoadError(describeError(e)))
      .finally(() => setIsLoading(false));
  }, [refresh]);

  useEffect(() => {
    reload();
  }, [reload, profile.id]);

  // Realtime: người khác sửa dữ liệu thì tự tải lại phần liên quan.
  useEffect(() => {
    const pending = new Set<Slice>();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = (slices: Slice[]) => {
      slices.forEach(s => pending.add(s));
      clearTimeout(timer);
      timer = setTimeout(() => {
        const list = [...pending];
        pending.clear();
        refresh(list).catch(() => undefined);
      }, 300);
    };
    const channel = supabase.channel(`app-changes-${profile.id}`);
    Object.entries(TABLE_SLICES).forEach(([table, slices]) => {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => schedule(slices));
    });
    channel.subscribe();
    return () => {
      clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [refresh, profile.id]);

  // --- Dữ liệu suy ra ---
  const projects = useMemo(() => projectRows.map(r => mapProject(r, members)), [projectRows, members]);

  // Dự án theo mã trong địa chỉ (không phân biệt hoa thường; chấp nhận cả id dự phòng)
  const routeProject = useMemo(() => {
    if (route.kind !== 'app' || !route.projectCode) return undefined;
    const code = route.projectCode.toLowerCase();
    return projects.find(p => p.code.toLowerCase() === code || p.id === route.projectCode);
  }, [projects, route]);
  // Mã dự án trong địa chỉ không khớp dự án nào: thử tra mã cũ (dự án đã đổi mã) rồi mới kết luận không tìm thấy
  const missingCode = route.kind === 'app' && route.projectCode && !routeProject && !isLoading ? route.projectCode : null;
  const [aliasChecked, setAliasChecked] = useState('');
  const routeProjectMissing = !!missingCode && aliasChecked === missingCode;
  useEffect(() => {
    if (!missingCode || aliasChecked === missingCode) return;
    let alive = true;
    void (async () => {
      const res = await supabase.rpc('resolve_project_code', { p_code: missingCode });
      if (!alive) return;
      const next = !res.error && typeof res.data === 'string' ? res.data : null;
      if (next && next.toLowerCase() !== missingCode.toLowerCase() && route.kind === 'app') {
        navigate(buildPath({ tab: route.tab, projectCode: next, itemCode: route.itemCode }) + search, { replace: true });
      } else {
        setAliasChecked(missingCode);
      }
    })();
    return () => {
      alive = false;
    };
  }, [missingCode]); // eslint-disable-line react-hooks/exhaustive-deps
  const activeProject = useMemo(
    () => routeProject || projects.find(p => p.id === activeProjectIdState) || projects[0],
    [routeProject, projects, activeProjectIdState]
  );
  // Vào dự án bằng địa chỉ thì nhớ làm dự án gần nhất
  useEffect(() => {
    if (routeProject && routeProject.id !== activeProjectIdState) setActiveProjectIdState(routeProject.id);
  }, [routeProject?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const activeProjectId = activeProject?.id || '';
  activeProjectIdRef.current = activeProjectId;
  // Đổi dự án: nạp ma trận phân quyền của dự án đó (có ghi đè riêng thì khác mặc định)
  useEffect(() => {
    if (activeProjectId) refresh(['permissions']).catch(() => undefined);
  }, [activeProjectId, refresh]);

  useEffect(() => {
    if (activeProjectId) safeSet(STORAGE_KEYS.ACTIVE_PROJECT, activeProjectId);
  }, [activeProjectId]);

  const tasks = useMemo(() => taskRows.map(r => mapTask(r, collabRows, taskUcRows)), [taskRows, collabRows, taskUcRows]);
  const useCases = useMemo(
    () => ucRows.map(r => mapUseCase(r, criteriaRows, stageRows)),
    [ucRows, criteriaRows, stageRows]
  );
  const qualityGates = useMemo(
    () => buildQualityGates(projects.map(p => p.id), qualityDefs, qualityRows),
    [projects, qualityDefs, qualityRows]
  );

  const projectIssues = useMemo(() => issueRows.filter(i => i.projectId === activeProjectId), [issueRows, activeProjectId]);
  const issueTypes = useMemo(() => issueTypeRows.filter(t => t.projectId === activeProjectId).sort((a, b) => a.sort - b.sort), [issueTypeRows, activeProjectId]);
  const issueStatuses = useMemo(() => issueStatusRows.filter(s => s.projectId === activeProjectId).sort((a, b) => a.sort - b.sort), [issueStatusRows, activeProjectId]);
  const issuePriorities = useMemo(() => issuePriorityRows.filter(p => p.projectId === activeProjectId).sort((a, b) => a.sort - b.sort), [issuePriorityRows, activeProjectId]);
  const projectTasks = useMemo(() => tasks.filter(t => t.projectId === activeProjectId), [tasks, activeProjectId]);
  const projectUseCases = useMemo(
    () => useCases.filter(u => u.projectId === activeProjectId),
    [useCases, activeProjectId]
  );
  const projectQualityGates = useMemo(
    () => qualityGates.find(q => q.projectId === activeProjectId),
    [qualityGates, activeProjectId]
  );

  const projectSnapshots = useMemo<ProgressSnapshot[]>(
    () =>
      snapshotRows
        .filter(s => s.projectId === activeProjectId)
        .map(({ projectId: _projectId, ...rest }) => rest),
    [snapshotRows, activeProjectId]
  );

  const reportSchedules = useMemo(
    () => scheduleRows.filter(s => s.projectId === activeProjectId),
    [scheduleRows, activeProjectId]
  );
  const reportRuns = useMemo(() => runRows.filter(r => r.projectId === activeProjectId), [runRows, activeProjectId]);

  const roleIn = useCallback(
    (projectId: string, p: Profile): Role => {
      if (p.isAdmin) return 'admin';
      return members.find(m => m.projectId === projectId && m.userId === p.id)?.role || 'viewer';
    },
    [members]
  );

  const currentUser = useMemo(() => toUser(profile, roleIn(activeProjectId, profile)), [profile, roleIn, activeProjectId]);

  const allUsers = useMemo(() => {
    const list = profiles.map(p => toUser(p, roleIn(activeProjectId, p)));
    return list.some(u => u.id === currentUser.id) ? list : [currentUser, ...list];
  }, [profiles, roleIn, activeProjectId, currentUser]);

  const users = useMemo(() => {
    const memberIds = new Set(members.filter(m => m.projectId === activeProjectId).map(m => m.userId));
    const list = allUsers.filter(u => memberIds.has(u.id));
    return list.some(u => u.id === currentUser.id) ? list : [currentUser, ...list];
  }, [allUsers, members, activeProjectId, currentUser]);

  const unreadNotificationCount = useMemo(() => notifications.filter(n => !n.isRead).length, [notifications]);

  // Âm báo khi có thông báo mới đến (sau lần tải đầu tiên).
  const prevUnread = useRef<number | null>(null);
  useEffect(() => {
    if (isLoading) return;
    if (prevUnread.current !== null && unreadNotificationCount > prevUnread.current) sound.playNotification();
    prevUnread.current = unreadNotificationCount;
  }, [unreadNotificationCount, isLoading]);

  // --- Quyền ---
  setEffectiveMatrix(permMatrix); // phải đặt trước khi tính các cờ quyền bên dưới
  const role = currentUser.role;
  const isAdmin = profile.isAdmin;
  const canManageProjectId = (projectId: string) => {
    const r = roleIn(projectId, profile);
    return r === 'admin' || r === 'pm';
  };
  const canManageProject = can(role, 'manage_project');
  const canManageTasks = can(role, 'write_tasks');
  const canManageUseCases = can(role, 'write_usecases');
  const canApproveQuality = can(role, 'approve_quality');
  const canEditQualityItems = can(role, 'edit_quality_items');
  const canCreateIssue = can(role, 'issue_create');
  const canUpdateIssue = can(role, 'issue_update');
  const canEditIssue = can(role, 'issue_edit');
  const canAssignIssue = can(role, 'issue_assign');
  const canDeleteIssue = can(role, 'issue_delete');
  const canConfigIssueTypes = can(role, 'config_issue_types');
  const canConfigIssueStatuses = can(role, 'config_issue_statuses');
  const canApproveUseCase = can(role, 'tick_criteria');
  const isViewer = role === 'viewer';
  const canTickStage = (stage: StageKey) => roleCanTickStage(role, stage);

  // --- Ghi dữ liệu ---
  const run = async (fn: () => Promise<void>, slices: Slice[], playSound = true): Promise<boolean> => {
    const successMessage = pendingSuccess.current;
    pendingSuccess.current = undefined;
    try {
      await fn();
      await refresh(slices);
      if (playSound) sound.playSuccess();
      if (successMessage) pushToast('success', successMessage);
      return true;
    } catch (e) {
      pushToast('error', describeError(e));
      // Đồng bộ lại để bỏ các thay đổi lạc quan bị từ chối.
      refresh(slices).catch(() => undefined);
      return false;
    }
  };
  const check = (res: { error: unknown }) => {
    if (res.error) throw res.error;
  };

  const setActiveProjectId = (id: string) => {
    setActiveProjectIdState(id);
    // Địa chỉ đang có mã dự án thì đổi theo (bỏ mục đang mở); tab Danh sách dự án không gắn với dự án nào
    const p = projects.find(x => x.id === id);
    if (p && route.kind === 'app' && route.projectCode) navigate(buildPath({ tab: route.tab, projectCode: p.code }));
  };

  // Dự án
  const createProject = (p: Omit<Project, 'id' | 'progressPercent'>) => {
    announce('Đã tạo dự án');
    void run(
      async () => {
        const res = await supabase
          .from('projects')
          .insert({
            code: p.code,
            name: p.name,
            description: p.description,
            status: p.status,
            priority: p.priority,
            manager_id: p.managerId || profile.id,
            start_date: p.startDate,
            target_end_date: p.targetEndDate,
            budget: p.budget,
            current_phase: p.currentPhase,
            progress_model: p.progressModel
          })
          .select('id')
          .single();
        check(res);
        setActiveProjectIdState(res.data!.id);
      },
      ['projects', 'members', 'quality', 'profiles']
    );
  };

  const updateProject = (p: Project) => {
    announce('Đã lưu thông tin dự án');
    void run(
      async () => {
        check(
          await supabase
            .from('projects')
            .update({
              code: p.code,
              name: p.name,
              description: p.description,
              status: p.status,
              priority: p.priority,
              manager_id: p.managerId || null,
              start_date: p.startDate,
              target_end_date: p.targetEndDate,
              budget: p.budget,
              current_phase: p.currentPhase,
              progress_model: p.progressModel
            })
            .eq('id', p.id)
        );
      },
      ['projects', 'members']
    );
  };

  const deleteProject = (id: string) => {
    announce('Đã xóa dự án');
    void run(
      async () => {
        check(await supabase.from('projects').delete().eq('id', id));
      },
      ALL_SLICES
    );
  };

  // Thành viên
  const addMember = async (email: string, memberRole: MemberRole) => {
    if (!activeProjectId) return false;
    announce('Đã thêm thành viên vào dự án');
    return run(
      async () => {
        check(
          await supabase.rpc('add_project_member', {
            p_project: activeProjectId,
            p_email: email,
            p_role: memberRole
          })
        );
      },
      ['members', 'profiles']
    );
  };

  const suggestAccounts = async (query: string): Promise<AccountSuggestion[]> => {
    if (!activeProjectId) return [];
    const { data, error } = await supabase.rpc('suggest_accounts', { p_project: activeProjectId, p_query: query });
    if (error) {
      console.warn('Không lấy được gợi ý tài khoản:', error.message);
      return [];
    }
    return ((data || []) as Row[]).map(r => ({
      id: r.id,
      name: r.name,
      email: r.email ?? '',
      avatarColor: LEGACY_AVATAR_FALLBACK(r.avatar_color),
      isPlaceholder: !!r.is_placeholder
    }));
  };

  const addMemberById = async (userId: string, memberRole: MemberRole) => {
    if (!activeProjectId) return false;
    announce('Đã thêm thành viên vào dự án');
    return run(
      async () => {
        check(await supabase.rpc('add_project_member_by_id', { p_project: activeProjectId, p_user: userId, p_role: memberRole }));
      },
      ['members', 'profiles']
    );
  };

  const createPlaceholderMember = async (name: string, memberRole: MemberRole) => {
    if (!activeProjectId) return false;
    announce(`Đã thêm "${name.trim()}" vào dự án (chưa đăng ký)`);
    return run(
      async () => {
        check(await supabase.rpc('create_placeholder_member', { p_project: activeProjectId, p_name: name, p_role: memberRole }));
      },
      ['members', 'profiles', 'projects']
    );
  };

  const deletePlaceholder = (userId: string) => {
    announce('Đã xóa tài khoản chưa đăng ký');
    void run(
      async () => {
        check(await supabase.rpc('delete_placeholder', { p_user: userId }));
      },
      ['members', 'profiles', 'projects', 'tasks', 'usecases', 'merges']
    );
  };

  const resolveMerge = (requestId: string, approve: boolean) => {
    announce(approve ? 'Đã hợp nhất tài khoản' : 'Đã từ chối hợp nhất');
    void run(
      async () => {
        check(await supabase.rpc(approve ? 'approve_account_merge' : 'reject_account_merge', { p_request: requestId }));
      },
      ALL_SLICES
    );
  };

  const setMemberRole = (userId: string, memberRole: MemberRole) => {
    announce('Đã đổi vai trò thành viên');
    void run(
      async () => {
        check(
          await supabase
            .from('project_members')
            .update({ role: memberRole })
            .eq('project_id', activeProjectId)
            .eq('user_id', userId)
        );
      },
      ['members']
    );
  };

  const removeMember = (userId: string) => {
    announce('Đã gỡ thành viên khỏi dự án');
    void run(
      async () => {
        check(
          await supabase.from('project_members').delete().eq('project_id', activeProjectId).eq('user_id', userId)
        );
      },
      ['members', 'profiles']
    );
  };

  // Nhiệm vụ
  const taskPayload = (t: Omit<Task, 'id'>) => ({
    code: t.code,
    title: t.title,
    description: t.description || null,
    status: t.status,
    priority: t.priority,
    assignee_id: t.assigneeId || null,
    department: t.department || null,
    phase: t.phase,
    estimated_effort: t.estimatedEffort,
    actual_effort: t.actualEffort,
    start_date: t.startDate,
    due_date: t.dueDate,
    progress_percent: t.progressPercent,
    actual_end_date: t.status === 'done' ? t.actualEndDate || null : null,
    assessment: t.assessment || null,
    deliverable_description: t.deliverable,
    notes: t.notes,
    tags: t.tags || [],
    // Cột cũ giữ use case đầu tiên để bản giao diện cũ vẫn hiển thị được
    use_case_id: t.useCaseIds[0] || null
  });

  // Người phối hợp: không trùng người chủ trì.
  const cleanCollaborators = (t: Pick<Task, 'assigneeId' | 'collaboratorIds'>) =>
    [...new Set(t.collaboratorIds)].filter(id => id && id !== t.assigneeId);

  const createTask = (t: Omit<Task, 'id'>) => {
    announce('Đã tạo nhiệm vụ');
    void run(
      async () => {
        const res = await supabase
          .from('tasks')
          .insert({ project_id: t.projectId, ...taskPayload(t) })
          .select('id')
          .single();
        check(res);
        const ids = cleanCollaborators(t);
        if (ids.length > 0) {
          check(await supabase.from('task_collaborators').insert(ids.map(user_id => ({ task_id: res.data!.id, user_id }))));
        }
        const ucIds = [...new Set(t.useCaseIds)];
        if (ucIds.length > 0) {
          // Liên kết đầu tiên đã được trigger tạo từ cột use_case_id; on conflict bỏ qua trùng.
          check(
            await supabase
              .from('task_use_cases')
              .upsert(ucIds.map(use_case_id => ({ task_id: res.data!.id, use_case_id })), { onConflict: 'task_id,use_case_id', ignoreDuplicates: true })
          );
        }
      },
      ['tasks', 'projects']
    );
  };

  const updateTask = (t: Task) => {
    announce('Đã lưu nhiệm vụ');
    void run(
      async () => {
        check(await supabase.from('tasks').update(taskPayload(t)).eq('id', t.id));

        // Đồng bộ người phối hợp (thêm mới / bỏ bớt).
        const wanted = new Set(cleanCollaborators(t));
        const current = new Set(collabRows.filter(c => c.task_id === t.id).map(c => c.user_id as string));
        const remove = [...current].filter(id => !wanted.has(id));
        const add = [...wanted].filter(id => !current.has(id));
        if (remove.length > 0) {
          check(await supabase.from('task_collaborators').delete().eq('task_id', t.id).in('user_id', remove));
        }
        if (add.length > 0) {
          check(await supabase.from('task_collaborators').insert(add.map(user_id => ({ task_id: t.id, user_id }))));
        }

        // Đồng bộ các use case liên kết (thêm trước rồi mới bỏ để không có lúc nhiệm vụ bị mất liên kết).
        const wantedUc = new Set(t.useCaseIds);
        const currentUc = new Set(taskUcRows.filter(l => l.task_id === t.id).map(l => l.use_case_id as string));
        const addUc = [...wantedUc].filter(id => !currentUc.has(id));
        const removeUc = [...currentUc].filter(id => !wantedUc.has(id));
        if (addUc.length > 0) {
          check(
            await supabase
              .from('task_use_cases')
              .upsert(addUc.map(use_case_id => ({ task_id: t.id, use_case_id })), { onConflict: 'task_id,use_case_id', ignoreDuplicates: true })
          );
        }
        if (removeUc.length > 0) {
          check(await supabase.from('task_use_cases').delete().eq('task_id', t.id).in('use_case_id', removeUc));
        }
      },
      ['tasks', 'projects']
    );
  };

  const deleteTask = (id: string) => {
    announce('Đã xóa nhiệm vụ');
    void run(
      async () => {
        check(await supabase.from('tasks').delete().eq('id', id));
      },
      ['tasks', 'projects', 'notifications'],
      false
    );
  };

  const moveTaskStatus = (taskId: string, newStatus: TaskStatus) => {
    const today = new Date().toISOString().slice(0, 10);
    setTaskRows(prev =>
      prev.map(t =>
        t.id !== taskId
          ? t
          : {
              ...t,
              status: newStatus,
              // Mô phỏng trigger trg_task_sync trong DB.
              progress_percent: newStatus === 'done' ? 100 : t.status === 'done' && t.progress_percent === 100 ? 90 : t.progress_percent,
              actual_end_date: newStatus === 'done' ? t.actual_end_date || today : null
            }
      )
    );
    sound.playNotification();
    void run(
      async () => {
        check(await supabase.from('tasks').update({ status: newStatus }).eq('id', taskId));
      },
      ['tasks', 'projects'],
      false
    );
  };

  // Use case
  const ucPayload = (u: Omit<UseCase, 'id' | 'updatedAt' | 'stagesDone'>) => ({
    code: u.code,
    title: u.title,
    actor: u.actor,
    description: u.description,
    priority: u.priority,
    status: u.status,
    main_flow: u.mainFlow,
    alternate_flow: u.alternateFlow || [],
    assigned_to: u.assignedTo || null,
    parent_id: u.parentId || null,
    kind: u.kind,
    tags: u.tags,
    complexity: u.complexity || null,
    transactions: u.transactions ?? null,
    necessity: u.necessity || 'B',
    origin: u.origin,
    change_note: u.changeNote,
    agreed_when: u.agreedWhen
  });

  const createUseCase = (u: Omit<UseCase, 'id' | 'updatedAt' | 'stagesDone'>) => {
    announce('Đã tạo use case');
    void run(
      async () => {
        const res = await supabase
          .from('use_cases')
          .insert({ project_id: u.projectId, ...ucPayload(u) })
          .select('id')
          .single();
        check(res);
        if (u.acceptanceCriteria.length > 0) {
          check(
            await supabase.from('acceptance_criteria').insert(
              u.acceptanceCriteria.map((c, idx) => ({
                use_case_id: res.data!.id,
                description: c.description,
                completed: false,
                sort: idx
              }))
            )
          );
        }
      },
      ['usecases', 'projects']
    );
  };

  const updateUseCase = (u: UseCase) => {
    announce('Đã lưu use case');
    void run(
      async () => {
        check(await supabase.from('use_cases').update(ucPayload(u)).eq('id', u.id));

        // Đồng bộ tiêu chí nghiệm thu theo vị trí dòng trong form.
        const existing = criteriaRows.filter(c => c.use_case_id === u.id);
        const existingById = new Map(existing.map(c => [c.id, c]));
        const keptIds = new Set(u.acceptanceCriteria.map(c => c.id));

        const toDelete = existing.filter(c => !keptIds.has(c.id)).map(c => c.id);
        if (toDelete.length > 0) {
          check(await supabase.from('acceptance_criteria').delete().in('id', toDelete));
        }
        for (const [idx, c] of u.acceptanceCriteria.entries()) {
          const old = existingById.get(c.id);
          if (!old) {
            check(
              await supabase
                .from('acceptance_criteria')
                .insert({ use_case_id: u.id, description: c.description, completed: false, sort: idx })
            );
          } else if (old.description !== c.description || old.sort !== idx) {
            check(
              await supabase
                .from('acceptance_criteria')
                .update({ description: c.description, sort: idx })
                .eq('id', c.id)
            );
          }
        }
      },
      ['usecases', 'projects']
    );
  };

  const deleteUseCase = (id: string) => {
    announce('Đã xóa use case');
    void run(
      async () => {
        check(await supabase.from('use_cases').delete().eq('id', id));
      },
      ['usecases', 'tasks', 'projects'],
      false
    );
  };

  const toggleAcceptanceCriteria = (useCaseId: string, criteriaId: string) => {
    const target = criteriaRows.find(c => c.id === criteriaId);
    if (!target) return;
    const next = !target.completed;

    // Cập nhật lạc quan, mô phỏng đúng logic trigger trong DB.
    const nextCriteria = criteriaRows.map(c => (c.id === criteriaId ? { ...c, completed: next } : c));
    const mine = nextCriteria.filter(c => c.use_case_id === useCaseId);
    const pct = mine.length === 0 ? 0 : Math.round((100 * mine.filter(c => c.completed).length) / mine.length);
    setCriteriaRows(nextCriteria);
    setUcRows(prev =>
      prev.map(u =>
        u.id !== useCaseId
          ? u
          : {
              ...u,
              progress_percent: pct,
              status: pct === 100 ? 'completed' : pct >= 50 && u.status === 'draft' ? 'developing' : u.status
            }
      )
    );
    sound.playNotification();

    void run(
      async () => {
        check(await supabase.from('acceptance_criteria').update({ completed: next }).eq('id', criteriaId));
      },
      ['usecases', 'projects'],
      false
    );
  };

  /** Kết quả set_use_case_stages / set_use_case_level (bản DB cũ trả một số nguyên = số use case đổi). */
  const parseStageResult = (data: unknown) => {
    if (typeof data === 'number') return { changed: data, unchanged: 0, blocked: 0, blockedCodes: [] as string[] };
    const d = (data || {}) as { changed?: number; unchanged?: number; blocked?: number; blockedCodes?: string[] };
    return { changed: d.changed ?? 0, unchanged: d.unchanged ?? 0, blocked: d.blocked ?? 0, blockedCodes: d.blockedCodes ?? [] };
  };
  const reportStageResult = (r: ReturnType<typeof parseStageResult>, doneText: string) => {
    if (r.blocked > 0) {
      const codes = r.blockedCodes.length ? ' (' + r.blockedCodes.join(', ') + (r.blocked > r.blockedCodes.length ? '…' : '') + ')' : '';
      pushToast(
        'info',
        (r.changed > 0 ? doneText + ' cho ' + r.changed + ' use case. ' : '') +
          'Bỏ qua ' + r.blocked + ' use case' + codes +
          ': 5 bước phải theo thứ tự, và bạn không có quyền tick/bỏ các bước liên quan (cần BA/PM hoàn thành bước trước, hoặc PM bỏ các bước sau).'
      );
    } else if (r.changed > 0) {
      pushToast('success', doneText + ' cho ' + r.changed + ' use case.');
    } else {
      pushToast('info', 'Không có use case nào thay đổi (đã ở đúng trạng thái này, hoặc dự án chưa dùng mô hình 5 bước).');
    }
  };

  const setUseCaseStages = (useCaseIds: string[], stage: StageKey, done: boolean, actorId?: string) => {
    const ids = [...new Set(useCaseIds)];
    if (ids.length === 0) return Promise.resolve(false);
    return run(
      async () => {
        const res = await supabase.rpc('set_use_case_stages', {
          p_use_cases: ids,
          p_stage: stage,
          p_done: done,
          p_actor: actorId && actorId !== profile.id ? actorId : null
        });
        check(res);
        reportStageResult(
          parseStageResult(res.data),
          done ? 'Đã đánh dấu xong bước "' + STAGE_LABEL[stage] + '" (và các bước trước)' : 'Đã bỏ bước "' + STAGE_LABEL[stage] + '" (và các bước sau)'
        );
      },
      ['usecases', 'projects'],
      false
    );
  };

  const setUseCaseLevel = (useCaseIds: string[], level: number, actorId?: string) => {
    const ids = [...new Set(useCaseIds)];
    if (ids.length === 0) return Promise.resolve(false);
    return run(
      async () => {
        const res = await supabase.rpc('set_use_case_level', {
          p_use_cases: ids,
          p_level: level,
          p_actor: actorId && actorId !== profile.id ? actorId : null
        });
        check(res);
        reportStageResult(
          parseStageResult(res.data),
          level === 0 ? 'Đã đưa về "Chưa bắt đầu"' : 'Đã đặt tiến độ đến hết bước "' + STAGES[level - 1].label + '"'
        );
      },
      ['usecases', 'projects'],
      false
    );
  };

  const getAccessReport = async (): Promise<AccessReport> => {
    const res = await supabase.rpc('my_access_report', { pid: activeProjectId });
    check(res);
    return res.data as AccessReport;
  };
  const scopeId = (scope: 'global' | 'project') => (scope === 'global' ? null : activeProjectId);
  const getPermissionMatrix = async (scope: 'global' | 'project'): Promise<MatrixData> => {
    const res = await supabase.rpc('get_permission_matrix', { pid: scopeId(scope) });
    check(res);
    return res.data as MatrixData;
  };
  const savePermissions = async (
    scope: 'global' | 'project',
    changes: { role: string; permission: PermissionId; allowed: boolean }[]
  ): Promise<string | null> => {
    try {
      check(await supabase.rpc('set_role_permissions', { p_project: scopeId(scope), p_changes: changes }));
      await refresh(['permissions']);
      pushToast('success', 'Đã lưu cấu hình phân quyền (' + changes.length + ' thay đổi).');
      return null;
    } catch (e) {
      return describeError(e);
    }
  };
  const resetPermissions = async (scope: 'global' | 'project'): Promise<{ removed: number } | { error: string }> => {
    try {
      const res = await supabase.rpc('reset_role_permissions', { p_project: scopeId(scope) });
      check(res);
      await refresh(['permissions']);
      return { removed: Number((res.data as { removed?: number } | null)?.removed ?? 0) };
    } catch (e) {
      return { error: describeError(e) };
    }
  };
  const getPermissionLog = async (scope: 'global' | 'project') => {
    const res = await supabase.rpc('get_permission_log', { p_project: scopeId(scope), p_limit: 50 });
    check(res);
    return (res.data || []) as { role: string; permission: string; from: boolean; to: boolean; by: string; at: string }[];
  };
  const getMemberAccessReport = async (userId: string): Promise<AccessReport> => {
    const res = await supabase.rpc('member_access_report', { pid: activeProjectId, uid: userId });
    check(res);
    return res.data as AccessReport;
  };

  // Quality gates
  const toggleQualityItemPassed = (_phaseId: string, itemId: string, notes?: string, actorId?: string) => {
    const item = qualityRows.find(i => i.id === itemId);
    if (!item) return;
    const next = !item.is_passed;
    const actor = actorId && actorId !== profile.id ? allUsers.find(u => u.id === actorId) : undefined;
    const label = actor
      ? `${actor.name} (${(actor.isAdmin ? 'admin' : members.find(m => m.projectId === activeProjectId && m.userId === actor.id)?.role || 'member').toUpperCase()})`
      : `${currentUser.name} (${currentUser.role.toUpperCase()})`;
    setQualityRows(prev =>
      prev.map(i =>
        i.id !== itemId
          ? i
          : {
              ...i,
              is_passed: next,
              checked_by: next ? label : null,
              checked_at: next ? new Date().toISOString().slice(0, 10) : null,
              notes: notes !== undefined ? notes : i.notes
            }
      )
    );
    void run(
      async () => {
        if (actor) {
          // Admin ghi nhận người khác là người duyệt: qua hàm có kiểm tra quyền ở DB.
          check(
            await supabase.rpc('set_quality_item', {
              p_item: itemId,
              p_passed: next,
              p_notes: notes ?? null,
              p_actor: actor.id
            })
          );
          return;
        }
        const patch: Record<string, unknown> = { is_passed: next };
        if (notes !== undefined) patch.notes = notes;
        check(await supabase.from('quality_items').update(patch).eq('id', itemId));
      },
      ['quality']
    );
  };

  const updateQualityNotes = (itemId: string, notes: string) => {
    announce('Đã lưu ghi chú');
    setQualityRows(prev => prev.map(i => (i.id === itemId ? { ...i, notes } : i)));
    void run(
      async () => {
        check(await supabase.from('quality_items').update({ notes }).eq('id', itemId));
      },
      ['quality']
    );
  };

  const addQualityItem = (phaseId: string, item: Omit<QualityCheckItem, 'id' | 'isPassed'>) => {
    announce('Đã thêm tiêu chuẩn mới');
    void run(
      async () => {
        check(
          await supabase.from('quality_items').insert({
            project_id: activeProjectId,
            phase_key: phaseId,
            title: item.title,
            description: item.description,
            is_mandatory: item.isMandatory,
            notes: item.notes || null
          })
        );
      },
      ['quality']
    );
  };

  const editQualityItem = (itemId: string, patch: { title: string; description: string; isMandatory: boolean }) => {
    announce('Đã cập nhật tiêu chuẩn');
    setQualityRows(prev =>
      prev.map(i => (i.id === itemId ? { ...i, title: patch.title, description: patch.description, is_mandatory: patch.isMandatory } : i))
    );
    void run(
      async () => {
        check(
          await supabase
            .from('quality_items')
            .update({ title: patch.title, description: patch.description, is_mandatory: patch.isMandatory })
            .eq('id', itemId)
        );
      },
      ['quality']
    );
  };

  const deleteQualityItem = (itemId: string) => {
    announce('Đã xóa tiêu chuẩn');
    setQualityRows(prev => prev.filter(i => i.id !== itemId));
    void run(
      async () => {
        // RLS không báo lỗi khi không có quyền xóa mà chỉ xóa 0 dòng: kiểm tra số dòng thực sự bị xóa.
        const res = await supabase.from('quality_items').delete().eq('id', itemId).select('id');
        check(res);
        if (!res.data || res.data.length === 0) throw new Error('Không xóa được: bạn không có quyền xóa tiêu chuẩn này hoặc tiêu chuẩn không còn tồn tại.');
      },
      ['quality']
    );
  };

  // Thông báo
  const sendDeadlineReminder = (taskId: string) => {
    void run(
      async () => {
        const res = await supabase.rpc('send_task_reminder', { p_task: taskId });
        check(res);
        sound.playWarning();
        // Từ migration 0016 hàm trả về kết quả giao tin Telegram; bản DB cũ trả null.
        const d = res.data as { recipientName: string; telegram: string; copy: boolean } | null;
        if (!d) {
          pushToast('success', 'Đã gửi nhắc nhở deadline');
          return;
        }
        const who = d.recipientName;
        const copyNote = d.copy ? ' Bạn nhận bản sao qua Telegram.' : '';
        const why: Record<string, string> = {
          not_linked: `${who} chưa liên kết Telegram nên chưa nhận được tin Telegram.`,
          disabled: `${who} đã tắt nhận Telegram.`,
          placeholder: `${who} là tài khoản chưa đăng ký nên không có Telegram.`,
          no_bot: 'Bot Telegram chưa được cấu hình trên hệ thống.'
        };
        if (d.telegram === 'sent') pushToast('success', `Đã nhắc ${who}: thông báo trong web và tin Telegram.${copyNote}`);
        else pushToast('info', `Đã nhắc ${who} trong web. ${why[d.telegram] ?? ''}${copyNote}`);
      },
      ['notifications'],
      false
    );
  };

  const getTelegram = async (): Promise<TelegramInfo> => {
    const res = await supabase.rpc('get_my_telegram');
    check(res);
    return res.data as TelegramInfo;
  };

  const saveTelegram = async (chatId: string, enabled: boolean): Promise<string | null> => {
    try {
      check(await supabase.rpc('set_my_telegram', { p_chat_id: chatId, p_enabled: enabled }));
      return null;
    } catch (e) {
      return describeError(e);
    }
  };

  const testTelegram = async (): Promise<{ ok: boolean; message: string }> => {
    try {
      check(await supabase.rpc('send_telegram_test'));
      // pg_net gửi bất đồng bộ (chờ Telegram tối đa 20 giây): hỏi kết quả tối đa ~25 giây
      for (let i = 0; i < 25; i++) {
        await new Promise(r => setTimeout(r, 1000));
        const res = await supabase.rpc('telegram_test_result');
        check(res);
        const d = res.data as { status: string; ok?: boolean; description?: string | null };
        if (d.status === 'done') {
          return d.ok
            ? { ok: true, message: 'Đã gửi tin thử. Hãy kiểm tra Telegram của bạn.' }
            : { ok: false, message: d.description || 'Telegram từ chối tin nhắn.' };
        }
      }
      return { ok: false, message: 'Chưa nhận được phản hồi từ Telegram. Thử lại sau ít giây.' };
    } catch (e) {
      return { ok: false, message: describeError(e) };
    }
  };

  const markNotificationAsRead = (id: string) => {
    setNotifications(prev => prev.map(n => (n.id === id ? { ...n, isRead: true } : n)));
    void run(
      async () => {
        check(await supabase.from('notifications').update({ is_read: true }).eq('id', id));
      },
      ['notifications'],
      false
    );
  };

  const markAllNotificationsAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    void run(
      async () => {
        check(await supabase.from('notifications').update({ is_read: true }).eq('is_read', false));
      },
      ['notifications'],
      false
    );
  };

  const seedDemoData = () => {
    announce('Đã nạp dữ liệu demo');
    void run(
      async () => {
        check(await supabase.rpc('seed_demo_data'));
      },
      ALL_SLICES
    );
  };

  const scanDeadlines = () => {
    void run(
      async () => {
        const res = await supabase.rpc('scan_deadlines');
        check(res);
        const n = Number(res.data ?? 0);
        if (n > 0) pushToast('success', `Đã tạo ${n} thông báo deadline mới.`);
        else pushToast('info', 'Không có thông báo deadline mới trong web. Tin Telegram nhắc lại chỉ gửi một lần mỗi ngày cho mỗi người.');
      },
      ['notifications'],
      false
    );
  };

  const setReportSchedule = (frequency: 'weekly' | 'monthly', enabled: boolean) => {
    const existing = scheduleRows.find(s => s.projectId === activeProjectId && s.frequency === frequency);
    setScheduleRows(prev =>
      existing
        ? prev.map(s => (s.id === existing.id ? { ...s, enabled } : s))
        : [...prev, { id: `tmp-${frequency}`, projectId: activeProjectId, frequency, enabled }]
    );
    void run(
      async () => {
        if (existing) {
          check(await supabase.from('report_schedules').update({ enabled }).eq('id', existing.id));
        } else {
          check(
            await supabase
              .from('report_schedules')
              .insert({ project_id: activeProjectId, frequency, enabled })
          );
        }
      },
      ['reports'],
      false
    );
  };

  const generateReportNow = (frequency: ReportFrequency) => {
    void run(
      async () => {
        check(await supabase.rpc('generate_report_now', { p_project: activeProjectId, p_frequency: frequency }));
        pushToast('success', 'Đã tạo báo cáo và lưu vào lịch sử báo cáo.');
      },
      ['reports'],
      false
    );
  };

  // ----- Issue -----
  const getIssueJournals = (issueId: string) => issueJournals.filter(j => j.issueId === issueId);

  const createIssue: AppContextType['createIssue'] = async (input, files = []) => {
    try {
      const res = await supabase.rpc('create_issue', {
        p_project: activeProjectId,
        p_type: input.typeId,
        p_title: input.title,
        p_description: input.description,
        p_priority: input.priorityId || null,
        p_severity: input.severity || null,
        p_environment: input.environment,
        p_assignee: input.assigneeId || null,
        p_due: input.dueDate || null,
        p_use_case: input.useCaseId || null,
        p_task: input.taskId || null
      });
      check(res);
      const d = res.data as { id: string; number: number };
      let attachError = '';
      if (files.length) {
        try {
          const items = await uploadObjects(activeProjectId, d.id, files);
          try {
            check(await registerObjects(d.id, items, null, false));
          } catch (e) {
            await removeObjects(items.map(i => i.path));
            throw e;
          }
        } catch (e) {
          attachError = describeError(e);
        }
      }
      await refresh(['issues', 'notifications']);
      if (attachError) pushToast('error', `Đã ghi nhận issue #${d.number} nhưng chưa đính kèm được tệp: ${attachError}. Mở issue để đính kèm lại.`);
      else pushToast('success', 'Đã ghi nhận issue #' + d.number);
      sound.playSuccess();
      return d;
    } catch (e) {
      pushToast('error', describeError(e));
      return null;
    }
  };

  const issueCall = async (fn: () => PromiseLike<{ error: unknown }>, success?: string): Promise<boolean> => {
    try {
      check(await fn());
      await refresh(['issues', 'notifications']);
      if (success) pushToast('success', success);
      return true;
    } catch (e) {
      pushToast('error', describeError(e));
      refresh(['issues']).catch(() => undefined);
      return false;
    }
  };

  const updateIssue: AppContextType['updateIssue'] = async (issueId, changes, notes = '', parentId, files = []) => {
    const issue = issueRows.find(i => i.id === issueId);
    const hasFields = Object.keys(changes).length > 0 || notes.trim() !== '';
    if (!files.length || !issue) {
      return issueCall(
        () => supabase.rpc('update_issue', { p_issue: issueId, p_changes: changes, p_notes: notes, p_parent: parentId || null }),
        parentId ? 'Đã gửi trả lời' : 'Đã cập nhật issue'
      );
    }
    // Có tệp: tải lên Storage trước (lỗi thì chưa lưu gì), rồi ghi cập nhật, rồi đăng ký tệp vào đúng dòng nhật ký đó.
    let items: UploadedObject[] = [];
    try {
      items = await uploadObjects(issue.projectId, issueId, files);
      let journalId: string | null = null;
      if (hasFields) {
        try {
          const res = await supabase.rpc('update_issue', { p_issue: issueId, p_changes: changes, p_notes: notes, p_parent: parentId || null });
          check(res);
          journalId = (res.data as { journalId?: string } | null)?.journalId ?? null;
        } catch (e) {
          await removeObjects(items.map(i => i.path));
          throw e;
        }
      }
      try {
        check(await registerObjects(issueId, items, journalId, true));
      } catch (e) {
        await removeObjects(items.map(i => i.path));
        await refresh(['issues', 'notifications']);
        pushToast('error', `${hasFields ? 'Đã lưu cập nhật nhưng ' : ''}chưa đính kèm được tệp: ${describeError(e)}`);
        return hasFields;
      }
      await refresh(['issues', 'notifications']);
      pushToast('success', 'Đã cập nhật issue');
      return true;
    } catch (e) {
      pushToast('error', describeError(e));
      refresh(['issues']).catch(() => undefined);
      return false;
    }
  };
  const editIssueNote = (journalId: string, notes: string) =>
    issueCall(() => supabase.rpc('edit_issue_note', { p_journal: journalId, p_notes: notes }), 'Đã sửa ghi chú');
  const deleteIssueNote = (journalId: string) => issueCall(() => supabase.rpc('delete_issue_note', { p_journal: journalId }), 'Đã xóa ghi chú');
  const deleteIssue = async (issueId: string) => {
    const paths = issueAttachmentRows.filter(a => a.issueId === issueId).map(a => a.storagePath);
    const ok = await issueCall(() => supabase.rpc('delete_issue', { p_issue: issueId }), 'Đã xóa issue');
    if (ok) await removeObjects(paths);
    return ok;
  };

  // ----- Ảnh / video đính kèm -----
  type UploadedObject = { id: string; name: string; path: string };
  const urlCache = useRef(new Map<string, { url: string; exp: number }>());

  const removeObjects = async (paths: string[]) => {
    if (!paths.length) return;
    const { error } = await supabase.storage.from(ATTACH_BUCKET).remove(paths);
    if (error) console.warn('Không xóa được tệp trong Storage:', error.message);
  };

  /** Tải từng tệp lên Storage; lỗi giữa chừng thì gỡ các tệp đã tải rồi ném lỗi. */
  const uploadObjects = async (projectId: string, issueId: string, files: File[]): Promise<UploadedObject[]> => {
    const done: UploadedObject[] = [];
    try {
      for (const f of files) {
        const bad = checkPrepared(f);
        if (bad) throw new Error(bad);
        const mime = mimeOf(f);
        const id = crypto.randomUUID();
        const path = `${projectId}/${issueId}/${id}.${extForMime(mime)}`;
        const { error } = await supabase.storage.from(ATTACH_BUCKET).upload(path, f, { contentType: mime, upsert: false, cacheControl: '3600' });
        if (error) throw new Error(`Không tải lên được "${f.name}": ${describeError(error)}`);
        done.push({ id, name: f.name, path });
      }
      return done;
    } catch (e) {
      await removeObjects(done.map(d => d.path));
      throw e;
    }
  };

  const registerObjects = (issueId: string, items: UploadedObject[], journalId: string | null, log: boolean) =>
    supabase.rpc('add_issue_attachments', {
      p_issue: issueId,
      p_items: items.map(({ id, name }) => ({ id, name })),
      p_journal: journalId,
      p_log: log
    });

  const getIssueAttachments = (issueId: string) => issueAttachmentRows.filter(a => a.issueId === issueId);

  const getAttachmentUrls = async (paths: string[]): Promise<Record<string, string>> => {
    const now = Date.now();
    const out: Record<string, string> = {};
    const need: string[] = [];
    for (const p of paths) {
      const c = urlCache.current.get(p);
      if (c && c.exp - now > 5 * 60 * 1000) out[p] = c.url;
      else need.push(p);
    }
    if (need.length) {
      const { data, error } = await supabase.storage.from(ATTACH_BUCKET).createSignedUrls(need, 3600);
      if (error) {
        console.warn('Không lấy được link xem tệp:', error.message);
        return out;
      }
      for (const d of data ?? []) {
        if (d.path && d.signedUrl) {
          urlCache.current.set(d.path, { url: d.signedUrl, exp: now + 3600 * 1000 });
          out[d.path] = d.signedUrl;
        }
      }
    }
    return out;
  };

  const deleteIssueAttachment = async (attachmentId: string): Promise<boolean> => {
    try {
      const res = await supabase.rpc('delete_issue_attachment', { p_id: attachmentId });
      check(res);
      await removeObjects([res.data as string]);
      await refresh(['issues']);
      pushToast('success', 'Đã xóa tệp đính kèm');
      return true;
    } catch (e) {
      pushToast('error', describeError(e));
      refresh(['issues']).catch(() => undefined);
      return false;
    }
  };

  const getAttachmentUsage = async (): Promise<AttachmentUsage | null> => {
    const res = await supabase.rpc('issue_attachment_usage', { p_project: activeProjectId });
    if (res.error || !res.data) return null;
    const d = res.data as { projectBytes: number; projectCount: number; totalBytes: number | null; capBytes: number };
    return { projectBytes: Number(d.projectBytes), projectCount: Number(d.projectCount), totalBytes: d.totalBytes == null ? undefined : Number(d.totalBytes), capBytes: Number(d.capBytes) };
  };

  const saveIssueConfig = async (fn: string, items: unknown, removeIds: string[]): Promise<string | null> => {
    try {
      check(await supabase.rpc(fn, { p_project: activeProjectId, p_items: items, p_delete: removeIds }));
      await refresh(['issues']);
      pushToast('success', 'Đã lưu cấu hình issue');
      return null;
    } catch (e) {
      return describeError(e);
    }
  };
  const saveIssueTypes: AppContextType['saveIssueTypes'] = (items, removeIds) => saveIssueConfig('save_issue_types', items, removeIds);
  const saveIssueStatuses: AppContextType['saveIssueStatuses'] = (items, removeIds) => saveIssueConfig('save_issue_statuses', items, removeIds);
  const saveIssuePriorities: AppContextType['saveIssuePriorities'] = (items, removeIds) =>
    saveIssueConfig('save_issue_priorities', items.map(({ isDefault, ...rest }) => ({ ...rest, default: isDefault })), removeIds);

  // ----- Địa chỉ / điều hướng -----
  const hrefFor = (t: LinkTarget): string => {
    let tab: NavigationTab = t.tab ?? 'dashboard';
    let projectId = t.projectId ?? activeProjectId;
    let itemCode: string | undefined;
    if (t.taskId) {
      const task = tasks.find(x => x.id === t.taskId);
      if (task) {
        tab = 'tasks';
        projectId = task.projectId;
        itemCode = task.code;
      }
    } else if (t.issueId) {
      const issue = issueRows.find(x => x.id === t.issueId);
      if (issue) {
        tab = 'issues';
        projectId = issue.projectId;
        itemCode = String(issue.number);
      }
    } else if (t.useCaseId) {
      const uc = useCases.find(x => x.id === t.useCaseId);
      if (uc) {
        tab = 'usecases';
        projectId = uc.projectId;
        itemCode = uc.code;
      }
    }
    const target: PathTarget = { tab, projectCode: projects.find(p => p.id === projectId)?.code, itemCode };
    return buildPath(target);
  };
  // Mở một mục ngay trong tab đang xem (cùng dự án) thì giữ nguyên tham số như ?view=gantt; sang tab / dự án khác thì bỏ.
  const goTo = (href: string) => {
    const head = (p: string) => p.split('/').slice(0, 4).join('/');
    navigate(head(href) === head(pathname) ? href + search : href);
  };
  const setActiveTab = (tab: NavigationTab) => navigate(hrefFor({ tab }));
  const openTask = (taskId: string) => goTo(hrefFor({ taskId }));
  const openIssue = (issueId: string) => goTo(hrefFor({ issueId }));
  const openUseCase = (useCaseId: string) => goTo(hrefFor({ useCaseId }));
  const closeItem = () => {
    if (route.kind === 'app') closeTo(buildPath({ tab: route.tab, projectCode: route.projectCode }) + search);
  };

  const copyLink = async (href: string) => {
    const url = window.location.origin + href;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Trình duyệt chặn clipboard API: dùng cách dự phòng
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
      } catch {
        /* bỏ qua */
      }
      document.body.removeChild(ta);
    }
    pushToast('success', 'Đã sao chép liên kết');
  };

  // Mục (nhiệm vụ / issue / use case) trong địa chỉ không có: báo và về danh sách. Mục từng thấy rồi mới biến mất (vừa xóa) thì đóng lặng lẽ.
  const seenItemRef = useRef('');
  useEffect(() => {
    if (isLoading || !routeProject || !routeItemCode || route.kind !== 'app') return;
    const code = routeItemCode.toLowerCase();
    const inProject = <T extends { projectId: string }>(list: T[], match: (x: T) => boolean) => list.some(x => x.projectId === routeProject.id && match(x));
    let found = true;
    if (route.tab === 'tasks') found = inProject(tasks, t => t.code.toLowerCase() === code || t.id === routeItemCode);
    else if (route.tab === 'usecases') found = inProject(useCases, u => u.code.toLowerCase() === code || u.id === routeItemCode);
    else if (route.tab === 'issues' && issuesAvailable) found = inProject(issueRows, i => String(i.number) === routeItemCode || i.id === routeItemCode);
    const key = `${routeProject.id}/${route.tab}/${code}`;
    if (found) {
      seenItemRef.current = key;
      return;
    }
    if (seenItemRef.current !== key) pushToast('error', `Không tìm thấy "${routeItemCode}" trong dự án ${routeProject.code}, hoặc bạn không có quyền xem.`);
    navigate(buildPath({ tab: route.tab, projectCode: routeProject.code }) + search, { replace: true });
  }, [isLoading, routeProject?.id, routeItemCode, route, tasks, useCases, issueRows, issuesAvailable]); // eslint-disable-line react-hooks/exhaustive-deps

  // Vào địa chỉ gốc hoặc địa chỉ không hợp lệ thì đưa về tổng quan của dự án gần nhất (địa chỉ luôn phản ánh màn hình đang xem)
  useEffect(() => {
    if (isLoading || !activeProject) return;
    if (route.kind === 'root' || route.kind === 'unknown' || route.kind === 'share') navigate(hrefFor({ tab: 'dashboard' }), { replace: true });
  }, [isLoading, route.kind, activeProject?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AppContext.Provider
      value={{
        activeTab,
        setActiveTab,
        routeItemCode,
        routeProjectMissing,
        hrefFor,
        copyLink,
        closeItem,
        openUseCase,
        issuesAvailable,
        issueView,
        setIssueView,
        projectIssues,
        issueTypes,
        issueStatuses,
        issuePriorities,
        getIssueJournals,
        canCreateIssue,
        canUpdateIssue,
        canEditIssue,
        canAssignIssue,
        canDeleteIssue,
        canConfigIssueTypes,
        canConfigIssueStatuses,
        createIssue,
        updateIssue,
        editIssueNote,
        deleteIssueNote,
        deleteIssue,
        attachmentsAvailable,
        getIssueAttachments,
        getAttachmentUrls,
        deleteIssueAttachment,
        getAttachmentUsage,
        saveIssueTypes,
        saveIssueStatuses,
        saveIssuePriorities,
        openIssue,
        openTask,
        users,
        allUsers,
        currentUser,
        signOut,
        projects,
        activeProjectId,
        // Chỉ được dùng khi đã có ít nhất một dự án (App chặn bằng màn hình "chưa có dự án").
        activeProject: activeProject as Project,
        setActiveProjectId,
        tasks,
        projectTasks,
        useCases,
        projectUseCases,
        qualityGates,
        projectQualityGates,
        notifications,
        unreadNotificationCount,
        projectSnapshots,
        reportSchedules,
        reportRuns,
        isLoading,
        loadError,
        reload,
        toasts,
        dismissToast,
        isAdmin,
        canManageProject,
        canManageProjectId,
        canManageTasks,
        canManageUseCases,
        canApproveQuality,
        canEditQualityItems,
        canApproveUseCase,
        canTickStage,
        isViewer,
        createProject,
        updateProject,
        deleteProject,
        addMember,
        suggestAccounts,
        addMemberById,
        createPlaceholderMember,
        deletePlaceholder,
        mergeRequests: mergeRows,
        resolveMerge,
        setMemberRole,
        removeMember,
        createTask,
        updateTask,
        deleteTask,
        moveTaskStatus,
        createUseCase,
        updateUseCase,
        deleteUseCase,
        toggleAcceptanceCriteria,
        setUseCaseStages,
        setUseCaseLevel,
        getAccessReport,
        getMemberAccessReport,
        permissionMatrix: permMatrix,
        getPermissionMatrix,
        savePermissions,
        resetPermissions,
        getPermissionLog,
        toggleQualityItemPassed,
        updateQualityNotes,
        addQualityItem,
        editQualityItem,
        deleteQualityItem,
        sendDeadlineReminder,
        getTelegram,
        saveTelegram,
        testTelegram,
        markNotificationAsRead,
        markAllNotificationsAsRead,
        seedDemoData,
        scanDeadlines,
        setReportSchedule,
        generateReportNow,
        soundMuted,
        toggleSound
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
