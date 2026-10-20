import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Film, ImagePlus, Loader2, X } from 'lucide-react';
import { ACCEPT_ATTR, checkFile, checkPrepared, formatBytes, kindOfMime, mimeOf, nameForPasted, prepareImage } from '../../utils/attachments';

export interface PendingFile {
  key: string;
  file: File;
  kind: 'image' | 'video';
  previewUrl: string;
}

/** Danh sách tệp đang chờ tải lên: kiểm tra loại / dung lượng, nén ảnh, giữ link xem trước và dọn khi bỏ. */
export function usePendingFiles(slots: number) {
  const [items, setItems] = useState<PendingFile[]>([]);
  const [problems, setProblems] = useState<string[]>([]);
  const [processing, setProcessing] = useState(0);
  const itemsRef = useRef<PendingFile[]>([]);
  itemsRef.current = items;
  const slotsRef = useRef(slots);
  slotsRef.current = slots;

  useEffect(
    () => () => {
      itemsRef.current.forEach(i => URL.revokeObjectURL(i.previewUrl));
    },
    []
  );

  const add = useCallback(async (incoming: File[]) => {
    if (!incoming.length) return;
    const issues: string[] = [];
    const accepted: File[] = [];
    let room = slotsRef.current - itemsRef.current.length;
    for (const raw of incoming) {
      const f = nameForPasted(raw);
      const bad = checkFile(f);
      if (bad) issues.push(bad);
      else if (room <= 0) issues.push(`"${f.name}": đã đủ số tệp tối đa cho issue này.`);
      else {
        accepted.push(f);
        room--;
      }
    }
    setProblems([...issues]);
    if (!accepted.length) return;
    setProcessing(n => n + accepted.length);
    const ready: PendingFile[] = [];
    for (const f of accepted) {
      const prepared = await prepareImage(f);
      const bad = checkPrepared(prepared);
      if (bad) issues.push(bad);
      else {
        const kind = kindOfMime(mimeOf(prepared));
        if (kind) ready.push({ key: crypto.randomUUID(), file: prepared, kind, previewUrl: URL.createObjectURL(prepared) });
      }
      setProcessing(n => n - 1);
    }
    setProblems([...issues]);
    setItems(prev => [...prev, ...ready]);
  }, []);

  const remove = useCallback((key: string) => {
    setItems(prev => {
      const hit = prev.find(i => i.key === key);
      if (hit) URL.revokeObjectURL(hit.previewUrl);
      return prev.filter(i => i.key !== key);
    });
  }, []);

  const clear = useCallback(() => {
    setItems(prev => {
      prev.forEach(i => URL.revokeObjectURL(i.previewUrl));
      return [];
    });
    setProblems([]);
  }, []);

  return { items, files: items.map(i => i.file), problems, processing, add, remove, clear, slots };
}

export type PendingFiles = ReturnType<typeof usePendingFiles>;

/** Vùng chọn / kéo thả / dán (Ctrl+V) ảnh và video, kèm xem trước các tệp đã chọn. */
export const AttachmentPicker: React.FC<{ pending: PendingFiles; disabled?: boolean; id?: string }> = ({ pending, disabled, id = 'att' }) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const { items, problems, processing, add, remove, slots } = pending;
  const full = items.length >= slots;

  // Dán ảnh từ clipboard: chỉ nhận khi đang ở trong cùng hộp thoại với vùng này
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (disabled) return;
      const files = Array.from(e.clipboardData?.files ?? []);
      if (!files.length) return;
      const root = rootRef.current;
      const target = e.target as Node | null;
      const dialog = root?.closest('[role="dialog"]');
      if (!root || !target || !(dialog ? dialog.contains(target) : root.contains(target))) return;
      e.preventDefault();
      void add(files);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [add, disabled]);

  return (
    <div ref={rootRef}>
      <div
        onDragOver={e => {
          e.preventDefault();
          if (!disabled) setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={e => {
          e.preventDefault();
          setOver(false);
          if (!disabled) void add(Array.from(e.dataTransfer.files));
        }}
        className={`rounded-lg border-2 border-dashed px-3 py-3 text-center transition-colors ${
          over ? 'border-indigo-500 bg-indigo-50' : 'border-slate-300 bg-slate-50'
        }`}
      >
        <input
          ref={inputRef}
          id={id}
          type="file"
          multiple
          accept={ACCEPT_ATTR}
          className="sr-only"
          disabled={disabled || full}
          onChange={e => {
            void add(Array.from(e.target.files ?? []));
            e.target.value = '';
          }}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || full}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <ImagePlus className="w-3.5 h-3.5" aria-hidden="true" /> Chọn ảnh / video
        </button>
        <p className="mt-1.5 text-[11px] text-slate-600">
          hoặc kéo thả vào đây, hoặc dán ảnh chụp màn hình (Ctrl+V). Ảnh tối đa 5 MB (tự nén nếu lớn), video tối đa 45 MB; còn {Math.max(0, slots - items.length)} / {slots} chỗ.
        </p>
      </div>

      {processing > 0 && (
        <p role="status" className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-slate-700">
          <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" /> Đang xử lý {processing} tệp…
        </p>
      )}
      {problems.length > 0 && (
        <ul role="alert" className="mt-2 space-y-0.5 rounded-lg border border-rose-200 bg-rose-50 p-2 text-[11px] text-rose-800">
          {problems.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
      )}

      {items.length > 0 && (
        <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Tệp sẽ được đính kèm">
          {items.map(it => (
            <li key={it.key} className="relative overflow-hidden rounded-lg border border-slate-200 bg-white">
              {it.kind === 'image' ? (
                <img src={it.previewUrl} alt={it.file.name} className="h-20 w-full object-cover" />
              ) : (
                <div className="relative h-20 w-full bg-slate-900">
                  <video src={it.previewUrl} muted preload="metadata" className="h-full w-full object-cover opacity-80" />
                  <Film className="absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 text-white" aria-hidden="true" />
                </div>
              )}
              <div className="px-2 py-1">
                <p className="truncate text-[11px] font-medium text-slate-900" title={it.file.name}>{it.file.name}</p>
                <p className="text-[10px] text-slate-600">{formatBytes(it.file.size)}</p>
              </div>
              <button
                type="button"
                onClick={() => remove(it.key)}
                disabled={disabled}
                aria-label={`Bỏ tệp ${it.file.name}`}
                className="absolute right-1 top-1 rounded-full bg-slate-900/70 p-0.5 text-white hover:bg-slate-900 disabled:opacity-50"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
