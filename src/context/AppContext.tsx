import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode } from 'react';
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
  UseCaseStatus,
  Role
} from '../types';
import {
  INITIAL_USERS,
  INITIAL_PROJECTS,
  INITIAL_TASKS,
  INITIAL_USE_CASES,
  INITIAL_QUALITY_GATES,
  INITIAL_NOTIFICATIONS
} from '../data/initialData';
import { sound } from '../utils/soundAlert';

interface AppContextType {
  activeTab: NavigationTab;
  setActiveTab: (tab: NavigationTab) => void;
  users: User[];
  currentUser: User;
  setCurrentUser: (user: User) => void;
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
  
  // Permissions helpers
  canManageProject: boolean;
  canManageTasks: boolean;
  canApproveQuality: boolean;
  canApproveUseCase: boolean;
  isViewer: boolean;

  // Actions
  createProject: (project: Omit<Project, 'id' | 'progressPercent'>) => void;
  updateProject: (project: Project) => void;
  deleteProject: (id: string) => void;
  createTask: (task: Omit<Task, 'id'>) => void;
  updateTask: (task: Task) => void;
  deleteTask: (id: string) => void;
  moveTaskStatus: (taskId: string, newStatus: TaskStatus) => void;
  createUseCase: (useCase: Omit<UseCase, 'id' | 'updatedAt'>) => void;
  updateUseCase: (useCase: UseCase) => void;
  deleteUseCase: (id: string) => void;
  toggleAcceptanceCriteria: (useCaseId: string, criteriaId: string) => void;
  toggleQualityItemPassed: (phaseId: string, itemId: string, notes?: string) => void;
  addQualityItem: (phaseId: string, item: Omit<QualityCheckItem, 'id' | 'isPassed'>) => void;
  sendDeadlineReminder: (taskId: string) => void;
  markNotificationAsRead: (id: string) => void;
  markAllNotificationsAsRead: () => void;
  resetToDemoData: () => void;
  soundMuted: boolean;
  toggleSound: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const STORAGE_KEYS = {
  PROJECTS: 'omni_projects_v1',
  ACTIVE_PROJECT: 'omni_active_proj_id_v1',
  TASKS: 'omni_tasks_v1',
  USE_CASES: 'omni_usecases_v1',
  QUALITY_GATES: 'omni_quality_gates_v1',
  CURRENT_USER_ID: 'omni_curr_user_id_v1',
  NOTIFICATIONS: 'omni_notifications_v1',
  SOUND_MUTED: 'omni_sound_muted_v1'
};

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [activeTab, setActiveTab] = useState<NavigationTab>('dashboard');
  const [users] = useState<User[]>(INITIAL_USERS);
  
