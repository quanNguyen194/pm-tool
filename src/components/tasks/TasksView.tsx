import React, { useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { DEPARTMENTS, Department, Task, TaskAssessment, TaskStatus, Priority } from '../../types';
import {
  Plus,
  Search,
  Filter,
  Kanban,
  CalendarRange,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Table as TableIcon,
  Clock,
  AlertTriangle,
  Send,
  Trash2,
  Edit3,
  ChevronRight,
  ChevronLeft,
  X,
  FileSpreadsheet
} from 'lucide-react';
import { exportTasksToCSV } from '../../utils/exportUtils';
import { GanttTimeline } from './GanttTimeline';
import { AssessmentBadge, OwnerAvatars, TaskProgress } from './TaskParts';
import { ASSESSMENT_LABELS, ASSESSMENT_OPTIONS, ASSESSMENT_STYLES, effectiveAssessment, suggestAssessment } from '../../utils/taskAssessment';
import { DEPARTMENT_LABELS, ROLE_SHORT } from '../../utils/roles';
import { UseCaseLinks } from './UseCaseLinks';

type SortKey = 'code' | 'title' | 'status' | 'priority' | 'assignee' | 'progress' | 'effort' | 'due';
const STATUS_ORDER: Record<TaskStatus, number> = { todo: 0, in_progress: 1, review: 2, done: 3 };
const PRIORITY_ORDER: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: 'Cần làm',
  in_progress: 'Đang thực hiện',
  review: 'Chờ thẩm định',
  done: 'Hoàn thành'
};
const PRIORITY_LABEL: Record<Priority, string> = { low: 'Thấp', medium: 'Trung bình', high: 'Cao', urgent: 'Khẩn cấp' };

