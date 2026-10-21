import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Paperclip } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import type { Issue, IssueStatusDef } from '../../types';
import { COLOR_BADGE, COLOR_DOT, issueCode } from './issueUi';

const PAGE = 30;
const fmtDay = (iso: string) => new Date(iso).toLocaleDateString('vi-VN');
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

interface Props {
  /** Issue đã qua bộ lọc (trừ lọc trạng thái, vì mỗi cột là một trạng thái), đã sắp xếp. */
  issues: Issue[];
  onOpen: (issueId: string) => void;
}

/** Kanban theo trạng thái: kéo thả thẻ (hoặc dùng ô "Chuyển sang…") để đổi trạng thái; mọi lần chuyển được ghi vào nhật ký như khi đổi trong hộp chi tiết. */
export const IssueBoard: React.FC<Props> = ({ issues, onOpen }) => {
  const { issueStatuses, issuePriorities, issueTypes, allUsers, canUpdateIssue, updateIssue, getIssueAttachments } = useApp();
  // Trạng thái hiển thị tạm thời ngay khi thả thẻ, trước khi máy chủ xác nhận
  const [moved, setMoved] = useState<Record<string, string>>({});
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [limit, setLimit] = useState<Record<string, number>>({});
  const today = todayIso();

  const statusOf = (i: Issue) => moved[i.id] ?? i.statusId;
  // Dữ liệu thật đã khớp thì bỏ trạng thái tạm
  useEffect(() => {
    setMoved(m => {
      const next = { ...m };
      let changed = false;
      for (const [id, sid] of Object.entries(m)) {
        if (issues.find(i => i.id === id)?.statusId === sid) {
          delete next[id];
          changed = true;
        }
      }
      return changed ? next : m;
    });
  }, [issues]);

  const prio = useMemo(() => new Map(issuePriorities.map(p => [p.id, p])), [issuePriorities]);
  const type = useMemo(() => new Map(issueTypes.map(t => [t.id, t])), [issueTypes]);
  const user = useMemo(() => new Map(allUsers.map(u => [u.id, u])), [allUsers]);

  const byStatus = useMemo(() => {
    const m = new Map<string, Issue[]>();
    issues.forEach(i => {
      const sid = moved[i.id] ?? i.statusId;
      (m.get(sid) ?? m.set(sid, []).get(sid)!).push(i);
    });
    return m;
  }, [issues, moved]);

  // Cột: mọi trạng thái đang bật + trạng thái đã ẩn nhưng còn issue (để issue không biến mất)
  const columns = useMemo(() => issueStatuses.filter(s => s.active || (byStatus.get(s.id)?.length ?? 0) > 0), [issueStatuses, byStatus]);
  const selectable = issueStatuses.filter(s => s.active);

  const move = async (issue: Issue, statusId: string) => {
    if (!canUpdateIssue || statusOf(issue) === statusId) return;
    setMoved(m => ({ ...m, [issue.id]: statusId }));
    const ok = await updateIssue(issue.id, { status_id: statusId });
    if (!ok) setMoved(m => {
      const { [issue.id]: _drop, ...rest } = m;
      return rest;
    });
  };

  const isOpenCol = (s: IssueStatusDef) => (s.category === 'closed' ? !!expanded[s.id] : expanded[s.id] !== false);

  return (
    <div className="relative flex gap-3 overflow-x-auto pb-3 items-start" role="list" aria-label="Bảng Kanban issue theo trạng thái">
      {columns.map(col => {
        const list = byStatus.get(col.id) ?? [];
        const open = isOpenCol(col);
        const shown = list.slice(0, limit[col.id] ?? PAGE);
        return (
          <section
            key={col.id}
            role="listitem"
            aria-label={`Cột ${col.name}, ${list.length} issue`}
            onDragOver={e => {
              if (!dragId) return;
              e.preventDefault();
              setOverCol(col.id);
            }}
            onDragLeave={() => setOverCol(c => (c === col.id ? null : c))}
            onDrop={e => {
              e.preventDefault();
              setOverCol(null);
              const issue = issues.find(i => i.id === (dragId ?? e.dataTransfer.getData('text/plain')));
              setDragId(null);
              if (issue) void move(issue, col.id);
            }}
            className={`w-72 shrink-0 rounded-2xl border bg-slate-50 p-2.5 ${overCol === col.id ? 'border-indigo-500 ring-2 ring-indigo-200' : 'border-slate-200'}`}
          >
            <button
              type="button"
              onClick={() => setExpanded(x => ({ ...x, [col.id]: !open }))}
              aria-expanded={open}
              className="w-full flex items-center justify-between gap-2 px-1 py-1 text-left"
            >
              <span className="flex items-center gap-1.5 min-w-0">
                {open ? <ChevronDown className="w-3.5 h-3.5 text-slate-600 shrink-0" aria-hidden="true" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-600 shrink-0" aria-hidden="true" />}
                <span className={`w-2 h-2 rounded-full shrink-0 ${COLOR_DOT[col.color]}`} aria-hidden="true" />
                <span className="text-xs font-bold text-slate-900 truncate">{col.name}</span>
                {!col.active && <span className="text-[10px] text-slate-600">(đã ẩn)</span>}
              </span>
              <span className="text-[11px] font-mono font-bold text-slate-700 bg-white border border-slate-200 rounded-full px-2 py-0.5 tabular-nums">{list.length}</span>
            </button>

            {open && (
              <div className="mt-2 space-y-2 min-h-[2.5rem]">
                {shown.map(i => {
                  const pr = prio.get(i.priorityId);
                  const ty = type.get(i.typeId);
                  const who = i.assigneeId ? user.get(i.assigneeId)?.name : undefined;
                  const late = !!i.dueDate && i.dueDate < today && col.category !== 'closed';
                  const files = getIssueAttachments(i.id).length;
                  return (
                    <article
                      key={i.id}
                      draggable={canUpdateIssue}
                      onDragStart={e => {
                        setDragId(i.id);
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', i.id);
                      }}
                      onDragEnd={() => {
                        setDragId(null);
                        setOverCol(null);
                      }}
                      className={`rounded-xl border border-slate-200 bg-white p-2.5 ${canUpdateIssue ? 'cursor-grab active:cursor-grabbing' : ''} ${dragId === i.id ? 'opacity-50' : ''}`}
                    >
                      <div className="flex flex-wrap items-center gap-1.5 mb-1">
                        <span className="font-mono text-[11px] font-bold text-indigo-700">{issueCode(i)}</span>
                        {ty && <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border whitespace-nowrap ${COLOR_BADGE[ty.color]}`}>{ty.name}</span>}
                        {pr && <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border whitespace-nowrap ${COLOR_BADGE[pr.color]}`}>{pr.name}</span>}
                      </div>
                      <button type="button" onClick={() => onOpen(i.id)} className="w-full text-left text-xs font-semibold text-slate-900 hover:text-indigo-700 break-words line-clamp-3">
                        {i.title}
                      </button>
                      <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-slate-600">
                        <span className="inline-flex items-center gap-1 min-w-0">
                          <span className="w-5 h-5 shrink-0 rounded-full bg-slate-200 text-slate-800 text-[10px] font-bold flex items-center justify-center" aria-hidden="true">
                            {who ? who.charAt(0).toUpperCase() : '?'}
                          </span>
                          <span className="truncate">{who ?? 'Chưa phân công'}</span>
                        </span>
                        <span className="inline-flex items-center gap-2 shrink-0">
                          {files > 0 && (
                            <span className="inline-flex items-center gap-0.5" title={`${files} tệp đính kèm`}>
                              <Paperclip className="w-3 h-3" aria-hidden="true" />
                              {files}
                            </span>
                          )}
                          {i.dueDate && <span className={late ? 'text-rose-700 font-bold' : ''}>{fmtDay(i.dueDate)}</span>}
                        </span>
                      </div>
                      {canUpdateIssue && (
                        <label className="mt-2 block">
                          <span className="sr-only">Trạng thái của issue {issueCode(i)} (chọn để chuyển)</span>
                          <select
                            value={statusOf(i)}
                            onChange={e => void move(i, e.target.value)}
                            className="w-full text-[11px] border border-slate-200 rounded-md px-1.5 py-1 bg-white text-slate-800"
                          >
                            {selectable.some(s => s.id === statusOf(i)) ? null : <option value={statusOf(i)}>{issueStatuses.find(s => s.id === statusOf(i))?.name} (đã ẩn)</option>}
                            {selectable.map(s => (
                              <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                          </select>
                        </label>
                      )}
                    </article>
                  );
                })}
                {list.length === 0 && <p className="text-[11px] text-slate-600 px-1 py-2">{dragId ? 'Thả vào đây' : 'Không có issue'}</p>}
                {list.length > shown.length && (
                  <button
                    type="button"
                    onClick={() => setLimit(l => ({ ...l, [col.id]: (l[col.id] ?? PAGE) + PAGE }))}
                    className="w-full text-[11px] font-medium text-indigo-700 hover:bg-white rounded-lg py-1.5"
                  >
                    Xem thêm ({list.length - shown.length})
                  </button>
                )}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
};
