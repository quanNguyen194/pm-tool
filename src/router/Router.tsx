import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

// Bộ định tuyến nhỏ dựa trên History API (không thêm thư viện). Địa chỉ là nguồn sự thật của màn hình đang xem.

interface Loc {
  pathname: string;
  search: string;
}

interface RouterValue extends Loc {
  query: URLSearchParams;
  navigate: (to: string, opts?: { replace?: boolean }) => void;
  /** Đóng một lớp chi tiết: quay lại nếu trang trước đúng là `fallback` do chính ứng dụng mở ra, không thì thay bằng `fallback`. */
  closeTo: (fallback: string) => void;
  /** Đặt/xóa một tham số truy vấn (thay thế mục lịch sử hiện tại, không thêm mục mới). */
  setQuery: (key: string, value: string | null) => void;
}

const RouterContext = createContext<RouterValue | null>(null);

const readLocation = (): Loc => ({ pathname: window.location.pathname, search: window.location.search });
const currentUrl = () => window.location.pathname + window.location.search;

export const RouterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [loc, setLoc] = useState<Loc>(readLocation);

  useEffect(() => {
    const onPop = () => setLoc(readLocation());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback((to: string, opts?: { replace?: boolean }) => {
    if (to === currentUrl()) return;
    if (opts?.replace) window.history.replaceState(window.history.state, '', to);
    else window.history.pushState({ from: currentUrl() }, '', to);
    setLoc(readLocation());
  }, []);

  const closeTo = useCallback(
    (fallback: string) => {
      if ((window.history.state as { from?: string } | null)?.from === fallback) window.history.back();
      else navigate(fallback, { replace: true });
    },
    [navigate]
  );

  const setQuery = useCallback(
    (key: string, value: string | null) => {
      const q = new URLSearchParams(window.location.search);
      if (value === null) q.delete(key);
      else q.set(key, value);
      const s = q.toString();
      navigate(window.location.pathname + (s ? `?${s}` : ''), { replace: true });
    },
    [navigate]
  );

  const value = useMemo<RouterValue>(
    () => ({ ...loc, query: new URLSearchParams(loc.search), navigate, closeTo, setQuery }),
    [loc, navigate, closeTo, setQuery]
  );
  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
};

export function useRouter(): RouterValue {
  const v = useContext(RouterContext);
  if (!v) throw new Error('useRouter phải nằm trong RouterProvider');
  return v;
}

/** Liên kết thật (chuột giữa, Ctrl+click, sao chép địa chỉ đều dùng được); bấm thường thì điều hướng không tải lại trang. */
export const Link = React.forwardRef<HTMLAnchorElement, React.AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }>(function Link(
  { to, onClick, children, ...rest },
  ref
) {
  const { navigate } = useRouter();
  return (
    <a
      {...rest}
      ref={ref}
      href={to}
      onClick={e => {
        onClick?.(e);
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || rest.target === '_blank') return;
        e.preventDefault();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
});
