import React from 'react';
import { AlertTriangle, Users } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { computeWorkload, countUnassigned } from '../../utils/workload';

/** Thanh xếp chồng: phần việc đang mở (tím) và đã xong (xanh) trên tổng số việc của một người. */
export const WorkloadBar: React.FC<{ active: number; done: number; className?: string }> = ({ active, done, className = '' }) => {
  const total = active + done;
  return (
    <div
      role="img"
      aria-label={`${active} việc đang mở, ${done} việc đã xong, tổng ${total}`}
      className={`flex h-2 w-full overflow-hidden rounded-full bg-slate-100 ${className}`}
    >
      {total > 0 && (
        <>
          <div className="bg-indigo-500 h-full transition-all" style={{ width: `${(active / total) * 100}%` }} />
          <div className="bg-emerald-500 h-full transition-all" style={{ width: `${(done / total) * 100}%` }} />
        </>
      )}
    </div>
  );
};

/** Bảng khối lượng công việc và giờ công theo từng thành viên của dự án đang chọn. */
export const WorkloadPanel: React.FC = () => {
  const { users, projectTasks, setActiveTab } = useApp();
  const rows = computeWorkload(users, projectTasks);
  const unassigned = countUnassigned(users, projectTasks);
  const maxActive = Math.max(1, ...rows.map(r => r.active));

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-indigo-600" />
          <div>
            <h3 className="text-sm font-bold text-slate-900">Khối Lượng Công Việc Theo Thành Viên</h3>
            <p className="text-xs text-slate-500">Việc đang mở, đã xong và giờ công của từng người</p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-slate-500">
          <span className="inline-flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-indigo-500" />Đang mở</span>
          <span className="inline-flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-emerald-500" />Đã xong</span>
          <button onClick={() => setActiveTab('team')} className="text-indigo-600 hover:text-indigo-800 font-medium">
            Đội ngũ →
          </button>
        </div>
      </div>

      <ul className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-4">
        {rows.map(r => (
          <li key={r.user.id} className="flex items-center gap-3">
            <div
              className={`w-8 h-8 rounded-full text-white text-xs font-bold flex items-center justify-center shrink-0 ${r.user.avatarColor}`}
              title={r.user.name}
            >
              {r.user.name.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 text-xs mb-1">
                <span className="font-semibold text-slate-800 truncate">
                  {r.user.name}
                  <span className="ml-1.5 font-mono text-[10px] font-normal text-slate-400">{r.user.role.toUpperCase()}</span>
                </span>
                <span className="font-mono tabular-nums text-slate-500 shrink-0">
                  {r.active} mở · {r.done} xong
                </span>
              </div>
              {/* Độ dài thanh theo số việc đang mở so với người nhiều việc nhất */}
              <div style={{ width: `${Math.max((r.active / maxActive) * 100, r.total > 0 ? 18 : 0)}%` }} className="min-w-0 transition-all">
                <WorkloadBar active={r.active} done={r.done} />
              </div>
              <div className="flex items-center justify-between gap-2 mt-1 text-[11px] text-slate-500">
                <span className="font-mono tabular-nums">
                  {r.actualHours}/{r.estimatedHours}h
                </span>
                {r.overdue > 0 ? (
                  <span className="inline-flex items-center gap-1 text-rose-600 font-semibold">
                    <AlertTriangle className="w-3 h-3" />
                    {r.overdue} quá hạn
                  </span>
                ) : (
                  r.urgentActive > 0 && <span className="text-amber-600 font-medium">{r.urgentActive} khẩn cấp</span>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>

      {unassigned > 0 && (
        <p className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-500">
          <strong className="text-amber-600">{unassigned} việc</strong> chưa có người phụ trách trong dự án này.
        </p>
      )}
    </div>
  );
};
