import React, { useMemo, useState } from 'react';
import { ArrowRight, CornerDownRight, Loader2, Pencil, Reply, Trash2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import type { Issue, IssueJournal, User } from '../../types';
import { buildJournalTree, FIELD_LABEL, JournalNode } from './issueUi';
import { useConfirm } from '../common/ConfirmDialog';

const LONG_FIELDS = new Set(['description']);
const fmt = (iso: string) => new Date(iso).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });

const Avatar: React.FC<{ user?: User }> = ({ user }) => (
  <span
    className={`w-7 h-7 rounded-full text-white text-[11px] font-semibold flex items-center justify-center shrink-0 ${user?.avatarColor ?? 'bg-zinc-700'}`}
    aria-hidden="true"
  >
    {(user?.name ?? '?').charAt(0).toUpperCase()}
  </span>
);

const JournalItem: React.FC<{ node: JournalNode; depth: number; issue: Issue; userMap: Map<string, User> }> = ({ node, depth, issue, userMap }) => {
  const { updateIssue, editIssueNote, deleteIssueNote, canUpdateIssue, canDeleteIssue, currentUser, isAdmin } = useApp();
  const confirm = useConfirm();
  const j: IssueJournal = node.journal;
  const author = j.userId ? userMap.get(j.userId) : undefined;
  const mine = j.userId === currentUser.id;
  const [mode, setMode] = useState<'none' | 'reply' | 'edit'>('none');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const deleted = !!j.deletedAt;

  const submit = async () => {
    if (!text.trim()) return;
    setBusy(true);
    const ok = mode === 'reply' ? await updateIssue(issue.id, {}, text.trim(), j.id) : await editIssueNote(j.id, text.trim());
    setBusy(false);
    if (ok) {
      setMode('none');
      setText('');
    }
  };

  const remove = async () => {
    const ok = await confirm({
      title: 'Xóa nội dung ghi chú?',
      message: 'Nội dung ghi chú sẽ bị xóa. Nhật ký vẫn ghi lại rằng ghi chú này đã bị xóa; các trả lời bên dưới được giữ nguyên.',
      target: { title: (author?.name ?? 'Người dùng') + ' · ' + fmt(j.createdAt), description: j.notes },
      confirmLabel: 'Xác nhận xóa',
      tone: 'danger'
    });
    if (ok) await deleteIssueNote(j.id);
  };

  return (
    <li className={depth > 1 ? 'mt-3 pl-3 sm:pl-4 border-l-2 border-slate-200' : 'mt-4 first:mt-0'}>
      <div className="flex items-start gap-2.5">
        <Avatar user={author} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-slate-600">
            <strong className="text-xs text-slate-900">{author?.name ?? 'Người dùng đã xóa'}</strong>
            <span>{fmt(j.createdAt)}</span>
            {j.editedAt && !deleted && <span className="italic">(đã sửa {fmt(j.editedAt)})</span>}
            {depth > 1 && <CornerDownRight className="w-3 h-3" aria-label="Trả lời" />}
          </div>

          {j.details.length > 0 && (
            <ul className="mt-1.5 space-y-1 text-xs text-slate-800">
              {j.details.map(d => (
                <li key={d.id} className="flex flex-wrap items-center gap-1.5">
                  <strong>{FIELD_LABEL[d.field] ?? d.field}</strong>
                  {d.field === 'attachment' ? (
                    <>
                      <span>{d.newValue ? 'đã thêm' : 'đã xóa'}</span>
                      <span className="rounded bg-slate-100 border border-slate-200 px-1.5 py-0.5 text-slate-700 break-words max-w-full">{d.newValue ?? d.oldValue}</span>
                    </>
                  ) : LONG_FIELDS.has(d.field) ? (
                    <details className="inline">
                      <summary className="cursor-pointer text-indigo-700">đã được thay đổi (xem chi tiết)</summary>
                      <div className="mt-1 grid gap-1.5 sm:grid-cols-2">
                        <div className="rounded border border-rose-200 bg-rose-50 p-2 whitespace-pre-wrap break-words text-rose-800">{d.oldValue || '—'}</div>
                        <div className="rounded border border-emerald-200 bg-emerald-50 p-2 whitespace-pre-wrap break-words text-emerald-800">{d.newValue || '—'}</div>
                      </div>
                    </details>
                  ) : (
                    <>
                      <span>từ</span>
                      <span className="rounded bg-slate-100 border border-slate-200 px-1.5 py-0.5 text-slate-700 break-words max-w-full">{d.oldValue ?? '—'}</span>
                      <ArrowRight className="w-3 h-3 text-slate-500" aria-label="thành" />
                      <span className="rounded bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 text-indigo-800 font-medium break-words max-w-full">{d.newValue ?? '—'}</span>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}

          {deleted ? (
            <p className="mt-1.5 text-xs italic text-slate-600">Ghi chú này đã bị xóa.</p>
          ) : mode === 'edit' ? null : (
            j.notes && <p className="mt-1.5 text-xs text-slate-800 whitespace-pre-wrap break-words">{j.notes}</p>
          )}

          {mode !== 'none' && (
            <div className="mt-2">
              <label className="sr-only" htmlFor={`jn-${j.id}`}>{mode === 'reply' ? 'Nội dung trả lời' : 'Sửa ghi chú'}</label>
              <textarea
                id={`jn-${j.id}`}
                autoFocus
                value={text}
                onChange={e => setText(e.target.value)}
                rows={3}
                placeholder={mode === 'reply' ? 'Viết trả lời…' : ''}
                className="w-full text-xs border border-slate-300 rounded-lg px-3 py-2 bg-white text-slate-900 placeholder:text-slate-500"
              />
              <div className="mt-1.5 flex gap-2">
                <button
                  onClick={() => void submit()}
                  disabled={busy || !text.trim()}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 rounded-lg"
                >
                  {busy && <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />}
                  {mode === 'reply' ? 'Gửi trả lời' : 'Lưu'}
                </button>
                <button onClick={() => setMode('none')} className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg">
                  Hủy
                </button>
              </div>
            </div>
          )}

          {!deleted && mode === 'none' && (
            <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[11px]">
              {canUpdateIssue && depth < 3 && (
                <button onClick={() => { setMode('reply'); setText(''); }} className="inline-flex items-center gap-1 text-slate-600 hover:text-indigo-700">
                  <Reply className="w-3 h-3" aria-hidden="true" /> Trả lời
                </button>
              )}
              {j.notes && canUpdateIssue && (mine || isAdmin) && (
                <button onClick={() => { setMode('edit'); setText(j.notes); }} className="inline-flex items-center gap-1 text-slate-600 hover:text-indigo-700">
                  <Pencil className="w-3 h-3" aria-hidden="true" /> Sửa
                </button>
              )}
              {j.notes && canDeleteIssue && (
                <button onClick={() => void remove()} className="inline-flex items-center gap-1 text-rose-700 hover:text-rose-800">
                  <Trash2 className="w-3 h-3" aria-hidden="true" /> Xóa
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {node.children.length > 0 && (
        <ul>
          {node.children.map(c => (
            <JournalItem key={c.journal.id} node={c} depth={depth + 1} issue={issue} userMap={userMap} />
          ))}
        </ul>
      )}
    </li>
  );
};

/** Nhật ký hoạt động của issue dạng cây (kiểu Redmine): ai cập nhật gì, ghi chú, trả lời lồng nhau tối đa 3 cấp. */
export const JournalTree: React.FC<{ issue: Issue }> = ({ issue }) => {
  const { getIssueJournals, allUsers } = useApp();
  const journals = getIssueJournals(issue.id);
  const tree = useMemo(() => buildJournalTree(journals), [journals]);
  const userMap = useMemo(() => new Map(allUsers.map(u => [u.id, u])), [allUsers]);

  return (
    <section aria-label="Nhật ký hoạt động">
      <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3">Nhật ký hoạt động ({journals.length})</h4>
      {tree.length === 0 ? (
        <p className="text-xs text-slate-600">Chưa có hoạt động nào. Mọi thay đổi trạng thái, phân công và bình luận sẽ được ghi lại ở đây.</p>
      ) : (
        <ul>
          {tree.map(n => (
            <JournalItem key={n.journal.id} node={n} depth={1} issue={issue} userMap={userMap} />
          ))}
        </ul>
      )}
    </section>
  );
};
