import React, { useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { NavigationTab } from '../../types';
import { projectColor } from '../../utils/projectColor';
import {
  LayoutDashboard,
  FolderKanban,
  CheckSquare,
  Boxes,
  ShieldCheck,
  FileBarChart2,
  Users2,
  RotateCcw,
  Clock,
  LogOut,
  Plus,
  X
} from 'lucide-react';

interface NavItem {
  id: NavigationTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number | string;
}

interface SidebarProps {
  /** Ngăn kéo đang mở (chỉ có tác dụng trên màn hình nhỏ; từ lg trở lên thanh bên luôn hiện). */
  open: boolean;
  onClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ open, onClose }) => {
  const {
    activeTab,
    setActiveTab,
    projects,
    activeProjectId,
    setActiveProjectId,
    tasks,
    projectTasks,
    projectUseCases,
    projectQualityGates,
    currentUser,
    isAdmin,
    seedDemoData,
    scanDeadlines,
    signOut
  } = useApp();

  const totalQualityItems = projectQualityGates?.phases.reduce((sum, p) => sum + p.items.length, 0) || 0;
  const passedQualityItems = projectQualityGates?.phases.reduce(
    (sum, p) => sum + p.items.filter(i => i.isPassed).length,
    0
  ) || 0;

  const taskCountByProject = useMemo(() => {
    const m = new Map<string, number>();
    tasks.forEach(t => m.set(t.projectId, (m.get(t.projectId) || 0) + 1));
    return m;
  }, [tasks]);

  const navItems: NavItem[] = [
    {
      id: 'dashboard',
      label: 'Tổng Quan (Dashboard)',
      icon: LayoutDashboard
    },
    {
      id: 'projects',
      label: 'Danh Sách Dự Án',
      icon: FolderKanban
    },
    {
      id: 'tasks',
      label: 'Nhiệm Vụ & Kanban',
      icon: CheckSquare,
      badge: projectTasks.length
    },
    {
      id: 'usecases',
      label: 'Quản Lý Use Case',
      icon: Boxes,
      badge: projectUseCases.length
    },
    {
      id: 'quality',
      label: 'Tiêu Chuẩn Quality Gates',
      icon: ShieldCheck,
      badge: `${passedQualityItems}/${totalQualityItems}`
    },
    {
      id: 'reports',
      label: 'Báo Cáo Định Kỳ',
      icon: FileBarChart2
    },
    {
      id: 'team',
      label: 'Đội Ngũ & Phân Quyền',
      icon: Users2
    }
  ];

  const roleBadgeMap: Record<string, { label: string; color: string; desc: string }> = {
    admin: { label: 'Quản Trị Viên (Admin)', color: 'bg-indigo-100 text-indigo-800 border-indigo-200', desc: 'Toàn quyền cấu hình & duyệt' },
    pm: { label: 'Quản Lý Dự Án (PM)', color: 'bg-emerald-100 text-emerald-800 border-emerald-200', desc: 'Quản lý tiến độ & phân công' },
    developer: { label: 'Lập Trình Viên (Dev)', color: 'bg-blue-100 text-blue-800 border-blue-200', desc: 'Cập nhật việc & usecase' },
    qa: { label: 'Kiểm Thử Viên (QA)', color: 'bg-amber-100 text-amber-800 border-amber-200', desc: 'Đánh giá tiêu chuẩn & test' },
    viewer: { label: 'Khách Hàng (Viewer)', color: 'bg-slate-100 text-slate-700 border-slate-200', desc: 'Chỉ xem báo cáo' }
  };

  const currentRoleInfo = roleBadgeMap[currentUser.role] || roleBadgeMap.admin;

  return (
    <>
      {/* Lớp phủ khi ngăn kéo mở trên màn hình nhỏ */}
      {open && <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={onClose} aria-hidden="true" />}

      <aside
        id="app-sidebar"
        aria-label="Thanh điều hướng"
        className={`theme-fixed fixed inset-y-0 left-0 z-40 w-64 max-w-[85vw] bg-slate-900 text-slate-300 flex flex-col shrink-0 border-r border-slate-800 select-none transition-transform duration-200 lg:static lg:z-auto lg:max-w-none lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full max-lg:invisible'
        }`}
      >
        {/* Sidebar Header Brand */}
        <div className="h-16 flex items-center justify-between px-5 border-b border-slate-800/80 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-500/40 text-indigo-400 flex items-center justify-center font-bold text-sm">
              PM
            </div>
            <div>
              <div className="text-sm font-bold text-white tracking-wide">OMNIPROJECT</div>
              <div className="text-[10px] text-slate-400 tracking-wider uppercase font-mono">Quản Trị Dự Án & QA</div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="lg:hidden p-1.5 -mr-2 text-slate-400 hover:text-white rounded-lg"
            aria-label="Đóng menu"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Điều hướng + danh sách dự án */}
        <div className="flex-1 overflow-y-auto">
          <nav className="px-3 py-4 space-y-1" aria-label="Menu chính">
            <div className="px-3 pb-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider font-mono">
              Menu Điều Hướng
            </div>
            {navItems.map(item => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id);
                    onClose();
                  }}
                  aria-current={isActive ? 'page' : undefined}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                    <span className="truncate">{item.label}</span>
                  </div>
                  {item.badge !== undefined && (
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded-md tabular-nums ${
                        isActive
                          ? 'bg-indigo-900/40 text-white'
                          : 'bg-slate-800 text-slate-400 border border-slate-700/50'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          <section className="px-3 pb-4" aria-label="Dự án">
            <div className="px-3 pb-2 flex items-center justify-between text-[10px] font-semibold text-slate-400 uppercase tracking-wider font-mono border-t border-slate-800/80 mt-1 pt-4">
              <span>Dự án ({projects.length})</span>
              {isAdmin && (
                <button
                  onClick={() => {
                    setActiveTab('projects');
                    onClose();
                  }}
                  className="p-1 -mr-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800"
                  title="Tạo dự án mới"
                  aria-label="Tạo dự án mới"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <div className="space-y-1">
              {projects.map(p => {
                const isActive = p.id === activeProjectId;
                const color = projectColor(p.code);
                return (
                  <button
                    key={p.id}
                    onClick={() => {
                      setActiveProjectId(p.id);
                      onClose();
                    }}
                    aria-current={isActive ? 'true' : undefined}
                    className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${
                      isActive
                        ? 'bg-slate-800 border-slate-700 text-white'
                        : 'border-transparent text-slate-300 hover:bg-slate-800/60 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${color.bg}`} />
                      <span className="text-xs font-semibold truncate flex-1">{p.name}</span>
                      <span className="text-[10px] font-mono text-slate-400 shrink-0">{p.code}</span>
                    </div>
                    <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-400 pl-4.5">
                      <span>{taskCountByProject.get(p.id) || 0} việc</span>
                      <span className="font-mono tabular-nums">{p.progressPercent}%</span>
                    </div>
                    <div className="ml-4.5 mt-1 h-1 rounded-full bg-slate-700 overflow-hidden" aria-hidden="true">
                      <div className={`h-full rounded-full ${color.bg}`} style={{ width: `${p.progressPercent}%` }} />
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        {/* Role & User Context Card */}
        <div className="p-3 border-t border-slate-800/80 bg-slate-950/40 shrink-0">
          <div className="p-2.5 rounded-lg bg-slate-800/60 border border-slate-700/50">
            <div className="flex items-center justify-between text-[11px] mb-1.5">
              <span className="text-slate-400 font-mono uppercase text-[10px]">Vai trò hiện tại:</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-medium border ${currentRoleInfo.color}`}>
                {currentUser.role.toUpperCase()}
              </span>
            </div>
            <div className="text-xs font-semibold text-white truncate">{currentUser.name}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">{currentRoleInfo.desc}</div>
          </div>

          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 pt-1">
            {isAdmin ? (
              <button
                onClick={scanDeadlines}
                className="flex items-center gap-1.5 text-[11px] text-slate-400 hover:text-amber-400 transition-colors"
                title="Quét ngay task quá hạn / sắp đến hạn và tạo thông báo (hệ thống cũng tự quét lúc 8:00 mỗi sáng)"
              >
                <Clock className="w-3 h-3" />
                <span>Quét deadline</span>
              </button>
            ) : (
              <span />
            )}
            {isAdmin ? (
              <button
                onClick={() => {
                  if (window.confirm('Nạp thêm 3 dự án demo? (Bỏ qua nếu đã nạp trước đó)')) {
                    seedDemoData();
                  }
                }}
                className="flex items-center gap-1.5 text-[11px] text-slate-400 hover:text-indigo-400 transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Nạp dữ liệu demo</span>
              </button>
            ) : (
              <span />
            )}
            <button
              onClick={() => void signOut()}
              className="flex items-center gap-1.5 text-[11px] text-slate-400 hover:text-rose-400 transition-colors"
            >
              <LogOut className="w-3 h-3" />
              <span>Đăng xuất</span>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};
