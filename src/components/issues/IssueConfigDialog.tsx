import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDown, ArrowUp, Eye, EyeOff, Loader2, Plus, Trash2, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import type { IssueColor, IssueStatusCategory } from '../../types';
import { COLOR_BADGE, COLOR_KEYS, COLOR_NAME } from './issueUi';

interface Row {
  key: string;
  id?: string;
  name: string;
  color: IssueColor;
  active: boolean;
  category: IssueStatusCategory;
  initial: boolean;
}

const CATEGORY_LABEL: Record<IssueStatusCategory, string> = { open: 'Còn mở', in_progress: 'Đang xử lý', closed: 'Đã đóng' };
const inputCls = 'text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white text-slate-900 placeholder:text-slate-500 focus-visible:outline-2 focus-visible:outline-indigo-500';
let seq = 0;
const newKey = () => `new-${++seq}`;

/** Admin/PM cấu hình loại issue và trạng thái của dự án: thêm, đổi tên/màu, sắp xếp, ẩn, xóa (chỉ khi chưa có issue dùng). */
export const IssueConfigDialog: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { issueTypes, issueStatuses, projectIssues, canConfigIssueTypes, canConfigIssueStatuses, saveIssueTypes, saveIssueStatuses } = useApp();
  const [tab, setTab] = useState<'types' | 'statuses'>(canConfigIssueTypes ? 'types' : 'statuses');
  const [typeRows, setTypeRows] = useState<Row[]>(() => issueTypes.map(t => ({ key: t.id, id: t.id, name: t.name, color: t.color, active: t.active, category: 'open', initial: false })));
  const [statusRows, setStatusRows] = useState<Row[]>(() =>
    issueStatuses.map(s => ({ key: s.id, id: s.id, name: s.name, color: s.color, active: s.active, category: s.category, initial: s.initial }))
  );
  const [removedTypes, setRemovedTypes] = useState<string[]>([]);
  const [removedStatuses, setRemovedStatuses] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const usage = useMemo(() => {
    const t = new Map<string, number>();
    const s = new Map<string, number>();
    projectIssues.forEach(i => {
      t.set(i.typeId, (t.get(i.typeId) ?? 0) + 1);
      s.set(i.statusId, (s.get(i.statusId) ?? 0) + 1);
    });
    return { t, s };
  }, [projectIssues]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  const isTypes = tab === 'types';
  const rows = isTypes ? typeRows : statusRows;
  const setRows = isTypes ? setTypeRows : setStatusRows;
  const editable = isTypes ? canConfigIssueTypes : canConfigIssueStatuses;
  const used = (r: Row) => (r.id ? (isTypes ? usage.t : usage.s).get(r.id) ?? 0 : 0);

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
    if (r.id) (isTypes ? setRemovedTypes : setRemovedStatuses)(l => [...l, r.id!]);
    setRows(list => list.filter(x => x.key !== r.key));
  };
  const add = () =>
    setRows(list => [...list, { key: newKey(), name: '', color: 'indigo', active: true, category: isTypes ? 'open' : 'in_progress', initial: false }]);
  const setInitial = (key: string) => setStatusRows(list => list.map(r => ({ ...r, initial: r.key === key, active: r.key === key ? true : r.active })));

  const validate = (): string => {
    const names = rows.map(r => r.name.trim().toLowerCase());
    if (rows.some(r => !r.name.trim())) return 'Tên không được để trống.';
    if (new Set(names).size !== names.length) return 'Có tên bị trùng nhau.';
    if (!rows.some(r => r.active)) return isTypes ? 'Phải còn ít nhất một loại đang bật.' : 'Phải còn ít nhất một trạng thái đang bật.';
    if (!isTypes) {
      if (rows.filter(r => r.initial).length !== 1) return 'Phải chọn đúng một trạng thái khởi tạo (dành cho issue mới).';
      if (rows.find(r => r.initial)?.category === 'closed') return 'Trạng thái khởi tạo không thể thuộc nhóm "Đã đóng".';
    }
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
    const err = isTypes
      ? await saveIssueTypes(typeRows.map(r => ({ id: r.id, name: r.name.trim(), color: r.color, active: r.active })), removedTypes)
      : await saveIssueStatuses(
          statusRows.map(r => ({ id: r.id, name: r.name.trim(), color: r.color, category: r.category, active: r.active, initial: r.initial })),
          removedStatuses
        );
    setBusy(false);
    if (err) setError(err);
    else onClose();
  };

  return createPortal(
    <div className="modal-backdrop-in fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 dark:bg-black/60 backdrop-blur-[2px] p-4" onMouseDown={e => e.target === e.currentTarget && !busy && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Cấu hình issue" className="modal-pop-in bg-white border border-slate-200 rounded-xl shadow-xl w-full max-w-3xl max-h-[92vh] overflow-y-auto">
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
          <div role="tablist" className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-xs font-semibold">
            {(
              [
                ['types', 'Loại issue', canConfigIssueTypes],
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
          {rows.map((r, idx) => (
            <div key={r.key} className={`flex flex-wrap items-center gap-2 rounded-lg border p-2.5 ${r.active ? 'border-slate-200 bg-white' : 'border-slate-200 bg-slate-50'}`}>
              <div className="flex flex-col">
                <button type="button" disabled={!editable || idx === 0} onClick={() => move(idx, -1)} aria-label="Lên" className="p-0.5 text-slate-600 hover:text-indigo-700 disabled:opacity-30">
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>
                <button type="button" disabled={!editable || idx === rows.length - 1} onClick={() => move(idx, 1)} aria-label="Xuống" className="p-0.5 text-slate-600 hover:text-indigo-700 disabled:opacity-30">
                  <ArrowDown className="w-3.5 h-3.5" />
                </button>
              </div>
              <input
                value={r.name}
                onChange={e => patch(r.key, { name: e.target.value })}
                disabled={!editable}
                maxLength={60}
                aria-label="Tên"
                placeholder="Tên"
                className={`${inputCls} flex-1 min-w-[10rem]`}
              />
              <select value={r.color} disabled={!editable} onChange={e => patch(r.key, { color: e.target.value as IssueColor })} aria-label="Màu" className={inputCls}>
                {COLOR_KEYS.map(c => (
                  <option key={c} value={c}>{COLOR_NAME[c]}</option>
                ))}
              </select>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${COLOR_BADGE[r.color]}`}>{r.name.trim() || 'Xem trước'}</span>
              {!isTypes && (
                <>
                  <select value={r.category} disabled={!editable} onChange={e => patch(r.key, { category: e.target.value as IssueStatusCategory })} aria-label="Nhóm" className={inputCls}>
                    {(Object.keys(CATEGORY_LABEL) as IssueStatusCategory[]).map(c => (
                      <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
                    ))}
                  </select>
                  <label className="inline-flex items-center gap-1 text-[11px] text-slate-700 cursor-pointer">
                    <input type="radio" name="initial-status" checked={r.initial} disabled={!editable} onChange={() => setInitial(r.key)} />
                    Khởi tạo
                  </label>
                </>
              )}
              <span className="text-[11px] text-slate-600 tabular-nums" title="Số issue đang dùng">{used(r)} issue</span>
              <button
                type="button"
                disabled={!editable || (r.initial && !isTypes)}
                onClick={() => patch(r.key, { active: !r.active })}
                aria-label={r.active ? 'Ẩn' : 'Bật lại'}
                title={r.active ? 'Ẩn (không chọn được cho issue mới)' : 'Bật lại'}
                className="p-1.5 text-slate-600 hover:text-indigo-700 disabled:opacity-30"
              >
                {r.active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              </button>
              <button
                type="button"
                disabled={!editable || used(r) > 0 || (r.initial && !isTypes)}
                onClick={() => remove(r)}
                aria-label="Xóa"
                title={used(r) > 0 ? 'Đang có issue dùng: chỉ ẩn được' : 'Xóa'}
                className="p-1.5 text-rose-700 hover:bg-rose-50 rounded disabled:opacity-30"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          {editable && (
            <button type="button" onClick={add} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-700 border border-dashed border-indigo-300 hover:bg-indigo-50 rounded-lg">
              <Plus className="w-3.5 h-3.5" aria-hidden="true" /> {isTypes ? 'Thêm loại issue' : 'Thêm trạng thái'}
            </button>
          )}
          {!isTypes && (
            <p className="text-[11px] text-slate-600">
              Nhóm "Đã đóng" quyết định issue có tính vào số "còn mở" hay không. Trạng thái khởi tạo là trạng thái của issue mới ghi nhận. Mọi người có quyền cập nhật đều đổi
              được sang trạng thái bất kỳ; mỗi lần đổi đều được ghi vào nhật ký.
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
              Lưu {isTypes ? 'loại issue' : 'trạng thái'}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
