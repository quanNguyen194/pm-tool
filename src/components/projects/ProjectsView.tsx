import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Project, ProjectStatus, Priority } from '../../types';
import {
  FolderPlus,
  Calendar,
  Layers,
  CheckCircle2,
  Trash2,
  Edit3,
  Users,
  DollarSign,
  AlertCircle,
  X
} from 'lucide-react';

export const ProjectsView: React.FC = () => {
  const {
    projects,
    activeProjectId,
    setActiveProjectId,
    createProject,
    updateProject,
    deleteProject,
    isAdmin,
    canManageProjectId,
    currentUser,
    allUsers
  } = useApp();

  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);

  // Form State
  const [formData, setFormData] = useState<{
    code: string;
    name: string;
    description: string;
    status: ProjectStatus;
    priority: Priority;
    managerId: string;
    startDate: string;
    targetEndDate: string;
    budget: number;
    currentPhase: Project['currentPhase'];
    memberIds: string[];
  }>({
    code: '',
    name: '',
    description: '',
    status: 'planning',
    priority: 'medium',
    managerId: currentUser.id,
    startDate: new Date().toISOString().split('T')[0],
    targetEndDate: new Date(Date.now() + 90 * 86400000).toISOString().split('T')[0],
    budget: 500000000,
    currentPhase: 'phase_1',
    memberIds: []
  });

  const userMap = new Map(allUsers.map(u => [u.id, u]));

  const openCreateModal = () => {
    setEditingProject(null);
    setFormData({
      code: `PRJ-${Math.floor(100 + Math.random() * 900)}`,
      name: '',
      description: '',
      status: 'planning',
      priority: 'high',
      managerId: currentUser.id,
      startDate: new Date().toISOString().split('T')[0],
      targetEndDate: new Date(Date.now() + 90 * 86400000).toISOString().split('T')[0],
      budget: 650000000,
      currentPhase: 'phase_1',
      memberIds: []
    });
    setIsModalOpen(true);
  };

  const openEditModal = (p: Project) => {
    setEditingProject(p);
    setFormData({
      code: p.code,
      name: p.name,
      description: p.description,
      status: p.status,
      priority: p.priority,
      managerId: p.managerId,
      startDate: p.startDate,
      targetEndDate: p.targetEndDate,
      budget: p.budget,
      currentPhase: p.currentPhase,
      memberIds: p.memberIds
    });
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.code.trim()) return;

    if (editingProject) {
      updateProject({
        ...editingProject,
        ...formData
      });
    } else {
      createProject({
        ...formData
      });
    }
    setIsModalOpen(false);
  };

  const filteredProjects = projects.filter(p => {
    if (filterStatus === 'all') return true;
    return p.status === filterStatus;
  });

  const phaseLabelMap: Record<string, string> = {
    phase_1: 'Giai đoạn 1: Khởi tạo & Lập kế hoạch',
    phase_2: 'Giai đoạn 2: Phân tích & Thiết kế kiến trúc',
    phase_3: 'Giai đoạn 3: Phát triển Sprint & Mã nguồn',
    phase_4: 'Giai đoạn 4: Kiểm thử QA/QC & An ninh',
    phase_5: 'Giai đoạn 5: UAT & Triển khai Release'
  };

  const statusLabelMap: Record<ProjectStatus, { label: string; color: string }> = {
    planning: { label: 'Lập Kế Hoạch', color: 'bg-slate-100 text-slate-700' },
    in_progress: { label: 'Đang Thực Hiện', color: 'bg-indigo-100 text-indigo-800' },
    review: { label: 'Đang Thẩm Định', color: 'bg-amber-100 text-amber-800' },
    completed: { label: 'Đã Hoàn Thành', color: 'bg-emerald-100 text-emerald-800' },
    on_hold: { label: 'Tạm Dừng', color: 'bg-rose-100 text-rose-800' }
  };

  const formatVND = (num: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(num);
  };

  return (
    <div className="space-y-6">
      {/* Top Header Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Danh Mục Quản Lý Các Dự Án</h1>
          <p className="text-xs text-slate-500 mt-1">
            Theo dõi, quản lý tiến độ và ngân sách các dự án độc lập trong tổ chức
          </p>
        </div>

        <div className="flex items-center gap-3">
          {isAdmin ? (
            <button
              onClick={openCreateModal}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-sm"
            >
              <FolderPlus className="w-4 h-4" />
              <span>+ Tạo Dự Án Mới</span>
            </button>
          ) : (
            <div className="text-xs text-slate-500 italic bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
              * Chỉ quản trị viên mới tạo được dự án
            </div>
          )}
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
        {[
          { id: 'all', label: 'Tất cả dự án' },
          { id: 'in_progress', label: 'Đang thực hiện' },
          { id: 'planning', label: 'Lập kế hoạch' },
          { id: 'completed', label: 'Đã hoàn thành' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setFilterStatus(tab.id)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              filterStatus === tab.id
                ? 'theme-fixed bg-slate-900 dark:bg-indigo-600 text-white font-semibold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Projects Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredProjects.map(project => {
          const isActive = project.id === activeProjectId;
          const manager = userMap.get(project.managerId);
          const statusInfo = statusLabelMap[project.status];

          return (
            <div
              key={project.id}
              className={`bg-white border rounded-2xl p-5 flex flex-col justify-between transition-all ${
                isActive
                  ? 'border-indigo-500 ring-2 ring-indigo-500/20 shadow-sm'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded break-all min-w-0">
                      [{project.code}]
                    </span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${statusInfo.color}`}>
                      {statusInfo.label}
                    </span>
                  </div>

                  {isActive && (
                    <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded flex items-center gap-1 border border-emerald-200">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>Đang chọn</span>
                    </span>
                  )}
                </div>

                <h3 className="text-base font-bold text-slate-900 leading-snug">{project.name}</h3>
                <p className="text-xs text-slate-600 mt-1.5 line-clamp-2 leading-relaxed">
                  {project.description}
                </p>

                {/* Progress bar */}
                <div className="mt-4">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-slate-500 font-medium">Tiến độ tổng thể</span>
                    <span className="font-mono font-bold text-slate-900">{project.progressPercent}%</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-indigo-600 h-full rounded-full transition-all"
                      style={{ width: `${project.progressPercent}%` }}
                    />
                  </div>
                </div>

                {/* Details list */}
                <div className="mt-4 pt-3 border-t border-slate-100 space-y-2 text-xs text-slate-600">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Giai đoạn:</span>
                    <span className="font-medium text-slate-800 truncate max-w-[180px]">
                      {phaseLabelMap[project.currentPhase]}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Ngân sách dự toán:</span>
                    <span className="font-mono font-semibold text-slate-900">{formatVND(project.budget)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Thời gian:</span>
                    <span className="font-mono text-slate-700">{project.startDate} → {project.targetEndDate}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Quản lý dự án (PM):</span>
                    <div className="flex items-center gap-1.5 font-medium text-slate-800">
                      <div className={`w-4 h-4 rounded-full text-white text-[9px] font-bold flex items-center justify-center ${manager?.avatarColor || 'bg-zinc-700'}`}>
                        {manager?.name.charAt(0) || 'M'}
                      </div>
                      <span>{manager?.name || 'Chưa gán'}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Card Footer Actions */}
              <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                <button
                  onClick={() => setActiveProjectId(project.id)}
                  disabled={isActive}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex-1 ${
                    isActive
                      ? 'bg-slate-100 text-slate-600 cursor-default'
                      : 'bg-indigo-600 text-white hover:bg-indigo-700'
                  }`}
                >
                  {isActive ? 'Đang kích hoạt' : 'Chọn dự án này'}
                </button>

                {canManageProjectId(project.id) && (
                  <button
                    onClick={() => openEditModal(project)}
                    className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200"
                    title="Chỉnh sửa thông tin dự án"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                )}

                {canManageProjectId(project.id) && (
                  <button
                    onClick={() => {
                      if (window.confirm(`Bạn có chắc chắn muốn xóa dự án "${project.name}" cùng mọi dữ liệu liên quan?`)) {
                        deleteProject(project.id);
                      }
                    }}
                    className="p-1.5 text-rose-700 hover:text-rose-800 hover:bg-rose-50 rounded-lg transition-colors border border-rose-200"
                    title="Xóa dự án"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Create / Edit Project Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 dark:bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl max-w-xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-base font-bold text-slate-900">
                {editingProject ? 'Chỉnh Sửa Dự Án' : 'Khởi Tạo Dự Án Mới'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-slate-500 hover:text-slate-600 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Mã Dự Án (Code)</label>
                  <input
                    type="text"
                    required
                    value={formData.code}
                    onChange={e => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                    placeholder="VD: CORE-BANK"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg font-mono focus:outline-indigo-500"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Tên Dự Án</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    placeholder="VD: Cổng dịch vụ chuyển tiền quốc tế"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Mục Tiêu & Mô Tả Chi Tiết</label>
                <textarea
                  rows={3}
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Mô tả phạm vi, yêu cầu nghiệp vụ và kết quả kỳ vọng..."
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Trạng Thái</label>
                  <select
                    value={formData.status}
                    onChange={e => setFormData({ ...formData, status: e.target.value as ProjectStatus })}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-indigo-500"
                  >
                    <option value="planning">Lập kế hoạch (Planning)</option>
                    <option value="in_progress">Đang thực hiện (In Progress)</option>
                    <option value="review">Đang thẩm định (Review)</option>
                    <option value="completed">Đã hoàn thành (Completed)</option>
                    <option value="on_hold">Tạm dừng (On Hold)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Mức Độ Ưu Tiên</label>
                  <select
                    value={formData.priority}
                    onChange={e => setFormData({ ...formData, priority: e.target.value as Priority })}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-indigo-500"
                  >
                    <option value="low">Thấp (Low)</option>
                    <option value="medium">Trung bình (Medium)</option>
                    <option value="high">Cao (High)</option>
                    <option value="urgent">Khẩn cấp (Urgent)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Người Quản Lý Dự Án (PM)</label>
                  <select
                    value={formData.managerId}
                    onChange={e => setFormData({ ...formData, managerId: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-indigo-500"
                  >
                    {allUsers.map(u => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.email})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Giai Đoạn Hiện Tại</label>
                  <select
                    value={formData.currentPhase}
                    onChange={e => setFormData({ ...formData, currentPhase: e.target.value as any })}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-indigo-500"
                  >
                    <option value="phase_1">Giai đoạn 1: Khởi tạo & Kế hoạch</option>
                    <option value="phase_2">Giai đoạn 2: Phân tích & Thiết kế</option>
                    <option value="phase_3">Giai đoạn 3: Sprint Dev</option>
                    <option value="phase_4">Giai đoạn 4: Kiểm thử QA/QC</option>
                    <option value="phase_5">Giai đoạn 5: UAT & Release</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Ngày Bắt Đầu</label>
                  <input
                    type="date"
                    value={formData.startDate}
                    onChange={e => setFormData({ ...formData, startDate: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg font-mono focus:outline-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Hạn Chót (Target End)</label>
                  <input
                    type="date"
                    value={formData.targetEndDate}
                    onChange={e => setFormData({ ...formData, targetEndDate: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg font-mono focus:outline-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Dự Toán (VND)</label>
                  <input
                    type="number"
                    step="10000000"
                    value={formData.budget}
                    onChange={e => setFormData({ ...formData, budget: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg font-mono focus:outline-indigo-500"
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
                  className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm"
                >
                  {editingProject ? 'Lưu Thay Đổi' : 'Xác Nhận Tạo Dự Án'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
