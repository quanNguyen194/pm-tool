import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDown, ArrowUp, Eye, EyeOff, Loader2, Plus, Trash2, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import type { IssueColor, IssueStatusCategory } from '../../types';
import { COLOR_BADGE, COLOR_KEYS, COLOR_NAME } from './issueUi';

type Kind = 'types' | 'priorities' | 'statuses';

interface Row {
  key: string;
  id?: string;
  name: string;
  color: IssueColor;
  active: boolean;
  category: IssueStatusCategory;
  /** Trạng thái: là trạng thái khởi tạo. Độ ưu tiên: là mức mặc định cho issue mới. */
  mark: boolean;
}

const CATEGORY_LABEL: Record<IssueStatusCategory, string> = { open: 'Còn mở', in_progress: 'Đang xử lý', closed: 'Đã đóng' };
const inputCls = 'w-full text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white text-slate-900 placeholder:text-slate-500 focus-visible:outline-2 focus-visible:outline-indigo-500 disabled:opacity-60';

/**
 * Cột cố định cho từng tab (từ lg trở lên) để mọi hàng thẳng cột; nhỏ hơn thì mỗi hàng là một thẻ có nhãn cho từng ô.
 * Viết nguyên văn để Tailwind nhận ra lớp.
 */
const GRID: Record<Kind, string> = {
  types: 'lg:grid-cols-[1.75rem_minmax(0,1fr)_7rem_8.5rem_4.5rem_4.5rem]',
  priorities: 'lg:grid-cols-[1.75rem_minmax(0,1fr)_7rem_8.5rem_5rem_4.5rem_4.5rem]',
  statuses: 'lg:grid-cols-[1.75rem_minmax(0,1fr)_7rem_8.5rem_7.5rem_5rem_4.5rem_4.5rem]'
};
const MARK_LABEL: Record<Kind, string> = { types: '', priorities: 'Mặc định', statuses: 'Khởi tạo' };
const ADD_LABEL: Record<Kind, string> = { types: 'Thêm loại issue', priorities: 'Thêm độ ưu tiên', statuses: 'Thêm trạng thái' };
const SAVE_LABEL: Record<Kind, string> = { types: 'Lưu loại issue', priorities: 'Lưu độ ưu tiên', statuses: 'Lưu trạng thái' };

let seq = 0;
const newKey = () => `new-${++seq}`;

const Field: React.FC<{ label: string; className?: string; children: React.ReactNode }> = ({ label, className = '', children }) => (
  <div className={`min-w-0 ${className}`}>
    <span className="lg:hidden block text-[10px] font-semibold uppercase tracking-wider text-slate-600 mb-0.5">{label}</span>
    {children}
  </div>
);

