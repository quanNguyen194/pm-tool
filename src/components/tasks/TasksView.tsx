import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Task, TaskStatus, Priority } from '../../types';
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
  CheckCircle2,
  Trash2,
  Edit3,
  ChevronRight,
  ChevronLeft,
  X,
  FileSpreadsheet
} from 'lucide-react';
import { exportTasksToCSV } from '../../utils/exportUtils';
import { GanttTimeline } from './GanttTimeline';

type SortKey = 'code' | 'title' | 'status' | 'priority' | 'assignee' | 'hours' | 'due';
const STATUS_ORDER: Record<TaskStatus, number> = { todo: 0, in_progress: 1, review: 2, done: 3 };
const PRIORITY_ORDER: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

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
    currentUser,
    projectUseCases
  } = useApp();

  const [viewMode, setViewMode] = useState<'kanban' | 'gantt' | 'table'>('kanban');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [filterAssignee, setFilterAssignee] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'due', dir: 'asc' });
  // Kéo thả Kanban
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<TaskStatus | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  const userMap = new Map(users.map(u => [u.id, u]));
  const useCaseCodeMap = new Map(projectUseCases.map(u => [u.id, u.code]));

  // Form State
  const [formData, setFormData] = useState({
    code: '',
    title: '',
    description: '',
    status: 'todo' as TaskStatus,
    priority: 'medium' as Priority,
    assigneeId: currentUser.id,
    phase: 'Giai đoạn 3: Phát triển Sprint',
    estimatedHours: 16,
    actualHours: 0,
    startDate: new Date().toISOString().split('T')[0],
    dueDate: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
    tags: 'Frontend, API',
    useCaseId: ''
  });

  const openCreateModal = () => {
    setEditingTask(null);
    setFormData({
      code: `${activeProject.code.slice(0, 3)}-${Math.floor(100 + Math.random() * 900)}`,
      title: '',
      description: '',
      status: 'todo',
      priority: 'high',
      assigneeId: currentUser.id,
      phase: 'Giai đoạn 3: Phát triển Sprint',
      estimatedHours: 20,
      actualHours: 0,
      startDate: new Date().toISOString().split('T')[0],
      dueDate: new Date(Date.now() + 5 * 86400000).toISOString().split('T')[0],
      tags: 'Feature, Sprint',
      useCaseId: projectUseCases[0]?.id || ''
    });
    setIsModalOpen(true);
  };

  const openEditModal = (task: Task) => {
    setEditingTask(task);
    setFormData({
      code: task.code,
      title: task.title,
      description: task.description || '',
      status: task.status,
      priority: task.priority,
      assigneeId: task.assigneeId,
      phase: task.phase,
      estimatedHours: task.estimatedHours,
      actualHours: task.actualHours,
      startDate: task.startDate,
      dueDate: task.dueDate,
      tags: task.tags?.join(', ') || '',
      useCaseId: task.useCaseId || ''
    });
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim() || !formData.code.trim()) return;

    const tagsArray = formData.tags
      .split(',')
      .map(t => t.trim())
      .filter(Boolean);

    if (editingTask) {
      updateTask({
        ...editingTask,
        ...formData,
        tags: tagsArray,
        useCaseId: formData.useCaseId || undefined
      });
    } else {
      createTask({
        projectId: activeProject.id,
        ...formData,
        tags: tagsArray,
        useCaseId: formData.useCaseId || undefined
      });
    }
    setIsModalOpen(false);
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Filtering
  const filteredTasks = projectTasks.filter(task => {
    const matchesSearch =
      task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      task.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (task.description && task.description.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesPriority = filterPriority === 'all' || task.priority === filterPriority;
    const matchesAssignee = filterAssignee === 'all' || task.assigneeId === filterAssignee;
    // Kanban đã chia cột theo trạng thái nên bộ lọc trạng thái chỉ áp dụng cho Gantt và Bảng.
    const matchesStatus = viewMode === 'kanban' || filterStatus === 'all' || task.status === filterStatus;

    return matchesSearch && matchesPriority && matchesAssignee && matchesStatus;
  });

  const sortedTasks = [...filteredTasks].sort((a, b) => {
    let r = 0;
    switch (sort.key) {
      case 'code': r = a.code.localeCompare(b.code, 'vi', { numeric: true }); break;
      case 'title': r = a.title.localeCompare(b.title, 'vi'); break;
      case 'status': r = STATUS_ORDER[a.status] - STATUS_ORDER[b.status]; break;
      case 'priority': r = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]; break;
      case 'assignee': r = (userMap.get(a.assigneeId)?.name || '~').localeCompare(userMap.get(b.assigneeId)?.name || '~', 'vi'); break;
      case 'hours': r = a.estimatedHours - b.estimatedHours; break;
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
    high: { label: 'Cao', color: 'text-amber-600 font-semibold' },
    urgent: { label: 'Khẩn Cấp', color: 'text-rose-600 font-bold' }
  };

  const getStatusFlow = (status: TaskStatus) => {
    switch (status) {
      case 'todo': return { prev: null, next: 'in_progress' as TaskStatus };
      case 'in_progress': return { prev: 'todo' as TaskStatus, next: 'review' as TaskStatus };
      case 'review': return { prev: 'in_progress' as TaskStatus, next: 'done' as TaskStatus };
      case 'done': return { prev: 'review' as TaskStatus, next: null };
    }
  };

  return (
    <div className="space-y-5">
      {/* Top Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Nhiệm Vụ & Bảng Kanban Dự Án</h1>
            <span className="text-xs font-mono font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
              [{activeProject.code}]
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Theo dõi phân công, hạn chót, tiến độ từng giai đoạn và nhắc nhở công việc tự động
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
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
          </button>

          {canManageTasks && (
            <button
              onClick={openCreateModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>+ Thêm Nhiệm Vụ</span>
            </button>
          )}
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-white border border-slate-200 rounded-xl">
        <div className="flex items-center gap-2 flex-1 min-w-[200px] max-w-sm">
          <Search className="w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Tìm theo tiêu đề, mã nhiệm vụ (VD: OB-101)..."
            className="w-full text-xs placeholder:text-slate-400 focus:outline-hidden"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="text-slate-400 hover:text-slate-600">
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
            <span>Phụ trách:</span>
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
                className={`border rounded-xl p-3.5 flex flex-col min-h-[500px] transition-colors ${
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
                    <div className="h-32 flex items-center justify-center border-2 border-dashed border-slate-200 rounded-lg text-[11px] text-slate-400">
                      Chưa có nhiệm vụ
                    </div>
                  ) : (
                    tasksInCol.map(task => {
                      const assignee = userMap.get(task.assigneeId);
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
                          className={`bg-white border border-slate-200 rounded-xl p-3.5 shadow-xs hover:border-slate-300 transition-all flex flex-col justify-between ${
                            canManageTasks ? 'cursor-grab active:cursor-grabbing' : ''
                          } ${draggingId === task.id ? 'opacity-40' : ''}`}
                        >
                          <div>
                            {/* Card Top Metadata (NO PILLS per frontend design constitution) */}
                            <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                              <div className="flex items-center gap-1.5 font-mono">
                                <span className="font-bold text-indigo-600">[{task.code}]</span>
                                <span aria-hidden="true">·</span>
                                <span className={priority.color}>{priority.label}</span>
                              </div>

                              {isPastDue && (
                                <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200 flex items-center gap-1">
                                  <AlertTriangle className="w-3 h-3" />
                                  <span>Quá hạn</span>
                                </span>
                              )}
                              {isDueSoon && (
                                <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  <span>Hạn &lt; 48h</span>
                                </span>
                              )}
                            </div>

                            <h4 className="text-xs font-semibold text-slate-900 leading-snug mb-1">
                              {task.title}
                            </h4>

                            {task.description && (
                              <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed mb-3">
                                {task.description}
                              </p>
                            )}

                            {/* Phase & Use Case Reference */}
                            <div className="text-[11px] text-slate-400 space-y-0.5 mb-3">
                              <div className="truncate">Giai đoạn: <span className="text-slate-600">{task.phase}</span></div>
                              {task.useCaseId && (
                                <div className="text-indigo-600 font-mono text-[10px]">
                                  Gắn với UseCase: {useCaseCodeMap.get(task.useCaseId) ?? task.useCaseId}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Card Footer: Assignee, Hours, Deadline, Action */}
                          <div className="pt-2.5 border-t border-slate-100">
                            <div className="flex items-center justify-between text-[11px] mb-2">
                              <div className="flex items-center gap-1.5">
                                <div
                                  className={`w-5 h-5 rounded-full text-white text-[9px] font-bold flex items-center justify-center ${assignee?.avatarColor || 'bg-slate-400'}`}
                                  title={assignee?.name}
                                >
                                  {assignee?.name.charAt(0) || '?'}
                                </div>
                                <span className="text-slate-700 truncate max-w-[100px]">{assignee?.name}</span>
                              </div>

                              <div className="font-mono text-[10px] tabular-nums text-slate-500">
                                {task.actualHours}/{task.estimatedHours}h
                              </div>
                            </div>

                            <div className="flex items-center justify-between text-[11px]">
                              <span className={`font-mono text-[10px] ${isPastDue ? 'text-rose-600 font-bold' : 'text-slate-500'}`}>
                                Hạn: {task.dueDate}
                              </span>

                              {/* Automated Deadline Reminder Action */}
                              {isPastDue && (
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
                                    className="p-1 text-slate-400 hover:text-slate-700 rounded"
                                    title="Sửa công việc"
                                  >
                                    <Edit3 className="w-3 h-3" />
                                  </button>
                                  <button
                                    onClick={() => {
                                      if (window.confirm(`Xóa nhiệm vụ ${task.code}?`)) deleteTask(task.id);
                                    }}
                                    className="p-1 text-slate-400 hover:text-rose-600 rounded"
                                    title="Xóa"
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
        <GanttTimeline tasks={filteredTasks} userMap={userMap} onTaskClick={canManageTasks ? openEditModal : undefined} />
      )}

      {/* TABLE DATA GRID VIEW (High density, per Section 2 of SaaS Guidelines) */}
      {viewMode === 'table' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-semibold text-[11px]">
                  <th
                    scope="col"
                    aria-sort={sort.key === 'code' ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                    className="py-3 px-4 w-24"
                  >
                    <button
                      onClick={() => toggleSort('code')}
                      className={`inline-flex items-center gap-1 uppercase tracking-wider hover:text-slate-900 ${sort.key === 'code' ? 'text-slate-900' : ''}`}
                    >
                      <span>Mã</span>
                      {sort.key === 'code' ? (
                        sort.dir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-300" />
                      )}
                    </button>
                  </th>
                  <th
                    scope="col"
                    aria-sort={sort.key === 'title' ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                    className="py-3 px-4"
                  >
                    <button
                      onClick={() => toggleSort('title')}
                      className={`inline-flex items-center gap-1 uppercase tracking-wider hover:text-slate-900 ${sort.key === 'title' ? 'text-slate-900' : ''}`}
                    >
                      <span>Tiêu Đề Công Việc</span>
                      {sort.key === 'title' ? (
                        sort.dir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-300" />
                      )}
                    </button>
                  </th>
                  <th
                    scope="col"
                    aria-sort={sort.key === 'status' ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                    className="py-3 px-4 w-32"
                  >
                    <button
                      onClick={() => toggleSort('status')}
                      className={`inline-flex items-center gap-1 uppercase tracking-wider hover:text-slate-900 ${sort.key === 'status' ? 'text-slate-900' : ''}`}
                    >
                      <span>Trạng Thái</span>
                      {sort.key === 'status' ? (
                        sort.dir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-300" />
                      )}
                    </button>
                  </th>
                  <th
                    scope="col"
                    aria-sort={sort.key === 'priority' ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                    className="py-3 px-4 w-28"
                  >
                    <button
                      onClick={() => toggleSort('priority')}
                      className={`inline-flex items-center gap-1 uppercase tracking-wider hover:text-slate-900 ${sort.key === 'priority' ? 'text-slate-900' : ''}`}
                    >
                      <span>Mức Ưu Tiên</span>
                      {sort.key === 'priority' ? (
                        sort.dir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-300" />
                      )}
                    </button>
                  </th>
                  <th
                    scope="col"
                    aria-sort={sort.key === 'assignee' ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                    className="py-3 px-4 w-40"
                  >
                    <button
                      onClick={() => toggleSort('assignee')}
                      className={`inline-flex items-center gap-1 uppercase tracking-wider hover:text-slate-900 ${sort.key === 'assignee' ? 'text-slate-900' : ''}`}
                    >
                      <span>Người Phụ Trách</span>
                      {sort.key === 'assignee' ? (
                        sort.dir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-300" />
                      )}
                    </button>
                  </th>
                  <th
                    scope="col"
                    aria-sort={sort.key === 'hours' ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                    className="py-3 px-4 w-24 text-right"
                  >
                    <button
                      onClick={() => toggleSort('hours')}
                      className={`inline-flex items-center gap-1 uppercase tracking-wider hover:text-slate-900 ${sort.key === 'hours' ? 'text-slate-900' : ''}`}
                    >
                      <span>Giờ Dự Kiến</span>
                      {sort.key === 'hours' ? (
                        sort.dir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-300" />
                      )}
                    </button>
                  </th>
                  <th
                    scope="col"
                    aria-sort={sort.key === 'due' ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                    className="py-3 px-4 w-32"
                  >
                    <button
                      onClick={() => toggleSort('due')}
                      className={`inline-flex items-center gap-1 uppercase tracking-wider hover:text-slate-900 ${sort.key === 'due' ? 'text-slate-900' : ''}`}
                    >
                      <span>Hạn Chót</span>
                      {sort.key === 'due' ? (
                        sort.dir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-300" />
                      )}
                    </button>
                  </th>
                  <th scope="col" className="py-3 px-4 w-28 text-right uppercase tracking-wider">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-sans">
                {sortedTasks.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400">
                      Không tìm thấy nhiệm vụ nào phù hợp
                    </td>
                  </tr>
                ) : (
                  sortedTasks.map(task => {
                    const assignee = userMap.get(task.assigneeId);
                    const due = new Date(task.dueDate);
                    due.setHours(0, 0, 0, 0);
                    const isPastDue = task.status !== 'done' && due < today;

                    return (
                      <tr key={task.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-2.5 px-4 font-mono font-bold text-indigo-600">
                          {task.code}
                        </td>
                        <td className="py-2.5 px-4">
                          <div className="font-semibold text-slate-900">{task.title}</div>
                          <div className="text-[11px] text-slate-500 line-clamp-1">{task.phase}</div>
                        </td>
                        <td className="py-2.5 px-4">
                          <select
                            disabled={!canManageTasks}
                            value={task.status}
                            onChange={e => moveTaskStatus(task.id, e.target.value as TaskStatus)}
                            className="text-xs bg-slate-50 border border-slate-200 rounded px-2 py-1 font-medium"
                          >
                            <option value="todo">Cần Làm</option>
                            <option value="in_progress">Đang Làm</option>
                            <option value="review">Chờ Thẩm Định</option>
                            <option value="done">Hoàn Thành</option>
                          </select>
                        </td>
                        <td className="py-2.5 px-4">
                          <span className={priorityBadge[task.priority].color}>
                            {priorityBadge[task.priority].label}
                          </span>
                        </td>
                        <td className="py-2.5 px-4">
                          <div className="flex items-center gap-2">
                            <div className={`w-5 h-5 rounded-full text-white text-[9px] font-bold flex items-center justify-center ${assignee?.avatarColor || 'bg-slate-400'}`}>
                              {assignee?.name.charAt(0) || '?'}
                            </div>
                            <span className="text-slate-800">{assignee?.name}</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700">
                          {task.actualHours}/{task.estimatedHours}h
                        </td>
                        <td className="py-2.5 px-4 font-mono">
                          <span className={isPastDue ? 'text-rose-600 font-bold' : 'text-slate-600'}>
                            {task.dueDate} {isPastDue && '(Quá Hạn)'}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {isPastDue && (
                              <button
                                onClick={() => sendDeadlineReminder(task.id)}
                                className="p-1 text-rose-600 hover:bg-rose-50 rounded"
                                title="Gửi nhắc nhở deadline"
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
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => {
                                    if (window.confirm(`Xóa nhiệm vụ ${task.code}?`)) deleteTask(task.id);
                                  }}
                                  className="p-1 text-slate-400 hover:text-rose-600 rounded"
                                  title="Xóa"
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

      {/* Create / Edit Task Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 dark:bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-base font-bold text-slate-900">
                {editingTask ? 'Chỉnh Sửa Nhiệm Vụ' : 'Thêm Nhiệm Vụ Mới'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Mã Nhiệm Vụ</label>
                  <input
                    type="text"
                    required
                    value={formData.code}
                    onChange={e => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Tiêu Đề Công Việc</label>
                  <input
                    type="text"
                    required
                    value={formData.title}
                    onChange={e => setFormData({ ...formData, title: e.target.value })}
                    placeholder="VD: Viết kịch bản kiểm thử API NAPAS..."
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Mô Tả Yêu Cầu</label>
                <textarea
                  rows={2}
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Chi tiết các tiêu chuẩn bàn giao kỹ thuật..."
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Trạng Thái</label>
                  <select
                    value={formData.status}
                    onChange={e => setFormData({ ...formData, status: e.target.value as TaskStatus })}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="todo">Cần Làm (To Do)</option>
                    <option value="in_progress">Đang Thực Hiện (In Progress)</option>
                    <option value="review">Chờ Thẩm Định (In Review)</option>
                    <option value="done">Hoàn Thành (Done)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Mức Độ Ưu Tiên</label>
                  <select
                    value={formData.priority}
                    onChange={e => setFormData({ ...formData, priority: e.target.value as Priority })}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="low">Thấp</option>
                    <option value="medium">Trung bình</option>
                    <option value="high">Cao</option>
                    <option value="urgent">Khẩn cấp</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Người Phụ Trách</label>
                  <select
                    value={formData.assigneeId}
                    onChange={e => setFormData({ ...formData, assigneeId: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                  >
                    {users.map(u => (
                      <option key={u.id} value={u.id}>{u.name} ({u.role.toUpperCase()})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Liên Kết Use Case</label>
                  <select
                    value={formData.useCaseId}
                    onChange={e => setFormData({ ...formData, useCaseId: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="">-- Không liên kết --</option>
                    {projectUseCases.map(uc => (
                      <option key={uc.id} value={uc.id}>[{uc.code}] {uc.title}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Ngày Bắt Đầu</label>
                  <input
                    type="date"
                    value={formData.startDate}
                    onChange={e => setFormData({ ...formData, startDate: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Hạn Chót (Due Date)</label>
                  <input
                    type="date"
                    required
                    value={formData.dueDate}
                    onChange={e => setFormData({ ...formData, dueDate: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Giờ Dự Kiến (Estimated)</label>
                  <input
                    type="number"
                    min="1"
                    value={formData.estimatedHours}
                    onChange={e => setFormData({ ...formData, estimatedHours: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Giờ Thực Tế Đã Làm</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.actualHours}
                    onChange={e => setFormData({ ...formData, actualHours: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg font-mono"
                  />
                </div>
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
