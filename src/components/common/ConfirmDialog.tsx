import React, { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, HelpCircle, Trash2 } from 'lucide-react';

export interface ConfirmOptions {
  title: string;
  /** Nội dung chính; xuống dòng được giữ nguyên. */
  message?: string;
  /** Các ý cần lưu ý, hiển thị dạng danh sách trong khung cảnh báo. */
  warnings?: string[];
  confirmLabel?: string;
  cancelLabel?: string;
  /** danger: xóa/không thể hoàn tác (nút đỏ); warning: thay đổi quan trọng; primary: xác nhận thông thường. */
  tone?: 'danger' | 'warning' | 'primary';
}

type Confirm = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Confirm | null>(null);

/** Hộp xác nhận thay cho window.confirm: `if (await confirm({ title, message, tone: 'danger' })) { ... }`. */
export function useConfirm(): Confirm {
  const c = useContext(ConfirmContext);
  if (!c) throw new Error('useConfirm phải nằm trong ConfirmProvider');
  return c;
}

const TONE = {
  danger: {
    icon: Trash2,
    ring: 'bg-rose-100 text-rose-700',
    button: 'bg-rose-700 hover:bg-rose-800 focus-visible:outline-rose-700',
    label: 'Xóa'
  },
  warning: {
    icon: AlertTriangle,
    ring: 'bg-amber-100 text-amber-700',
    button: 'bg-amber-700 hover:bg-amber-800 focus-visible:outline-amber-700',
    label: 'Tiếp tục'
  },
  primary: {
    icon: HelpCircle,
    ring: 'bg-indigo-100 text-indigo-700',
    button: 'bg-indigo-600 hover:bg-indigo-700 focus-visible:outline-indigo-600',
    label: 'Xác nhận'
  }
} as const;

interface Pending extends ConfirmOptions {
  resolve: (ok: boolean) => void;
}

export const ConfirmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [pending, setPending] = useState<Pending | null>(null);
  const titleId = useId();
  const descId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  const confirm = useCallback<Confirm>(
    options =>
      new Promise<boolean>(resolve => {
        returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        // Nếu đang có hộp xác nhận khác thì coi như đã hủy.
        setPending(prev => {
          prev?.resolve(false);
          return { ...options, resolve };
        });
      }),
    []
  );

  const close = useCallback((ok: boolean) => {
    setPending(prev => {
      prev?.resolve(ok);
      return null;
    });
  }, []);

  // Mở hộp: đưa tiêu điểm vào nút an toàn (Hủy khi xóa/cảnh báo); đóng: trả tiêu điểm về nơi bấm.
  useEffect(() => {
    if (!pending) {
      returnFocus.current?.focus?.();
      return;
    }
    (pending.tone === 'primary' ? confirmRef : cancelRef).current?.focus();
  }, [pending]);

  // Escape = Hủy; Tab xoay vòng trong hộp.
  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close(false);
      } else if (e.key === 'Tab') {
        const buttons = [cancelRef.current, confirmRef.current].filter(Boolean) as HTMLButtonElement[];
        const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
        e.preventDefault();
        buttons[(i + (e.shiftKey ? buttons.length - 1 : 1)) % buttons.length]?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pending, close]);

  const tone = TONE[pending?.tone ?? 'primary'];
  const Icon = tone.icon;

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending &&
        createPortal(
          <div
            className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/50 dark:bg-black/60 backdrop-blur-xs p-4"
            onMouseDown={e => e.target === e.currentTarget && close(false)}
          >
            <div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby={titleId}
              aria-describedby={pending.message || pending.warnings?.length ? descId : undefined}
              className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-md p-5 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-start gap-3">
                <span className={`shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-full ${tone.ring}`}>
                  <Icon className="w-5 h-5" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 id={titleId} className="text-sm font-bold text-slate-900 break-words">
                    {pending.title}
                  </h2>
                  <div id={descId} className="mt-1.5 space-y-2.5">
                    {pending.message && <p className="text-xs text-slate-700 whitespace-pre-line break-words">{pending.message}</p>}
                    {pending.warnings && pending.warnings.length > 0 && (
                      <ul className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-2.5 space-y-1 list-disc pl-6">
                        {pending.warnings.map(w => (
                          <li key={w} className="break-words">
                            {w}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
              <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
                <button
                  ref={cancelRef}
                  type="button"
                  onClick={() => close(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
                >
                  {pending.cancelLabel ?? 'Hủy'}
                </button>
                <button
                  ref={confirmRef}
                  type="button"
                  onClick={() => close(true)}
                  className={`px-4 py-2 text-xs font-semibold text-white rounded-lg shadow-xs focus-visible:outline-2 focus-visible:outline-offset-2 ${tone.button}`}
                >
                  {pending.confirmLabel ?? tone.label}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </ConfirmContext.Provider>
  );
};
