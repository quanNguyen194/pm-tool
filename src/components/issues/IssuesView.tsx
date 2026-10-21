import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CircleDot, Download, Plus, Search, Settings2, UserRound, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import type { Issue } from '../../types';
import { norm } from '../../utils/text';
import { exportIssuesToCSV } from '../../utils/issueExport';
import { COLOR_BADGE, issueCode, matchesQuery } from './issueUi';
import { IssueFormDialog } from './IssueFormDialog';
import { IssueDetailDialog } from './IssueDetailDialog';
import { IssueConfigDialog } from './IssueConfigDialog';

type SortKey = 'updated' | 'number' | 'priority' | 'due';
const selCls = 'text-xs bg-slate-50 border border-slate-200 rounded-md px-2 py-1.5 text-slate-900 max-w-[11rem]';

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const fmtDay = (iso: string) => new Date(iso).toLocaleDateString('vi-VN');

const Badge: React.FC<{ color: keyof typeof COLOR_BADGE; children: React.ReactNode }> = ({ color, children }) => (
  <span className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded border whitespace-nowrap ${COLOR_BADGE[color]}`}>{children}</span>
);

export const IssuesView: React.FC = () => {
  const {
    activeProject, issuesAvailable, projectIssues, issueTypes, issueStatuses, issuePriorities, allUsers, users, currentUser,
    canCreateIssue, canConfigIssueTypes, canConfigIssueStatuses, focusIssue, clearFocusIssue, projectUseCases, projectTasks, getIssueAttachments
  } = useApp();

  const [query, setQuery] = useState('');
  const [fType, setFType] = useState('all');
  const [fStatus, setFStatus] = useState('open'); // open = chưa đóng
  const [fAssignee, setFAssignee] = useState('all');
  const [fPriority, setFPriority] = useState('all');
  const [sort, setSort] = useState<SortKey>('updated');
  const [createOpen, setCreateOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  // Mở từ thông báo
  useEffect(() => {
    if (!focusIssue || focusIssue.projectId !== activeProject?.id) return;
    if (projectIssues.some(i => i.id === focusIssue.issueId)) setDetailId(focusIssue.issueId);
    clearFocusIssue();
  }, [focusIssue, activeProject?.id, projectIssues]); // eslint-disable-line react-hooks/exhaustive-deps

  const typeMap = useMemo(() => new Map(issueTypes.map(t => [t.id, t])), [issueTypes]);
  const statusMap = useMemo(() => new Map(issueStatuses.map(s => [s.id, s])), [issueStatuses]);
  const priorityMap = useMemo(() => new Map(issuePriorities.map(p => [p.id, p])), [issuePriorities]);
  const userMap = useMemo(() => new Map(allUsers.map(u => [u.id, u])), [allUsers]);
  const isClosed = (i: Issue) => statusMap.get(i.statusId)?.category === 'closed';
  const today = todayIso();

  const kpi = useMemo(() => {
    const open = projectIssues.filter(i => !isClosed(i));
    return {
      total: projectIssues.length,
      open: open.length,
      mine: open.filter(i => i.assigneeId === currentUser.id).length,
      overdue: open.filter(i => i.dueDate && i.dueDate < today).length
    };
  }, [projectIssues, statusMap, currentUser.id, today]); // eslint-disable-line react-hooks/exhaustive-deps

  const normTitles = useMemo(() => new Map(projectIssues.map(i => [i.id, norm(i.title)])), [projectIssues]);

  const rows = useMemo(() => {
    const list = projectIssues.filter(i => {
      if (!matchesQuery(i, normTitles.get(i.id) ?? '', query, norm)) return false;
      if (fType !== 'all' && i.typeId !== fType) return false;
      if (fStatus === 'open' ? isClosed(i) : fStatus !== 'all' && i.statusId !== fStatus) return false;
      if (fAssignee === 'me' ? i.assigneeId !== currentUser.id : fAssignee === 'none' ? !!i.assigneeId : fAssignee !== 'all' && i.assigneeId !== fAssignee) return false;
      if (fPriority !== 'all' && i.priorityId !== fPriority) return false;
      return true;
    });
    list.sort((a, b) => {
      switch (sort) {
        case 'number': return b.number - a.number;
        case 'priority': return (priorityMap.get(a.priorityId)?.sort ?? 9999) - (priorityMap.get(b.priorityId)?.sort ?? 9999) || b.updatedAt.localeCompare(a.updatedAt);
        case 'due': return (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || b.updatedAt.localeCompare(a.updatedAt);
        default: return b.updatedAt.localeCompare(a.updatedAt);
      }
    });
    return list;
  }, [projectIssues, normTitles, query, fType, fStatus, fAssignee, fPriority, sort, statusMap, priorityMap, currentUser.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = query.trim() !== '' || fType !== 'all' || fStatus !== 'open' || fAssignee !== 'all' || fPriority !== 'all';
  const clearFilters = () => {
    setQuery('');
    setFType('all');
    setFStatus('open');
    setFAssignee('all');
    setFPriority('all');
  };

  if (!issuesAvailable) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-xs text-amber-900" role="note">
        <div className="flex items-center gap-2 font-bold text-sm mb-1.5">
          <AlertTriangle className="w-4 h-4" aria-hidden="true" /> Chức năng Lỗi & Yêu cầu chưa được bật
        </div>
        Cơ sở dữ liệu chưa có bảng issue hoặc độ ưu tiên. Quản trị viên cần chạy lần lượt các migration <span className="font-mono">0023_issues.sql</span> và{' '}
        <span className="font-mono">0025_issue_priorities.sql</span> (thư mục supabase/migrations) trong Supabase SQL Editor rồi tải lại trang.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex flex-wrap items-center gap-2">
            Lỗi & Yêu Cầu Thay Đổi
            <span className="text-xs font-mono font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded break-all min-w-0">[{activeProject.code}]</span>
          </h1>
          <p className="text-xs text-slate-600 mt-1">Ghi nhận, phân công và theo dõi bug, yêu cầu thay đổi (CR) của dự án. Mọi cập nhật được lưu vào nhật ký.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() =>
              exportIssuesToCSV(rows, {
                project: activeProject, types: issueTypes, statuses: issueStatuses, priorities: issuePriorities, users: allUsers,
                useCases: projectUseCases, tasks: projectTasks, attachmentCount: id => getIssueAttachments(id).length
              })
            }
            disabled={rows.length === 0}
            title={filtered ? 'Xuất danh sách đang lọc ra CSV' : 'Xuất toàn bộ issue đang hiển thị ra CSV'}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg disabled:opacity-50"
          >
            <Download className="w-4 h-4" aria-hidden="true" />
            <span>Xuất CSV</span>
          </button>
          {(canConfigIssueTypes || canConfigIssueStatuses) && (
            <button onClick={() => setConfigOpen(true)} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg">
              <Settings2 className="w-4 h-4" aria-hidden="true" />
              <span>Cấu hình</span>
            </button>
          )}
          {canCreateIssue && (
            <button onClick={() => setCreateOpen(true)} className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs">
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span>Ghi nhận issue</span>
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Tổng số issue', value: kpi.total, tone: 'text-slate-900' },
          { label: 'Còn mở', value: kpi.open, tone: 'text-indigo-700' },
          { label: 'Giao cho tôi (còn mở)', value: kpi.mine, tone: 'text-slate-900' },
          { label: 'Quá hạn xử lý', value: kpi.overdue, tone: kpi.overdue > 0 ? 'text-rose-700' : 'text-slate-900' }
        ].map(k => (
          <div key={k.label} className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">{k.label}</div>
            <div className={`mt-1 text-2xl font-bold font-mono tabular-nums ${k.tone}`}>{k.value}</div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-3 space-y-3">
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4 text-slate-500 shrink-0" aria-hidden="true" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Tìm theo mã (VD: #12) hoặc tên lỗi…"
            aria-label="Tìm issue theo mã hoặc tên"
            className="w-full text-xs placeholder:text-slate-500 text-slate-900 bg-transparent outline-none"
          />
          {query && (
            <button onClick={() => setQuery('')} aria-label="Xóa tìm kiếm" className="text-slate-500 hover:text-slate-700">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-slate-700">
          <label className="flex items-center gap-1.5">
            <span>Loại</span>
            <select value={fType} onChange={e => setFType(e.target.value)} className={selCls}>
              <option value="all">Tất cả</option>
              {issueTypes.map(t => (
                <option key={t.id} value={t.id}>{t.name}{t.active ? '' : ' (ẩn)'}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5">
            <span>Trạng thái</span>
            <select value={fStatus} onChange={e => setFStatus(e.target.value)} className={selCls}>
              <option value="open">Chưa đóng</option>
              <option value="all">Tất cả</option>
              {issueStatuses.map(s => (
                <option key={s.id} value={s.id}>{s.name}{s.active ? '' : ' (ẩn)'}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5">
            <span>Người xử lý</span>
            <select value={fAssignee} onChange={e => setFAssignee(e.target.value)} className={selCls}>
              <option value="all">Tất cả</option>
              <option value="me">Tôi</option>
              <option value="none">Chưa phân công</option>
              {users.filter(u => u.id !== currentUser.id).map(u => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5">
            <span>Ưu tiên</span>
            <select value={fPriority} onChange={e => setFPriority(e.target.value)} className={selCls}>
              <option value="all">Tất cả</option>
              {issuePriorities.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.active ? '' : ' (đã ẩn)'}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5">
            <span>Sắp xếp</span>
            <select value={sort} onChange={e => setSort(e.target.value as SortKey)} className={selCls}>
              <option value="updated">Mới cập nhật</option>
              <option value="number">Mã mới nhất</option>
              <option value="priority">Độ ưu tiên</option>
              <option value="due">Hạn xử lý</option>
            </select>
          </label>
          {filtered && (
            <button onClick={clearFilters} className="text-indigo-700 hover:underline">Xóa bộ lọc</button>
          )}
          <span className="ml-auto text-slate-600">{rows.length}/{projectIssues.length} issue</span>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-xs text-slate-600">
          <CircleDot className="w-6 h-6 mx-auto mb-2 text-slate-500" aria-hidden="true" />
          {projectIssues.length === 0
            ? canCreateIssue ? 'Dự án chưa có issue nào. Bấm "Ghi nhận issue" để tạo issue đầu tiên.' : 'Dự án chưa có issue nào.'
            : 'Không có issue nào khớp bộ lọc.'}
        </div>
      ) : (
        <>
          {/* Bảng (từ md) */}
          <div className="hidden md:block rounded-2xl border border-slate-200 bg-white overflow-x-auto">
            <table className="w-full text-xs text-left min-w-[760px]">
              <thead className="bg-slate-50 border-b border-slate-200 text-[11px] text-slate-700">
                <tr>
                  <th scope="col" className="py-2.5 px-3 w-16">Mã</th>
                  <th scope="col" className="py-2.5 px-3">Tiêu đề</th>
                  <th scope="col" className="py-2.5 px-3">Loại</th>
                  <th scope="col" className="py-2.5 px-3">Trạng thái</th>
                  <th scope="col" className="py-2.5 px-3">Ưu tiên</th>
                  <th scope="col" className="py-2.5 px-3">Người xử lý</th>
                  <th scope="col" className="py-2.5 px-3">Hạn</th>
                  <th scope="col" className="py-2.5 px-3">Cập nhật</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map(i => {
                  const type = typeMap.get(i.typeId);
                  const st = statusMap.get(i.statusId);
                  const late = i.dueDate && i.dueDate < today && st?.category !== 'closed';
                  return (
                    <tr key={i.id} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-3 font-mono font-bold text-indigo-700">{issueCode(i)}</td>
                      <td className="py-2.5 px-3 max-w-[22rem]">
                        <button onClick={() => setDetailId(i.id)} className="text-left font-semibold text-slate-900 hover:text-indigo-700 hover:underline break-words">
                          {i.title}
                        </button>
                      </td>
                      <td className="py-2.5 px-3">{type ? <Badge color={type.color}>{type.name}</Badge> : '—'}</td>
                      <td className="py-2.5 px-3">{st ? <Badge color={st.color}>{st.name}</Badge> : '—'}</td>
                      <td className="py-2.5 px-3">
                        {priorityMap.get(i.priorityId) ? <Badge color={priorityMap.get(i.priorityId)!.color}>{priorityMap.get(i.priorityId)!.name}</Badge> : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-slate-800">{i.assigneeId ? userMap.get(i.assigneeId)?.name ?? '—' : <span className="text-slate-600">Chưa phân công</span>}</td>
                      <td className={`py-2.5 px-3 font-mono tabular-nums ${late ? 'text-rose-700 font-bold' : 'text-slate-700'}`}>{i.dueDate ? fmtDay(i.dueDate) : '—'}</td>
                      <td className="py-2.5 px-3 text-slate-600 font-mono tabular-nums">{fmtDay(i.updatedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Thẻ (dưới md) */}
          <ul className="md:hidden space-y-2.5">
            {rows.map(i => {
              const type = typeMap.get(i.typeId);
              const st = statusMap.get(i.statusId);
              const late = i.dueDate && i.dueDate < today && st?.category !== 'closed';
              return (
                <li key={i.id}>
                  <button onClick={() => setDetailId(i.id)} className="w-full text-left rounded-2xl border border-slate-200 bg-white p-3.5 hover:border-slate-300">
                    <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                      <span className="font-mono text-xs font-bold text-indigo-700">{issueCode(i)}</span>
                      {type && <Badge color={type.color}>{type.name}</Badge>}
                      {st && <Badge color={st.color}>{st.name}</Badge>}
                      {priorityMap.get(i.priorityId) && <Badge color={priorityMap.get(i.priorityId)!.color}>{priorityMap.get(i.priorityId)!.name}</Badge>}
                    </div>
                    <div className="text-xs font-semibold text-slate-900 break-words">{i.title}</div>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600">
                      <span className="inline-flex items-center gap-1">
                        <UserRound className="w-3 h-3" aria-hidden="true" />
                        {i.assigneeId ? userMap.get(i.assigneeId)?.name ?? '—' : 'Chưa phân công'}
                      </span>
                      <span className={late ? 'text-rose-700 font-bold' : ''}>{i.dueDate ? `Hạn ${fmtDay(i.dueDate)}` : `Cập nhật ${fmtDay(i.updatedAt)}`}</span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {createOpen && <IssueFormDialog onClose={() => setCreateOpen(false)} onCreated={id => setDetailId(id)} />}
      {detailId && <IssueDetailDialog issueId={detailId} onClose={() => setDetailId(null)} />}
      {configOpen && <IssueConfigDialog onClose={() => setConfigOpen(false)} />}
    </div>
  );
};

