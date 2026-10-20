import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, ExternalLink, Film, Play, Trash2, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import type { AttachmentUsage, IssueAttachment } from '../../types';
import { formatBytes } from '../../utils/attachments';
import { useConfirm } from '../common/ConfirmDialog';

const fmt = (iso: string) => new Date(iso).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });

/** Lấy link xem có hạn cho danh sách tệp; tự lấy lại khi danh sách đổi. */
export function useAttachmentUrls(attachments: IssueAttachment[]) {
  const { getAttachmentUrls } = useApp();
  const [urls, setUrls] = useState<Record<string, string>>({});
  const key = attachments.map(a => a.storagePath).join('|');
  useEffect(() => {
    let alive = true;
    if (!attachments.length) {
      setUrls({});
      return;
    }
    getAttachmentUrls(attachments.map(a => a.storagePath)).then(u => alive && setUrls(u));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return urls;
}

const Lightbox: React.FC<{ items: IssueAttachment[]; urls: Record<string, string>; index: number; onIndex: (i: number) => void; onClose: () => void }> = ({
  items, urls, index, onIndex, onClose
}) => {
  const { allUsers } = useApp();
  const att = items[index];
  const url = att ? urls[att.storagePath] : undefined;
  const uploader = allUsers.find(u => u.id === att?.uploaderId)?.name;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft' && index > 0) onIndex(index - 1);
      else if (e.key === 'ArrowRight' && index < items.length - 1) onIndex(index + 1);
      else return;
      // Chặn các hộp thoại bên dưới (chi tiết issue) cùng phản ứng với phím này
      e.stopImmediatePropagation();
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [index, items.length, onClose, onIndex]);

  if (!att) return null;
  return createPortal(
    <div
      className="modal-backdrop-in fixed inset-0 z-[90] flex flex-col bg-black/90 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`Xem tệp ${att.fileName}`}
      onMouseDown={e => e.target === e.currentTarget && onClose()}
    >
      <div className="flex items-center justify-between gap-3 pb-3 text-white" onMouseDown={e => e.stopPropagation()}>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{att.fileName}</p>
          <p className="text-[11px] text-white/80">
            {formatBytes(att.sizeBytes)} · {uploader ?? 'Người dùng đã xóa'} · {fmt(att.createdAt)} · {index + 1}/{items.length}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {url && (
            <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-white/20">
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /> Mở tab mới
            </a>
          )}
          <button autoFocus onClick={onClose} aria-label="Đóng" className="rounded-lg bg-white/10 p-1.5 text-white hover:bg-white/20">
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center" onMouseDown={e => e.target === e.currentTarget && onClose()}>
        {index > 0 && (
          <button onClick={() => onIndex(index - 1)} aria-label="Tệp trước" className="absolute left-0 z-10 rounded-full bg-white/10 p-2 text-white hover:bg-white/25">
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}
        {!url ? (
          <p className="text-sm text-slate-200">Đang tải…</p>
        ) : att.kind === 'image' ? (
          <img src={url} alt={att.fileName} className="max-h-full max-w-full rounded object-contain" />
        ) : (
          <video key={att.id} src={url} controls autoPlay playsInline className="max-h-full max-w-full rounded bg-black" />
        )}
        {index < items.length - 1 && (
          <button onClick={() => onIndex(index + 1)} aria-label="Tệp sau" className="absolute right-0 z-10 rounded-full bg-white/10 p-2 text-white hover:bg-white/25">
            <ChevronRight className="h-6 w-6" />
          </button>
        )}
      </div>
    </div>,
    document.body
  );
};

/** Dung lượng đã dùng: của dự án, và (Admin) của cả kho tệp so với giới hạn mềm. */
const UsageMeter: React.FC<{ refreshKey: number }> = ({ refreshKey }) => {
  const { getAttachmentUsage } = useApp();
  const [usage, setUsage] = useState<AttachmentUsage | null>(null);
  useEffect(() => {
    let alive = true;
    getAttachmentUsage().then(u => alive && setUsage(u));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);
  if (!usage) return null;
  const pct = usage.totalBytes != null ? Math.min(100, Math.round((usage.totalBytes / usage.capBytes) * 100)) : 0;
  const bar = pct >= 90 ? 'bg-rose-500' : pct >= 70 ? 'bg-amber-500' : 'bg-indigo-500';
  return (
    <div className="mt-3 text-[11px] text-slate-600">
      <p>
        Dự án này dùng {formatBytes(usage.projectBytes)} cho {usage.projectCount} tệp đính kèm.
        {usage.totalBytes != null && <> Toàn hệ thống: {formatBytes(usage.totalBytes)} / {formatBytes(usage.capBytes)} ({pct}%).</>}
      </p>
      {usage.totalBytes != null && (
        <div
          role="progressbar"
          aria-label="Dung lượng kho tệp đính kèm"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          className="mt-1 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-slate-200"
        >
          <div className={`h-full ${bar}`} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
};

/** Lưới ảnh / video đã đính kèm vào issue; bấm để xem phóng to / phát video. */
export const AttachmentGallery: React.FC<{ attachments: IssueAttachment[]; canDelete: (a: IssueAttachment) => boolean }> = ({ attachments, canDelete }) => {
  const { allUsers, deleteIssueAttachment } = useApp();
  const confirm = useConfirm();
  const urls = useAttachmentUrls(attachments);
  const [open, setOpen] = useState<number | null>(null);
  const userName = useMemo(() => new Map(allUsers.map(u => [u.id, u.name])), [allUsers]);

  useEffect(() => {
    if (open !== null && open >= attachments.length) setOpen(attachments.length ? attachments.length - 1 : null);
  }, [attachments.length, open]);

  const remove = async (a: IssueAttachment) => {
    const ok = await confirm({
      title: 'Xóa tệp đính kèm?',
      message: 'Tệp sẽ bị xóa vĩnh viễn khỏi kho lưu trữ. Nhật ký vẫn ghi lại việc xóa.',
      target: { title: a.fileName, description: `${formatBytes(a.sizeBytes)} · ${userName.get(a.uploaderId ?? '') ?? 'Người dùng đã xóa'}` },
      confirmLabel: 'Xác nhận xóa',
      tone: 'danger'
    });
    if (ok) await deleteIssueAttachment(a.id);
  };

  if (!attachments.length) return <p className="text-xs text-slate-600">Chưa có ảnh / video nào.</p>;
  return (
    <>
      <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4" aria-label="Ảnh và video đính kèm">
        {attachments.map((a, i) => {
          const url = urls[a.storagePath];
          return (
            <li key={a.id} className="group relative overflow-hidden rounded-lg border border-slate-200 bg-white">
              <button
                type="button"
                onClick={() => setOpen(i)}
                className="relative block h-24 w-full bg-slate-100 focus-visible:outline-2 focus-visible:outline-indigo-500"
                aria-label={`Xem ${a.kind === 'image' ? 'ảnh' : 'video'} ${a.fileName}`}
              >
                {!url ? null : a.kind === 'image' ? (
                  <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <>
                    <video src={`${url}#t=0.1`} muted preload="metadata" playsInline className="h-full w-full object-cover" />
                    <span className="absolute inset-0 flex items-center justify-center bg-black/30">
                      <Play className="h-7 w-7 text-white" aria-hidden="true" />
                    </span>
                  </>
                )}
                {a.kind === 'video' && !url && <Film className="mx-auto h-6 w-6 text-slate-500" aria-hidden="true" />}
              </button>
              <div className="px-2 py-1.5">
                <p className="truncate text-[11px] font-medium text-slate-900" title={a.fileName}>{a.fileName}</p>
                <p className="truncate text-[10px] text-slate-600">
                  {formatBytes(a.sizeBytes)} · {userName.get(a.uploaderId ?? '') ?? '—'}
                </p>
              </div>
              {canDelete(a) && (
                <button
                  type="button"
                  onClick={() => void remove(a)}
                  aria-label={`Xóa tệp ${a.fileName}`}
                  className="absolute right-1 top-1 rounded-full bg-slate-900/70 p-1 text-white opacity-100 hover:bg-rose-700 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {open !== null && <Lightbox items={attachments} urls={urls} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />}
    </>
  );
};

export const AttachmentUsageMeter = UsageMeter;
