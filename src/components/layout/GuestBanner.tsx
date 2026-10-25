import React from 'react';
import { Eye } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useGuestSwitch } from '../../context/GuestSwitchContext';
import { Link, useRouter } from '../../router/Router';
import { buildLoginPath } from '../../router/paths';

/** Dải thông báo đầu trang ở chế độ Khách: nói rõ đang xem chỉ đọc và mời đăng nhập / tạo tài khoản. */
export const GuestBanner: React.FC = () => {
  const { activeProject } = useApp();
  const { pathname, search } = useRouter();
  const { signedIn, exit } = useGuestSwitch();
  const btn = 'px-3 py-1 rounded-md text-xs font-semibold bg-white text-indigo-900 hover:bg-indigo-50';
  return (
    <div role="note" className="bg-indigo-700 text-white text-xs px-3 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
      <span className="inline-flex items-center gap-2 min-w-0">
        <Eye className="w-4 h-4 shrink-0" aria-hidden="true" />
        <span>
          Bạn đang xem dự án <strong className="font-mono">{activeProject.code}</strong> ở chế độ <strong>Khách</strong> (chỉ đọc).
          {signedIn ? ' Bạn chưa là thành viên của dự án này.' : ' Đăng nhập hoặc tạo tài khoản để tham gia dự án.'}
        </span>
      </span>
      {signedIn ? (
        <button type="button" onClick={exit} className={btn}>
          Quay lại dự án của tôi
        </button>
      ) : (
        <Link to={buildLoginPath(pathname + search)} className={btn}>
          Đăng nhập / Tạo tài khoản
        </Link>
      )}
    </div>
  );
};