const isoDay = (offsetDays = 0) => {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Tiến độ mặc định theo trạng thái (khớp trigger trong DB). */
const defaultProgress = (s: TaskStatus) => (s === 'done' ? 100 : s === 'review' ? 70 : s === 'in_progress' ? 40 : 0);

interface TaskForm {
  code: string;
  title: string;
  description: string;
  deliverable: string;
  notes: string;
  status: TaskStatus;
  priority: Priority;
  assigneeId: string;
  collaboratorIds: string[];
  department: Department | '';
  phase: string;
  estimatedEffort: number;
  actualEffort: number;
  startDate: string;
  dueDate: string;
  actualEndDate: string;
  progressPercent: number;
  assessment: TaskAssessment | '';
  tags: string;
  useCaseIds: string[];
}

export const TasksView: React.FC = () => {
  const {
    activeProject,
    projectTasks,
    users,
    createTask,
    updateTask,
    deleteTask,
    moveTaskStatus,
    sendDeadlineReminder,
    canManageTasks,
    canManageProject,
    currentUser,
    projectUseCases
  } = useApp();

  const [viewMode, setViewMode] = useState<'kanban' | 'gantt' | 'table'>('kanban');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [filterAssignee, setFilterAssignee] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterDepartment, setFilterDepartment] = useState<string>('all');
  const [filterAssessment, setFilterAssessment] = useState<TaskAssessment | 'all'>('all');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'due', dir: 'asc' });
  // Kéo thả Kanban
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<TaskStatus | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const userMap = useMemo(() => new Map(users.map(u => [u.id, u])), [users]);
  const useCaseCodeMap = useMemo(() => new Map(projectUseCases.map(u => [u.id, u.code])), [projectUseCases]);
  const detailTask = detailId ? projectTasks.find(t => t.id === detailId) || null : null;

  const roleDepartment = (): Department | '' =>
    (['pm', 'ba', 'dev', 'tester'] as const).find(r => r === currentUser.role) || '';

  const emptyForm = (): TaskForm => ({
    code: `${activeProject.code.slice(0, 3)}-${Math.floor(100 + Math.random() * 900)}`,
    title: '',
    description: '',
    deliverable: '',
    notes: '',
    status: 'todo',
    priority: 'medium',
    assigneeId: currentUser.id,
    collaboratorIds: [],
    department: roleDepartment(),
    phase: 'Giai đoạn 3: Phát triển Sprint',
    estimatedEffort: 2,
    actualEffort: 0,
    startDate: isoDay(0),
    dueDate: isoDay(5),
    actualEndDate: '',
    progressPercent: 0,
    assessment: '',
    tags: '',
    useCaseIds: []
  });

  const [formData, setFormData] = useState<TaskForm>(emptyForm);

  const openCreateModal = () => {
    setEditingTask(null);
    setFormData(emptyForm());
    setIsModalOpen(true);
  };

  const openEditModal = (task: Task) => {
    setDetailId(null);
    setEditingTask(task);
    setFormData({
      code: task.code,
      title: task.title,
      description: task.description || '',
      deliverable: task.deliverable,
      notes: task.notes,
      status: task.status,
      priority: task.priority,
      assigneeId: task.assigneeId,
      collaboratorIds: task.collaboratorIds,
      department: task.department || '',
      phase: task.phase,
      estimatedEffort: task.estimatedEffort,
      actualEffort: task.actualEffort,
      startDate: task.startDate,
      dueDate: task.dueDate,
      actualEndDate: task.actualEndDate || '',
      progressPercent: task.progressPercent,
      assessment: task.assessment || '',
      tags: task.tags?.join(', ') || '',
      useCaseIds: task.useCaseIds
    });
    setIsModalOpen(true);
  };

  // Đổi trạng thái trong form thì điều chỉnh tiến độ cho hợp lý (khớp trigger DB).
  const changeStatus = (status: TaskStatus) =>
    setFormData(f => {
      let progress = f.progressPercent;
      if (status === 'done') progress = 100;
      else if (f.status === 'done') progress = progress === 100 ? 90 : progress;
      else if (progress === defaultProgress(f.status)) progress = defaultProgress(status);
      return {
        ...f,
        status,
        progressPercent: progress,
        actualEndDate: status === 'done' ? f.actualEndDate || isoDay(0) : ''
      };
    });

  const changeProgress = (raw: number) =>
    setFormData(f => {
      const p = Math.max(0, Math.min(100, Math.round(Number.isFinite(raw) ? raw : 0)));
      let status = f.status;
      if (p === 100) status = 'done';
      else if (f.status === 'done') status = 'review';
      else if (p > 0 && f.status === 'todo') status = 'in_progress';
      return {
        ...f,
        progressPercent: p,
        status,
        actualEndDate: status === 'done' ? f.actualEndDate || isoDay(0) : ''
      };
    });

  const toggleCollaborator = (id: string) =>
    setFormData(f => ({
      ...f,
      collaboratorIds: f.collaboratorIds.includes(id) ? f.collaboratorIds.filter(x => x !== id) : [...f.collaboratorIds, id]
    }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim() || !formData.code.trim()) return;

    const tagsArray = formData.tags
      .split(',')
      .map(t => t.trim())
      .filter(Boolean);

    const payload = {
      code: formData.code,
      title: formData.title,
      description: formData.description,
      deliverable: formData.deliverable,
      notes: formData.notes,
      status: formData.status,
      priority: formData.priority,
      assigneeId: formData.assigneeId,
      collaboratorIds: formData.collaboratorIds.filter(id => id !== formData.assigneeId),
      department: formData.department || undefined,
      phase: formData.phase,
      estimatedEffort: formData.estimatedEffort,
      actualEffort: formData.actualEffort,
      startDate: formData.startDate,
      dueDate: formData.dueDate,
      actualEndDate: formData.status === 'done' ? formData.actualEndDate || undefined : undefined,
      progressPercent: formData.progressPercent,
      assessment: formData.assessment || undefined,
      tags: tagsArray,
      useCaseIds: formData.useCaseIds
    };

    if (editingTask) {
      updateTask({ ...editingTask, ...payload });
    } else {
      createTask({ projectId: activeProject.id, ...payload });
    }
    setIsModalOpen(false);
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Filtering
  const q = searchQuery.toLowerCase();
  const filteredTasks = projectTasks.filter(task => {
    const matchesSearch =
      task.title.toLowerCase().includes(q) ||
      task.code.toLowerCase().includes(q) ||
      (task.description && task.description.toLowerCase().includes(q));

    const matchesPriority = filterPriority === 'all' || task.priority === filterPriority;
    const matchesAssignee =
      filterAssignee === 'all' || task.assigneeId === filterAssignee || task.collaboratorIds.includes(filterAssignee);
    const matchesDepartment = filterDepartment === 'all' || task.department === filterDepartment;
    const matchesAssessment = filterAssessment === 'all' || effectiveAssessment(task).value === filterAssessment;
    // Kanban đã chia cột theo trạng thái nên bộ lọc trạng thái chỉ áp dụng cho Gantt và Bảng.
    const matchesStatus = viewMode === 'kanban' || filterStatus === 'all' || task.status === filterStatus;

    return matchesSearch && matchesPriority && matchesAssignee && matchesDepartment && matchesAssessment && matchesStatus;
  });

  // Đếm theo đánh giá (trên toàn bộ việc của dự án) cho thanh tóm tắt.
  const assessmentCounts = useMemo(() => {
    const c: Record<TaskAssessment, number> = { ahead: 0, on_track: 0, at_risk: 0, delayed: 0 };
    projectTasks.forEach(t => {
      c[effectiveAssessment(t).value]++;
    });
    return c;
  }, [projectTasks]);

  const sortedTasks = [...filteredTasks].sort((a, b) => {
    let r = 0;
    switch (sort.key) {
      case 'code': r = a.code.localeCompare(b.code, 'vi', { numeric: true }); break;
      case 'title': r = a.title.localeCompare(b.title, 'vi'); break;
      case 'status': r = STATUS_ORDER[a.status] - STATUS_ORDER[b.status]; break;
      case 'priority': r = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]; break;
      case 'assignee': r = (userMap.get(a.assigneeId)?.name || '~').localeCompare(userMap.get(b.assigneeId)?.name || '~', 'vi'); break;
      case 'progress': r = a.progressPercent - b.progressPercent; break;
      case 'effort': r = a.estimatedEffort - b.estimatedEffort; break;
      case 'due': r = a.dueDate.localeCompare(b.dueDate); break;
    }
    return sort.dir === 'asc' ? r : -r;
  });
  const toggleSort = (key: SortKey) =>
    setSort(s => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));

  const columns: { id: TaskStatus; title: string; color: string; badgeColor: string }[] = [
    { id: 'todo', title: 'Cần Làm (To Do)', color: 'border-slate-300', badgeColor: 'bg-slate-100 text-slate-700' },
    { id: 'in_progress', title: 'Đang Thực Hiện', color: 'border-indigo-400', badgeColor: 'bg-indigo-100 text-indigo-800' },
    { id: 'review', title: 'Chờ Thẩm Định / Review', color: 'border-amber-400', badgeColor: 'bg-amber-100 text-amber-800' },
    { id: 'done', title: 'Đã Hoàn Thành (Done)', color: 'border-emerald-400', badgeColor: 'bg-emerald-100 text-emerald-800' }
  ];

  const priorityBadge: Record<Priority, { label: string; color: string }> = {
    low: { label: 'Thấp', color: 'text-slate-500' },
    medium: { label: 'TB', color: 'text-blue-600' },
    high: { label: 'Cao', color: 'text-amber-700 font-semibold' },
    urgent: { label: 'Khẩn Cấp', color: 'text-rose-700 font-bold' }
  };

  const getStatusFlow = (status: TaskStatus) => {
    switch (status) {
      case 'todo': return { prev: null, next: 'in_progress' as TaskStatus };
      case 'in_progress': return { prev: 'todo' as TaskStatus, next: 'review' as TaskStatus };
      case 'review': return { prev: 'in_progress' as TaskStatus, next: 'done' as TaskStatus };
      case 'done': return { prev: 'review' as TaskStatus, next: null };
    }
  };

  const sortHeader = (key: SortKey, label: string, className = '') => (
    <th
      scope="col"
      aria-sort={sort.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={`py-3 px-3 ${className}`}
    >
      <button
        onClick={() => toggleSort(key)}
        className={`inline-flex items-center gap-1 uppercase tracking-wider hover:text-slate-900 whitespace-nowrap ${sort.key === key ? 'text-slate-900' : ''}`}
      >
        <span>{label}</span>
        {sort.key === key ? (
          sort.dir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
        ) : (
          <ArrowUpDown className="w-3 h-3 text-slate-300" />
        )}
      </button>
    </th>
  );

  const formSuggestion = suggestAssessment({
    status: formData.status,
    startDate: formData.startDate,
    dueDate: formData.dueDate,
    progressPercent: formData.progressPercent,
    actualEndDate: formData.actualEndDate || undefined
  });

  const inputCls = 'w-full px-3 py-2 text-xs border border-slate-300 rounded-lg';
  const labelCls = 'block text-xs font-semibold text-slate-700 mb-1';

  return (
    <div className="space-y-5">
      {/* Top Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Nhiệm Vụ & Bảng Kanban Dự Án</h1>
            <span className="text-xs font-mono font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded break-all min-w-0">
              [{activeProject.code}]
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Theo dõi người chủ trì, phối hợp, tiến độ, đánh giá và nỗ lực của từng nhiệm vụ
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* View Mode Toggle */}
          <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200" role="group" aria-label="Chế độ xem">
            <button
              onClick={() => setViewMode('kanban')}
              aria-pressed={viewMode === 'kanban'}
              title="Kanban"
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                viewMode === 'kanban' ? 'bg-white text-slate-900 shadow-xs font-semibold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Kanban className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Kanban</span>
            </button>
            <button
              onClick={() => setViewMode('gantt')}
              aria-pressed={viewMode === 'gantt'}
              title="Gantt"
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                viewMode === 'gantt' ? 'bg-white text-slate-900 shadow-xs font-semibold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <CalendarRange className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Gantt</span>
            </button>
            <button
              onClick={() => setViewMode('table')}
              aria-pressed={viewMode === 'table'}
              title="Bảng Chi Tiết"
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                viewMode === 'table' ? 'bg-white text-slate-900 shadow-xs font-semibold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <TableIcon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Bảng Chi Tiết</span>
            </button>
          </div>

          <button
            onClick={() => exportTasksToCSV(activeProject, projectTasks, users, projectUseCases)}
            className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors"
            title="Xuất danh sách công việc sang Excel/CSV"
            aria-label="Xuất danh sách công việc sang Excel/CSV"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
          </button>

          {canManageTasks && (
            <button
              onClick={openCreateModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>Thêm Nhiệm Vụ</span>
            </button>
          )}
        </div>
      </div>

      {/* Tóm tắt đánh giá tiến độ (bấm để lọc) */}
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Lọc theo đánh giá tiến độ">
        <span className="text-xs text-slate-500">Đánh giá:</span>
        {ASSESSMENT_OPTIONS.map(a => (
          <button
            key={a}
            onClick={() => setFilterAssessment(filterAssessment === a ? 'all' : a)}
            aria-pressed={filterAssessment === a}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold transition-shadow ${ASSESSMENT_STYLES[a]} ${
              filterAssessment === a ? 'ring-2 ring-indigo-400' : 'opacity-90 hover:opacity-100'
            }`}
          >
            <span>{ASSESSMENT_LABELS[a]}</span>
            <span className="font-mono tabular-nums">{assessmentCounts[a]}</span>
          </button>
        ))}
        {filterAssessment !== 'all' && (
          <button onClick={() => setFilterAssessment('all')} className="text-xs text-indigo-700 hover:underline">
            Bỏ lọc
          </button>
        )}
      </div>

      {/* Filters Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-white border border-slate-200 rounded-2xl">
        <div className="flex items-center gap-2 flex-1 min-w-[200px] max-w-sm">
          <Search className="w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Tìm theo nội dung, mã nhiệm vụ (VD: OB-101)..."
            aria-label="Tìm nhiệm vụ"
            className="w-full text-xs placeholder:text-slate-500 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="text-slate-500 hover:text-slate-600" aria-label="Xóa tìm kiếm">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="flex items-center gap-1.5 text-xs text-slate-600">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <span>Ưu tiên:</span>
            <select
              value={filterPriority}
              onChange={e => setFilterPriority(e.target.value)}
              className="text-xs bg-slate-50 border border-slate-200 rounded-md px-2 py-1"
            >
              <option value="all">Tất cả</option>
              <option value="urgent">Khẩn cấp</option>
              <option value="high">Cao</option>
              <option value="medium">Trung bình</option>
              <option value="low">Thấp</option>
            </select>
          </div>

          {viewMode !== 'kanban' && (
            <div className="flex items-center gap-1.5 text-xs text-slate-600">
              <span>Trạng thái:</span>
              <select
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value)}
                className="text-xs bg-slate-50 border border-slate-200 rounded-md px-2 py-1"
              >
                <option value="all">Tất cả</option>
                <option value="todo">Cần làm</option>
                <option value="in_progress">Đang thực hiện</option>
                <option value="review">Chờ thẩm định</option>
                <option value="done">Hoàn thành</option>
              </select>
            </div>
          )}

          <div className="flex items-center gap-1.5 text-xs text-slate-600">
            <span>Bộ phận:</span>
            <select
              value={filterDepartment}
              onChange={e => setFilterDepartment(e.target.value)}
              className="text-xs bg-slate-50 border border-slate-200 rounded-md px-2 py-1"
            >
              <option value="all">Tất cả</option>
              {DEPARTMENTS.map(d => (
                <option key={d} value={d}>{DEPARTMENT_LABELS[d]}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-slate-600">
            <span>Người tham gia:</span>
            <select
              value={filterAssignee}
              onChange={e => setFilterAssignee(e.target.value)}
              className="text-xs bg-slate-50 border border-slate-200 rounded-md px-2 py-1"
            >
              <option value="all">Tất cả thành viên</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* KANBAN BOARD VIEW */}
      {viewMode === 'kanban' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
          {columns.map(col => {
            const tasksInCol = filteredTasks.filter(t => t.status === col.id);

            return (
              <div
                key={col.id}
                onDragOver={e => {
                  if (!canManageTasks || !draggingId) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  if (dragOverCol !== col.id) setDragOverCol(col.id);
                }}
                onDragLeave={e => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverCol(prev => (prev === col.id ? null : prev));
                }}
                onDrop={e => {
                  e.preventDefault();
                  if (!canManageTasks) return;
                  const id = e.dataTransfer.getData('text/plain') || draggingId;
                  const dragged = projectTasks.find(t => t.id === id);
                  if (dragged && dragged.status !== col.id) moveTaskStatus(dragged.id, col.id);
                  setDraggingId(null);
                  setDragOverCol(null);
                }}
                className={`border rounded-2xl p-3.5 flex flex-col min-h-[500px] transition-colors ${
                  dragOverCol === col.id && draggingId
                    ? 'bg-indigo-50 border-indigo-400 ring-2 ring-indigo-300'
                    : 'bg-slate-100/70 border-slate-200/80'
                }`}
              >
                {/* Column Header */}
                <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-200">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-800">{col.title}</span>
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold ${col.badgeColor}`}>
                      {tasksInCol.length}
                    </span>
                  </div>
                </div>

                {/* Task Cards Column */}
                <div className="space-y-3 flex-1 overflow-y-auto">
                  {tasksInCol.length === 0 ? (
                    <div className="h-32 flex items-center justify-center border-2 border-dashed border-slate-200 rounded-lg text-[11px] text-slate-500">
                      Chưa có nhiệm vụ
                    </div>
                  ) : (
                    tasksInCol.map(task => {
                      const due = new Date(task.dueDate);
                      due.setHours(0, 0, 0, 0);
                      const isPastDue = task.status !== 'done' && due < today;
                      const isDueSoon = task.status !== 'done' && !isPastDue && Math.ceil((due.getTime() - today.getTime()) / 86400000) <= 2;
                      const flow = getStatusFlow(task.status);
                      const priority = priorityBadge[task.priority];

                      return (
                        <div
                          key={task.id}
                          draggable={canManageTasks}
                          onDragStart={e => {
                            e.dataTransfer.setData('text/plain', task.id);
                            e.dataTransfer.effectAllowed = 'move';
                            setDraggingId(task.id);
                          }}
                          onDragEnd={() => {
                            setDraggingId(null);
                            setDragOverCol(null);
                          }}
                          className={`bg-white border border-slate-200 rounded-2xl p-3.5 shadow-xs hover:border-slate-300 transition-all flex flex-col justify-between ${
                            canManageTasks ? 'cursor-grab active:cursor-grabbing' : ''
                          } ${draggingId === task.id ? 'opacity-40' : ''}`}
                        >
                          <div>
                            {/* Card Top Metadata (NO PILLS per frontend design constitution) */}
                            <div className="flex items-center justify-between gap-2 text-xs text-slate-500 mb-2">
                              <div className="flex items-center gap-1.5 font-mono min-w-0">
                                <span className="font-bold text-indigo-600 truncate">[{task.code}]</span>
                                <span aria-hidden="true">·</span>
                                <span className={`shrink-0 ${priority.color}`}>{priority.label}</span>
                              </div>

                              {isPastDue && (
                                <span className="text-[10px] font-bold text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200 flex items-center gap-1 shrink-0">
                                  <AlertTriangle className="w-3 h-3" />
                                  <span>Quá hạn</span>
                                </span>
                              )}
                              {isDueSoon && (
                                <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 flex items-center gap-1 shrink-0">
                                  <Clock className="w-3 h-3" />
                                  <span>Hạn &lt; 48h</span>
                                </span>
                              )}
                            </div>

                            <h4 className="text-xs font-semibold text-slate-900 leading-snug mb-1">
                              <button
                                onClick={() => setDetailId(task.id)}
                                className="text-left hover:text-indigo-700 hover:underline"
                                title="Xem chi tiết nhiệm vụ"
                              >
                                {task.title}
                              </button>
                            </h4>

                            {task.description && (
                              <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed mb-2">
                                {task.description}
                              </p>
                            )}

                            {/* Tiến độ + đánh giá */}
                            <div className="space-y-1.5 mb-2.5">
                              <TaskProgress task={task} />
                              <AssessmentBadge task={task} compact />
                            </div>

                            {/* Bộ phận & Use Case */}
                            <div className="text-[11px] text-slate-500 space-y-0.5 mb-3">
                              {task.department && (
                                <div>
                                  Bộ phận: <span className="text-slate-700 font-semibold">{DEPARTMENT_LABELS[task.department]}</span>
                                </div>
                              )}
                              {task.useCaseIds.length > 0 && (
                                <div
                                  className="text-indigo-600 font-mono text-[10px] truncate"
                                  title={task.useCaseIds.map(id => useCaseCodeMap.get(id) ?? id).join(', ')}
                                >
                                  Use Case: {useCaseCodeMap.get(task.useCaseIds[0]) ?? task.useCaseIds[0]}
                                  {task.useCaseIds.length > 1 && ` +${task.useCaseIds.length - 1}`}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Card Footer: Người chủ trì, nỗ lực, Deadline, Action */}
                          <div className="pt-2.5 border-t border-slate-100">
                            <div className="flex items-center justify-between gap-2 text-[11px] mb-2">
                              <OwnerAvatars task={task} userMap={userMap} />
                              <div className="font-mono text-[10px] tabular-nums text-slate-500 shrink-0" title="Nỗ lực thực tế / dự kiến (ngày công)">
                                {task.actualEffort}/{task.estimatedEffort} ngày
                              </div>
                            </div>

                            <div className="flex items-center justify-between text-[11px]">
                              <span className={`font-mono text-[10px] ${isPastDue ? 'text-rose-700 font-bold' : 'text-slate-500'}`}>
                                {task.status === 'done' && task.actualEndDate
                                  ? `Xong: ${task.actualEndDate}`
                                  : `Hạn: ${task.dueDate}`}
                              </span>

                              {/* Automated Deadline Reminder Action */}
                              {isPastDue && canManageProject && (
                                <button
                                  onClick={() => sendDeadlineReminder(task.id)}
                                  className="text-[10px] font-medium text-rose-700 hover:text-rose-900 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200 flex items-center gap-1 transition-colors"
                                  title="Gửi nhắc nhở deadline tức thì"
                                >
                                  <Send className="w-2.5 h-2.5" />
                                  <span>Nhắc việc</span>
                                </button>
                              )}
                            </div>

                            {/* Status transitions & Edit */}
                            {canManageTasks && (
                              <div className="flex items-center justify-between pt-2 mt-2 border-t border-slate-100">
                                <div className="flex items-center gap-1">
                                  {flow.prev && (
                                    <button
                                      onClick={() => moveTaskStatus(task.id, flow.prev!)}
                                      className="p-1 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded"
                                      title="Lùi về bước trước"
                                      aria-label="Lùi về bước trước"
                                    >
                                      <ChevronLeft className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                  {flow.next && (
                                    <button
                                      onClick={() => moveTaskStatus(task.id, flow.next!)}
                                      className="p-1 text-indigo-600 hover:text-indigo-900 hover:bg-indigo-50 rounded font-medium flex items-center text-[10px]"
                                      title="Chuyển sang trạng thái tiếp theo"
                                    >
                                      <span>Tiếp</span>
                                      <ChevronRight className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>

                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => openEditModal(task)}
                                    className="p-1 text-slate-500 hover:text-slate-700 rounded"
                                    title="Sửa công việc"
                                    aria-label="Sửa công việc"
                                  >
                                    <Edit3 className="w-3 h-3" />
                                  </button>
                                  <button
                                    onClick={() => {
                                      if (window.confirm(`Xóa nhiệm vụ ${task.code}?`)) deleteTask(task.id);
                                    }}
                                    className="p-1 text-slate-500 hover:text-rose-700 rounded"
                                    title="Xóa"
                                    aria-label="Xóa"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* GANTT TIMELINE VIEW */}
      {viewMode === 'gantt' && (
        <GanttTimeline tasks={filteredTasks} userMap={userMap} onTaskClick={task => setDetailId(task.id)} />
      )}

      {/* TABLE DATA GRID VIEW (High density, per Section 2 of SaaS Guidelines) */}
      {viewMode === 'table' && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-semibold text-[11px]">
                  {sortHeader('code', 'Mã', 'w-24')}
                  {sortHeader('title', 'Nội Dung')}
                  {sortHeader('status', 'Trạng Thái', 'w-32')}
                  <th scope="col" className="py-3 px-3 w-20 uppercase tracking-wider">Bộ Phận</th>
                  {sortHeader('assignee', 'Chủ Trì / Phối Hợp', 'w-44')}
                  {sortHeader('progress', 'Tiến Độ', 'w-32')}
                  <th scope="col" className="py-3 px-3 w-32 uppercase tracking-wider">Đánh Giá</th>
                  {sortHeader('effort', 'Nỗ Lực (ngày)', 'w-28 text-right')}
                  {sortHeader('due', 'Deadline', 'w-32')}
                  <th scope="col" className="py-3 px-3 w-24 text-right uppercase tracking-wider">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-sans">
                {sortedTasks.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-8 text-center text-slate-500">
                      Không tìm thấy nhiệm vụ nào phù hợp
                    </td>
                  </tr>
                ) : (
                  sortedTasks.map(task => {
                    const due = new Date(task.dueDate);
                    due.setHours(0, 0, 0, 0);
                    const isPastDue = task.status !== 'done' && due < today;

                    return (
                      <tr key={task.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-2.5 px-3 font-mono font-bold text-indigo-600">
                          {task.code}
                        </td>
                        <td className="py-2.5 px-3">
                          <button
                            onClick={() => setDetailId(task.id)}
                            className="text-left font-semibold text-slate-900 hover:text-indigo-700 hover:underline"
                          >
                            {task.title}
                          </button>
                          <div className="text-[11px] text-slate-500 line-clamp-1">
                            {priorityBadge[task.priority].label} · {task.phase}
                          </div>
                        </td>
                        <td className="py-2.5 px-3">
                          <select
                            disabled={!canManageTasks}
                            value={task.status}
                            onChange={e => moveTaskStatus(task.id, e.target.value as TaskStatus)}
                            aria-label={`Trạng thái của ${task.code}`}
                            className="text-xs bg-slate-50 border border-slate-200 rounded px-2 py-1 font-medium"
                          >
                            <option value="todo">Cần Làm</option>
                            <option value="in_progress">Đang Làm</option>
                            <option value="review">Chờ Thẩm Định</option>
                            <option value="done">Hoàn Thành</option>
                          </select>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-700">
                          {task.department ? DEPARTMENT_LABELS[task.department] : '—'}
                        </td>
                        <td className="py-2.5 px-3">
                          <OwnerAvatars task={task} userMap={userMap} nameClass="max-w-[110px]" />
                        </td>
                        <td className="py-2.5 px-3">
                          <TaskProgress task={task} />
                        </td>
                        <td className="py-2.5 px-3">
                          <AssessmentBadge task={task} compact />
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700">
                          {task.actualEffort}/{task.estimatedEffort}
                        </td>
                        <td className="py-2.5 px-3 font-mono">
                          <span className={isPastDue ? 'text-rose-700 font-bold' : 'text-slate-600'}>
                            {task.dueDate} {isPastDue && '(Quá Hạn)'}
                          </span>
                          {task.status === 'done' && task.actualEndDate && (
                            <div className="text-[10px] text-emerald-700">Xong: {task.actualEndDate}</div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {isPastDue && canManageProject && (
                              <button
                                onClick={() => sendDeadlineReminder(task.id)}
                                className="p-1 text-rose-700 hover:bg-rose-50 rounded"
                                title="Gửi nhắc nhở deadline"
                                aria-label="Gửi nhắc nhở deadline"
                              >
                                <Send className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {canManageTasks && (
                              <>
                                <button
                                  onClick={() => openEditModal(task)}
                                  className="p-1 text-slate-500 hover:text-slate-800 rounded"
                                  title="Chỉnh sửa"
                                  aria-label="Chỉnh sửa"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => {
                                    if (window.confirm(`Xóa nhiệm vụ ${task.code}?`)) deleteTask(task.id);
                                  }}
                                  className="p-1 text-slate-500 hover:text-rose-700 rounded"
                                  title="Xóa"
                                  aria-label="Xóa"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Chi tiết nhiệm vụ (chỉ đọc) */}
      {detailTask && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 dark:bg-black/60 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Chi tiết nhiệm vụ ${detailTask.code}`}
        >
          <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100 mb-4">
              <div className="min-w-0">
                <div className="font-mono text-xs font-bold text-indigo-600 break-all">[{detailTask.code}]</div>
                <h3 className="text-base font-bold text-slate-900 leading-snug">{detailTask.title}</h3>
              </div>
              <button
                onClick={() => setDetailId(null)}
                className="p-1 text-slate-500 hover:text-slate-600 shrink-0"
                aria-label="Đóng"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-xs">
              <div>
                <dt className="text-slate-500">Người chủ trì</dt>
                <dd className="mt-0.5 font-semibold text-slate-900">
                  {userMap.get(detailTask.assigneeId)?.name || 'Chưa phân công'}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Người phối hợp</dt>
                <dd className="mt-0.5 text-slate-900">
                  {detailTask.collaboratorIds.length > 0
                    ? detailTask.collaboratorIds.map(id => userMap.get(id)?.name || '?').join(', ')
                    : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Bộ phận thực hiện</dt>
                <dd className="mt-0.5 font-semibold text-slate-900">
                  {detailTask.department ? DEPARTMENT_LABELS[detailTask.department] : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Trạng thái · Ưu tiên</dt>
                <dd className="mt-0.5 text-slate-900">
                  {STATUS_LABEL[detailTask.status]} · {PRIORITY_LABEL[detailTask.priority]}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Ngày bắt đầu dự kiến</dt>
                <dd className="mt-0.5 font-mono text-slate-900">{detailTask.startDate}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Ngày kết thúc (Deadline)</dt>
                <dd className="mt-0.5 font-mono text-slate-900">{detailTask.dueDate}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Ngày hoàn thành thực tế</dt>
                <dd className="mt-0.5 font-mono text-slate-900">{detailTask.actualEndDate || '—'}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-slate-500">Liên kết Use Case ({detailTask.useCaseIds.length})</dt>
                <dd className="mt-1">
                  {detailTask.useCaseIds.length === 0 ? (
                    <span className="text-slate-900">—</span>
                  ) : (
                    <ul className="max-h-40 overflow-y-auto space-y-0.5 text-slate-900">
                      {detailTask.useCaseIds.map(id => {
                        const uc = projectUseCases.find(u => u.id === id);
                        return (
                          <li key={id} className="text-xs">
                            <span className="font-mono font-bold text-indigo-600">[{uc?.code ?? id}]</span> {uc?.title ?? ''}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Tiến độ</dt>
                <dd className="mt-1">
                  <TaskProgress task={detailTask} />
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Đánh giá</dt>
                <dd className="mt-0.5">
                  <AssessmentBadge task={detailTask} />
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Nỗ lực dự kiến</dt>
                <dd className="mt-0.5 font-mono text-slate-900">{detailTask.estimatedEffort} ngày công</dd>
              </div>
              <div>
                <dt className="text-slate-500">Nỗ lực thực tế</dt>
                <dd className="mt-0.5 font-mono text-slate-900">{detailTask.actualEffort} ngày công</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-slate-500">Mô tả</dt>
                <dd className="mt-0.5 text-slate-900 whitespace-pre-wrap">{detailTask.description || '—'}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-slate-500">Mô tả yêu cầu đầu ra</dt>
                <dd className="mt-0.5 text-slate-900 whitespace-pre-wrap">{detailTask.deliverable || '—'}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-slate-500">Ghi chú</dt>
                <dd className="mt-0.5 text-slate-900 whitespace-pre-wrap">{detailTask.notes || '—'}</dd>
              </div>
            </dl>

            <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-end gap-2">
              {canManageTasks && (
                <button
                  onClick={() => openEditModal(detailTask)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Chỉnh sửa</span>
                </button>
              )}
              <button
                onClick={() => setDetailId(null)}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 rounded-lg"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create / Edit Task Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 dark:bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-base font-bold text-slate-900">
                {editingTask ? 'Chỉnh Sửa Nhiệm Vụ' : 'Thêm Nhiệm Vụ Mới'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="p-1 text-slate-500 hover:text-slate-600" aria-label="Đóng">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className={labelCls}>Mã Nhiệm Vụ</label>
                  <input
                    type="text"
                    required
                    value={formData.code}
                    onChange={e => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                    className={`${inputCls} font-mono`}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelCls}>Nội Dung</label>
                  <input
                    type="text"
                    required
                    value={formData.title}
                    onChange={e => setFormData({ ...formData, title: e.target.value })}
                    placeholder="VD: Viết kịch bản kiểm thử API NAPAS..."
                    className={inputCls}
                  />
                </div>
              </div>

              <div>
                <label className={labelCls}>Mô Tả</label>
                <textarea
                  rows={2}
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Mô tả chi tiết công việc cần thực hiện..."
                  className={inputCls}
                />
              </div>

              <div>
                <label className={labelCls}>Mô Tả Yêu Cầu Đầu Ra</label>
                <textarea
                  rows={2}
                  value={formData.deliverable}
                  onChange={e => setFormData({ ...formData, deliverable: e.target.value })}
                  placeholder="Sản phẩm/kết quả cần bàn giao và tiêu chuẩn nghiệm thu..."
                  className={inputCls}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Người Chủ Trì (chọn 1 người)</label>
                  <select
                    value={formData.assigneeId}
                    onChange={e =>
                      setFormData({
                        ...formData,
                        assigneeId: e.target.value,
                        collaboratorIds: formData.collaboratorIds.filter(id => id !== e.target.value)
                      })
                    }
                    className={`${inputCls} bg-white`}
                  >
                    <option value="">-- Chưa phân công --</option>
                    {users.map(u => (
                      <option key={u.id} value={u.id}>{u.name} ({ROLE_SHORT[u.role]})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Bộ Phận Thực Hiện</label>
                  <select
                    value={formData.department}
                    onChange={e => setFormData({ ...formData, department: e.target.value as Department | '' })}
                    className={`${inputCls} bg-white`}
                  >
                    <option value="">-- Chưa chọn --</option>
                    {DEPARTMENTS.map(d => (
                      <option key={d} value={d}>{DEPARTMENT_LABELS[d]}</option>
                    ))}
                  </select>
                </div>
              </div>

              <fieldset>
                <legend className={labelCls}>
                  Người Phối Hợp (chọn nhiều) <span className="font-normal text-slate-500">· đã chọn {formData.collaboratorIds.filter(id => id !== formData.assigneeId).length}</span>
                </legend>
                <div className="max-h-32 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-1.5 p-2 border border-slate-200 rounded-lg bg-slate-50/60">
                  {users.filter(u => u.id !== formData.assigneeId).length === 0 && (
                    <span className="text-xs text-slate-500 col-span-full">Chưa có thành viên nào khác trong dự án</span>
                  )}
                  {users
                    .filter(u => u.id !== formData.assigneeId)
                    .map(u => (
                      <label key={u.id} className="flex items-center gap-2 text-xs text-slate-800 cursor-pointer min-w-0">
                        <input
                          type="checkbox"
                          checked={formData.collaboratorIds.includes(u.id)}
                          onChange={() => toggleCollaborator(u.id)}
                          className="rounded border-slate-300 text-indigo-600"
                        />
                        <span
                          className={`w-5 h-5 rounded-full text-white text-[9px] font-bold flex items-center justify-center shrink-0 ${u.avatarColor}`}
                          aria-hidden="true"
                        >
                          {u.name.charAt(0)}
                        </span>
                        <span className="truncate">{u.name}</span>
                      </label>
                    ))}
                </div>
              </fieldset>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className={labelCls}>Ngày Bắt Đầu Dự Kiến</label>
                  <input
                    type="date"
                    required
                    value={formData.startDate}
                    onChange={e => setFormData({ ...formData, startDate: e.target.value })}
                    className={`${inputCls} font-mono`}
                  />
                </div>
                <div>
                  <label className={labelCls}>Ngày Kết Thúc (Deadline)</label>
                  <input
                    type="date"
                    required
                    min={formData.startDate}
                    value={formData.dueDate}
                    onChange={e => setFormData({ ...formData, dueDate: e.target.value })}
                    className={`${inputCls} font-mono`}
                  />
                </div>
                <div>
                  <label className={labelCls}>Ngày Hoàn Thành Thực Tế</label>
                  <input
                    type="date"
                    disabled={formData.status !== 'done'}
                    value={formData.actualEndDate}
                    onChange={e => setFormData({ ...formData, actualEndDate: e.target.value })}
                    className={`${inputCls} font-mono disabled:bg-slate-100 disabled:text-slate-500`}
                  />
                  {formData.status !== 'done' && (
                    <p className="text-[11px] text-slate-500 mt-1">Tự ghi khi chuyển sang Hoàn thành</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Trạng Thái</label>
                  <select
                    value={formData.status}
                    onChange={e => changeStatus(e.target.value as TaskStatus)}
                    className={`${inputCls} bg-white`}
                  >
                    <option value="todo">Cần Làm (To Do)</option>
                    <option value="in_progress">Đang Thực Hiện (In Progress)</option>
                    <option value="review">Chờ Thẩm Định (In Review)</option>
                    <option value="done">Hoàn Thành (Done)</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls} htmlFor="task-progress">
                    Tiến Độ (%): <span className="font-mono">{formData.progressPercent}%</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      id="task-progress"
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={formData.progressPercent}
                      onChange={e => changeProgress(Number(e.target.value))}
                      className="flex-1 accent-indigo-600"
                    />
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={formData.progressPercent}
                      onChange={e => changeProgress(Number(e.target.value))}
                      aria-label="Tiến độ phần trăm"
                      className="w-16 px-2 py-1.5 text-xs border border-slate-300 rounded-lg font-mono"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Đánh Giá Tiến Độ</label>
                  <select
                    value={formData.assessment}
                    onChange={e => setFormData({ ...formData, assessment: e.target.value as TaskAssessment | '' })}
                    className={`${inputCls} bg-white`}
                  >
                    <option value="">Tự động (gợi ý: {ASSESSMENT_LABELS[formSuggestion]})</option>
                    {ASSESSMENT_OPTIONS.map(a => (
                      <option key={a} value={a}>{ASSESSMENT_LABELS[a]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Mức Độ Ưu Tiên</label>
                  <select
                    value={formData.priority}
                    onChange={e => setFormData({ ...formData, priority: e.target.value as Priority })}
                    className={`${inputCls} bg-white`}
                  >
                    <option value="low">Thấp</option>
                    <option value="medium">Trung bình</option>
                    <option value="high">Cao</option>
                    <option value="urgent">Khẩn cấp</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className={labelCls}>Nỗ Lực Dự Kiến (ngày công)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={formData.estimatedEffort}
                    onChange={e => setFormData({ ...formData, estimatedEffort: Math.max(0, Number(e.target.value)) })}
                    className={`${inputCls} font-mono`}
                  />
                </div>
                <div>
                  <label className={labelCls}>Nỗ Lực Thực Tế (ngày công)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={formData.actualEffort}
                    onChange={e => setFormData({ ...formData, actualEffort: Math.max(0, Number(e.target.value)) })}
                    className={`${inputCls} font-mono`}
                  />
                </div>
                <div>
                  <label className={labelCls}>Liên Kết Use Case</label>
                  <UseCaseLinks
                    value={formData.useCaseIds}
                    onChange={ids => setFormData({ ...formData, useCaseIds: ids })}
                    useCases={projectUseCases}
                  />
                </div>
              </div>

              <div>
                <label className={labelCls}>Ghi Chú</label>
                <textarea
                  rows={2}
                  value={formData.notes}
                  onChange={e => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Vướng mắc, phụ thuộc, lưu ý khi thực hiện..."
                  className={inputCls}
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 rounded-lg"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs"
                >
                  {editingTask ? 'Lưu Thay Đổi' : 'Thêm Nhiệm Vụ'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
