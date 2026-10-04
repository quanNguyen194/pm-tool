import React, { useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { UseCase, UseCaseStatus, Priority } from '../../types';
import {
  Boxes,
  Plus,
  Search,
  CheckCircle2,
  Trash2,
  Edit3,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  FileSpreadsheet,
  FolderTree,
  X,
  ListOrdered,
  AlertCircle
} from 'lucide-react';
import { exportUseCasesToCSV } from '../../utils/exportUtils';
import {
  MAX_USE_CASE_DEPTH,
  descendantIds,
  flattenUseCaseTree,
  subtreeHeight,
  suggestUseCaseCode,
  useCaseDepth
} from '../../utils/useCaseTree';

const statusMap: Record<UseCaseStatus, { label: string; color: string }> = {
  draft: { label: 'Bản Thảo (Draft)', color: 'bg-slate-100 text-slate-700' },
  in_review: { label: 'Đang Xem Xét', color: 'bg-amber-100 text-amber-800' },
  approved: { label: 'Đã Phê Duyệt', color: 'bg-blue-100 text-blue-800' },
  developing: { label: 'Đang Phát Triển', color: 'bg-indigo-100 text-indigo-800' },
  tested: { label: 'Đã Kiểm Thử QA', color: 'bg-purple-100 text-purple-800' },
  completed: { label: 'Đã Nghiệm Thu', color: 'bg-emerald-100 text-emerald-800' }
};

// Thụt lề theo cấp (hẹp hơn trên điện thoại).
const INDENT = ['', 'ml-3 sm:ml-5', 'ml-6 sm:ml-10'];
const LEVEL_LABELS = ['', 'Use case lớn', 'Use case con', 'Use case chi tiết'];

interface FormState {
  code: string;
  title: string;
  actor: string;
  description: string;
  priority: Priority;
  status: UseCaseStatus;
  progressPercent: number;
  mainFlow: string;
  alternateFlow: string;
  acceptanceCriteria: string;
  assignedTo: string;
  parentId: string;
}

export const UseCasesView: React.FC = () => {
  const {
    activeProject,
    projectUseCases,
    createUseCase,
    updateUseCase,
    deleteUseCase,
    toggleAcceptanceCriteria,
    canApproveUseCase,
    canManageUseCases,
    currentUser
  } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Các use case cha đang thu gọn (ẩn các con).
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUc, setEditingUc] = useState<UseCase | null>(null);
  const [formData, setFormData] = useState<FormState>({
    code: '',
    title: '',
    actor: '',
    description: '',
    priority: 'high',
    status: 'draft',
    progressPercent: 0,
    mainFlow: '',
    alternateFlow: '',
    acceptanceCriteria: '',
    assignedTo: currentUser.id,
    parentId: ''
  });

  const nodes = useMemo(() => flattenUseCaseTree(projectUseCases), [projectUseCases]);
  const byId = useMemo(() => new Map(projectUseCases.map(u => [u.id, u])), [projectUseCases]);
  const rootCount = nodes.filter(n => n.depth === 1).length;
  const isFiltering = searchQuery.trim() !== '' || filterStatus !== 'all';

  // Khi lọc/tìm kiếm: giữ use case khớp và các cha của nó (để thấy vị trí trong cây).
  const visibleNodes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const matches = (uc: UseCase) =>
      (q === '' ||
        uc.title.toLowerCase().includes(q) ||
        uc.code.toLowerCase().includes(q) ||
        uc.actor.toLowerCase().includes(q)) &&
      (filterStatus === 'all' || uc.status === filterStatus);

    if (isFiltering) {
      const keep = new Set<string>();
      projectUseCases.filter(matches).forEach(uc => {
        let cur: UseCase | undefined = uc;
        while (cur && !keep.has(cur.id)) {
          keep.add(cur.id);
          cur = cur.parentId ? byId.get(cur.parentId) : undefined;
        }
      });
      return nodes.filter(n => keep.has(n.useCase.id));
    }

    return nodes.filter(n => {
      let cur = n.useCase.parentId ? byId.get(n.useCase.parentId) : undefined;
      while (cur) {
        if (collapsed.has(cur.id)) return false;
        cur = cur.parentId ? byId.get(cur.parentId) : undefined;
      }
      return true;
    });
  }, [nodes, byId, projectUseCases, searchQuery, filterStatus, isFiltering, collapsed]);

  const toggleCollapsed = (id: string) =>
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const collapseAll = () => setCollapsed(new Set(nodes.filter(n => n.childCount > 0).map(n => n.useCase.id)));
  const expandAll = () => setCollapsed(new Set());

  const openCreateModal = (parent?: UseCase) => {
    setEditingUc(null);
    setFormData({
      code: suggestUseCaseCode(parent, projectUseCases),
      title: '',
      actor: parent?.actor || 'Khách hàng cá nhân',
      description: '',
      priority: parent?.priority || 'high',
      status: 'draft',
      progressPercent: 0,
      mainFlow: '1. Người dùng truy cập tính năng\n2. Nhập thông tin yêu cầu\n3. Hệ thống kiểm tra dữ liệu\n4. Xác nhận hoàn tất giao dịch',
      alternateFlow: '3a. Dữ liệu không hợp lệ: Hiển thị thông báo lỗi',
      acceptanceCriteria: 'Đảm bảo thời gian phản hồi dưới 2 giây\nCó mã hóa dữ liệu an toàn\nKiểm thử luồng biên thành công',
      assignedTo: currentUser.id,
      parentId: parent?.id || ''
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
      assignedTo: uc.assignedTo || currentUser.id,
      parentId: uc.parentId || ''
    });
    setIsModalOpen(true);
  };

  // Use case có thể làm cha: không phải chính nó/hậu duệ, và không làm cây vượt 3 cấp.
  const parentOptions = useMemo(() => {
    const blocked = editingUc ? descendantIds(editingUc.id, projectUseCases) : new Set<string>();
    const height = editingUc ? subtreeHeight(editingUc.id, projectUseCases) : 0;
    return nodes.filter(
      n => !blocked.has(n.useCase.id) && useCaseDepth(n.useCase.id, projectUseCases) + 1 + height <= MAX_USE_CASE_DEPTH
    );
  }, [nodes, projectUseCases, editingUc]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim() || !formData.code.trim()) return;

    const lines = (text: string) =>
      text
        .split('\n')
        .map(s => s.trim())
        .filter(Boolean);

    const criteriaArray = lines(formData.acceptanceCriteria).map((desc, idx) => {
      // giữ trạng thái hoàn thành khi sửa
      const existing = editingUc?.acceptanceCriteria[idx];
      return {
        id: existing ? existing.id : `crit-${Date.now()}-${idx}`,
        description: desc,
        completed: existing ? existing.completed : false
      };
    });

    const { parentId, ...rest } = formData;
    const payload = {
      ...rest,
      parentId: parentId || undefined,
      mainFlow: lines(formData.mainFlow),
      alternateFlow: lines(formData.alternateFlow),
      acceptanceCriteria: criteriaArray
    };

    if (editingUc) {
      updateUseCase({ ...editingUc, ...payload });
    } else {
      createUseCase({ projectId: activeProject.id, ...payload });
      if (parentId) setCollapsed(prev => new Set([...prev].filter(id => id !== parentId)));
    }
    setIsModalOpen(false);
  };

  const confirmDelete = (uc: UseCase) => {
    const n = descendantIds(uc.id, projectUseCases).size - 1;
    const warn = n > 0 ? `\n\nLƯU Ý: ${n} use case con/cháu bên dưới cũng sẽ bị xóa.` : '';
    if (window.confirm(`Xóa Use Case ${uc.code}?${warn}`)) deleteUseCase(uc.id);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Quản Lý Danh Mục Use Case Nghiệp Vụ</h1>
            <span className="text-xs font-mono font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded break-all min-w-0">
              [{activeProject.code}]
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Cây use case tối đa 3 cấp (use case lớn → con → chi tiết). Tiến độ use case cha tự tổng hợp từ các use case con.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => exportUseCasesToCSV(activeProject, projectUseCases)}
            className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors"
            title="Xuất bảng Use Case sang file CSV"
            aria-label="Xuất bảng Use Case sang file CSV"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
          </button>

          {canManageUseCases && (
            <button
              onClick={() => openCreateModal()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>Thêm Use Case</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-white border border-slate-200 rounded-2xl">
        <div className="flex items-center gap-2 flex-1 min-w-[200px] max-w-sm">
          <Search className="w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Tìm theo mã UC, tên chức năng, tác nhân..."
            aria-label="Tìm use case"
            className="w-full text-xs placeholder:text-slate-500 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
          <div className="flex items-center gap-2">
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
          <div className="flex items-center gap-1">
            <button
              onClick={expandAll}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-200 bg-slate-50 hover:bg-slate-100"
              title="Mở rộng toàn bộ cây"
            >
              <ChevronsUpDown className="w-3.5 h-3.5" />
              <span>Mở hết</span>
            </button>
            <button
              onClick={collapseAll}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-200 bg-slate-50 hover:bg-slate-100"
              title="Thu gọn về các use case lớn"
            >
              <ChevronsDownUp className="w-3.5 h-3.5" />
              <span>Thu gọn</span>
            </button>
          </div>
        </div>
      </div>

      {/* Cây use case */}
      <div className="space-y-2" role="tree" aria-label="Cây use case">
        {visibleNodes.length === 0 ? (
          <div className="p-8 text-center bg-white border border-slate-200 rounded-2xl text-xs text-slate-500">
            {projectUseCases.length === 0 ? 'Dự án chưa có Use Case nào' : 'Không tìm thấy Use Case nào phù hợp'}
          </div>
        ) : (
          visibleNodes.map(({ useCase: uc, depth, childCount, leafCount }) => {
            const isExpanded = expandedId === uc.id;
            const isParent = childCount > 0;
            const isCollapsed = collapsed.has(uc.id) && !isFiltering;
            const statusInfo = statusMap[uc.status];
            const totalCriteria = uc.acceptanceCriteria.length;
            const completedCriteria = uc.acceptanceCriteria.filter(c => c.completed).length;
            const children = projectUseCases.filter(c => c.parentId === uc.id);
            const parent = uc.parentId ? byId.get(uc.parentId) : undefined;

            return (
              <div
                key={uc.id}
                role="treeitem"
                aria-level={depth}
                aria-expanded={isParent ? !isCollapsed : undefined}
                className={`bg-white border rounded-2xl overflow-hidden shadow-xs ${INDENT[Math.min(depth, 3) - 1]} ${
                  depth === 1 ? 'border-slate-300' : 'border-slate-200 border-l-4 border-l-indigo-300'
                }`}
              >
                {/* Header Row */}
                <div className="flex items-center hover:bg-slate-50/70 transition-colors">
                  {isParent && !isFiltering ? (
                    <button
                      onClick={() => toggleCollapsed(uc.id)}
                      className="p-2.5 text-slate-500 hover:text-slate-900 shrink-0"
                      aria-label={isCollapsed ? `Mở các use case con của ${uc.code}` : `Thu gọn các use case con của ${uc.code}`}
                    >
                      {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  ) : (
                    <span className="w-9 shrink-0" aria-hidden="true" />
                  )}

                  <div
                    onClick={() => setExpandedId(isExpanded ? null : uc.id)}
                    className="flex-1 min-w-0 py-3 pr-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 cursor-pointer"
                  >
                    <div className="flex flex-col items-start sm:flex-row sm:items-center gap-1.5 sm:gap-3 min-w-0 max-w-full">
                      <span className="font-mono text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded shrink-0 max-w-[9rem] truncate">
                        [{uc.code}]
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <h3 className={`text-sm text-slate-900 break-words sm:truncate ${depth === 1 ? 'font-bold' : 'font-semibold'}`}>
                            {uc.title}
                          </h3>
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${statusInfo.color}`}>
                            {statusInfo.label}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap items-center gap-x-2">
                          <span>{LEVEL_LABELS[depth]}</span>
                          {isParent && (
                            <>
                              <span>·</span>
                              <span>
                                {childCount} con · {leafCount} use case lá
                              </span>
                            </>
                          )}
                          {uc.actor && (
                            <>
                              <span>·</span>
                              <span className="truncate">
                                Tác nhân: <strong className="text-slate-700">{uc.actor}</strong>
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0 ml-auto">
                      <div className="text-right">
                        <div className="text-xs font-bold text-slate-900 font-mono tabular-nums">
                          {uc.progressPercent}%
                        </div>
                        {!isParent && (
                          <div className="text-[11px] text-slate-500 font-mono">
                            {completedCriteria}/{totalCriteria} tiêu chí
                          </div>
                        )}
                      </div>
                      <div
                        className="w-20 bg-slate-100 h-2 rounded-full overflow-hidden hidden sm:block"
                        role="img"
                        aria-label={`Tiến độ ${uc.progressPercent}%`}
                      >
                        <div
                          className="bg-indigo-600 h-full rounded-full transition-all"
                          style={{ width: `${uc.progressPercent}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Expanded Details Body */}
                {isExpanded && (
                  <div className="px-5 pb-5 pt-3 border-t border-slate-100 bg-slate-50/40 space-y-5">
                    {parent && (
                      <div className="text-xs text-slate-600 flex items-center gap-1.5">
                        <FolderTree className="w-3.5 h-3.5 text-indigo-600" />
                        <span>
                          Thuộc use case: <strong className="font-mono text-slate-800">[{parent.code}]</strong> {parent.title}
                        </span>
                      </div>
                    )}

                    {/* Description */}
                    <div>
                      <div className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1 font-mono">
                        Mục Tiêu Nghiệp Vụ
                      </div>
                      <p className="text-xs text-slate-700 leading-relaxed bg-white p-3 rounded-lg border border-slate-200">
                        {uc.description || 'Chưa có mô tả'}
                      </p>
                    </div>

                    {isParent && (
                      <div className="bg-white p-4 rounded-2xl border border-slate-200">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 mb-2">
                          <Boxes className="w-3.5 h-3.5 text-indigo-600" />
                          <span>Các use case con ({childCount}) · tiến độ tổng hợp {uc.progressPercent}%</span>
                        </div>
                        <ul className="space-y-1.5">
                          {children.map(c => (
                            <li key={c.id} className="flex items-center justify-between gap-3 text-xs">
                              <button
                                onClick={() => setExpandedId(c.id)}
                                className="flex items-center gap-2 min-w-0 text-left hover:underline"
                              >
                                <span className="font-mono font-bold text-indigo-600 shrink-0">[{c.code}]</span>
                                <span className="truncate text-slate-800">{c.title}</span>
                              </button>
                              <span className="font-mono tabular-nums text-slate-700 shrink-0">{c.progressPercent}%</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Flows Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-white p-4 rounded-2xl border border-slate-200">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 mb-2">
                          <ListOrdered className="w-3.5 h-3.5 text-indigo-600" />
                          <span>Luồng Xử Lý Chính (Main Flow)</span>
                        </div>
                        {uc.mainFlow.length > 0 ? (
                          <ol className="space-y-1.5 text-xs text-slate-600">
                            {uc.mainFlow.map((step, idx) => (
                              <li key={idx} className="flex items-start gap-2">
                                <span className="font-mono text-indigo-600 font-bold shrink-0">{idx + 1}.</span>
                                <span>{step.replace(/^\d+\.\s*/, '')}</span>
                              </li>
                            ))}
                          </ol>
                        ) : (
                          <div className="text-xs text-slate-500 italic">Chưa mô tả luồng chính</div>
                        )}
                      </div>

                      <div className="bg-white p-4 rounded-2xl border border-slate-200">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 mb-2">
                          <AlertCircle className="w-3.5 h-3.5 text-amber-700" />
                          <span>Luồng Ngoại Lệ & Xử Lý Lỗi (Alternate Flow)</span>
                        </div>
                        {uc.alternateFlow && uc.alternateFlow.length > 0 ? (
                          <ul className="space-y-1.5 text-xs text-slate-600">
                            {uc.alternateFlow.map((alt, idx) => (
                              <li key={idx} className="flex items-start gap-2">
                                <span className="text-amber-700 font-bold shrink-0">·</span>
                                <span>{alt}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <div className="text-xs text-slate-500 italic">Không có luồng ngoại lệ đặc biệt</div>
                        )}
                      </div>
                    </div>

                    {/* Interactive Acceptance Criteria Checklist */}
                    <div className="bg-white p-4 rounded-2xl border border-slate-200">
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                          <h4 className="text-xs font-bold text-slate-900">
                            Tiêu Chí Nghiệm Thu (Acceptance Criteria / Definition of Done)
                          </h4>
                        </div>
                        <span className="text-xs text-slate-500 font-mono font-medium">
                          Đã đạt: {completedCriteria}/{totalCriteria}
                          {!isParent && ` (${uc.progressPercent}%)`}
                        </span>
                      </div>
                      {isParent && (
                        <p className="text-[11px] text-slate-500 mb-2">
                          Use case có các use case con nên tiến độ được tính từ các con; tiêu chí ở đây dùng để nghiệm thu tổng thể.
                        </p>
                      )}

                      <div className="space-y-2">
                        {uc.acceptanceCriteria.length === 0 && (
                          <div className="text-xs text-slate-500 italic">Chưa có tiêu chí nghiệm thu</div>
                        )}
                        {uc.acceptanceCriteria.map(criterion => (
                          <label
                            key={criterion.id}
                            className={`flex items-start gap-3 p-2.5 rounded-lg border text-xs transition-colors ${
                              canApproveUseCase ? 'cursor-pointer' : 'cursor-not-allowed'
                            } ${
                              criterion.completed
                                ? 'bg-emerald-50/50 border-emerald-200 text-slate-800'
                                : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100/60'
                            }`}
                            title={canApproveUseCase ? undefined : 'Chỉ Quản trị viên hoặc PM mới xác nhận được tiêu chí nghiệm thu'}
                          >
                            <input
                              type="checkbox"
                              checked={criterion.completed}
                              disabled={!canApproveUseCase}
                              onChange={() => toggleAcceptanceCriteria(uc.id, criterion.id)}
                              className="mt-0.5 rounded border-slate-300 text-emerald-700 focus:ring-emerald-500"
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

                      <div className="flex flex-wrap items-center gap-2">
                        {canManageUseCases && (
                          <>
                            {depth < MAX_USE_CASE_DEPTH && (
                              <button
                                onClick={() => openCreateModal(uc)}
                                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs text-indigo-700 hover:text-indigo-800 bg-white border border-indigo-200 rounded-lg hover:bg-indigo-50"
                              >
                                <FolderTree className="w-3.5 h-3.5" />
                                <span>Thêm use case con</span>
                              </button>
                            )}
                            <button
                              onClick={() => openEditModal(uc)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs text-slate-700 hover:text-slate-900 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span>Sửa Use Case</span>
                            </button>
                            <button
                              onClick={() => confirmDelete(uc)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs text-rose-700 hover:text-rose-800 bg-white border border-rose-200 rounded-lg hover:bg-rose-50"
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

      {nodes.length > 0 && (
        <p className="text-[11px] text-slate-500">
          {nodes.length} use case · {rootCount} use case lớn
          {isFiltering ? ` · đang hiển thị ${visibleNodes.length} (kèm use case cha của kết quả tìm được)` : ''}
        </p>
      )}

      {/* Create / Edit Use Case Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 dark:bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl max-w-xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-base font-bold text-slate-900">
                {editingUc ? 'Chỉnh Sửa Use Case' : formData.parentId ? 'Thêm Use Case Con' : 'Thêm Use Case Mới'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-slate-500 hover:text-slate-600"
                aria-label="Đóng"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Thuộc use case (cấp trên)</label>
                <select
                  value={formData.parentId}
                  onChange={e => {
                    const parentId = e.target.value;
                    // Đổi cha khi tạo mới thì gợi ý lại mã.
                    setFormData(prev => ({
                      ...prev,
                      parentId,
                      code: editingUc ? prev.code : suggestUseCaseCode(byId.get(parentId), projectUseCases)
                    }));
                  }}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                >
                  <option value="">— Không có (use case lớn, cấp 1) —</option>
                  {parentOptions.map(n => (
                    <option key={n.useCase.id} value={n.useCase.id}>
                      {'  '.repeat(n.depth - 1)}
                      {n.depth > 1 ? '└ ' : ''}[{n.useCase.code}] {n.useCase.title}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500 mt-1">
                  Tối đa {MAX_USE_CASE_DEPTH} cấp. Chỉ hiện các use case còn chỗ để chứa thêm cấp con.
                </p>
              </div>

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
