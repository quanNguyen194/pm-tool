import React, { useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { UseCase, UseCaseComplexity, UseCaseKind, UseCaseStatus, Priority } from '../../types';
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
  Folder,
  FolderTree,
  X,
  ListOrdered,
  AlertCircle
} from 'lucide-react';
import { exportUseCasesToCSV } from '../../utils/exportUtils';
import {
  COMPLEXITY_LABEL,
  COMPLEXITY_STYLE,
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
// Cây nhỏ thì mở sẵn; cây lớn (vd 200+ use case) thì thu gọn sẵn để khỏi phải cuộn dài.
const AUTO_COLLAPSE_ABOVE = 40;

const levelLabel = (uc: UseCase, depth: number, hasChildren: boolean) => {
  if (uc.kind === 'group') return depth === 1 ? 'Module' : 'Nhóm chức năng';
  return hasChildren ? (depth === 1 ? 'Use case lớn' : 'Use case con') : 'Use case';
};

interface FormState {
  kind: UseCaseKind;
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
  tags: string;
  complexity: UseCaseComplexity | '';
  transactions: string;
  necessity: string;
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
  const [filterTag, setFilterTag] = useState<string>('all');
  const [filterComplexity, setFilterComplexity] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Các nút đang mở (hiện con). null = mặc định theo kích thước cây.
  const [openNodes, setOpenNodes] = useState<Set<string> | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUc, setEditingUc] = useState<UseCase | null>(null);
  const [formData, setFormData] = useState<FormState>({
    kind: 'usecase',
    code: '',
    title: '',
    actor: '',
    description: '',
    priority: 'medium',
    status: 'draft',
    progressPercent: 0,
    mainFlow: '',
    alternateFlow: '',
    acceptanceCriteria: '',
    assignedTo: currentUser.id,
    parentId: '',
    tags: '',
    complexity: '',
    transactions: '',
    necessity: 'B'
  });

  const nodes = useMemo(() => flattenUseCaseTree(projectUseCases), [projectUseCases]);
  const byId = useMemo(() => new Map(projectUseCases.map(u => [u.id, u])), [projectUseCases]);
  const allTags = useMemo(
    () => [...new Set(projectUseCases.flatMap(u => u.tags))].sort((a, b) => a.localeCompare(b, 'vi')),
    [projectUseCases]
  );
  const isFiltering =
    searchQuery.trim() !== '' || filterStatus !== 'all' || filterTag !== 'all' || filterComplexity !== 'all';

  const effectiveOpen = useMemo(() => {
    if (openNodes) return openNodes;
    return nodes.length > AUTO_COLLAPSE_ABOVE
      ? new Set<string>()
      : new Set(nodes.filter(n => n.childCount > 0).map(n => n.useCase.id));
  }, [openNodes, nodes]);

  // Tổng quan cả dự án (chỉ use case thật ở lá).
  const totals = useMemo(() => {
    const roots = nodes.filter(n => n.depth === 1);
    const leafCount = roots.reduce((s, n) => s + n.leafCount, 0);
    const done = roots.reduce((s, n) => s + n.doneCount, 0);
    const ucp = roots.reduce((s, n) => s + n.ucp, 0);
    const progress = leafCount
      ? Math.round(roots.reduce((s, n) => s + n.avgProgress * n.leafCount, 0) / leafCount)
      : 0;
    return { leafCount, done, ucp, progress, modules: roots.length };
  }, [nodes]);

  // Khi lọc/tìm kiếm: giữ use case khớp và các nhóm cha của nó (để thấy vị trí trong cây).
  const visibleNodes = useMemo(() => {
    if (isFiltering) {
      const q = searchQuery.trim().toLowerCase();
      const textHit = (u: UseCase) =>
        u.title.toLowerCase().includes(q) || u.code.toLowerCase().includes(q) || u.actor.toLowerCase().includes(q);
      // Tên nhóm khớp thì lấy cả nhánh bên dưới.
      const textMatch = (u: UseCase) => {
        if (q === '') return true;
        let cur: UseCase | undefined = u;
        while (cur) {
          if (textHit(cur)) return true;
          cur = cur.parentId ? byId.get(cur.parentId) : undefined;
        }
        return false;
      };
      const keep = new Set<string>();
      projectUseCases.forEach(uc => {
        if (uc.kind === 'group') return;
        const ok =
          textMatch(uc) &&
          (filterStatus === 'all' || uc.status === filterStatus) &&
          (filterTag === 'all' || uc.tags.includes(filterTag)) &&
          (filterComplexity === 'all' || uc.complexity === filterComplexity);
        if (!ok) return;
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
        if (!effectiveOpen.has(cur.id)) return false;
        cur = cur.parentId ? byId.get(cur.parentId) : undefined;
      }
      return true;
    });
  }, [nodes, byId, projectUseCases, searchQuery, filterStatus, filterTag, filterComplexity, isFiltering, effectiveOpen]);

  const toggleOpen = (id: string) =>
    setOpenNodes(() => {
      const next = new Set(effectiveOpen);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const openAll = () => setOpenNodes(new Set(nodes.filter(n => n.childCount > 0).map(n => n.useCase.id)));
  const closeAll = () => setOpenNodes(new Set());
  const clearFilters = () => {
    setSearchQuery('');
    setFilterStatus('all');
    setFilterTag('all');
    setFilterComplexity('all');
  };

  const openCreateModal = (parent?: UseCase, kind: UseCaseKind = 'usecase') => {
    setEditingUc(null);
    setFormData({
      kind,
      code: suggestUseCaseCode(parent, projectUseCases, kind),
      title: '',
      actor: kind === 'usecase' ? parent?.actor || 'Người dùng' : '',
      description: '',
      priority: parent?.priority || 'medium',
      status: 'draft',
      progressPercent: 0,
      mainFlow:
        kind === 'usecase'
          ? '1. Người dùng truy cập tính năng\n2. Nhập thông tin yêu cầu\n3. Hệ thống kiểm tra dữ liệu\n4. Xác nhận hoàn tất giao dịch'
          : '',
      alternateFlow: '',
      acceptanceCriteria: '',
      assignedTo: currentUser.id,
      parentId: parent?.id || '',
      tags: parent?.tags.join(', ') || '',
      complexity: kind === 'usecase' ? 'medium' : '',
      transactions: '',
      necessity: 'B'
    });
    setIsModalOpen(true);
  };

  const openEditModal = (uc: UseCase) => {
    setEditingUc(uc);
    setFormData({
      kind: uc.kind,
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
      parentId: uc.parentId || '',
      tags: uc.tags.join(', '),
      complexity: uc.complexity || '',
      transactions: uc.transactions !== undefined ? String(uc.transactions) : '',
      necessity: uc.necessity
    });
    setIsModalOpen(true);
  };

  // Nút có thể làm cha: không phải chính nó/hậu duệ, và không làm cây vượt 3 cấp.
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
    const isGroup = formData.kind === 'group';

    const criteriaArray = isGroup
      ? []
      : lines(formData.acceptanceCriteria).map((desc, idx) => {
          // giữ trạng thái hoàn thành khi sửa
          const existing = editingUc?.acceptanceCriteria[idx];
          return {
            id: existing ? existing.id : `crit-${Date.now()}-${idx}`,
            description: desc,
            completed: existing ? existing.completed : false
          };
        });

    const tx = formData.transactions.trim() === '' ? undefined : Math.max(0, Math.round(Number(formData.transactions)));
    const payload = {
      kind: formData.kind,
      code: formData.code.trim(),
      title: formData.title.trim(),
      actor: isGroup ? '' : formData.actor.trim(),
      description: formData.description,
      priority: formData.priority,
      status: formData.status,
      progressPercent: formData.progressPercent,
      assignedTo: formData.assignedTo,
      parentId: formData.parentId || undefined,
      tags: formData.tags
        .split(',')
        .map(t => t.trim())
        .filter(Boolean),
      complexity: isGroup ? undefined : formData.complexity || undefined,
      transactions: isGroup ? undefined : Number.isFinite(tx) ? tx : undefined,
      necessity: formData.necessity || 'B',
      mainFlow: isGroup ? [] : lines(formData.mainFlow),
      alternateFlow: isGroup ? [] : lines(formData.alternateFlow),
      acceptanceCriteria: criteriaArray
    };

    if (editingUc) {
      updateUseCase({ ...editingUc, ...payload });
    } else {
      createUseCase({ projectId: activeProject.id, ...payload });
      if (payload.parentId) setOpenNodes(new Set([...effectiveOpen, payload.parentId]));
    }
    setIsModalOpen(false);
  };

  const confirmDelete = (uc: UseCase) => {
    const n = descendantIds(uc.id, projectUseCases).size - 1;
    const warn = n > 0 ? `\n\nLƯU Ý: ${n} nút con/cháu bên dưới cũng sẽ bị xóa.` : '';
    if (window.confirm(`Xóa ${uc.kind === 'group' ? 'nhóm' : 'Use Case'} ${uc.code}?${warn}`)) deleteUseCase(uc.id);
  };

  const inputCls = 'w-full px-3 py-2 text-xs border border-slate-300 rounded-lg';
  const labelCls = 'block text-xs font-semibold text-slate-700 mb-1';
  const isGroupForm = formData.kind === 'group';

  return (
    <div className="space-y-5">
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
            Cây tối đa 3 cấp: module → nhóm chức năng → use case. Tiến độ module/nhóm tự tổng hợp từ các use case bên dưới.
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
            <>
              <button
                onClick={() => openCreateModal(undefined, 'group')}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors"
              >
                <Folder className="w-4 h-4" />
                <span>Thêm Module</span>
              </button>
              <button
                onClick={() => openCreateModal()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-xs"
              >
                <Plus className="w-4 h-4" />
                <span>Thêm Use Case</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Tổng quan */}
      {totals.leafCount > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3" aria-label="Tổng quan use case">
          {[
            { label: 'Use case', value: totals.leafCount },
            { label: 'Module', value: totals.modules },
            { label: 'Tổng điểm UCP', value: totals.ucp.toLocaleString('vi-VN') },
            { label: 'Đã hoàn thành', value: `${totals.done}/${totals.leafCount}` },
            { label: 'Tiến độ trung bình', value: `${totals.progress}%` }
          ].map(k => (
            <div key={k.label} className="bg-white border border-slate-200 rounded-2xl px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{k.label}</div>
              <div className="mt-0.5 text-lg font-bold text-slate-900 font-mono tabular-nums">{k.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-white border border-slate-200 rounded-2xl">
        <div className="flex items-center gap-2 flex-1 min-w-[200px] max-w-sm">
          <Search className="w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Tìm theo mã, tên chức năng, tác nhân, tên module..."
            aria-label="Tìm use case"
            className="w-full text-xs placeholder:text-slate-500 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-slate-600">
          {allTags.length > 0 && (
            <label className="flex items-center gap-1.5">
              <span>Nhãn:</span>
              <select
                value={filterTag}
                onChange={e => setFilterTag(e.target.value)}
                className="text-xs bg-slate-50 border border-slate-200 rounded-md px-2 py-1"
              >
                <option value="all">Tất cả</option>
                {allTags.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </label>
          )}
          <label className="flex items-center gap-1.5">
            <span>Độ phức tạp:</span>
            <select
              value={filterComplexity}
              onChange={e => setFilterComplexity(e.target.value)}
              className="text-xs bg-slate-50 border border-slate-200 rounded-md px-2 py-1"
            >
              <option value="all">Tất cả</option>
              <option value="simple">Đơn giản</option>
              <option value="medium">Trung bình</option>
              <option value="complex">Phức tạp</option>
            </select>
          </label>
          <label className="flex items-center gap-1.5">
            <span>Trạng thái:</span>
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="text-xs bg-slate-50 border border-slate-200 rounded-md px-2 py-1"
            >
              <option value="all">Tất cả</option>
              <option value="draft">Bản thảo</option>
              <option value="in_review">Đang xem xét</option>
              <option value="approved">Đã phê duyệt</option>
              <option value="developing">Đang phát triển</option>
              <option value="tested">Đã kiểm thử QA</option>
              <option value="completed">Đã nghiệm thu</option>
            </select>
          </label>
          <div className="flex items-center gap-1">
            <button
              onClick={openAll}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-200 bg-slate-50 hover:bg-slate-100"
              title="Mở rộng toàn bộ cây"
            >
              <ChevronsUpDown className="w-3.5 h-3.5" />
              <span>Mở hết</span>
            </button>
            <button
              onClick={closeAll}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-200 bg-slate-50 hover:bg-slate-100"
              title="Thu gọn về các module"
            >
              <ChevronsDownUp className="w-3.5 h-3.5" />
              <span>Thu gọn</span>
            </button>
          </div>
        </div>
      </div>

      {isFiltering && (
        <div className="flex items-center gap-3 text-xs text-slate-600">
          <span>Đang lọc: {visibleNodes.filter(n => n.useCase.kind !== 'group').length} use case khớp</span>
          <button onClick={clearFilters} className="text-indigo-700 hover:underline">
            Xóa bộ lọc
          </button>
        </div>
      )}

      {/* Cây use case */}
      <div className="space-y-2" role="tree" aria-label="Cây use case">
        {visibleNodes.length === 0 ? (
          <div className="p-8 text-center bg-white border border-slate-200 rounded-2xl text-xs text-slate-500">
            {projectUseCases.length === 0 ? 'Dự án chưa có Use Case nào' : 'Không tìm thấy Use Case nào phù hợp'}
          </div>
        ) : (
          visibleNodes.map(({ useCase: uc, depth, childCount, leafCount, ucp, doneCount, avgProgress }) => {
            const isGroup = uc.kind === 'group';
            const isExpanded = expandedId === uc.id;
            const isParent = childCount > 0;
            const isOpen = effectiveOpen.has(uc.id) || isFiltering;
            const statusInfo = statusMap[uc.status];
            const totalCriteria = uc.acceptanceCriteria.length;
            const completedCriteria = uc.acceptanceCriteria.filter(c => c.completed).length;
            const children = nodes.filter(n => n.useCase.parentId === uc.id);
            const parent = uc.parentId ? byId.get(uc.parentId) : undefined;
            const progress = isGroup ? avgProgress : uc.progressPercent;

            return (
              <div
                key={uc.id}
                role="treeitem"
                aria-level={depth}
                aria-expanded={isParent ? isOpen : undefined}
                className={`bg-white border rounded-2xl overflow-hidden shadow-xs ${INDENT[Math.min(depth, 3) - 1]} ${
                  isGroup
                    ? depth === 1
                      ? 'border-slate-300 bg-slate-50/60'
                      : 'border-slate-200 border-l-4 border-l-slate-300'
                    : 'border-slate-200 border-l-4 border-l-indigo-300'
                }`}
              >
                {/* Header Row */}
                <div className="flex items-center hover:bg-slate-50/70 transition-colors">
                  {isParent && !isFiltering ? (
                    <button
                      onClick={() => toggleOpen(uc.id)}
                      className="p-2.5 text-slate-500 hover:text-slate-900 shrink-0"
                      aria-label={isOpen ? `Thu gọn ${uc.code}` : `Mở ${uc.code}`}
                    >
                      {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </button>
                  ) : (
                    <span className="w-9 shrink-0" aria-hidden="true" />
                  )}

                  <div
                    onClick={() => setExpandedId(isExpanded ? null : uc.id)}
                    className="flex-1 min-w-0 py-3 pr-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 cursor-pointer"
                  >
                    <div className="flex flex-col items-start sm:flex-row sm:items-center gap-1.5 sm:gap-3 min-w-0 max-w-full">
                      <span className="font-mono text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded shrink-0 max-w-[9rem] truncate inline-flex items-center gap-1">
                        {isGroup && <Folder className="w-3 h-3 shrink-0" aria-hidden="true" />}
                        <span className="truncate">[{uc.code}]</span>
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <h3 className={`text-sm text-slate-900 break-words sm:truncate ${isGroup ? 'font-bold' : 'font-semibold'}`}>
                            {uc.title}
                          </h3>
                          {!isGroup && (
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${statusInfo.color}`}>
                              {statusInfo.label}
                            </span>
                          )}
                          {!isGroup && uc.complexity && (
                            <span
                              className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${COMPLEXITY_STYLE[uc.complexity]}`}
                              title={uc.transactions !== undefined ? `${uc.transactions} transaction` : undefined}
                            >
                              {COMPLEXITY_LABEL[uc.complexity]}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap items-center gap-x-2">
                          <span>{levelLabel(uc, depth, isParent)}</span>
                          {isParent && (
                            <>
                              <span>·</span>
                              <span>
                                {leafCount} use case · {ucp} UCP
                                {leafCount > 0 && ` · ${doneCount}/${leafCount} xong`}
                              </span>
                            </>
                          )}
                          {!isGroup && uc.actor && (
                            <>
                              <span>·</span>
                              <span className="truncate">
                                Tác nhân: <strong className="text-slate-700">{uc.actor}</strong>
                              </span>
                            </>
                          )}
                          {uc.tags.length > 0 && (depth > 1 || !isGroup) && (
                            <>
                              <span>·</span>
                              <span>{uc.tags.join(', ')}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0 ml-auto">
                      <div className="text-right">
                        <div className="text-xs font-bold text-slate-900 font-mono tabular-nums">{progress}%</div>
                        {!isParent && !isGroup && (
                          <div className="text-[11px] text-slate-500 font-mono">
                            {completedCriteria}/{totalCriteria} tiêu chí
                          </div>
                        )}
                      </div>
                      <div
                        className="w-20 bg-slate-100 h-2 rounded-full overflow-hidden hidden sm:block"
                        role="img"
                        aria-label={`Tiến độ ${progress}%`}
                      >
                        <div className="bg-indigo-600 h-full rounded-full transition-all" style={{ width: `${progress}%` }} />
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
                          Thuộc: <strong className="font-mono text-slate-800">[{parent.code}]</strong> {parent.title}
                        </span>
                      </div>
                    )}

                    {!isGroup && (
                      <>
                        <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-600">
                          <span>Độ phức tạp: <strong className="text-slate-800">{uc.complexity ? COMPLEXITY_LABEL[uc.complexity] : '—'}</strong></span>
                          <span>Số transaction: <strong className="font-mono text-slate-800">{uc.transactions ?? '—'}</strong></span>
                          <span>Mức cần thiết: <strong className="font-mono text-slate-800">{uc.necessity}</strong></span>
                        </div>

                        <div>
                          <div className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1 font-mono">
                            Mục Tiêu Nghiệp Vụ
                          </div>
                          <p className="text-xs text-slate-700 leading-relaxed bg-white p-3 rounded-lg border border-slate-200">
                            {uc.description || 'Chưa có mô tả'}
                          </p>
                        </div>
                      </>
                    )}

                    {isParent && (
                      <div className="bg-white p-4 rounded-2xl border border-slate-200">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 mb-2">
                          <Boxes className="w-3.5 h-3.5 text-indigo-600" />
                          <span>
                            Bên dưới ({childCount}) · tiến độ tổng hợp {progress}%
                          </span>
                        </div>
                        <ul className="space-y-1.5">
                          {children.map(c => (
                            <li key={c.useCase.id} className="flex items-center justify-between gap-3 text-xs">
                              <button
                                onClick={() => setExpandedId(c.useCase.id)}
                                className="flex items-center gap-2 min-w-0 text-left hover:underline"
                              >
                                <span className="font-mono font-bold text-indigo-600 shrink-0">[{c.useCase.code}]</span>
                                <span className="truncate text-slate-800">{c.useCase.title}</span>
                              </button>
                              <span className="font-mono tabular-nums text-slate-700 shrink-0">
                                {c.useCase.kind === 'group' ? c.avgProgress : c.useCase.progressPercent}%
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {!isGroup && (
                      <>
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
                      </>
                    )}

                    {/* Bottom Status Change & Actions */}
                    <div className="pt-2 flex flex-wrap items-center justify-between gap-3 text-xs">
                      {!isGroup ? (
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
                      ) : (
                        <span />
                      )}

                      <div className="flex flex-wrap items-center gap-2">
                        {canManageUseCases && (
                          <>
                            {depth < MAX_USE_CASE_DEPTH && isGroup && (
                              <button
                                onClick={() => openCreateModal(uc, 'group')}
                                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs text-slate-700 hover:text-slate-900 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
                              >
                                <Folder className="w-3.5 h-3.5" />
                                <span>Thêm nhóm con</span>
                              </button>
                            )}
                            {depth < MAX_USE_CASE_DEPTH && (
                              <button
                                onClick={() => openCreateModal(uc)}
                                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs text-indigo-700 hover:text-indigo-800 bg-white border border-indigo-200 rounded-lg hover:bg-indigo-50"
                              >
                                <FolderTree className="w-3.5 h-3.5" />
                                <span>{isGroup ? 'Thêm use case vào đây' : 'Thêm use case con'}</span>
                              </button>
                            )}
                            <button
                              onClick={() => openEditModal(uc)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs text-slate-700 hover:text-slate-900 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span>Sửa</span>
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

      {nodes.length > 0 && !isFiltering && (
        <p className="text-[11px] text-slate-500">
          {nodes.length} nút · {totals.modules} module · {totals.leafCount} use case · đang hiển thị {visibleNodes.length}
        </p>
      )}

      {/* Create / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 dark:bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl max-w-xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-base font-bold text-slate-900">
                {editingUc
                  ? isGroupForm ? 'Chỉnh Sửa Module / Nhóm' : 'Chỉnh Sửa Use Case'
                  : isGroupForm ? 'Thêm Module / Nhóm Chức Năng' : formData.parentId ? 'Thêm Use Case' : 'Thêm Use Case Mới'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="p-1 text-slate-500 hover:text-slate-600" aria-label="Đóng">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <fieldset>
                <legend className={labelCls}>Loại</legend>
                <div className="flex gap-4 text-xs text-slate-800">
                  {(['usecase', 'group'] as const).map(k => (
                    <label key={k} className="inline-flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="uc-kind"
                        checked={formData.kind === k}
                        onChange={() =>
                          setFormData(prev => ({
                            ...prev,
                            kind: k,
                            code: editingUc ? prev.code : suggestUseCaseCode(byId.get(prev.parentId), projectUseCases, k)
                          }))
                        }
                        className="text-indigo-600"
                      />
                      <span>{k === 'usecase' ? 'Use case' : 'Module / Nhóm chức năng'}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <div>
                <label className={labelCls}>Thuộc (cấp trên)</label>
                <select
                  value={formData.parentId}
                  onChange={e => {
                    const parentId = e.target.value;
                    // Đổi cha khi tạo mới thì gợi ý lại mã.
                    setFormData(prev => ({
                      ...prev,
                      parentId,
                      code: editingUc ? prev.code : suggestUseCaseCode(byId.get(parentId), projectUseCases, prev.kind)
                    }));
                  }}
                  className={`${inputCls} bg-white`}
                >
                  <option value="">— Không có (cấp 1) —</option>
                  {parentOptions.map(n => (
                    <option key={n.useCase.id} value={n.useCase.id}>
                      {'  '.repeat(n.depth - 1)}
                      {n.depth > 1 ? '└ ' : ''}[{n.useCase.code}] {n.useCase.title}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500 mt-1">
                  Tối đa {MAX_USE_CASE_DEPTH} cấp. Chỉ hiện các nút còn chỗ để chứa thêm cấp con.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className={labelCls}>Mã</label>
                  <input
                    type="text"
                    required
                    value={formData.code}
                    onChange={e => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                    className={`${inputCls} font-mono`}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelCls}>{isGroupForm ? 'Tên module / nhóm' : 'Tên Ca Sử Dụng (Use Case)'}</label>
                  <input
                    type="text"
                    required
                    value={formData.title}
                    onChange={e => setFormData({ ...formData, title: e.target.value })}
                    placeholder={isGroupForm ? 'VD: Quản lý định danh vật tư, thiết bị' : 'VD: Xác thực OTP qua tin nhắn SMS...'}
                    className={inputCls}
                  />
                </div>
              </div>

              <div>
                <label className={labelCls}>Nhãn (cách nhau bằng dấu phẩy)</label>
                <input
                  type="text"
                  value={formData.tags}
                  onChange={e => setFormData({ ...formData, tags: e.target.value })}
                  placeholder="VD: Web, Mobile, Tích hợp dữ liệu"
                  className={inputCls}
                />
              </div>

              {!isGroupForm && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>Tác Nhân (Actor)</label>
                      <input
                        type="text"
                        required
                        value={formData.actor}
                        onChange={e => setFormData({ ...formData, actor: e.target.value })}
                        placeholder="VD: Khách hàng, Thu ngân, Admin..."
                        className={inputCls}
                      />
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
                      <label className={labelCls}>Độ phức tạp</label>
                      <select
                        value={formData.complexity}
                        onChange={e => setFormData({ ...formData, complexity: e.target.value as UseCaseComplexity | '' })}
                        className={`${inputCls} bg-white`}
                      >
                        <option value="">— Chưa đánh giá —</option>
                        <option value="simple">Đơn giản (5 điểm)</option>
                        <option value="medium">Trung bình (10 điểm)</option>
                        <option value="complex">Phức tạp (15 điểm)</option>
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>Số transaction</label>
                      <input
                        type="number"
                        min="0"
                        value={formData.transactions}
                        onChange={e => setFormData({ ...formData, transactions: e.target.value })}
                        className={`${inputCls} font-mono`}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Mức cần thiết</label>
                      <select
                        value={formData.necessity}
                        onChange={e => setFormData({ ...formData, necessity: e.target.value })}
                        className={`${inputCls} bg-white`}
                      >
                        <option value="B">B</option>
                        <option value="M">M</option>
                        <option value="T">T</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className={labelCls}>Mô Tả Mục Tiêu Nghiệp Vụ</label>
                    <textarea
                      rows={2}
                      value={formData.description}
                      onChange={e => setFormData({ ...formData, description: e.target.value })}
                      placeholder="Mô tả bối cảnh và kết quả sau khi hoàn thành Use Case..."
                      className={inputCls}
                    />
                  </div>

                  <div>
                    <label className={labelCls}>Luồng Xử Lý Chính (Mỗi bước 1 dòng)</label>
                    <textarea
                      rows={4}
                      value={formData.mainFlow}
                      onChange={e => setFormData({ ...formData, mainFlow: e.target.value })}
                      placeholder={'1. Người dùng bấm nút...\n2. Hệ thống kiểm tra...'}
                      className={`${inputCls} font-mono text-[11px]`}
                    />
                  </div>

                  <div>
                    <label className={labelCls}>Luồng Ngoại Lệ (Alternate Flow - Mỗi kịch bản 1 dòng)</label>
                    <textarea
                      rows={2}
                      value={formData.alternateFlow}
                      onChange={e => setFormData({ ...formData, alternateFlow: e.target.value })}
                      placeholder="3a. Người dùng nhập sai mã OTP: Thông báo nhập lại..."
                      className={`${inputCls} font-mono text-[11px]`}
                    />
                  </div>

                  <div>
                    <label className={labelCls}>Tiêu Chí Nghiệm Thu (Acceptance Criteria - Mỗi tiêu chí 1 dòng)</label>
                    <textarea
                      rows={3}
                      value={formData.acceptanceCriteria}
                      onChange={e => setFormData({ ...formData, acceptanceCriteria: e.target.value })}
                      placeholder={'Thời gian phản hồi < 2s\nBảo mật mã OTP 6 số\nAudit log ghi nhận đầy đủ'}
                      className={`${inputCls} font-mono text-[11px]`}
                    />
                  </div>
                </>
              )}

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
                  {editingUc ? 'Lưu Thay Đổi' : 'Xác Nhận Tạo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
