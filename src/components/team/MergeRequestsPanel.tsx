import React from 'react';
import { GitMerge, Check, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';

/** Admin: các yêu cầu hợp nhất tài khoản ảo vào tài khoản thật vừa đăng ký trùng tên. */
export const MergeRequestsPanel: React.FC = () => {
  const { isAdmin, mergeRequests, allUsers, projects, tasks, resolveMerge } = useApp();
  if (!isAdmin || mergeRequests.length === 0) return null;

  const userMap = new Map(allUsers.map(u => [u.id, u]));

  return (
    <section
      className="bg-amber-50/70 border border-amber-300 rounded-2xl p-4 space-y-3"
      aria-label="Yêu cầu hợp nhất tài khoản"
    >
      <div className="flex items-center gap-2">
        <GitMerge className="w-4 h-4 text-amber-700" aria-hidden="true" />
        <h3 className="text-xs font-bold text-amber-900 uppercase tracking-wider">
          Yêu cầu hợp nhất tài khoản ({mergeRequests.length})
        </h3>
      </div>
      <p className="text-xs text-amber-900">
        Tài khoản mới đăng ký trùng tên với người bạn đã thêm trước (chưa đăng ký). Duyệt thì mọi dự án, nhiệm vụ và dữ liệu cũ
        của người đó chuyển sang tài khoản thật; từ chối thì giữ nguyên hai tài khoản riêng.
      </p>
      <ul className="space-y-2">
        {mergeRequests.map(r => {
          const ph = userMap.get(r.placeholderId);
          const real = userMap.get(r.userId);
          const projectCount = projects.filter(p => p.memberIds.includes(r.placeholderId)).length;
          const taskCount = tasks.filter(t => t.assigneeId === r.placeholderId || t.collaboratorIds.includes(r.placeholderId)).length;
          return (
            <li
              key={r.id}
              className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-white border border-amber-200 rounded-xl px-3 py-2.5"
            >
              <div className="text-xs text-slate-700 min-w-0 space-y-0.5">
                <div>
                  Tài khoản mới: <strong className="text-slate-900">{real?.name ?? '—'}</strong>
                  {real?.email && <span className="text-slate-500"> ({real.email})</span>}
                </div>
                <div>
                  Gộp với tài khoản chưa đăng ký: <strong className="text-slate-900">{ph?.name ?? '—'}</strong>
                  <span className="text-slate-500">
                    {' '}
                    · {projectCount} dự án · {taskCount} nhiệm vụ
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => {
                    if (window.confirm(`Hợp nhất "${ph?.name}" vào tài khoản ${real?.email || real?.name}?\nTài khoản chưa đăng ký sẽ bị xóa sau khi chuyển dữ liệu.`)) {
                      resolveMerge(r.id, true);
                    }
                  }}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Duyệt hợp nhất</span>
                </button>
                <button
                  onClick={() => resolveMerge(r.id, false)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Từ chối</span>
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
};
