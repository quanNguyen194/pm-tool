import React from 'react';
import { Link2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';

/** Nút sao chép địa chỉ của một màn hình / mục để gửi cho người khác. `href` là đường dẫn tương đối (lấy từ hrefFor). */
export const CopyLinkButton: React.FC<{ href: string; label?: string; className?: string; showText?: boolean }> = ({
  href, label = 'Sao chép liên kết', className = '', showText = false
}) => {
  const { copyLink } = useApp();
  return (
    <button
      type="button"
      onClick={() => void copyLink(href)}
      title={label}
      aria-label={label}
      className={`inline-flex items-center gap-1.5 rounded-lg text-slate-600 hover:text-indigo-700 hover:bg-slate-100 ${showText ? 'px-2.5 py-1.5 text-xs font-medium border border-slate-300 bg-white' : 'p-1.5'} ${className}`}
    >
      <Link2 className="w-4 h-4" aria-hidden="true" />
      {showText && <span>{label}</span>}
    </button>
  );
};