  const [currentUserId, setCurrentUserId] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEYS.CURRENT_USER_ID) || 'user-admin';
  });

  const currentUser = useMemo(() => {
    return users.find(u => u.id === currentUserId) || users[0];
  }, [users, currentUserId]);

  const [soundMuted, setSoundMuted] = useState<boolean>(() => {
    return localStorage.getItem(STORAGE_KEYS.SOUND_MUTED) === 'true';
  });

  const toggleSound = () => {
    const next = !soundMuted;
    setSoundMuted(next);
    sound.setMuted(next);
    localStorage.setItem(STORAGE_KEYS.SOUND_MUTED, String(next));
  };

  // Projects state
  const [projects, setProjects] = useState<Project[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.PROJECTS);
      return saved ? JSON.parse(saved) : INITIAL_PROJECTS;
    } catch {
      return INITIAL_PROJECTS;
    }
  });

  const [activeProjectId, setActiveProjectId] = useState<string>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.ACTIVE_PROJECT);
    return saved && projects.some(p => p.id === saved) ? saved : (projects[0]?.id || 'proj-1');
  });

  // Tasks state
  const [tasks, setTasks] = useState<Task[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.TASKS);
      return saved ? JSON.parse(saved) : INITIAL_TASKS;
    } catch {
      return INITIAL_TASKS;
    }
  });

  // Use Cases state
  const [useCases, setUseCases] = useState<UseCase[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.USE_CASES);
      return saved ? JSON.parse(saved) : INITIAL_USE_CASES;
    } catch {
      return INITIAL_USE_CASES;
    }
  });

  // Quality Gates state
  const [qualityGates, setQualityGates] = useState<ProjectQualityGates[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.QUALITY_GATES);
      return saved ? JSON.parse(saved) : INITIAL_QUALITY_GATES;
    } catch {
      return INITIAL_QUALITY_GATES;
    }
  });

  // Notifications state
  const [notifications, setNotifications] = useState<NotificationItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS);
      return saved ? JSON.parse(saved) : INITIAL_NOTIFICATIONS;
    } catch {
      return INITIAL_NOTIFICATIONS;
    }
  });

  // Save changes to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(projects));
  }, [projects]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.ACTIVE_PROJECT, activeProjectId);
  }, [activeProjectId]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(tasks));
  }, [tasks]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.USE_CASES, JSON.stringify(useCases));
  }, [useCases]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.QUALITY_GATES, JSON.stringify(qualityGates));
  }, [qualityGates]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.CURRENT_USER_ID, currentUserId);
  }, [currentUserId]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(notifications));
  }, [notifications]);

  // Derived current active project
  const activeProject = useMemo(() => {
    return projects.find(p => p.id === activeProjectId) || projects[0] || INITIAL_PROJECTS[0];
  }, [projects, activeProjectId]);

  // Project tasks
  const projectTasks = useMemo(() => {
    return tasks.filter(t => t.projectId === activeProjectId);
  }, [tasks, activeProjectId]);

  // Project use cases
  const projectUseCases = useMemo(() => {
    return useCases.filter(uc => uc.projectId === activeProjectId);
  }, [useCases, activeProjectId]);

  // Project quality gates
  const projectQualityGates = useMemo(() => {
    return qualityGates.find(qg => qg.projectId === activeProjectId);
  }, [qualityGates, activeProjectId]);

  // Recalculate project progress dynamically based on tasks and use cases
  useEffect(() => {
    if (!activeProject) return;
    const currentTasks = tasks.filter(t => t.projectId === activeProject.id);
    const currentUcs = useCases.filter(u => u.projectId === activeProject.id);

    if (currentTasks.length === 0 && currentUcs.length === 0) return;

    let taskDonePercent = 0;
    if (currentTasks.length > 0) {
      const doneCount = currentTasks.filter(t => t.status === 'done').length;
      const inProgressCount = currentTasks.filter(t => t.status === 'in_progress').length;
      const reviewCount = currentTasks.filter(t => t.status === 'review').length;
      taskDonePercent = ((doneCount * 1.0 + reviewCount * 0.7 + inProgressCount * 0.4) / currentTasks.length) * 100;
    }

    let ucDonePercent = 0;
    if (currentUcs.length > 0) {
      const totalUcProgress = currentUcs.reduce((acc, curr) => acc + curr.progressPercent, 0);
      ucDonePercent = totalUcProgress / currentUcs.length;
    }

    const calculatedProgress = Math.round(
      currentUcs.length > 0 ? (taskDonePercent * 0.6 + ucDonePercent * 0.4) : taskDonePercent
    );

    if (calculatedProgress !== activeProject.progressPercent) {
      setProjects(prev =>
        prev.map(p => (p.id === activeProject.id ? { ...p, progressPercent: calculatedProgress } : p))
      );
    }
  }, [tasks, useCases, activeProject?.id]);

  // Auto scan deadlines on mount and add overdue/approaching warnings if not existing
  useEffect(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const newAlerts: NotificationItem[] = [];

    tasks.forEach(task => {
      if (task.status === 'done') return;
      const due = new Date(task.dueDate);
      due.setHours(0, 0, 0, 0);
      const diffDays = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

      if (diffDays < 0) {
        // Overdue
        const exists = notifications.some(n => n.taskId === task.id && n.type === 'overdue');
        if (!exists) {
          newAlerts.push({
            id: `notif-overdue-${task.id}-${Date.now()}`,
            projectId: task.projectId,
            type: 'overdue',
            title: `Cảnh Báo Quá Hạn: ${task.code}`,
            message: `Nhiệm vụ "${task.title}" đã quá hạn chót (${task.dueDate}) ${Math.abs(diffDays)} ngày!`,
            taskId: task.id,
            createdAt: new Date().toLocaleString('vi-VN'),
            isRead: false
          });
        }
      } else if (diffDays <= 2) {
        // Approaching deadline <= 48h
        const exists = notifications.some(n => n.taskId === task.id && n.type === 'deadline_warning');
        if (!exists) {
          newAlerts.push({
            id: `notif-warning-${task.id}-${Date.now()}`,
            projectId: task.projectId,
            type: 'deadline_warning',
            title: `Nhắc Nhở Deadline: ${task.code}`,
            message: `Nhiệm vụ "${task.title}" sẽ đến hạn ${diffDays === 0 ? 'trong ngày hôm nay' : `trong ${diffDays} ngày tới (${task.dueDate})`}!`,
            taskId: task.id,
            createdAt: new Date().toLocaleString('vi-VN'),
            isRead: false
          });
        }
      }
    });

    if (newAlerts.length > 0) {
      setNotifications(prev => [...newAlerts, ...prev]);
    }
  }, [tasks]);

  const unreadNotificationCount = useMemo(() => {
    return notifications.filter(n => !n.isRead).length;
  }, [notifications]);

  // RBAC permissions logic
  const canManageProject = currentUser.role === 'admin' || currentUser.role === 'pm';
  const canManageTasks = currentUser.role === 'admin' || currentUser.role === 'pm' || currentUser.role === 'developer';
  const canApproveQuality = currentUser.role === 'admin' || currentUser.role === 'pm' || currentUser.role === 'qa';
  const canApproveUseCase = currentUser.role === 'admin' || currentUser.role === 'pm';
  const isViewer = currentUser.role === 'viewer';

  // Project Actions
  const createProject = (projectData: Omit<Project, 'id' | 'progressPercent'>) => {
    const newId = `proj-${Date.now()}`;
    const newProject: Project = {
      ...projectData,
      id: newId,
      progressPercent: 0
    };

    // Also initialize default Quality Gates for the new project
    const defaultQualityPhases: ProjectQualityGates = {
      projectId: newId,
      phases: INITIAL_QUALITY_GATES[0].phases.map(p => ({
        ...p,
        items: p.items.map(item => ({
          ...item,
          id: `item-${newId}-${Math.random().toString(36).substring(2, 7)}`,
          isPassed: false,
          checkedBy: undefined,
          checkedAt: undefined,
          notes: undefined
        }))
      }))
    };

    setProjects(prev => [newProject, ...prev]);
    setQualityGates(prev => [...prev, defaultQualityPhases]);
    setActiveProjectId(newId);
    sound.playSuccess();
  };

  const updateProject = (updated: Project) => {
    setProjects(prev => prev.map(p => (p.id === updated.id ? updated : p)));
    sound.playSuccess();
  };

  const deleteProject = (id: string) => {
    if (projects.length <= 1) return; // Keep at least one
    const remaining = projects.filter(p => p.id !== id);
    setProjects(remaining);
    setTasks(prev => prev.filter(t => t.projectId !== id));
    setUseCases(prev => prev.filter(u => u.projectId !== id));
    setQualityGates(prev => prev.filter(qg => qg.projectId !== id));
    setActiveProjectId(remaining[0].id);
  };

  // Task Actions
  const createTask = (taskData: Omit<Task, 'id'>) => {
    const newTask: Task = {
      ...taskData,
      id: `task-${Date.now()}`
    };
    setTasks(prev => [newTask, ...prev]);
    sound.playSuccess();
  };

  const updateTask = (updated: Task) => {
    setTasks(prev => prev.map(t => (t.id === updated.id ? updated : t)));
    sound.playSuccess();
  };

  const deleteTask = (id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id));
  };

  const moveTaskStatus = (taskId: string, newStatus: TaskStatus) => {
    setTasks(prev =>
      prev.map(t => {
        if (t.id === taskId) {
          return { ...t, status: newStatus };
        }
        return t;
      })
    );
    sound.playNotification();
  };

  // Use Case Actions
  const createUseCase = (ucData: Omit<UseCase, 'id' | 'updatedAt'>) => {
    const newUc: UseCase = {
      ...ucData,
      id: `uc-${Date.now()}`,
      updatedAt: new Date().toISOString().split('T')[0]
    };
    setUseCases(prev => [newUc, ...prev]);
    sound.playSuccess();
  };

  const updateUseCase = (updated: UseCase) => {
    const refreshed = {
      ...updated,
      updatedAt: new Date().toISOString().split('T')[0]
    };
    setUseCases(prev => prev.map(uc => (uc.id === updated.id ? refreshed : uc)));
    sound.playSuccess();
  };

  const deleteUseCase = (id: string) => {
    setUseCases(prev => prev.filter(uc => uc.id !== id));
  };

  const toggleAcceptanceCriteria = (useCaseId: string, criteriaId: string) => {
    setUseCases(prev =>
      prev.map(uc => {
        if (uc.id !== useCaseId) return uc;
        const newCriteria = uc.acceptanceCriteria.map(c =>
          c.id === criteriaId ? { ...c, completed: !c.completed } : c
        );
        const completedCount = newCriteria.filter(c => c.completed).length;
        const autoProgress = Math.round((completedCount / newCriteria.length) * 100);

        let newStatus: UseCaseStatus = uc.status;
        if (autoProgress === 100) {
          newStatus = 'completed';
        } else if (autoProgress >= 50 && uc.status === 'draft') {
          newStatus = 'developing';
        }

        return {
          ...uc,
          acceptanceCriteria: newCriteria,
          progressPercent: autoProgress,
          status: newStatus,
          updatedAt: new Date().toISOString().split('T')[0]
        };
      })
    );
    sound.playNotification();
  };

  // Quality Gate Actions
  const toggleQualityItemPassed = (phaseId: string, itemId: string, notes?: string) => {
    setQualityGates(prev =>
      prev.map(qg => {
        if (qg.projectId !== activeProjectId) return qg;
        return {
          ...qg,
          phases: qg.phases.map(phase => {
            if (phase.id !== phaseId) return phase;
            return {
              ...phase,
              items: phase.items.map(item => {
                if (item.id !== itemId) return item;
                const nextPassed = !item.isPassed;
                return {
                  ...item,
                  isPassed: nextPassed,
                  checkedBy: nextPassed ? `${currentUser.name} (${currentUser.role.toUpperCase()})` : undefined,
                  checkedAt: nextPassed ? new Date().toISOString().split('T')[0] : undefined,
                  notes: notes !== undefined ? notes : item.notes
                };
              })
            };
          })
        };
      })
    );
    sound.playSuccess();
  };

  const addQualityItem = (phaseId: string, itemData: Omit<QualityCheckItem, 'id' | 'isPassed'>) => {
    setQualityGates(prev =>
      prev.map(qg => {
        if (qg.projectId !== activeProjectId) return qg;
        return {
          ...qg,
          phases: qg.phases.map(phase => {
            if (phase.id !== phaseId) return phase;
            const newItem: QualityCheckItem = {
              ...itemData,
              id: `qg-custom-${Date.now()}`,
              isPassed: false
            };
            return {
              ...phase,
              items: [...phase.items, newItem]
            };
          })
        };
      })
    );
    sound.playSuccess();
  };

  // Deadline Reminders
  const sendDeadlineReminder = (taskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    const assignee = users.find(u => u.id === task.assigneeId);

    const reminderNotif: NotificationItem = {
      id: `reminder-${Date.now()}`,
      projectId: task.projectId,
      type: 'deadline_warning',
      title: `Nhắc việc gửi tới ${assignee?.name || 'thành viên'}`,
      message: `Quản trị viên đã gửi nhắc nhở deadline nhiệm vụ "${task.title}" (Hạn chót: ${task.dueDate}).`,
      taskId: task.id,
      createdAt: new Date().toLocaleString('vi-VN'),
      isRead: false
    };

    setNotifications(prev => [reminderNotif, ...prev]);
    sound.playWarning();
  };

  const markNotificationAsRead = (id: string) => {
    setNotifications(prev => prev.map(n => (n.id === id ? { ...n, isRead: true } : n)));
  };

  const markAllNotificationsAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
  };

  // Demo Data Reset
  const resetToDemoData = () => {
    setProjects(INITIAL_PROJECTS);
    setActiveProjectId('proj-1');
    setTasks(INITIAL_TASKS);
    setUseCases(INITIAL_USE_CASES);
    setQualityGates(INITIAL_QUALITY_GATES);
    setNotifications(INITIAL_NOTIFICATIONS);
    setCurrentUserId('user-admin');
    sound.playSuccess();
  };

  const handleSetCurrentUser = (user: User) => {
    setCurrentUserId(user.id);
    sound.playNotification();
  };

  return (
    <AppContext.Provider
      value={{
        activeTab,
        setActiveTab,
        users,
        currentUser,
        setCurrentUser: handleSetCurrentUser,
        projects,
        activeProjectId,
        activeProject,
        setActiveProjectId,
        tasks,
        projectTasks,
        useCases,
        projectUseCases,
        qualityGates,
        projectQualityGates,
        notifications,
        unreadNotificationCount,
        canManageProject,
        canManageTasks,
        canApproveQuality,
        canApproveUseCase,
        isViewer,
        createProject,
        updateProject,
        deleteProject,
        createTask,
        updateTask,
        deleteTask,
        moveTaskStatus,
        createUseCase,
        updateUseCase,
        deleteUseCase,
        toggleAcceptanceCriteria,
        toggleQualityItemPassed,
        addQualityItem,
        sendDeadlineReminder,
        markNotificationAsRead,
        markAllNotificationsAsRead,
        resetToDemoData,
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
