import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, ListChecks, Search, X } from 'lucide-react';
import type { UseCase } from '../../types';
import { flattenUseCaseTree, useCasePath } from '../../utils/useCaseTree';

const MAX_RESULTS = 50;
const MAX_CHIPS = 8;
// Cây lớn thì thu gọn sẵn (giống màn Use Case).
const AUTO_COLLAPSE_ABOVE = 40;

/** Use case có thể liên kết: use case thật, ở lá và còn hiệu lực. */
const isLinkable = (u: UseCase, hasChildren: boolean) => u.kind !== 'group' && !hasChildren && u.status !== 'cancelled';

interface UseCaseLinksProps {
  value: string[];
  onChange: (ids: string[]) => void;
  useCases: UseCase[];
}

/**
 * Chọn nhiều use case cho nhiệm vụ:
 * - ô tìm nhanh (gõ để thêm từng use case) và
 * - cửa sổ phụ hiển thị cây use case, có chọn cả cụm theo module/nhóm/use case cha.
 */
export const UseCaseLinks: React.FC<UseCaseLinksProps> = ({ value, onChange, useCases }) => {
  const [quickOpen, setQuickOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [showAllChips, setShowAllChips] = useState(false);

  const byId = useMemo(() => new Map(useCases.map(u => [u.id, u])), [useCases]);
  const parentIds = useMemo(() => new Set(useCases.map(u => u.parentId).filter(Boolean)), [useCases]);
  const selectable = useMemo(() => useCases.filter(u => isLinkable(u, parentIds.has(u.id))), [useCases, parentIds]);
  const selected = useMemo(() => new Set(value), [value]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (q
      ? selectable.filter(
          u =>
            u.code.toLowerCase().includes(q) ||
            u.title.toLowerCase().includes(q) ||
            useCasePath(u, byId).toLowerCase().includes(q) ||
            u.tags.some(t => t.toLowerCase().includes(q))
        )
      : selectable
    ).filter(u => !selected.has(u.id));
    return { items: list.slice(0, MAX_RESULTS), total: list.length };
  }, [selectable, byId, query, selected]);

  const add = (id: string) => onChange([...value, id]);
  const remove = (id: string) => onChange(value.filter(x => x !== id));

  const chips = showAllChips ? value : value.slice(0, MAX_CHIPS);

  return (
    <div className="space-y-2">
      {/* Các use case đã chọn */}
      {value.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map(id => {
            const u = byId.get(id);
            return (
              <span
                key={id}
                className="inline-flex items-center gap-1 max-w-full pl-2 pr-1 py-0.5 text-[11px] rounded border border-indigo-200 bg-indigo-50 text-indigo-800"
                title={u ? `${u.code} - ${u.title}` : id}
              >
                <span className="font-mono font-bold truncate">{u?.code ?? '?'}</span>
                <button
                  type="button"
                  onClick={() => remove(id)}
                  aria-label={`Bỏ liên kết ${u?.code ?? ''}`}
                  className="p-0.5 rounded hover:bg-indigo-100"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            );
          })}
          {value.length > MAX_CHIPS && (
            <button
              type="button"
              onClick={() => setShowAllChips(s => !s)}
              className="text-[11px] text-indigo-700 hover:underline"
            >
              {showAllChips ? 'Thu gọn' : `+${value.length - MAX_CHIPS} use case khác`}
            </button>
          )}
          <button
            type="button"
            onClick={() => onChange([])}
            className="text-[11px] text-slate-500 hover:text-rose-700 hover:underline ml-1"
          >
            Xóa hết ({value.length})
          </button>
        </div>
      ) : (
        <p className="text-[11px] text-slate-500">Chưa liên kết use case nào</p>
      )}

      {/* Hai cách thêm */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setQuickOpen(o => !o)}
          aria-expanded={quickOpen}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white hover:bg-slate-50"
        >
          <Search className="w-3.5 h-3.5" />
          <span>Tìm nhanh để thêm</span>
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${quickOpen ? 'rotate-180' : ''}`} />
        </button>
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-800 border border-indigo-200 rounded-lg bg-indigo-50 hover:bg-indigo-100"
        >
          <ListChecks className="w-3.5 h-3.5" />
          <span>Chọn từ danh sách…</span>
        </button>
      </div>

      {quickOpen && (
        <div className="border border-slate-200 rounded-lg bg-white shadow-xs">
          <div className="flex items-center gap-2 px-2.5 py-2 border-b border-slate-100">
            <Search className="w-3.5 h-3.5 text-slate-400" />
            <input
              autoFocus
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Escape') {
                  e.stopPropagation();
                  setQuickOpen(false);
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  if (results.items[0]) {
                    add(results.items[0].id);
                    setQuery('');
                  }
                }
              }}
              placeholder="Gõ mã, tên, module hoặc nhãn; Enter để thêm kết quả đầu tiên"
              aria-label="Tìm use case để thêm"
              className="w-full text-xs placeholder:text-slate-500 bg-transparent outline-none"
            />
          </div>
          <ul className="max-h-56 overflow-y-auto py-1" role="listbox" aria-label="Kết quả tìm use case">
            {results.items.map(u => (
              <li key={u.id} role="option" aria-selected={false}>
                <button
                  type="button"
                  onClick={() => add(u.id)}
                  className="w-full text-left px-3 py-1.5 hover:bg-indigo-50"
                >
                  <div className="text-xs text-slate-900">
                    <span className="font-mono font-bold text-indigo-600">[{u.code}]</span> {u.title}
                  </div>
                  {useCasePath(u, byId) && <div className="text-[11px] text-slate-500 truncate">{useCasePath(u, byId)}</div>}
                </button>
              </li>
            ))}
            {results.total === 0 && <li className="px-3 py-2 text-xs text-slate-500">Không có use case phù hợp</li>}
            {results.total > MAX_RESULTS && (
              <li className="px-3 py-1.5 text-[11px] text-slate-500">
                Hiển thị {MAX_RESULTS}/{results.total} - gõ thêm để thu hẹp
              </li>
            )}
          </ul>
        </div>
      )}

      {dialogOpen && (
        <UseCaseSelectDialog
          useCases={useCases}
          initial={value}
          onCancel={() => setDialogOpen(false)}
          onApply={ids => {
            onChange(ids);
            setDialogOpen(false);
          }}
        />
      )}
    </div>
  );
};

interface DialogProps {
  useCases: UseCase[];
  initial: string[];
  onCancel: () => void;
  onApply: (ids: string[]) => void;
}

/** Cửa sổ phụ: cây use case có tìm kiếm, lọc theo nhãn, tick từng use case hoặc cả cụm theo module/nhóm/use case cha. */
const UseCaseSelectDialog: React.FC<DialogProps> = ({ useCases, initial, onCancel, onApply }) => {
  const [draft, setDraft] = useState<Set<string>>(new Set(initial));
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState('all');
  const [open, setOpen] = useState<Set<string> | null>(null);

  const nodes = useMemo(() => flattenUseCaseTree(useCases), [useCases]);
  const byId = useMemo(() => new Map(useCases.map(u => [u.id, u])), [useCases]);
  const tags = useMemo(() => [...new Set(useCases.flatMap(u => u.tags))].sort((a, b) => a.localeCompare(b, 'vi')), [useCases]);
  const isFiltering = query.trim() !== '' || tag !== 'all';

  // Use case có thể chọn của mỗi nút (nút lá: chính nó; nút cha/nhóm: các lá bên dưới).
  const targetsOf = (n: (typeof nodes)[number]) =>
    n.childCount > 0 ? n.leafIds : isLinkable(n.useCase, false) ? [n.useCase.id] : [];

  // Khi lọc: giữ use case khớp và các nút cha của nó.
  const filteredNodes = useMemo(() => {
    if (!isFiltering) return nodes;
    const q = query.trim().toLowerCase();
    const hit = (u: UseCase) => u.title.toLowerCase().includes(q) || u.code.toLowerCase().includes(q) || u.actor.toLowerCase().includes(q);
    const textMatch = (u: UseCase) => {
      if (q === '') return true;
      let cur: UseCase | undefined = u;
      while (cur) {
        if (hit(cur)) return true;
        cur = cur.parentId ? byId.get(cur.parentId) : undefined;
      }
      return false;
    };
    const keep = new Set<string>();
    nodes.forEach(n => {
      if (targetsOf(n).length === 0 || n.childCount > 0) return;
      const u = n.useCase;
      if (!textMatch(u) || (tag !== 'all' && !u.tags.includes(tag))) return;
      let cur: UseCase | undefined = u;
      while (cur && !keep.has(cur.id)) {
        keep.add(cur.id);
        cur = cur.parentId ? byId.get(cur.parentId) : undefined;
      }
    });
    return nodes.filter(n => keep.has(n.useCase.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, byId, query, tag, isFiltering]);

  const effectiveOpen = useMemo(() => {
    if (open) return open;
    return nodes.length > AUTO_COLLAPSE_ABOVE ? new Set<string>() : new Set(nodes.filter(n => n.childCount > 0).map(n => n.useCase.id));
  }, [open, nodes]);

  const visible = useMemo(
    () =>
      filteredNodes.filter(n => {
        if (isFiltering) return true;
        let cur = n.useCase.parentId ? byId.get(n.useCase.parentId) : undefined;
        while (cur) {
          if (!effectiveOpen.has(cur.id)) return false;
          cur = cur.parentId ? byId.get(cur.parentId) : undefined;
        }
        return true;
      }),
    [filteredNodes, byId, effectiveOpen, isFiltering]
  );

  // Các use case đang hiển thị (để "Chọn tất cả đang hiển thị" theo bộ lọc).
  const shownLeafIds = useMemo(
    () => [...new Set(filteredNodes.filter(n => n.childCount === 0).flatMap(targetsOf))],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filteredNodes]
  );

  const toggle = (ids: string[], on: boolean) =>
    setDraft(prev => {
      const next = new Set(prev);
      ids.forEach(id => (on ? next.add(id) : next.delete(id)));
      return next;
    });
  const toggleOpen = (id: string) =>
    setOpen(() => {
      const next = new Set(effectiveOpen);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Esc đóng cửa sổ phụ (không đóng cả form nhiệm vụ bên dưới).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onCancel]);

  const selectedCount = draft.size;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 dark:bg-black/70 p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Chọn use case từ danh sách"
    >
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-base font-bold text-slate-900">Chọn use case liên kết</h3>
            <p className="text-[11px] text-slate-500">
              Tick một use case, hoặc tick module/nhóm/use case cha để chọn cả cụm bên dưới.
            </p>
          </div>
          <button onClick={onCancel} className="p-1 text-slate-500 hover:text-slate-700" aria-label="Đóng">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-slate-100 flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="flex items-center gap-2 flex-1 min-w-[180px]">
            <Search className="w-4 h-4 text-slate-400" />
            <input
              autoFocus
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Tìm theo mã, tên, tác nhân, tên module..."
              aria-label="Tìm use case"
              className="w-full text-xs placeholder:text-slate-500 bg-transparent outline-none"
            />
          </div>
          {tags.length > 0 && (
            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              <span>Nhãn:</span>
              <select
                value={tag}
                onChange={e => setTag(e.target.value)}
                className="text-xs bg-slate-50 border border-slate-200 rounded-md px-2 py-1"
              >
                <option value="all">Tất cả</option>
                {tags.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </label>
          )}
          <div className="flex items-center gap-1 text-xs">
            <button
              type="button"
              onClick={() => setOpen(new Set(nodes.filter(n => n.childCount > 0).map(n => n.useCase.id)))}
              className="px-2 py-1 rounded-md border border-slate-200 bg-slate-50 hover:bg-slate-100"
            >
              Mở hết
            </button>
            <button
              type="button"
              onClick={() => setOpen(new Set())}
              className="px-2 py-1 rounded-md border border-slate-200 bg-slate-50 hover:bg-slate-100"
            >
              Thu gọn
            </button>
            <button
              type="button"
              onClick={() => toggle(shownLeafIds, true)}
              className="px-2 py-1 rounded-md border border-indigo-200 bg-indigo-50 text-indigo-800 hover:bg-indigo-100"
              title="Chọn tất cả use case khớp bộ lọc hiện tại"
            >
              Chọn tất cả ({shownLeafIds.length})
            </button>
          </div>
        </div>

        <ul className="flex-1 overflow-y-auto px-3 py-2 space-y-0.5" role="tree" aria-label="Cây use case">
          {visible.length === 0 && <li className="px-3 py-6 text-center text-xs text-slate-500">Không có use case phù hợp</li>}
          {visible.map(n => {
            const u = n.useCase;
            const targets = targetsOf(n);
            const chosen = targets.filter(id => draft.has(id)).length;
            const all = targets.length > 0 && chosen === targets.length;
            const some = chosen > 0 && !all;
            const isParent = n.childCount > 0;
            const isOpen = effectiveOpen.has(u.id) || isFiltering;
            return (
              <li
                key={u.id}
                role="treeitem"
                aria-level={n.depth}
                aria-expanded={isParent ? isOpen : undefined}
                style={{ paddingLeft: (n.depth - 1) * 20 }}
              >
                <div className={`flex items-center gap-2 px-2 py-1.5 rounded-lg ${all ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}>
                  {isParent && !isFiltering ? (
                    <button
                      type="button"
                      onClick={() => toggleOpen(u.id)}
                      className="p-0.5 text-slate-500 hover:text-slate-900 shrink-0"
                      aria-label={isOpen ? `Thu gọn ${u.code}` : `Mở ${u.code}`}
                    >
                      {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </button>
                  ) : (
                    <span className="w-5 shrink-0" aria-hidden="true" />
                  )}
                  <label className={`flex items-center gap-2 min-w-0 flex-1 ${targets.length ? 'cursor-pointer' : 'cursor-default opacity-60'}`}>
                    <input
                      type="checkbox"
                      disabled={targets.length === 0}
                      checked={all}
                      ref={el => {
                        if (el) el.indeterminate = some;
                      }}
                      onChange={e => toggle(targets, e.target.checked)}
                      className="rounded border-slate-300 text-indigo-600 shrink-0"
                      aria-label={`Chọn ${u.code}`}
                    />
                    <span className="min-w-0 text-xs">
                      <span className="font-mono font-bold text-indigo-600">[{u.code}]</span>{' '}
                      <span className={`text-slate-900 ${isParent ? 'font-semibold' : ''}`}>{u.title}</span>
                    </span>
                  </label>
                  {isParent && (
                    <span className="text-[11px] font-mono text-slate-700 shrink-0" title="Đã chọn / tổng số use case bên dưới">
                      {chosen}/{targets.length}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-t border-slate-100">
          <div className="flex items-center gap-3 text-xs text-slate-700">
            <span>
              Đã chọn <strong className="font-mono">{selectedCount}</strong> use case
            </span>
            {selectedCount > 0 && (
              <button type="button" onClick={() => setDraft(new Set())} className="text-slate-500 hover:text-rose-700 hover:underline">
                Bỏ chọn hết
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 rounded-lg"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={() => onApply([...draft])}
              className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs"
            >
              Áp dụng ({selectedCount})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
