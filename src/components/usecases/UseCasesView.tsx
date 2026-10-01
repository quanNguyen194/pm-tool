import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { UseCase, UseCaseStatus, Priority } from '../../types';
import {
  Boxes,
  Plus,
  Search,
  CheckCircle2,
  Clock,
  Trash2,
  Edit3,
  ChevronDown,
  ChevronUp,
  FileSpreadsheet,
  X,
  ListOrdered,
  AlertCircle
} from 'lucide-react';
import { exportUseCasesToCSV } from '../../utils/exportUtils';

export const UseCasesView: React.FC = () => {
  const {
    activeProject,
    projectUseCases,
    createUseCase,
    updateUseCase,
    deleteUseCase,
    toggleAcceptanceCriteria,
    canApproveUseCase,
    canManageTasks,
    currentUser,
    users
  } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(projectUseCases[0]?.id || null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUc, setEditingUc] = useState<UseCase | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    code: '',
    title: '',
    actor: '',
    description: '',
    priority: 'high' as Priority,
    status: 'draft' as UseCaseStatus,
    progressPercent: 0,
    mainFlow: '',
    alternateFlow: '',
    acceptanceCriteria: '',
    assignedTo: currentUser.id
  });

  const openCreateModal = () => {
    setEditingUc(null);
    setFormData({
      code: `UC-${activeProject.code.slice(0, 3)}-0${projectUseCases.length + 1}`,
      title: '',
      actor: 'Khách hàng cá nhân',
      description: '',
      priority: 'high',
      status: 'draft',
      progressPercent: 0,
      mainFlow: '1. Người dùng truy cập tính năng\n2. Nhập thông tin yêu cầu\n3. Hệ thống kiểm tra dữ liệu\n4. Xác nhận hoàn tất giao dịch',
      alternateFlow: '3a. Dữ liệu không hợp lệ: Hiển thị thông báo lỗi',
      acceptanceCriteria: 'Đảm bảo thời gian phản hồi dưới 2 giây\nCó mã hóa dữ liệu an toàn\nKiểm thử luồng biên thành công',
      assignedTo: currentUser.id
    });
    setIsModalOpen(true);
  };

  const openEditModal = (uc: UseCase) => {
    setEditingUc(uc);
    setFormData({
      code: uc.code,
      title: uc.title,
      actor: uc.actor,
      description: uc.description,
      priority: uc.priority,
      status: uc.status,
      progressPercent: uc.progressPercent,
      mainFlow: uc.mainFlow.join('\n'),
      alternateFlow: uc.alternateFlow?.join('\n') || '',
      acceptanceCriteria: uc.acceptanceCriteria.map(c => c.description).join('\n'),
      assignedTo: uc.assignedTo || currentUser.id
    });
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim() || !formData.code.trim()) return;

    const mainFlowArray = formData.mainFlow
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean);

    const altFlowArray = formData.alternateFlow
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean);

    const criteriaArray = formData.acceptanceCriteria
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean)
      .map((desc, idx) => {
        // preserve completed status if editing
        const existing = editingUc?.acceptanceCriteria[idx];
        return {
          id: existing ? existing.id : `crit-${Date.now()}-${idx}`,
          description: desc,
          completed: existing ? existing.completed : false
        };
      });

    if (editingUc) {
      updateUseCase({
        ...editingUc,
        ...formData,
        mainFlow: mainFlowArray,
        alternateFlow: altFlowArray,
        acceptanceCriteria: criteriaArray
      });
    } else {
      createUseCase({
        projectId: activeProject.id,
        ...formData,
        mainFlow: mainFlowArray,
        alternateFlow: altFlowArray,
        acceptanceCriteria: criteriaArray
      });
    }
    setIsModalOpen(false);
  };

  const statusMap: Record<UseCaseStatus, { label: string; color: string }> = {
    draft: { label: 'Bản Thảo (Draft)', color: 'bg-slate-100 text-slate-700' },
    in_review: { label: 'Đang Xem Xét', color: 'bg-amber-100 text-amber-800' },
    approved: { label: 'Đã Phê Duyệt', color: 'bg-blue-100 text-blue-800' },
    developing: { label: 'Đang Phát Triển', color: 'bg-indigo-100 text-indigo-800' },
    tested: { label: 'Đã Kiểm Thử QA', color: 'bg-purple-100 text-purple-800' },
    completed: { label: 'Đã Nghiệm Thu', color: 'bg-emerald-100 text-emerald-800' }
  };

  const filteredUseCases = projectUseCases.filter(uc => {
    const matchesSearch =
      uc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      uc.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      uc.actor.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = filterStatus === 'all' || uc.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Quản Lý Danh Mục Use Case Nghiệp Vụ</h1>
            <span className="text-xs font-mono font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
              [{activeProject.code}]
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Theo dõi tiến độ hoàn thành các ca sử dụng (Use Case), tiêu chí nghiệm thu Acceptance Criteria và luồng xử lý
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => exportUseCasesToCSV(activeProject, projectUseCases)}
            className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors"
            title="Xuất bảng Use Case sang file CSV"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
          </button>

          {canManageTasks && (
            <button
              onClick={openCreateModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>+ Thêm Use Case</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-white border border-slate-200 rounded-xl">
        <div className="flex items-center gap-2 flex-1 min-w-[200px] max-w-sm">
          <Search className="w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Tìm theo mã UC, tên chức năng, tác nhân..."
            className="w-full text-xs placeholder:text-slate-400 focus:outline-hidden"
          />
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-600">
          <span>Trạng thái:</span>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-200 rounded-md px-2 py-1"
          >
            <option value="all">Tất cả trạng thái</option>
            <option value="draft">Bản thảo</option>
            <option value="in_review">Đang xem xét</option>
            <option value="approved">Đã phê duyệt</option>
            <option value="developing">Đang phát triển</option>
            <option value="tested">Đã kiểm thử QA</option>
            <option value="completed">Đã nghiệm thu</option>
          </select>
        </div>
      </div>

      {/* Use Cases Accordion List */}
      <div className="space-y-4">
        {filteredUseCases.length === 0 ? (
          <div className="p-8 text-center bg-white border border-slate-200 rounded-xl text-xs text-slate-400">
            Không tìm thấy Use Case nào phù hợp
          </div>
        ) : (
          filteredUseCases.map(uc => {
            const isExpanded = expandedId === uc.id;
            const statusInfo = statusMap[uc.status];
            const totalCriteria = uc.acceptanceCriteria.length;
            const completedCriteria = uc.acceptanceCriteria.filter(c => c.completed).length;

            return (
              <div
                key={uc.id}
                className="bg-white border border-slate-200 rounded-xl overflow-hidden transition-all shadow-xs"
              >
                {/* Header Row */}
                <div
                  onClick={() => setExpandedId(isExpanded ? null : uc.id)}
                  className="p-4 flex items-center justify-between cursor-pointer hover:bg-slate-50/70 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0 pr-4">
                    <span className="font-mono text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded shrink-0">
                      [{uc.code}]
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-slate-900 truncate">{uc.title}</h3>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${statusInfo.color}`}>
                          {statusInfo.label}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
                        <span>Tác nhân: <strong className="text-slate-700">{uc.actor}</strong></span>
                        <span>·</span>
                        <span>Ưu tiên {uc.priority.toUpperCase()}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 shrink-0">
                    <div className="text-right hidden sm:block">
                      <div className="text-xs font-bold text-slate-900 font-mono tabular-nums">
                        {uc.progressPercent}% hoàn thành
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono">
                        {completedCriteria}/{totalCriteria} tiêu chí đạt
                      </div>
                    </div>

                    <div className="w-20 bg-slate-100 h-2 rounded-full overflow-hidden hidden sm:block">
                      <div
                        className="bg-indigo-600 h-full rounded-full transition-all"
                        style={{ width: `${uc.progressPercent}%` }}
                      />
                    </div>

                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-slate-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                    )}
                  </div>
                </div>

                {/* Expanded Details Body */}
                {isExpanded && (
                  <div className="px-5 pb-5 pt-2 border-t border-slate-100 bg-slate-50/40 space-y-5">
                    {/* Description */}
                    <div>
                      <div className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1 font-mono">
                        Mục Tiêu Nghiệp Vụ
                      </div>
                      <p className="text-xs text-slate-700 leading-relaxed bg-white p-3 rounded-lg border border-slate-200">
                        {uc.description}
                      </p>
                    </div>

                    {/* Flows Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Main Flow */}
                      <div className="bg-white p-4 rounded-xl border border-slate-200">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 mb-2">
                          <ListOrdered className="w-3.5 h-3.5 text-indigo-600" />
                          <span>Luồng Xử Lý Chính (Main Flow)</span>
                        </div>
                        <ol className="space-y-1.5 text-xs text-slate-600">
                          {uc.mainFlow.map((step, idx) => (
                            <li key={idx} className="flex items-start gap-2">
                              <span className="font-mono text-indigo-600 font-bold shrink-0">{idx + 1}.</span>
                              <span>{step.replace(/^\d+\.\s*/, '')}</span>
                            </li>
                          ))}
                        </ol>
                      </div>

                      {/* Alternate Flow */}
                      <div className="bg-white p-4 rounded-xl border border-slate-200">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 mb-2">
                          <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                          <span>Luồng Ngoại Lệ & Xử Lý Lỗi (Alternate Flow)</span>
                        </div>
                        {uc.alternateFlow && uc.alternateFlow.length > 0 ? (
                          <ul className="space-y-1.5 text-xs text-slate-600">
                            {uc.alternateFlow.map((alt, idx) => (
                              <li key={idx} className="flex items-start gap-2">
                                <span className="text-amber-600 font-bold shrink-0">·</span>
                                <span>{alt}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <div className="text-xs text-slate-400 italic">Không có luồng ngoại lệ đặc biệt</div>
                        )}
                      </div>
                    </div>

                    {/* Interactive Acceptance Criteria Checklist */}
                    <div className="bg-white p-4 rounded-xl border border-slate-200">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          <h4 className="text-xs font-bold text-slate-900">
                            Tiêu Chí Nghiệm Thu (Acceptance Criteria / Definition of Done)
                          </h4>
                        </div>
                        <span className="text-xs text-slate-500 font-mono font-medium">
                          Đã đạt: {completedCriteria}/{totalCriteria} ({uc.progressPercent}%)
                        </span>
                      </div>

                      <div className="space-y-2">
                        {uc.acceptanceCriteria.map(criterion => (
                          <label
                            key={criterion.id}
                            className={`flex items-start gap-3 p-2.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                              criterion.completed
                                ? 'bg-emerald-50/50 border-emerald-200 text-slate-800'
                                : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100/60'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={criterion.completed}
                              onChange={() => toggleAcceptanceCriteria(uc.id, criterion.id)}
                              className="mt-0.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                            />
                            <span className={criterion.completed ? 'line-through text-slate-500' : 'font-medium'}>
                              {criterion.description}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Bottom Status Change & Actions */}
                    <div className="pt-2 flex flex-wrap items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500">Chuyển trạng thái:</span>
                        <select
                          disabled={!canApproveUseCase}
                          value={uc.status}
                          onChange={e => updateUseCase({ ...uc, status: e.target.value as UseCaseStatus })}
                          className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-medium"
                        >
                          <option value="draft">Bản Thảo (Draft)</option>
                          <option value="in_review">Đang Xem Xét (In Review)</option>
                          <option value="approved">Đã Phê Duyệt (Approved)</option>
                          <option value="developing">Đang Phát Triển (Developing)</option>
                          <option value="tested">Đã Kiểm Thử (Tested)</option>
                          <option value="completed">Đã Nghiệm Thu (Completed)</option>
                        </select>
                      </div>

                      <div className="flex items-center gap-2">
                        {canManageTasks && (
                          <>
                            <button
                              onClick={() => openEditModal(uc)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs text-slate-700 hover:text-slate-900 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span>Sửa Use Case</span>
                            </button>
                            <button
                              onClick={() => {
                                if (window.confirm(`Xóa Use Case ${uc.code}?`)) deleteUseCase(uc.id);
                              }}
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs text-rose-600 hover:text-rose-800 bg-white border border-rose-200 rounded-lg hover:bg-rose-50"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Xóa</span>
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Create / Edit Use Case Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl max-w-xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-base font-bold text-slate-900">
                {editingUc ? 'Chỉnh Sửa Use Case' : 'Thêm Use Case Mới'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Mã Use Case</label>
                  <input
                    type="text"
                    required
                    value={formData.code}
                    onChange={e => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Tên Ca Sử Dụng (Use Case)</label>
                  <input
                    type="text"
                    required
                    value={formData.title}
                    onChange={e => setFormData({ ...formData, title: e.target.value })}
                    placeholder="VD: Xác thực OTP qua tin nhắn SMS..."
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Tác Nhân (Actor)</label>
                  <input
                    type="text"
                    required
                    value={formData.actor}
                    onChange={e => setFormData({ ...formData, actor: e.target.value })}
                    placeholder="VD: Khách hàng, Thu ngân, Admin..."
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
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

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Mô Tả Mục Tiêu Nghiệp Vụ</label>
                <textarea
                  rows={2}
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Mô tả bối cảnh và kết quả sau khi hoàn thành Use Case..."
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Luồng Xử Lý Chính (Mỗi bước 1 dòng)
                </label>
                <textarea
                  rows={4}
                  value={formData.mainFlow}
                  onChange={e => setFormData({ ...formData, mainFlow: e.target.value })}
                  placeholder="1. Người dùng bấm nút...\n2. Hệ thống kiểm tra..."
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg font-mono text-[11px]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Luồng Ngoại Lệ (Alternate Flow - Mỗi kịch bản 1 dòng)
                </label>
                <textarea
                  rows={2}
                  value={formData.alternateFlow}
                  onChange={e => setFormData({ ...formData, alternateFlow: e.target.value })}
                  placeholder="3a. Người dùng nhập sai mã OTP: Thông báo nhập lại..."
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg font-mono text-[11px]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Tiêu Chí Nghiệm Thu (Acceptance Criteria - Mỗi tiêu chí 1 dòng)
                </label>
                <textarea
                  rows={3}
                  value={formData.acceptanceCriteria}
                  onChange={e => setFormData({ ...formData, acceptanceCriteria: e.target.value })}
                  placeholder="Thời gian phản hồi &lt; 2s\nBảo mật mã OTP 6 số\nAudit log ghi nhận đầy đủ"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg font-mono text-[11px]"
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
                  {editingUc ? 'Lưu Thay Đổi' : 'Xác Nhận Tạo Use Case'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
