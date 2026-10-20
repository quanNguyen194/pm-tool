import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bug, Loader2, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import type { Issue, IssueSeverity, Priority } from '../../types';
import { PRIORITY_LABEL, SEVERITY_LABEL } from './issueUi';
import { SearchSelect } from '../common/SearchSelect';

interface Props {
  /** Có `issue` = chế độ sửa nội dung; không có = ghi nhận mới. */
  issue?: Issue;
  onClose: () => void;
  onCreated?: (id: string) => void;
}

const inputCls =
  'w-full text-xs border border-slate-300 rounded-lg px-3 py-2 bg-white text-slate-900 placeholder:text-slate-500 focus-visible:outline-2 focus-visible:outline-indigo-500';
const labelCls = 'block text-xs font-semibold text-slate-700 mb-1';

/** Ghi nhận issue mới hoặc sửa nội dung issue (người sửa phải có quyền sửa, hoặc là người báo khi issue còn ở trạng thái khởi tạo). */
export const IssueFormDialog: React.FC<Props> = ({ issue, onClose, onCreated }) => {
  const { issueTypes, canAssignIssue, users, projectUseCases, projectTasks, createIssue, updateIssue } = useApp();
  const editing = !!issue;

  const activeTypes = issueTypes.filter(t => t.active || t.id === issue?.typeId);
  const [typeId, setTypeId] = useState(issue?.typeId ?? issueTypes.find(t => t.active)?.id ?? '');
  const [title, setTitle] = useState(issue?.title ?? '');
  const [description, setDescription] = useState(issue?.description ?? '');
  const [priority, setPriority] = useState<Priority>(issue?.priority ?? 'medium');
  const [severity, setSeverity] = useState<string>(issue?.severity ?? '');
  const [environment, setEnvironment] = useState(issue?.environment ?? '');
  const [assigneeId, setAssigneeId] = useState('');
  const [dueDate, setDueDate] = useState(issue?.dueDate ?? '');
  const [useCaseId, setUseCaseId] = useState(issue?.useCaseId ?? '');
  const [taskId, setTaskId] = useState(issue?.taskId ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const ucOptions = useMemo(
    () =>
      projectUseCases
        .filter(u => u.kind !== 'group' && u.status !== 'cancelled')
        .map(u => ({ id: u.id, label: `${u.code} — ${u.title}` })),
    [projectUseCases]
  );
  const taskOptions = useMemo(() => projectTasks.map(t => ({ id: t.id, label: `${t.code} — ${t.title}` })), [projectTasks]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Hãy nhập tiêu đề.');
      return;
    }
    setBusy(true);
    setError('');
    if (!issue) {
      const res = await createIssue({
        typeId,
        title: title.trim(),
        description,
        priority,
        severity: severity || undefined,
        environment: environment.trim(),
        assigneeId: assigneeId || undefined,
        dueDate: dueDate || undefined,
        useCaseId: useCaseId || undefined,
        taskId: taskId || undefined
      });
      setBusy(false);
      if (res) {
        onCreated?.(res.id);
        onClose();
      }
      return;
    }
    // Sửa: chỉ gửi các trường thật sự thay đổi
    const changes: Record<string, string | null> = {};
    if (typeId !== issue.typeId) changes.type_id = typeId;
    if (title.trim() !== issue.title) changes.title = title.trim();
    if (description !== issue.description) changes.description = description;
    if (priority !== issue.priority) changes.priority = priority;
    if ((severity || null) !== (issue.severity ?? null)) changes.severity = severity || null;
    if (environment.trim() !== issue.environment) changes.environment = environment.trim();
    if ((dueDate || null) !== (issue.dueDate ?? null)) changes.due_date = dueDate || null;
    if ((useCaseId || null) !== (issue.useCaseId ?? null)) changes.use_case_id = useCaseId || null;
    if ((taskId || null) !== (issue.taskId ?? null)) changes.task_id = taskId || null;
    if (Object.keys(changes).length === 0) {
      setBusy(false);
      onClose();
      return;
    }
    const ok = await updateIssue(issue.id, changes);
    setBusy(false);
    if (ok) onClose();
  };

  return createPortal(
    <div className="modal-backdrop-in fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 dark:bg-black/60 backdrop-blur-[2px] p-4" onMouseDown={e => e.target === e.currentTarget && !busy && onClose()}>
      <form
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-label={editing ? 'Sửa nội dung issue' : 'Ghi nhận issue mới'}
        className="modal-pop-in bg-white border border-slate-200 rounded-xl shadow-xl w-full max-w-2xl max-h-[92vh] overflow-y-auto p-6"
      >
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100 mb-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-rose-50 border border-rose-100 text-rose-600">
              <Bug className="w-5 h-5" aria-hidden="true" />
            </span>
            <h3 className="text-base font-bold text-slate-900">{editing ? `Sửa issue #${issue!.number}` : 'Ghi nhận lỗi / yêu cầu thay đổi'}</h3>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Đóng">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-1">
              <label htmlFor="is-type" className={labelCls}>Loại</label>
              <select id="is-type" value={typeId} onChange={e => setTypeId(e.target.value)} className={inputCls}>
                {activeTypes.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.active ? '' : ' (đã ẩn)'}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="is-title" className={labelCls}>Tiêu đề *</label>
              <input id="is-title" autoFocus value={title} onChange={e => setTitle(e.target.value)} maxLength={200} placeholder="Mô tả ngắn gọn vấn đề" className={inputCls} />
            </div>
          </div>

          <div>
            <label htmlFor="is-desc" className={labelCls}>Mô tả chi tiết</label>
            <textarea
              id="is-desc"
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={5}
              placeholder={'Các bước tái hiện, kết quả thực tế, kết quả mong đợi…\n(ảnh/video đính kèm thêm ở phần Cập nhật sau khi tạo)'}
              className={inputCls}
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label htmlFor="is-pri" className={labelCls}>Độ ưu tiên</label>
              <select id="is-pri" value={priority} onChange={e => setPriority(e.target.value as Priority)} className={inputCls}>
                {(Object.keys(PRIORITY_LABEL) as Priority[]).map(p => (
                  <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="is-sev" className={labelCls}>Mức nghiêm trọng</label>
              <select id="is-sev" value={severity} onChange={e => setSeverity(e.target.value)} className={inputCls}>
                <option value="">Không xác định</option>
                {(Object.keys(SEVERITY_LABEL) as IssueSeverity[]).map(s => (
                  <option key={s} value={s}>{SEVERITY_LABEL[s]}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="is-due" className={labelCls}>Hạn xử lý</label>
              <input id="is-due" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label htmlFor="is-env" className={labelCls}>Môi trường</label>
              <input id="is-env" value={environment} onChange={e => setEnvironment(e.target.value)} maxLength={200} placeholder="UAT, PROD…" className={inputCls} />
            </div>
          </div>

          {!editing && canAssignIssue && (
            <div>
              <label htmlFor="is-asg" className={labelCls}>Người xử lý</label>
              <select id="is-asg" value={assigneeId} onChange={e => setAssigneeId(e.target.value)} className={inputCls}>
                <option value="">Chưa phân công</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <span className={labelCls}>Liên quan use case</span>
              <SearchSelect value={useCaseId} onChange={setUseCaseId} options={ucOptions} placeholder="Gõ mã hoặc tên use case…" ariaLabel="Use case liên quan" />
            </div>
            <div>
              <span className={labelCls}>Liên quan nhiệm vụ</span>
              <SearchSelect value={taskId} onChange={setTaskId} options={taskOptions} placeholder="Gõ mã hoặc tên nhiệm vụ…" ariaLabel="Nhiệm vụ liên quan" />
            </div>
          </div>
        </div>

        {error && (
          <p role="alert" className="mt-4 text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg p-2.5">
            {error}
          </p>
        )}

        <div className="mt-6 flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100">
          <button type="button" onClick={onClose} disabled={busy} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
            Hủy bỏ
          </button>
          <button type="submit" disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60">
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
            {editing ? 'Lưu thay đổi' : 'Ghi nhận issue'}
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
};