/** Admin/PM cấu hình loại issue, độ ưu tiên và trạng thái của dự án: thêm, đổi tên/màu, sắp xếp, ẩn, xóa (chỉ khi chưa có issue dùng). */
export const IssueConfigDialog: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const {
    issueTypes, issueStatuses, issuePriorities, projectIssues, canConfigIssueTypes, canConfigIssueStatuses,
    saveIssueTypes, saveIssueStatuses, saveIssuePriorities
  } = useApp();
  const [tab, setTab] = useState<Kind>(canConfigIssueTypes ? 'types' : 'statuses');
  const [rowsBy, setRowsBy] = useState<Record<Kind, Row[]>>(() => ({
    types: issueTypes.map(t => ({ key: t.id, id: t.id, name: t.name, color: t.color, active: t.active, category: 'open', mark: false })),
    priorities: issuePriorities.map(p => ({ key: p.id, id: p.id, name: p.name, color: p.color, active: p.active, category: 'open', mark: p.isDefault })),
    statuses: issueStatuses.map(s => ({ key: s.id, id: s.id, name: s.name, color: s.color, active: s.active, category: s.category, mark: s.initial }))
  }));
  const [removed, setRemoved] = useState<Record<Kind, string[]>>({ types: [], priorities: [], statuses: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const usage = useMemo(() => {
    const m: Record<Kind, Map<string, number>> = { types: new Map(), priorities: new Map(), statuses: new Map() };
    const inc = (map: Map<string, number>, id: string) => map.set(id, (map.get(id) ?? 0) + 1);
    projectIssues.forEach(i => {
      inc(m.types, i.typeId);
      inc(m.priorities, i.priorityId);
      inc(m.statuses, i.statusId);
    });
    return m;
  }, [projectIssues]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  const rows = rowsBy[tab];
  const editable = tab === 'statuses' ? canConfigIssueStatuses : canConfigIssueTypes;
  const hasMark = tab !== 'types';
  const used = (r: Row) => (r.id ? usage[tab].get(r.id) ?? 0 : 0);

  const setRows = (fn: (list: Row[]) => Row[]) => setRowsBy(s => ({ ...s, [tab]: fn(s[tab]) }));
  const patch = (key: string, p: Partial<Row>) => setRows(list => list.map(r => (r.key === key ? { ...r, ...p } : r)));
  const move = (idx: number, dir: -1 | 1) =>
    setRows(list => {
      const j = idx + dir;
      if (j < 0 || j >= list.length) return list;
      const copy = [...list];
      [copy[idx], copy[j]] = [copy[j], copy[idx]];
      return copy;
    });
  const remove = (r: Row) => {
    if (r.id) setRemoved(s => ({ ...s, [tab]: [...s[tab], r.id!] }));
    setRows(list => list.filter(x => x.key !== r.key));
  };
  const add = () => setRows(list => [...list, { key: newKey(), name: '', color: 'indigo', active: true, category: tab === 'statuses' ? 'in_progress' : 'open', mark: false }]);
  const setMark = (key: string) => setRows(list => list.map(r => ({ ...r, mark: r.key === key, active: r.key === key ? true : r.active })));

  const validate = (): string => {
    const names = rows.map(r => r.name.trim().toLowerCase());
    if (rows.some(r => !r.name.trim())) return 'Tên không được để trống.';
    if (new Set(names).size !== names.length) return 'Có tên bị trùng nhau.';
    if (!rows.some(r => r.active)) return 'Phải còn ít nhất một mục đang bật.';
    if (tab === 'statuses') {
      if (rows.filter(r => r.mark).length !== 1) return 'Phải chọn đúng một trạng thái khởi tạo (dành cho issue mới).';
      if (rows.find(r => r.mark)?.category === 'closed') return 'Trạng thái khởi tạo không thể thuộc nhóm "Đã đóng".';
    }
    if (tab === 'priorities' && rows.filter(r => r.mark && r.active).length !== 1) return 'Phải chọn đúng một độ ưu tiên mặc định (đang bật) cho issue mới.';
    return '';
  };

  const save = async () => {
    const msg = validate();
    if (msg) {
      setError(msg);
      return;
    }
    setBusy(true);
    setError('');
    const base = (r: Row) => ({ id: r.id, name: r.name.trim(), color: r.color, active: r.active });
    const err =
      tab === 'types'
        ? await saveIssueTypes(rows.map(base), removed.types)
        : tab === 'priorities'
          ? await saveIssuePriorities(rows.map(r => ({ ...base(r), isDefault: r.mark })), removed.priorities)
          : await saveIssueStatuses(rows.map(r => ({ ...base(r), category: r.category, initial: r.mark })), removed.statuses);
    setBusy(false);
    if (err) setError(err);
    else onClose();
  };

  const lockMark = (r: Row) => hasMark && r.mark; // mục khởi tạo/mặc định không ẩn/xóa được

  return createPortal(
    <div className="modal-backdrop-in fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 dark:bg-black/60 backdrop-blur-[2px] p-4" onMouseDown={e => e.target === e.currentTarget && !busy && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Cấu hình issue" className="modal-pop-in bg-white border border-slate-200 rounded-xl shadow-xl w-full max-w-5xl max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 z-10 bg-white flex items-start justify-between gap-3 px-6 pt-5 pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-base font-bold text-slate-900">Cấu hình Lỗi & Yêu cầu</h3>
            <p className="text-[11px] text-slate-600 mt-0.5">Áp dụng riêng cho dự án đang chọn. Mục đã có issue sử dụng chỉ ẩn được, không xóa được.</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Đóng">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 pt-4">
          <div role="tablist" className="inline-flex flex-wrap rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-xs font-semibold">
            {(
              [
                ['types', 'Loại issue', canConfigIssueTypes],
                ['priorities', 'Độ ưu tiên', canConfigIssueTypes],
                ['statuses', 'Trạng thái', canConfigIssueStatuses]
              ] as const
            ).map(([k, label, allowed]) => (
              <button
                key={k}
                role="tab"
                aria-selected={tab === k}
                onClick={() => {
                  setTab(k);
                  setError('');
                }}
                className={`px-3.5 py-1.5 rounded-md ${tab === k ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-700 hover:text-slate-900'}`}
              >
                {label}
                {!allowed && ' (chỉ xem)'}
              </button>
            ))}
          </div>
        </div>

        <div className="px-6 py-4 space-y-2">
          {!editable && <p className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-2.5">Bạn không có quyền chỉnh phần này; chỉ xem.</p>}

          {/* Hàng tiêu đề cột (chỉ từ lg trở lên) */}
          <div className={`hidden lg:grid ${GRID[tab]} items-end gap-2 px-[calc(0.625rem+1px)] text-[10px] font-semibold uppercase tracking-wider text-slate-600`} aria-hidden="true">
            <span />
            <span>Tên</span>
            <span>Màu</span>
            <span>Xem trước</span>
            {tab === 'statuses' && <span>Nhóm</span>}
            {hasMark && <span className="text-center">{MARK_LABEL[tab]}</span>}
            <span className="text-right">Đang dùng</span>
            <span />
          </div>

          {rows.map((r, idx) => (
            <div
              key={r.key}
              className={`grid grid-cols-2 ${GRID[tab]} items-center gap-2 rounded-lg border p-2.5 ${r.active ? 'border-slate-200 bg-white' : 'border-slate-200 bg-slate-50'}`}
            >
              <div className="col-span-2 lg:col-span-1 flex lg:flex-col items-center justify-start gap-1 lg:gap-0">
                <button type="button" disabled={!editable || idx === 0} onClick={() => move(idx, -1)} aria-label="Lên" className="p-0.5 text-slate-600 hover:text-indigo-700 disabled:opacity-30">
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>
                <button type="button" disabled={!editable || idx === rows.length - 1} onClick={() => move(idx, 1)} aria-label="Xuống" className="p-0.5 text-slate-600 hover:text-indigo-700 disabled:opacity-30">
                  <ArrowDown className="w-3.5 h-3.5" />
                </button>
              </div>

              <Field label="Tên" className="col-span-2 lg:col-span-1">
                <input value={r.name} onChange={e => patch(r.key, { name: e.target.value })} disabled={!editable} maxLength={60} aria-label="Tên" placeholder="Tên" className={inputCls} />
              </Field>

              <Field label="Màu">
                <select value={r.color} disabled={!editable} onChange={e => patch(r.key, { color: e.target.value as IssueColor })} aria-label="Màu" className={inputCls}>
                  {COLOR_KEYS.map(c => (
                    <option key={c} value={c}>{COLOR_NAME[c]}</option>
                  ))}
                </select>
              </Field>

              <Field label="Xem trước">
                <span className={`inline-block max-w-full truncate align-middle text-[10px] font-bold px-1.5 py-0.5 rounded border ${COLOR_BADGE[r.color]}`}>{r.name.trim() || 'Xem trước'}</span>
              </Field>

              {tab === 'statuses' && (
                <Field label="Nhóm">
                  <select value={r.category} disabled={!editable} onChange={e => patch(r.key, { category: e.target.value as IssueStatusCategory })} aria-label="Nhóm" className={inputCls}>
                    {(Object.keys(CATEGORY_LABEL) as IssueStatusCategory[]).map(c => (
                      <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
                    ))}
                  </select>
                </Field>
              )}

              {hasMark && (
                <Field label={MARK_LABEL[tab]} className="lg:text-center">
                  <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-700 cursor-pointer">
                    <input type="radio" name={`mark-${tab}`} checked={r.mark} disabled={!editable} onChange={() => setMark(r.key)} />
                    <span className="lg:sr-only">{MARK_LABEL[tab]}</span>
                  </label>
                </Field>
              )}

              <Field label="Đang dùng" className="lg:text-right">
                <span className="text-[11px] text-slate-600 tabular-nums whitespace-nowrap" title="Số issue đang dùng">{used(r)} issue</span>
              </Field>

              <div className="flex items-center justify-end gap-0.5">
                <button
                  type="button"
                  disabled={!editable || lockMark(r)}
                  onClick={() => patch(r.key, { active: !r.active })}
                  aria-label={r.active ? 'Ẩn' : 'Bật lại'}
                  title={r.active ? 'Ẩn (không chọn được cho issue mới)' : 'Bật lại'}
                  className="p-1.5 text-slate-600 hover:text-indigo-700 disabled:opacity-30"
                >
                  {r.active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  disabled={!editable || used(r) > 0 || lockMark(r)}
                  onClick={() => remove(r)}
                  aria-label="Xóa"
                  title={used(r) > 0 ? 'Đang có issue dùng: chỉ ẩn được' : lockMark(r) ? 'Không xóa được mục khởi tạo/mặc định' : 'Xóa'}
                  className="p-1.5 text-rose-700 hover:bg-rose-50 rounded disabled:opacity-30"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}

          {editable && (
            <button type="button" onClick={add} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-700 border border-dashed border-indigo-300 hover:bg-indigo-50 rounded-lg">
              <Plus className="w-3.5 h-3.5" aria-hidden="true" /> {ADD_LABEL[tab]}
            </button>
          )}
          {tab === 'statuses' && (
            <p className="text-[11px] text-slate-600">
              Nhóm "Đã đóng" quyết định issue có tính vào số "còn mở" hay không. Trạng thái khởi tạo là trạng thái của issue mới ghi nhận. Mọi người có quyền cập nhật đều đổi
              được sang trạng thái bất kỳ; mỗi lần đổi đều được ghi vào nhật ký.
            </p>
          )}
          {tab === 'priorities' && (
            <p className="text-[11px] text-slate-600">
              Thứ tự từ trên xuống dưới là từ ưu tiên cao đến thấp (dùng khi sắp xếp theo độ ưu tiên). Mức mặc định được gán cho issue mới nếu người ghi nhận không chọn.
            </p>
          )}
          {error && (
            <p role="alert" className="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg p-2.5">{error}</p>
          )}
        </div>

        <div className="sticky bottom-0 bg-white flex items-center justify-end gap-2.5 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} disabled={busy} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
            Đóng
          </button>
          {editable && (
            <button onClick={() => void save()} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60">
              {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
              {SAVE_LABEL[tab]}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
