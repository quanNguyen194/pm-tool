import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { norm } from '../../utils/text';

export interface SearchOption {
  id: string;
  label: string;
  /** Dòng phụ nhỏ bên dưới (VD: mã, nhóm). */
  sub?: string;
}

/** Ô chọn có tìm kiếm (gõ để lọc theo tên/mã, không phân biệt dấu). value rỗng = chưa chọn. */
export const SearchSelect: React.FC<{
  value: string;
  onChange: (id: string) => void;
  options: SearchOption[];
  placeholder?: string;
  disabled?: boolean;
  ariaLabel: string;
  className?: string;
}> = ({ value, onChange, options, placeholder = 'Chọn…', disabled, ariaLabel, className = '' }) => {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const selected = options.find(o => o.id === value);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const shown = useMemo(() => {
    const q = norm(text);
    const list = q ? options.filter(o => norm(o.label + ' ' + (o.sub ?? '')).includes(q)) : options;
    return list.slice(0, 40);
  }, [options, text]);

  const pick = (id: string) => {
    onChange(id);
    setOpen(false);
    setText('');
  };

  return (
    <div ref={box} className={`relative ${className}`}>
      <div className="flex items-center gap-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 focus-within:outline-2 focus-within:outline-indigo-500">
        <input
          type="text"
          role="combobox"
          aria-label={ariaLabel}
          aria-expanded={open}
          disabled={disabled}
          value={open ? text : selected ? selected.label : ''}
          placeholder={selected && !open ? undefined : placeholder}
          onFocus={() => {
            setOpen(true);
            setActive(0);
          }}
          onChange={e => {
            setText(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={e => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive(a => Math.min(a + 1, shown.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive(a => Math.max(a - 1, 0));
            } else if (e.key === 'Enter' && open && shown[active]) {
              e.preventDefault();
              pick(shown[active].id);
            } else if (e.key === 'Escape' && open) {
              e.stopPropagation();
              setOpen(false);
            }
          }}
          className="flex-1 min-w-0 bg-transparent text-xs text-slate-900 placeholder:text-slate-500 outline-none"
        />
        {value && !disabled ? (
          <button type="button" onClick={() => pick('')} aria-label={`Bỏ chọn ${ariaLabel}`} className="p-0.5 text-slate-500 hover:text-slate-700">
            <X className="w-3.5 h-3.5" />
          </button>
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0" aria-hidden="true" />
        )}
      </div>
      {open && (
        <ul role="listbox" className="absolute z-30 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg py-1">
          {shown.length === 0 ? (
            <li className="px-3 py-2 text-xs text-slate-600">Không có kết quả</li>
          ) : (
            shown.map((o, i) => (
              <li key={o.id} role="option" aria-selected={o.id === value}>
                <button
                  type="button"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => pick(o.id)}
                  className={`w-full text-left px-3 py-1.5 text-xs ${i === active ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}
                >
                  <span className="block text-slate-900 truncate">{o.label}</span>
                  {o.sub && <span className="block text-[11px] text-slate-600 truncate">{o.sub}</span>}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
};
