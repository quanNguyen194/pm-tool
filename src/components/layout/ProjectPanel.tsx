import React, { useMemo } from 'react';
import { Plus } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { projectColor } from '../../utils/projectColor';

/**
 * Danh sách dự án ở bên trái (chỉ từ màn hình lg trở lên). Dưới lg dùng ô chọn dự án trên thanh trên.
 * Menu điều hướng chính nằm ở TopNav, vai trò + công cụ quản trị nằm trong menu tài khoản.
 */
export const ProjectPanel: React.FC = () => {
  const { projects, activeProjectId, setActiveProjectId, setActiveTab, tasks, isAdmin } = useApp();

  const taskCountByProject = useMemo(() => {
    const m = new Map<string, number>();
    tasks.forEach(t => m.set(t.projectId, (m.get(t.projectId) || 0) + 1));
    return m;
  }, [tasks]);

  return (
    <aside
      aria-label="Danh sách dự án"
      className="hidden lg:flex w-64 shrink-0 flex-col border-r border-slate-200 bg-slate-50/60 overflow-y-auto"
    >
      <div className="px-4 pt-4 pb-2 flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-500">
        <span>Dự án ({projects.length})</span>
        {isAdmin && (
          <button
            onClick={() => setActiveTab('projects')}
            className="p-1 -mr-1 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-200/70"
            title="Tạo dự án mới"
            aria-label="Tạo dự án mới"
          >
            <Plus className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="px-3 pb-4 space-y-1.5">
        {projects.map(p => {
          const isActive = p.id === activeProjectId;
          const color = projectColor(p.code);
          return (
            <button
              key={p.id}
              onClick={() => setActiveProjectId(p.id)}
              aria-current={isActive ? 'true' : undefined}
              className={`w-full text-left p-3 rounded-2xl border transition-colors ${
                isActive
                  ? 'bg-white border-slate-200 shadow-xs text-slate-900'
                  : 'border-transparent text-slate-600 hover:bg-white/70 hover:text-slate-900'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${color.bg}`} />
                <span className="text-xs font-semibold truncate flex-1" title={p.name}>{p.name}</span>
              </div>
              <div className="mt-0.5 pl-[18px] text-[10px] font-mono text-slate-500 truncate" title={p.code}>{p.code}</div>
              <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500 pl-[18px]">
                <span>{taskCountByProject.get(p.id) || 0} việc</span>
                <span className="font-mono tabular-nums">{p.progressPercent}%</span>
              </div>
              <div className="ml-[18px] mt-1.5 h-1 rounded-full bg-slate-200 overflow-hidden" aria-hidden="true">
                <div className={`h-full rounded-full ${color.bg}`} style={{ width: `${p.progressPercent}%` }} />
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
};
