import React from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Toast } from '../../types';

const STYLES: Record<Toast['type'], { bg: string; Icon: React.ComponentType<{ className?: string }> }> = {
  success: { bg: 'bg-emerald-700', Icon: CheckCircle2 },
  error: { bg: 'bg-rose-600', Icon: AlertTriangle },
  info: { bg: 'bg-indigo-600', Icon: Info }
};

/** Chồng thông báo nổi ở góc dưới phải. Lỗi dùng role="alert" để trình đọc màn hình đọc ngay. */
export const ToastContainer: React.FC = () => {
  const { toasts, dismissToast } = useApp();
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 w-[min(24rem,calc(100vw-2rem))]"
      role="region"
      aria-label="Thông báo"
    >
      {toasts.map(t => {
        const { bg, Icon } = STYLES[t.type];
        return (
          <div
            key={t.id}
            role={t.type === 'error' ? 'alert' : 'status'}
            className={`toast-in flex items-start gap-2.5 ${bg} text-white text-xs rounded-lg shadow-xl px-3.5 py-3`}
          >
            <Icon className="w-4 h-4 shrink-0 mt-px" />
            <span className="flex-1 leading-relaxed">{t.message}</span>
            <button
              onClick={() => dismissToast(t.id)}
              className="shrink-0 text-white/80 hover:text-white"
              aria-label="Đóng thông báo"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
