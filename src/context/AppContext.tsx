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
  Toast
} from '../types';
import { supabase, describeError } from '../lib/supabase';
import {
  Profile,
  MemberRow,
  mapProfile,
  mapMember,
  mapProject,
  mapTask,
  mapUseCase,
  mapNotification,
  mapSnapshot,
  mapReportSchedule,
  mapReportRun,
  buildQualityGates
} from '../api/mappers';
import { useAuth } from './AuthContext';
import { sound } from '../utils/soundAlert';
import { StageKey, STAGE_LABEL, canTickStage as roleCanTickStage } from '../utils/stages';

interface AppContextType {
  activeTab: NavigationTab;
  setActiveTab: (tab: NavigationTab) => void;

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
  setUseCaseStages: (useCaseIds: string[], stage: StageKey, done: boolean) => Promise<boolean>;
  // Quality gates
  toggleQualityItemPassed: (phaseId: string, itemId: string, notes?: string) => void;
  updateQualityNotes: (itemId: string, notes: string) => void;
  addQualityItem: (phaseId: string, item: Omit<QualityCheckItem, 'id' | 'isPassed'>) => void;
  // Thông báo
  sendDeadlineReminder: (taskId: string) => void;
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
  SOUND_MUTED: 'omni_sound_muted_v1'
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
  | 'reports';
const ALL_SLICES: Slice[] = [
  'profiles',
  'members',
  'projects',
  'tasks',
  'usecases',
  'quality',
  'notifications',
  'snapshots',
  'reports'
];

// Bảng nào thay đổi thì tải lại những phần dữ liệu nào.
const TABLE_SLICES: Record<string, Slice[]> = {
  projects: ['projects'],
  project_members: ['members', 'projects', 'profiles'],
  tasks: ['tasks'],
  task_collaborators: ['tasks'],
  use_cases: ['usecases'],
  acceptance_criteria: ['usecases'],
  use_case_stages: ['usecases'],
  quality_items: ['quality'],
  notifications: ['notifications'],
  progress_snapshots: ['snapshots'],
  report_schedules: ['reports'],
  report_runs: ['reports']
};

type Row = Record<string, any>;

const toUser = (p: Profile, role: Role): User => ({
  id: p.id,
  name: p.name,
  email: p.email,
  avatarColor: p.avatarColor,
  role,
  isAdmin: p.isAdmin,
  department: p.department
});

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { profile, signOut } = useAuth();
  if (!profile) throw new Error('AppProvider requires a signed-in profile');

