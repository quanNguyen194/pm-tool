import React, { useMemo, useState } from 'react';
import { Search, ChevronDown, X } from 'lucide-react';
import type { UseCase } from '../../types';
import { useCasePath } from '../../utils/useCaseTree';

const MAX_RESULTS = 50;

interface UseCasePickerProps {
  value: string;
  onChange: (id: string) => void;
  useCases: UseCase[];
}

/** Ô chọn use case có tìm kiếm (danh sách thả xuống thường quá dài khi dự án có hàng trăm use case). */
export const UseCasePicker: React.FC<UseCasePickerProps> = ({ value, onChange, useCases }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const byId = useMemo(() => new Map(useCases.map(u => [u.id, u])), [useCases]);
  const selectable = useMemo(() => useCases.filter(u => u.kind !== 'group'), [useCases]);
  const selected = value ? byId.get(value) : undefined;

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? selectable.filter(
          u =>
            u.code.toLowerCase().includes(q) ||
            u.title.toLowerCase().includes(q) ||
            useCasePath(u, byId).toLowerCase().includes(q) ||
            u.tags.some(t => t.toLowerCase().includes(q))
        )
      : selectable;
    return { items: list.slice(0, MAX_RESULTS), total: list.length };
  }, [selectable, byId, query]);

  const pick = (id: string) => {
    onChange(id);
    setOpen(false);
    setQuery('');
  };

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs text-left border border-slate-300 rounded-lg bg-white"
      >
        <span className={`truncate ${selected ? 'text-slate-900' : 'text-slate-500'}`}>
          {selected ? `[${selected.code}] ${selected.title}` : '-- Không liên kết --'}
        </span>
        <span className="flex items-center gap-1 shrink-0">
          {selected && (
            <span
              role="button"
              tabIndex={0}
              aria-label="Bỏ liên kết use case"
              onClick={e => {
                e.stopPropagation();
                pick('');
              }}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.stopPropagation();
                  pick('');
                }
              }}
              className="p-0.5 text-slate-500 hover:text-slate-900 rounded"
            >
              <X className="w-3.5 h-3.5" />
            </span>
          )}
          <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
        </span>
      </button>

      {open && (
        <div className="mt-1 border border-slate-200 rounded-lg bg-white shadow-xs">
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
                  setOpen(false);
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  if (results.items[0]) pick(results.items[0].id);
                }
              }}
              placeholder="Tìm theo mã, tên, module hoặc nhãn..."
              aria-label="Tìm use case"
              className="w-full text-xs placeholder:text-slate-500 bg-transparent outline-none"
            />
          </div>
          <ul className="max-h-56 overflow-y-auto py-1" role="listbox" aria-label="Danh sách use case">
            <li>
              <button
                type="button"
                onClick={() => pick('')}
                className="w-full text-left px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
              >
                -- Không liên kết --
              </button>
            </li>
            {results.items.map(u => (
              <li key={u.id} role="option" aria-selected={u.id === value}>
                <button
                  type="button"
                  onClick={() => pick(u.id)}
                  className={`w-full text-left px-3 py-1.5 hover:bg-indigo-50 ${u.id === value ? 'bg-indigo-50' : ''}`}
                >
                  <div className="text-xs text-slate-900">
                    <span className="font-mono font-bold text-indigo-600">[{u.code}]</span> {u.title}
                  </div>
                  {useCasePath(u, byId) && (
                    <div className="text-[11px] text-slate-500 truncate">{useCasePath(u, byId)}</div>
                  )}
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
    </div>
  );
};
