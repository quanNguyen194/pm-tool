import React from 'react';
import { useApp } from '../../context/AppContext';
import { NavigationTab } from '../../types';
import {
  LayoutDashboard,
  FolderKanban,
  CheckSquare,
  Boxes,
  ShieldCheck,
  FileBarChart2,
  Users2,
  RotateCcw,
  LogOut,
  Sparkles,
  Info
} from 'lucide-react';

interface NavItem {
  id: NavigationTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number | string;
}

export const Sidebar: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
    projectTasks,
    projectUseCases,
    projectQualityGates,
    currentUser,
    isAdmin,
    seedDemoData,
    signOut
  } = useApp();

  const totalQualityItems = projectQualityGates?.phases.reduce((sum, p) => sum + p.items.length, 0) || 0;
  const passedQualityItems = projectQualityGates?.phases.reduce(
    (sum, p) => sum + p.items.filter(i => i.isPassed).length,
    0
  ) || 0;

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
    <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col shrink-0 border-r border-slate-800 select-none">
      {/* Sidebar Header Brand */}
      <div className="h-16 flex items-center px-5 border-b border-slate-800/80">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-500/40 text-indigo-400 flex items-center justify-center font-bold text-sm">
            PM
          </div>
          <div>
            <div className="text-sm font-bold text-white tracking-wide">OMNIPROJECT</div>
            <div className="text-[10px] text-slate-400 tracking-wider uppercase font-mono">Quản Trị Dự Án & QA</div>
          </div>
        </div>
      </div>

      {/* Navigation Items */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <div className="px-3 pb-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider font-mono">
          Menu Điều Hướng
        </div>
        {navItems.map(item => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
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
                      ? 'bg-white/20 text-white'
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

      {/* Role & User Context Card */}
      <div className="p-3 border-t border-slate-800/80 bg-slate-950/40">
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

        <div className="mt-2.5 flex items-center justify-between pt-1">
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
  );
};
