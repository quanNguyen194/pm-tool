import React, { useEffect } from 'react';
import { SearchX } from 'lucide-react';
import { Link, useRouter } from '../../router/Router';
import { useApp } from '../../context/AppContext';
import { useGuestSwitch } from '../../context/GuestSwitchContext';
import { parsePath } from '../../router/paths';
import { supabase } from '../../lib/supabase';

/** Địa chỉ trỏ tới dự án không tồn tại hoặc bạn không có quyền xem (hai trường hợp dùng chung một thông báo để không lộ dự án có tồn tại hay không). */
export const NotFoundPanel: React.FC = () => {
  const { hrefFor } = useApp();
  const { pathname } = useRouter();
  const { enter } = useGuestSwitch();
  // Đã đăng nhập nhưng chưa là thành viên: nếu dự án đang Công khai thì xem với tư cách Khách thay vì báo không tìm thấy
  useEffect(() => {
    const r = parsePath(pathname);
    if (r.kind !== 'app' || !r.projectCode) return;
    const code = r.projectCode;
    let alive = true;
    void supabase.rpc('get_public_project', { p_code: code }).then(res => {
      if (alive && !res.error && res.data) enter(code);
    });
    return () => {
      alive = false;
    };
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center" role="alert">
      <SearchX className="w-8 h-8 mx-auto mb-3 text-slate-500" aria-hidden="true" />
      <h1 className="text-base font-bold text-slate-900">Không tìm thấy nội dung này</h1>
      <p className="mt-1.5 text-xs text-slate-600 max-w-md mx-auto">
        Liên kết có thể đã sai hoặc đã đổi, hoặc bạn chưa là thành viên của dự án này. Hãy liên hệ quản lý dự án nếu bạn cần quyền truy cập.
      </p>
      <Link to={hrefFor({ tab: 'dashboard' })} className="mt-4 inline-flex px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg">
        Về tổng quan dự án của tôi
      </Link>
    </div>
  );
};