  const [activeTab, setActiveTab] = useState<NavigationTab>('dashboard');
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
  const [ucRows, setUcRows] = useState<Row[]>([]);
  const [criteriaRows, setCriteriaRows] = useState<Row[]>([]);
  const [stageRows, setStageRows] = useState<Row[]>([]);
  const [qualityDefs, setQualityDefs] = useState<Row[]>([]);
  const [qualityRows, setQualityRows] = useState<Row[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [snapshotRows, setSnapshotRows] = useState<(ProgressSnapshot & { projectId: string })[]>([]);
  const [scheduleRows, setScheduleRows] = useState<ReportSchedule[]>([]);
  const [runRows, setRunRows] = useState<ReportRun[]>([]);

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
      setTimeout(() => dismissToast(id), type === 'error' ? 8000 : 4500);
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
        const { data, error } = await supabase.from('project_members').select('*');
        if (error) throw error;
        setMembers((data || []).map(mapMember));
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
        const [tk, co] = await Promise.all([
          supabase.from('tasks').select('*').order('created_at', { ascending: false }).order('code'),
          supabase.from('task_collaborators').select('*')
        ]);
        if (tk.error) throw tk.error;
        if (co.error) throw co.error;
        setTaskRows(tk.data || []);
        setCollabRows(co.data || []);
      },
      usecases: async () => {
        const [uc, cr, st] = await Promise.all([
          supabase.from('use_cases').select('*').order('created_at', { ascending: false }).order('code'),
          supabase.from('acceptance_criteria').select('*'),
          supabase.from('use_case_stages').select('*')
        ]);
        if (uc.error) throw uc.error;
        if (cr.error) throw cr.error;
        // Bảng bước chuẩn là phần phụ: lỗi (vd chưa chạy migration 0010) chỉ làm trống phần này.
        if (st.error) console.warn('Không tải được các bước use case:', st.error.message);
        setUcRows(uc.data || []);
        setCriteriaRows(cr.data || []);
        setStageRows(st.error ? [] : st.data || []);
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

  const activeProject = useMemo(
    () => projects.find(p => p.id === activeProjectIdState) || projects[0],
    [projects, activeProjectIdState]
  );
  const activeProjectId = activeProject?.id || '';

  useEffect(() => {
    if (activeProjectId) safeSet(STORAGE_KEYS.ACTIVE_PROJECT, activeProjectId);
  }, [activeProjectId]);

  const tasks = useMemo(() => taskRows.map(r => mapTask(r, collabRows)), [taskRows, collabRows]);
  const useCases = useMemo(
    () => ucRows.map(r => mapUseCase(r, criteriaRows, stageRows)),
    [ucRows, criteriaRows, stageRows]
  );
  const qualityGates = useMemo(
    () => buildQualityGates(projects.map(p => p.id), qualityDefs, qualityRows),
    [projects, qualityDefs, qualityRows]
  );

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
  const role = currentUser.role;
  const isAdmin = profile.isAdmin;
  const canManageProjectId = (projectId: string) => {
    const r = roleIn(projectId, profile);
    return r === 'admin' || r === 'pm';
  };
  const canManageProject = role === 'admin' || role === 'pm';
  const canManageTasks = role === 'admin' || role === 'pm' || role === 'dev' || role === 'ba' || role === 'tester';
  const canManageUseCases = role === 'admin' || role === 'pm' || role === 'dev' || role === 'ba';
  const canApproveQuality = role === 'admin' || role === 'pm' || role === 'tester';
  const canApproveUseCase = role === 'admin' || role === 'pm';
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

  const setActiveProjectId = (id: string) => setActiveProjectIdState(id);

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
    use_case_id: t.useCaseId || null
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
    necessity: u.necessity || 'B'
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

  const setUseCaseStages = (useCaseIds: string[], stage: StageKey, done: boolean) => {
    const ids = [...new Set(useCaseIds)];
    if (ids.length === 0) return Promise.resolve(false);
    return run(
      async () => {
        const res = await supabase.rpc('set_use_case_stages', { p_use_cases: ids, p_stage: stage, p_done: done });
        check(res);
        const n = Number(res.data ?? 0);
        pushToast(
          n > 0 ? 'success' : 'info',
          n > 0
            ? `${done ? 'Đã đánh dấu' : 'Đã bỏ đánh dấu'} bước "${STAGE_LABEL[stage]}" cho ${n} use case.`
            : `Không có use case nào thay đổi (bước "${STAGE_LABEL[stage]}" đã ở trạng thái này, hoặc dự án chưa dùng mô hình 5 bước).`
        );
      },
      ['usecases', 'projects'],
      false
    );
  };

  // Quality gates
  const toggleQualityItemPassed = (_phaseId: string, itemId: string, notes?: string) => {
    const item = qualityRows.find(i => i.id === itemId);
    if (!item) return;
    const next = !item.is_passed;
    const label = `${currentUser.name} (${currentUser.role.toUpperCase()})`;
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

  // Thông báo
  const sendDeadlineReminder = (taskId: string) => {
    announce('Đã gửi nhắc nhở deadline');
    void run(
      async () => {
        check(await supabase.rpc('send_task_reminder', { p_task: taskId }));
        sound.playWarning();
      },
      ['notifications'],
      false
    );
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
        else pushToast('info', 'Không có thông báo deadline mới (mọi cảnh báo đã được gửi trước đó).');
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

  return (
    <AppContext.Provider
      value={{
        activeTab,
        setActiveTab,
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
        canApproveUseCase,
        canTickStage,
        isViewer,
        createProject,
        updateProject,
        deleteProject,
        addMember,
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
        toggleQualityItemPassed,
        updateQualityNotes,
        addQualityItem,
        sendDeadlineReminder,
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
