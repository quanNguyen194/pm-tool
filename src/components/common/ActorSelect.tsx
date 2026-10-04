import React from 'react';
import { UserCog } from 'lucide-react';
import { useApp } from '../../context/AppContext';

interface ActorSelectProps {
  /** Id người thực hiện đã chọn; '' = chính mình. */
  value: string;
  onChange: (id: string) => void;
  className?: string;
}

/**
 * Admin chọn thành viên khác làm người thực hiện hành động (tick bước, duyệt chất lượng).
 * Chỉ hiện với quản trị viên; vai trò khác luôn là chính họ.
 */
export const ActorSelect: React.FC<ActorSelectProps> = ({ value, onChange, className = '' }) => {
  const { isAdmin, users, currentUser } = useApp();
  if (!isAdmin) return null;

  const others = users.filter(u => u.id !== currentUser.id);
  const selected = others.some(u => u.id === value) ? value : '';

  return (
    <label className={`inline-flex items-center gap-1.5 text-xs text-slate-700 ${className}`}>
      <UserCog className="w-3.5 h-3.5 text-indigo-700 shrink-0" aria-hidden="true" />
      <span className="whitespace-nowrap">Thực hiện bởi:</span>
      <select
        value={selected}
        onChange={e => onChange(e.target.value)}
        className="text-xs bg-white border border-slate-300 rounded-md px-2 py-1 max-w-[12rem]"
        aria-label="Người thực hiện hành động"
      >
        <option value="">Tôi ({currentUser.name})</option>
        {others.map(u => (
          <option key={u.id} value={u.id}>
            {u.name}
            {u.isPlaceholder ? ' (chưa đăng ký)' : ''}
          </option>
        ))}
      </select>
    </label>
  );
};

/** Id hợp lệ của người thực hiện (rỗng nếu là chính mình hoặc người đó không còn trong dự án). */
export function useActor(selected: string): string | undefined {
  const { users, currentUser, isAdmin } = useApp();
  if (!isAdmin || !selected || selected === currentUser.id) return undefined;
  return users.some(u => u.id === selected) ? selected : undefined;
}
