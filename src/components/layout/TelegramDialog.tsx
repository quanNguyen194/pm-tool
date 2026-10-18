import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ExternalLink, Loader2, MessageCircle, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import type { TelegramInfo } from '../../types';

/** Telegram trả "chat not found" khi người dùng chưa bấm Start với bot (hoặc sai Chat ID). */
const explain = (msg: string) =>
  /timeout/i.test(msg)
    ? `${msg}. Telegram phản hồi chậm; tin có thể vẫn đã tới, hãy kiểm tra Telegram rồi thử lại nếu chưa thấy.`
    : /chat not found/i.test(msg)
    ? `${msg}. Hãy mở bot và bấm Start trước, rồi kiểm tra lại Chat ID.`
    : /blocked/i.test(msg)
      ? `${msg}. Bạn đã chặn bot; hãy bỏ chặn rồi thử lại.`
      : msg;

/** Mỗi người tự liên kết Telegram của mình để nhận nhắc nhở deadline qua bot. */
export const TelegramDialog: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { getTelegram, saveTelegram, testTelegram } = useApp();
  const [info, setInfo] = useState<TelegramInfo | null>(null);
  const [chatId, setChatId] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [busy, setBusy] = useState<'save' | 'test' | null>(null);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let alive = true;
    getTelegram()
      .then(i => {
        if (!alive) return;
        setInfo(i);
        setChatId(i.chatId);
        setEnabled(i.enabled);
      })
      .catch(e => alive && setLoadError(e instanceof Error ? e.message : 'Không tải được cấu hình Telegram'));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const save = async (andTest: boolean) => {
    setBusy('save');
    setResult(null);
    const err = await saveTelegram(chatId.trim(), enabled);
    if (err) {
      setResult({ ok: false, message: err });
      setBusy(null);
      return;
    }
    if (!andTest || !chatId.trim()) {
      setResult({ ok: true, message: chatId.trim() ? 'Đã lưu.' : 'Đã gỡ liên kết Telegram.' });
      setBusy(null);
      return;
    }
    setBusy('test');
    const r = await testTelegram();
    setResult({ ok: r.ok, message: r.ok ? r.message : explain(r.message) });
    setBusy(null);
  };

  const botLink = info?.botUsername ? `https://t.me/${info.botUsername}` : null;
  const inputCls =
    'w-full text-sm font-mono bg-white border border-slate-300 rounded-lg px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500';

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 dark:bg-black/60 backdrop-blur-xs p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Nhắc nhở qua Telegram"
        onClick={e => e.stopPropagation()}
        className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100 mb-4">
          <div className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-blue-700" aria-hidden="true" />
            <h3 className="text-base font-bold text-slate-900">Nhắc nhở qua Telegram</h3>
          </div>
          <button onClick={onClose} className="p-1 text-slate-500 hover:text-slate-700" aria-label="Đóng">
            <X className="w-4 h-4" />
          </button>
        </div>

        {loadError ? (
          <p className="text-xs text-rose-700" role="alert">{loadError}</p>
        ) : !info ? (
          <p className="text-xs text-slate-600 flex items-center gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> Đang tải…
          </p>
        ) : (
          <div className="space-y-4">
            {!info.configured && (
              <div className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-3" role="note">
                Bot Telegram chưa được cấu hình trên hệ thống nên chưa gửi được tin. Quản trị viên cần lưu token bot vào
                Supabase Vault (xem <span className="font-mono">docs/TELEGRAM.md</span>). Bạn vẫn có thể lưu Chat ID trước.
              </div>
            )}

            <ol className="text-xs text-slate-700 space-y-2 list-decimal pl-4">
              <li>
                Mở bot{' '}
                {botLink ? (
                  <a href={botLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-indigo-700 hover:underline">
                    @{info.botUsername} <ExternalLink className="w-3 h-3" aria-hidden="true" />
                  </a>
                ) : (
                  'của hệ thống'
                )}{' '}
                trên Telegram và bấm <strong>Start</strong> (bắt buộc, nếu không bot không nhắn được cho bạn).
              </li>
              <li>
                Lấy <strong>Chat ID</strong> của bạn: nhắn cho bot <span className="font-mono">@userinfobot</span>, nó trả về
                dòng <span className="font-mono">Id: 123456789</span>.
              </li>
              <li>Dán dãy số đó vào ô bên dưới rồi bấm <strong>Lưu &amp; gửi thử</strong>.</li>
            </ol>

            <div>
              <label htmlFor="tg-chat-id" className="block text-xs font-semibold text-slate-700 mb-1">
                Telegram Chat ID
              </label>
              <input
                id="tg-chat-id"
                inputMode="numeric"
                autoComplete="off"
                value={chatId}
                onChange={e => setChatId(e.target.value)}
                placeholder="VD: 123456789"
                className={inputCls}
              />
              <p className="text-[11px] text-slate-500 mt-1">Để trống rồi Lưu để gỡ liên kết.</p>
            </div>

            <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={enabled}
                onChange={e => setEnabled(e.target.checked)}
                className="rounded border-slate-300 text-indigo-600"
              />
              <span>Nhận nhắc nhở qua Telegram (deadline quá hạn / sắp đến hạn, nhắc việc từ PM)</span>
            </label>

            {result && (
              <div
                role="status"
                className={`text-xs rounded-lg border p-3 ${
                  result.ok ? 'text-emerald-800 bg-emerald-50 border-emerald-200' : 'text-rose-800 bg-rose-50 border-rose-200'
                }`}
              >
                {result.message}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
              <button
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 rounded-lg"
              >
                Đóng
              </button>
              <button
                disabled={busy !== null}
                onClick={() => void save(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg disabled:opacity-60"
              >
                {busy === 'save' ? 'Đang lưu…' : 'Lưu'}
              </button>
              <button
                disabled={busy !== null || chatId.trim() === ''}
                onClick={() => void save(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs disabled:opacity-60"
              >
                {busy === 'test' && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
                <span>{busy === 'test' ? 'Đang gửi thử…' : 'Lưu & gửi thử'}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};
