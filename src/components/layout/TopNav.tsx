import React, { useEffect, useRef } from 'react';
import {
  LayoutDashboard,
  FolderKanban,
  CheckSquare,
  Boxes,
  ShieldCheck,
  FileBarChart2,
  Users2
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { NavigationTab } from '../../types';

interface NavItem {
  id: NavigationTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number | string;
}

/** Menu điều hướng chính, hiển thị ngang dưới thanh trên. Các mục và nhãn giữ nguyên như menu bên trái trước đây. */
export const TopNav: React.FC = () => {
  const { activeTab, setActiveTab, projectTasks, projectUseCases, projectQualityGates } = useApp();

  const totalQualityItems = projectQualityGates?.phases.reduce((sum, p) => sum + p.items.length, 0) || 0;
  const passedQualityItems =
    projectQualityGates?.phases.reduce((sum, p) => sum + p.items.filter(i => i.isPassed).length, 0) || 0;

  const items: NavItem[] = [
    { id: 'dashboard', label: 'Tổng Quan (Dashboard)', icon: LayoutDashboard },
    { id: 'projects', label: 'Danh Sách Dự Án', icon: FolderKanban },
    { id: 'tasks', label: 'Nhiệm Vụ & Kanban', icon: CheckSquare, badge: projectTasks.length },
    { id: 'usecases', label: 'Quản Lý Use Case', icon: Boxes, badge: projectUseCases.length },
    { id: 'quality', label: 'Tiêu Chuẩn Quality Gates', icon: ShieldCheck, badge: `${passedQualityItems}/${totalQualityItems}` },
    { id: 'reports', label: 'Báo Cáo Định Kỳ', icon: FileBarChart2 },
    { id: 'team', label: 'Đội Ngũ & Phân Quyền', icon: Users2 }
  ];

  // Trên màn hình hẹp menu cuộn ngang: đưa mục đang chọn vào tầm nhìn.
  const activeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView?.({ block: 'nearest', inline: 'center' });
  }, [activeTab]);

  return (
    <nav aria-label="Menu chính" className="bg-white border-b border-slate-200">
      <div className="flex items-center gap-1 px-3 sm:px-6 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map(item => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              ref={isActive ? activeRef : undefined}
              onClick={() => setActiveTab(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`shrink-0 my-1.5 inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                isActive
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-indigo-600' : 'text-slate-500'}`} />
              <span>{item.label}</span>
              {item.badge !== undefined && (
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.5 rounded-md tabular-nums ${
                    isActive ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
