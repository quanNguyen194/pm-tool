import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bug, Loader2, Pencil, Trash2, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { COLOR_BADGE, issueCode, PRIORITY_LABEL, PRIORITY_STYLE, SEVERITY_LABEL } from './issueUi';
import { JournalTree } from './JournalTree';
import { IssueFormDialog } from './IssueFormDialog';
import { AttachmentGallery, AttachmentUsageMeter } from './AttachmentGallery';
import { AttachmentPicker, usePendingFiles } from './AttachmentPicker';
import { MAX_FILES_PER_ISSUE } from '../../utils/attachments';
import { useConfirm } from '../common/ConfirmDialog';

const fmt = (iso?: string) => (iso ? new Date(iso).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' }) : '—');
const selectCls =
  'w-full text-xs border border-slate-300 rounded-lg px-3 py-2 bg-white text-slate-900 focus-visible:outline-2 focus-visible:outline-indigo-500';

const Prop: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <dt className="text-[11px] text-slate-600">{label}</dt>
    <dd className="mt-0.5 text-xs text-slate-900 break-words">{children}</dd>
  </div>
);

export const IssueDetailDialog: React.FC<{ issueId: string; onClose: () => void }> = ({ issueId, onClose }) => {
  const {
    projectIssues, issueTypes, issueStatuses, allUsers, users, projectUseCases, projectTasks, currentUser,
    canUpdateIssue, canEditIssue, canAssignIssue, canDeleteIssue, updateIssue, deleteIssue,
    attachmentsAvailable, getIssueAttachments
  } = useApp();
  const confirm = useConfirm();
  const issue = projectIssues.find(i => i.id === issueId);

  const [statusId, setStatusId] = useState(issue?.statusId ?? '');
  const [assigneeId, setAssigneeId] = useState(issue?.assigneeId ?? '');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const attachments = getIssueAttachments(issueId);
  const pending = usePendingFiles(Math.max(0, MAX_FILES_PER_ISSUE - attachments.length));

  // Dữ liệu đổi từ nơi khác (realtime) thì đồng bộ lại ô chọn
  useEffect(() => {
    if (issue) {
      setStatusId(issue.statusId);
      setAssigneeId(issue.assigneeId ?? '');
    }
  }, [issue?.statusId, issue?.assigneeId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !editOpen && !document.querySelector('[role="alertdialog"]') && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, editOpen]);

  const userMap = useMemo(() => new Map(allUsers.map(u => [u.id, u])), [allUsers]);
  if (!issue) {
    // issue vừa bị xóa
    return null;
  }

  const type = issueTypes.find(t => t.id === issue.typeId);
  const status = issueStatuses.find(s => s.id === issue.statusId);
  const uc = projectUseCases.find(u => u.id === issue.useCaseId);
  const task = projectTasks.find(t => t.id === issue.taskId);
  const statusOptions = issueStatuses.filter(s => s.active || s.id === issue.statusId);
  const canEditContent = canEditIssue || (issue.reporterId === currentUser.id && !!status?.initial);

  const changes: Record<string, string | null> = {};
  if (statusId !== issue.statusId) changes.status_id = statusId;
  if (canAssignIssue && (assigneeId || null) !== (issue.assigneeId ?? null)) changes.assignee_id = assigneeId || null;
  const dirty = Object.keys(changes).length > 0 || notes.trim() !== '' || pending.items.length > 0;

  const save = async () => {
    setBusy(true);
    const ok = await updateIssue(issue.id, changes, notes.trim(), undefined, pending.files);
    setBusy(false);
    if (ok) {
      setNotes('');
      pending.clear();
    }
  };

  const remove = async () => {
    const ok = await confirm({
      title: 'Xóa issue?',
      message: 'Issue và toàn bộ nhật ký của nó sẽ bị xóa vĩnh viễn. Hành động này không thể hoàn tác.',
      target: { title: issue.title, badge: issueCode(issue), description: issue.description },
      confirmLabel: 'Xác nhận xóa',
      tone: 'danger'
    });
    if (ok && (await deleteIssue(issue.id))) onClose();
  };

  return createPortal(
    <div className="modal-backdrop-in fixed inset-0 z-[60] flex items-start sm:items-center justify-center bg-slate-900/40 dark:bg-black/60 backdrop-blur-[2px] p-3 sm:p-4" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={`Chi tiết issue ${issueCode(issue)}`} className="modal-pop-in bg-white border border-slate-200 rounded-xl shadow-xl w-full max-w-5xl max-h-[94vh] overflow-y-auto">
        <div className="sticky top-0 z-10 bg-white border-b border-slate-100 px-5 py-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1 basis-[16rem]">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">{issueCode(issue)}</span>
              {type && <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${COLOR_BADGE[type.color]}`}>{type.name}</span>}
              {status && <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${COLOR_BADGE[status.color]}`}>{status.name}</span>}
            </div>
            <h2 className="mt-1.5 text-base font-bold text-slate-900 break-words flex items-start gap-2">
              <Bug className="w-4 h-4 mt-1 shrink-0 text-rose-600" aria-hidden="true" />
              <span>{issue.title}</span>
            </h2>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {canEditContent && (
              <button onClick={() => setEditOpen(true)} className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 border border-slate-300 hover:bg-slate-50 rounded-lg">
                <Pencil className="w-3.5 h-3.5" aria-hidden="true" /> Sửa
              </button>
            )}
            {canDeleteIssue && (
              <button onClick={() => void remove()} className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-rose-700 border border-rose-300 hover:bg-rose-50 rounded-lg">
                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" /> Xóa
              </button>
            )}
            <button onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Đóng">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-5 grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6 min-w-0">
            <section>
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2">Mô tả</h4>
              <p className="text-xs text-slate-800 whitespace-pre-wrap break-words">{issue.description || <span className="text-slate-600 italic">Chưa có mô tả.</span>}</p>
            </section>

            {attachmentsAvailable && (attachments.length > 0 || canUpdateIssue) && (
              <section aria-label="Tệp đính kèm">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2">
                  Ảnh / video đính kèm ({attachments.length}/{MAX_FILES_PER_ISSUE})
                </h4>
                <AttachmentGallery attachments={attachments} canDelete={a => canDeleteIssue || (a.uploaderId === currentUser.id && canUpdateIssue)} />
                <AttachmentUsageMeter refreshKey={attachments.length} />
              </section>
            )}

            {canUpdateIssue ? (
              <section className="rounded-xl border border-slate-200 bg-slate-50/60 p-4" aria-label="Cập nhật issue">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3">Cập nhật</h4>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="iu-status" className="block text-xs font-semibold text-slate-700 mb-1">Trạng thái</label>
                    <select id="iu-status" value={statusId} onChange={e => setStatusId(e.target.value)} className={selectCls}>
                      {statusOptions.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                          {s.active ? '' : ' (đã ẩn)'}
                        </option>
                      ))}
                    </select>
                  </div>
                  {canAssignIssue && (
                    <div>
                      <label htmlFor="iu-asg" className="block text-xs font-semibold text-slate-700 mb-1">Người xử lý</label>
                      <select id="iu-asg" value={assigneeId} onChange={e => setAssigneeId(e.target.value)} className={selectCls}>
                        <option value="">Chưa phân công</option>
                        {users.map(u => (
                          <option key={u.id} value={u.id}>{u.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
                <div className="mt-3">
                  <label htmlFor="iu-notes" className="block text-xs font-semibold text-slate-700 mb-1">Ghi chú / bình luận</label>
                  <textarea
                    id="iu-notes"
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    rows={3}
                    placeholder="Ghi chú về lần cập nhật này (kết quả test, nguyên nhân, cách xử lý…)"
                    className="w-full text-xs border border-slate-300 rounded-lg px-3 py-2 bg-white text-slate-900 placeholder:text-slate-500 focus-visible:outline-2 focus-visible:outline-indigo-500"
                  />
                </div>
                {attachmentsAvailable && attachments.length < MAX_FILES_PER_ISSUE && (
                  <div className="mt-3">
                    <span className="block text-xs font-semibold text-slate-700 mb-1">Đính kèm ảnh / video</span>
                    <AttachmentPicker pending={pending} disabled={busy} id="iu-files" />
                  </div>
                )}
                <div className="mt-3 flex items-center justify-end gap-2">
                  {dirty && (
                    <button
                      onClick={() => {
                        setStatusId(issue.statusId);
                        setAssigneeId(issue.assigneeId ?? '');
                        setNotes('');
                        pending.clear();
                      }}
                      className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg"
                    >
                      Hoàn tác
                    </button>
                  )}
                  <button
                    onClick={() => void save()}
                    disabled={busy || !dirty}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg"
                  >
                    {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
                    {busy && pending.items.length > 0 ? 'Đang tải lên…' : 'Lưu cập nhật'}
                  </button>
                </div>
              </section>
            ) : (
              <p className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-3">Bạn chỉ có quyền xem issue này.</p>
            )}

            <JournalTree issue={issue} />
          </div>

          <aside className="lg:col-span-1">
            <dl className="grid grid-cols-2 lg:grid-cols-1 gap-x-4 gap-y-3 rounded-xl border border-slate-200 p-4">
              <Prop label="Trạng thái">{status?.name ?? '—'}</Prop>
              <Prop label="Loại">{type?.name ?? '—'}</Prop>
              <Prop label="Độ ưu tiên">
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${PRIORITY_STYLE[issue.priority]}`}>{PRIORITY_LABEL[issue.priority]}</span>
              </Prop>
              <Prop label="Mức nghiêm trọng">{issue.severity ? SEVERITY_LABEL[issue.severity] : '—'}</Prop>
              <Prop label="Người báo">{issue.reporterId ? userMap.get(issue.reporterId)?.name ?? '—' : '—'}</Prop>
              <Prop label="Người xử lý">{issue.assigneeId ? userMap.get(issue.assigneeId)?.name ?? '—' : 'Chưa phân công'}</Prop>
              <Prop label="Hạn xử lý">{issue.dueDate ?? '—'}</Prop>
              <Prop label="Môi trường">{issue.environment || '—'}</Prop>
              <Prop label="Use case">{uc ? `${uc.code} — ${uc.title}` : '—'}</Prop>
              <Prop label="Nhiệm vụ">{task ? `${task.code} — ${task.title}` : '—'}</Prop>
              <Prop label="Ghi nhận lúc">{fmt(issue.createdAt)}</Prop>
              <Prop label="Cập nhật lúc">{fmt(issue.updatedAt)}</Prop>
              {issue.closedAt && <Prop label="Đóng lúc">{fmt(issue.closedAt)}</Prop>}
            </dl>
          </aside>
        </div>
      </div>
      {editOpen && <IssueFormDialog issue={issue} onClose={() => setEditOpen(false)} />}
    </div>,
    document.body
  );
};
