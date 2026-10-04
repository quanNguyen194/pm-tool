import React, { useEffect, useRef, useState } from 'react';
import { UserPlus, UserRoundPlus, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import type { AccountSuggestion, MemberRole } from '../../types';
import { MEMBER_ROLES, ROLE_SHORT } from '../../utils/roles';

type Picked =
  | { kind: 'account'; suggestion: AccountSuggestion }
  | { kind: 'new'; name: string };

const looksLikeEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

/**
 * Thêm thành viên vào dự án: gõ tên/email để thấy gợi ý tài khoản trên hệ thống.
 * Admin còn có thể thêm người CHƯA đăng ký (tài khoản ảo) bằng cách đặt tên.
 */
export const MemberInvite: React.FC<{ projectCode: string }> = ({ projectCode }) => {
  const { suggestAccounts, addMember, addMemberById, createPlaceholderMember, isAdmin } = useApp();

  const [text, setText] = useState('');
  const [role, setRole] = useState<MemberRole>('dev');
  const [picked, setPicked] = useState<Picked | null>(null);
  const [suggestions, setSuggestions] = useState<AccountSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);
  const reqSeq = useRef(0);

  const query = text.trim();

  // Gợi ý theo nội dung đang gõ (trễ nhẹ để không gọi liên tục), bỏ kết quả của lần gọi cũ.
  useEffect(() => {
    if (picked || !open) return;
    const seq = ++reqSeq.current;
    const t = setTimeout(async () => {
      const list = (await suggestAccounts(query)) || [];
      if (seq === reqSeq.current) {
        setSuggestions(list);
        setActive(-1);
      }
    }, 180);
    return () => clearTimeout(t);
  }, [query, open, picked, suggestAccounts]);

  // Bấm ra ngoài thì đóng gợi ý.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const canCreateNew = isAdmin && query.length >= 2 && !looksLikeEmail(query);
  const exactAccount = suggestions.find(
    s => s.name.trim().toLowerCase() === query.toLowerCase() || (s.email && s.email.toLowerCase() === query.toLowerCase())
  );
  // Tên đã trùng một tài khoản gợi ý thì không đề nghị tạo mới (DB cũng chặn trùng tên tài khoản đã đăng ký).
  const showCreateOption = canCreateNew && !exactAccount;

  type Row = { key: string; pick: Picked };
  const rows: Row[] = [
    ...suggestions.map(s => ({ key: s.id, pick: { kind: 'account', suggestion: s } as Picked })),
    ...(showCreateOption ? [{ key: 'new', pick: { kind: 'new', name: query } as Picked }] : [])
  ];

  const choose = (p: Picked) => {
    setPicked(p);
    setText(p.kind === 'account' ? p.suggestion.name : p.name);
    setOpen(false);
  };
  const reset = () => {
    setPicked(null);
    setText('');
    setSuggestions([]);
    setActive(-1);
  };

  // Gõ tên trùng đúng một gợi ý thì coi như chọn gợi ý đó; admin gõ tên mới thì coi như thêm người chưa đăng ký.
  const canSubmit = !busy && (picked !== null || looksLikeEmail(text) || !!exactAccount || showCreateOption);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    let ok = false;
    if (picked?.kind === 'account') ok = await addMemberById(picked.suggestion.id, role);
    else if (picked?.kind === 'new') ok = await createPlaceholderMember(picked.name, role);
    else if (looksLikeEmail(text) && !exactAccount) ok = await addMember(text.trim(), role);
    else if (exactAccount) ok = await addMemberById(exactAccount.id, role);
    else if (showCreateOption) ok = await createPlaceholderMember(query, role);
    setBusy(false);
    if (ok) reset();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open || rows.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive(i => (i + 1) % rows.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(i => (i <= 0 ? rows.length - 1 : i - 1));
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      choose(rows[active].pick);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const listId = `invite-list-${projectCode}`;

  return (
    <form onSubmit={handleSubmit} className="space-y-2 pt-1">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1" ref={wrapRef}>
          <input
            type="text"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
            value={text}
            onChange={e => {
              setText(e.target.value);
              setPicked(null);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            placeholder={isAdmin ? 'Gõ tên hoặc email để chọn tài khoản (hoặc đặt tên người chưa đăng ký)' : 'Gõ tên hoặc email để chọn tài khoản'}
            aria-label="Tên hoặc email thành viên"
            className="w-full px-3 py-2 pr-8 text-xs border border-indigo-200 rounded-lg bg-white focus:outline-indigo-500"
            autoComplete="off"
          />
          {text && (
            <button
              type="button"
              onClick={reset}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-slate-500 hover:text-slate-800"
              aria-label="Xóa nội dung đã nhập"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}

          {open && !picked && (
            <ul
              id={listId}
              role="listbox"
              className="absolute z-30 mt-1 w-full max-h-64 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg py-1"
            >
              {rows.map((r, i) => (
                <li
                  key={r.key}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => choose(r.pick)}
                  className={`px-3 py-2 cursor-pointer text-xs ${i === active ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}
                >
                  {r.pick.kind === 'account' ? (
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`w-6 h-6 rounded-full text-white text-[10px] font-bold flex items-center justify-center shrink-0 ${r.pick.suggestion.avatarColor}`}
                        aria-hidden="true"
                      >
                        {r.pick.suggestion.name.charAt(0)}
                      </span>
                      <span className="min-w-0">
                        <span className="block font-semibold text-slate-900 truncate">{r.pick.suggestion.name}</span>
                        <span className="block text-[11px] text-slate-500 truncate">
                          {r.pick.suggestion.isPlaceholder ? 'Chưa đăng ký (tài khoản ảo)' : r.pick.suggestion.email}
                        </span>
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-indigo-800">
                      <UserRoundPlus className="w-4 h-4 shrink-0" aria-hidden="true" />
                      <span className="truncate">
                        Thêm "<strong>{r.pick.name}</strong>" như người chưa đăng ký
                      </span>
                    </div>
                  )}
                </li>
              ))}
              {rows.length === 0 && (
                <li className="px-3 py-2 text-xs text-slate-500">
                  {query ? 'Không có tài khoản phù hợp' : 'Chưa có tài khoản nào để thêm'}
                  {!isAdmin && looksLikeEmail(query) ? ' - bấm "Thêm vào dự án" để thử theo email' : ''}
                </li>
              )}
            </ul>
          )}
        </div>

        <select
          value={role}
          onChange={e => setRole(e.target.value as MemberRole)}
          aria-label="Vai trò"
          className="px-3 py-2 text-xs border border-indigo-200 rounded-lg bg-white"
        >
          {MEMBER_ROLES.map(r => (
            <option key={r} value={r}>
              {ROLE_SHORT[r]}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={!canSubmit}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 rounded-lg"
        >
          <UserPlus className="w-3.5 h-3.5" />
          <span>Thêm vào dự án</span>
        </button>
      </div>

      {picked?.kind === 'new' && (
        <p className="text-[11px] text-indigo-900">
          "{picked.name}" sẽ được thêm như người <strong>chưa đăng ký</strong>. Khi có tài khoản thật đăng ký trùng tên, hệ thống sẽ
          báo bạn để duyệt hợp nhất.
        </p>
      )}
      {picked?.kind === 'account' && picked.suggestion.isPlaceholder && (
        <p className="text-[11px] text-indigo-900">Tài khoản này chưa đăng ký (do admin tạo trước), đang dùng ở dự án khác.</p>
      )}
    </form>
  );
};
