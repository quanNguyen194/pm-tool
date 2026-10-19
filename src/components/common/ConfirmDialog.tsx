import React, { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Check, HelpCircle, Trash2, X } from 'lucide-react';

/** Thẻ tóm tắt đối tượng sắp bị tác động (đồng bộ kiểu thẻ ở các màn hình). */
export interface ConfirmTarget {
  title: string;
  /** Nhãn nhỏ cạnh tên (VD: BẮT BUỘC, mã nhiệm vụ). */
  badge?: string;
  badgeTone?: 'danger' | 'success' | 'neutral';
  description?: string;
}

export interface ConfirmOptions {
  title: string;
  /** Nội dung chính; có thể chèn <strong> để nhấn mạnh đối tượng. Xuống dòng (\n) được giữ nguyên. */
  message?: React.ReactNode;
  target?: ConfirmTarget;
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
    icon: AlertTriangle,
    iconBox: 'bg-rose-50 border-rose-100 text-rose-600',
    button: 'bg-rose-600 hover:bg-rose-700 focus-visible:outline-rose-600',
    buttonIcon: Trash2,
    label: 'Xác nhận xóa'
  },
  warning: {
    icon: AlertTriangle,
    iconBox: 'bg-amber-50 border-amber-100 text-amber-700',
    button: 'bg-amber-700 hover:bg-amber-800 focus-visible:outline-amber-700',
    buttonIcon: Check,
    label: 'Tiếp tục'
  },
  primary: {
    icon: HelpCircle,
    iconBox: 'bg-indigo-50 border-indigo-100 text-indigo-600',
    button: 'bg-indigo-600 hover:bg-indigo-700 focus-visible:outline-indigo-600',
    buttonIcon: Check,
    label: 'Xác nhận'
  }
} as const;

const BADGE: Record<NonNullable<ConfirmTarget['badgeTone']>, string> = {
  danger: 'bg-rose-50 text-rose-700 border-rose-200',
  success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  neutral: 'bg-slate-100 text-slate-700 border-slate-200'
};

interface Pending extends ConfirmOptions {
  resolve: (ok: boolean) => void;
}

export const ConfirmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [pending, setPending] = useState<Pending | null>(null);
  const titleId = useId();
  const descId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
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

  // Escape = Hủy; Tab xoay vòng trong hộp (nút đóng, Hủy, Xác nhận).
  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close(false);
      } else if (e.key === 'Tab') {
        const buttons = [closeRef.current, cancelRef.current, confirmRef.current].filter(Boolean) as HTMLButtonElement[];
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
  const ButtonIcon = tone.buttonIcon;
  const hasBody = !!(pending?.message || pending?.target || pending?.warnings?.length);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending &&
        createPortal(
          <div
            className="modal-backdrop-in fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/40 dark:bg-black/60 backdrop-blur-[2px] p-4"
            onMouseDown={e => e.target === e.currentTarget && close(false)}
          >
            <div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby={titleId}
              aria-describedby={hasBody ? descId : undefined}
              className="modal-pop-in relative w-full max-w-md max-h-[90vh] overflow-y-auto rounded-xl bg-white p-6 shadow-xl border border-slate-200"
            >
              <button
                ref={closeRef}
                type="button"
                onClick={() => close(false)}
                aria-label="Đóng"
                className="absolute top-4 right-4 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition focus-visible:outline-2 focus-visible:outline-indigo-500"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>

              <div className="flex items-start gap-4 pr-6">
                <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border ${tone.iconBox}`}>
                  <Icon className="h-6 w-6" aria-hidden="true" />
                </div>

                <div className="flex-1 min-w-0 pt-0.5">
                  <h2 id={titleId} className="text-base font-bold text-slate-900 break-words">
                    {pending.title}
                  </h2>
                  <div id={descId}>
                    {pending.message && (
                      <p className="mt-1.5 text-sm text-slate-600 leading-relaxed whitespace-pre-line break-words">{pending.message}</p>
                    )}

                    {pending.target && (
                      <div className="mt-3 rounded-lg bg-slate-50 p-3 border border-slate-200">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-bold text-slate-800 break-words min-w-0">{pending.target.title}</span>
                          {pending.target.badge && (
                            <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${BADGE[pending.target.badgeTone ?? 'neutral']}`}>
                              {pending.target.badge}
                            </span>
                          )}
                        </div>
                        {pending.target.description && (
                          <p className="mt-1 text-xs text-slate-600 line-clamp-2 break-words">{pending.target.description}</p>
                        )}
                      </div>
                    )}

                    {pending.warnings && pending.warnings.length > 0 && (
                      <ul className="mt-3 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-2.5 space-y-1 list-disc pl-6">
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

              <div className="mt-6 flex flex-wrap items-center justify-end gap-2.5 pt-4 border-t border-slate-100">
                <button
                  ref={cancelRef}
                  type="button"
                  onClick={() => close(false)}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
                >
                  {pending.cancelLabel ?? 'Hủy bỏ'}
                </button>
                <button
                  ref={confirmRef}
                  type="button"
                  onClick={() => close(true)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold text-white shadow-sm transition focus-visible:outline-2 focus-visible:outline-offset-2 ${tone.button}`}
                >
                  <ButtonIcon className="h-3.5 w-3.5" aria-hidden="true" />
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
