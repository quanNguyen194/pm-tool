import React, { useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { COLOR_BADGE, issueCode } from '../issues/issueUi';

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Thẻ tổng quan Lỗi & Yêu cầu trên Dashboard: số còn mở / quá hạn / ưu tiên cao, phân bổ theo nhóm trạng thái và 5 issue đáng chú ý nhất. */
export const IssueSummaryCard: React.FC = () => {
  const { issuesAvailable, projectIssues, issueStatuses, issuePriorities, allUsers, setActiveTab, openIssue, canCreateIssue } = useApp();

  const data = useMemo(() => {
    const status = new Map(issueStatuses.map(s => [s.id, s]));
    const prioRank = new Map(issuePriorities.map((p, i) => [p.id, i]));
    const today = todayIso();
    const open = projectIssues.filter(i => status.get(i.statusId)?.category !== 'closed');
    const overdue = (i: (typeof projectIssues)[number]) => !!i.dueDate && i.dueDate < today;
    // "Ưu tiên cao" = hai mức cao nhất đang bật theo thứ tự cấu hình
    const topPrios = issuePriorities.filter(p => p.active).slice(0, 2);
    const topIds = new Set(topPrios.map(p => p.id));
    const byCat = { open: 0, in_progress: 0, closed: 0 };
    projectIssues.forEach(i => {
      const c = status.get(i.statusId)?.category;
      if (c) byCat[c]++;
    });
    const notable = [...open]
      .sort(
        (a, b) =>
          Number(overdue(b)) - Number(overdue(a)) ||
          (prioRank.get(a.priorityId) ?? 99) - (prioRank.get(b.priorityId) ?? 99) ||
          a.createdAt.localeCompare(b.createdAt)
      )
      .slice(0, 5);
    return {
      status,
      open: open.length,
      overdue: open.filter(overdue).length,
      high: open.filter(i => topIds.has(i.priorityId)).length,
      highLabel: topPrios.map(p => p.name).join(' + ') || 'Ưu tiên cao',
      byCat,
      notable,
      overdueOf: overdue
    };
  }, [projectIssues, issueStatuses, issuePriorities]);

  if (!issuesAvailable) return null;
  const total = projectIssues.length;
  const userName = (id?: string) => allUsers.find(u => u.id === id)?.name;
  const prio = (id: string) => issuePriorities.find(p => p.id === id);

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5" aria-label="Tổng quan lỗi và yêu cầu">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-slate-900">Lỗi & Yêu Cầu Thay Đổi</h3>
          <p className="text-xs text-slate-500">Tình hình xử lý bug và yêu cầu thay đổi của dự án</p>
        </div>
        <button onClick={() => setActiveTab('issues')} className="shrink-0 text-xs text-indigo-600 hover:text-indigo-800 font-medium">
          Xem tất cả →
        </button>
      </div>

      {total === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-xs text-slate-600">
          Chưa có lỗi hay yêu cầu thay đổi nào được ghi nhận.
          {canCreateIssue && (
            <div className="mt-2">
              <button onClick={() => setActiveTab('issues')} className="font-semibold text-indigo-700 hover:text-indigo-900">
                Mở tab Lỗi & Yêu Cầu để ghi nhận →
              </button>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-slate-50 border border-slate-100 p-2.5">
              <div className="text-[10px] text-slate-600">Còn mở</div>
              <div className="text-lg font-bold font-mono tabular-nums text-indigo-700">{data.open}</div>
            </div>
            <div className={`rounded-lg border p-2.5 ${data.overdue > 0 ? 'bg-rose-50 border-rose-100' : 'bg-slate-50 border-slate-100'}`}>
              <div className={`text-[10px] ${data.overdue > 0 ? 'text-rose-700' : 'text-slate-600'}`}>Quá hạn xử lý</div>
              <div className={`text-lg font-bold font-mono tabular-nums ${data.overdue > 0 ? 'text-rose-700' : 'text-slate-900'}`}>{data.overdue}</div>
            </div>
            <div className="rounded-lg bg-slate-50 border border-slate-100 p-2.5" title={`Issue còn mở ở mức ${data.highLabel}`}>
              <div className="text-[10px] text-slate-600 truncate">{data.highLabel}</div>
              <div className="text-lg font-bold font-mono tabular-nums text-slate-900">{data.high}</div>
            </div>
          </div>

          <div className="mt-4">
            <div className="h-3 w-full bg-slate-100 rounded-lg overflow-hidden flex" role="img" aria-label={`Còn mở ${data.byCat.open}, đang xử lý ${data.byCat.in_progress}, đã đóng ${data.byCat.closed}`}>
              <div style={{ width: `${(data.byCat.open / total) * 100}%` }} className="bg-amber-400 h-full" />
              <div style={{ width: `${(data.byCat.in_progress / total) * 100}%` }} className="bg-indigo-500 h-full" />
              <div style={{ width: `${(data.byCat.closed / total) * 100}%` }} className="bg-emerald-500 h-full" />
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-600">
              <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-amber-400" aria-hidden="true" /> Còn mở {data.byCat.open}</span>
              <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-indigo-500" aria-hidden="true" /> Đang xử lý {data.byCat.in_progress}</span>
              <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-500" aria-hidden="true" /> Đã đóng {data.byCat.closed}</span>
            </div>
          </div>

          {data.notable.length > 0 ? (
            <div className="mt-4">
              <div className="text-xs font-semibold text-slate-700 mb-1 uppercase tracking-wider font-mono">Đáng chú ý</div>
              <ul className="divide-y divide-slate-100">
                {data.notable.map(i => {
                  const st = data.status.get(i.statusId);
                  const pr = prio(i.priorityId);
                  const late = data.overdueOf(i);
                  const who = userName(i.assigneeId);
                  return (
                    <li key={i.id}>
                      <button onClick={() => openIssue(i.id)} className="w-full py-2 px-1 text-left text-xs hover:bg-slate-50 rounded">
                        <span className="flex items-center gap-2 min-w-0">
                          <span className="font-mono font-bold text-indigo-700 shrink-0">{issueCode(i)}</span>
                          <span className="font-medium text-slate-900 truncate">{i.title}</span>
                        </span>
                        <span className="mt-1 flex flex-wrap items-center gap-1.5">
                          {late && <span className="text-[10px] font-bold text-rose-700">Quá hạn</span>}
                          {pr && <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${COLOR_BADGE[pr.color]}`}>{pr.name}</span>}
                          {st && <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border whitespace-nowrap ${COLOR_BADGE[st.color]}`}>{st.name}</span>}
                          <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-slate-600 min-w-0">
                            <span className="w-4 h-4 shrink-0 rounded-full bg-slate-200 text-slate-800 text-[9px] font-bold flex items-center justify-center" aria-hidden="true">
                              {who ? who.charAt(0).toUpperCase() : '?'}
                            </span>
                            <span className="truncate max-w-[8rem]">{who ?? 'Chưa phân công'}</span>
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            <p className="mt-4 text-xs text-slate-600">Không còn issue nào đang mở.</p>
          )}
        </>
      )}
    </div>
  );
};
