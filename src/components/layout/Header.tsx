import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Bell,
  Volume2,
  VolumeX,
  FileSpreadsheet,
  Printer,
  ChevronDown,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Shield,
  LogOut,
  RotateCcw,
  Send
} from 'lucide-react';
import { printPeriodicReport, exportTasksToCSV } from '../../utils/exportUtils';
import { ThemeToggle } from './ThemeToggle';
import { projectColor, projectInitials } from '../../utils/projectColor';

export const Header: React.FC = () => {
  const {
    projects,
    activeProjectId,
    setActiveProjectId,
    activeProject,
    currentUser,
    signOut,
    isAdmin,
    scanDeadlines,
    seedDemoData,
    canManageProject,
    users,
    notifications,
    unreadNotificationCount,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    sendDeadlineReminder,
    soundMuted,
    toggleSound,
    projectTasks,
    projectUseCases,
    projectQualityGates,
    projectSnapshots
  } = useApp();

  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false);
  const [isProjectDropdownOpen, setIsProjectDropdownOpen] = useState(false);

  const notifRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);
  const projRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setIsNotifOpen(false);
      }
      if (userRef.current && !userRef.current.contains(e.target as Node)) {
        setIsUserDropdownOpen(false);
      }
      if (projRef.current && !projRef.current.contains(e.target as Node)) {
        setIsProjectDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const roleNameMap: Record<string, string> = {
    admin: 'Quản trị viên (Admin)',
    pm: 'Quản lý dự án (PM)',
    developer: 'Lập trình viên (Dev)',
    qa: 'Kiểm thử viên (QA)',
    viewer: 'Khách hàng / Quan sát (Viewer)'
  };

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-2 sm:gap-3 h-14 px-3 sm:px-6 bg-white border-b border-slate-200">
      {/* Zone 1: Nút menu (màn hình nhỏ), thương hiệu và chọn dự án */}
      <div className="flex items-center gap-2 sm:gap-4 min-w-0">
        <div className="flex items-center gap-2 text-lg font-bold tracking-tight text-slate-900 shrink-0">
          <span className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-sm shadow-sm">
            OP
          </span>
          <span className="hidden md:inline">OmniProject</span>
        </div>

        {/* Project Selector Segment */}
        <div className="relative min-w-0" ref={projRef}>
          <button
            onClick={() => setIsProjectDropdownOpen(!isProjectDropdownOpen)}
            className="flex items-center gap-2 pl-1.5 pr-2.5 py-1.5 max-w-full text-xs font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors border border-slate-200"
            aria-haspopup="listbox"
            aria-expanded={isProjectDropdownOpen}
            title={`${activeProject.code} - ${activeProject.name}`}
          >
            <span
              className={`w-6 h-6 rounded-md ${projectColor(activeProject.code).bg} text-white text-[10px] font-bold flex items-center justify-center shrink-0`}
            >
              {projectInitials(activeProject.code)}
            </span>
            <span className="font-semibold text-slate-900 font-mono shrink-0">{activeProject.code}</span>
            <span className="truncate max-w-[200px] hidden lg:inline text-slate-600">{activeProject.name}</span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          </button>

          {isProjectDropdownOpen && (
            <div
              className="absolute left-0 mt-2 w-[min(22rem,calc(100vw-1.5rem))] max-h-[70vh] overflow-y-auto bg-white border border-slate-200 rounded-2xl shadow-xl py-2 z-50"
              role="listbox"
              aria-label="Chọn dự án"
            >
              <div className="px-3 py-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Chọn Dự Án Đang Làm Việc
              </div>
              <div className="divide-y divide-slate-100">
                {projects.map(p => {
                  const color = projectColor(p.code);
                  return (
                    <button
                      key={p.id}
                      role="option"
                      aria-selected={p.id === activeProjectId}
                      onClick={() => {
                        setActiveProjectId(p.id);
                        setIsProjectDropdownOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2.5 text-xs transition-colors hover:bg-slate-50 flex items-start gap-2.5 ${
                        p.id === activeProjectId ? 'bg-indigo-50/70 text-indigo-950 font-medium' : 'text-slate-700'
                      }`}
                    >
                      <span
                        className={`w-7 h-7 rounded-md ${color.bg} text-white text-[10px] font-bold flex items-center justify-center shrink-0`}
                      >
                        {projectInitials(p.code)}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold flex items-center gap-1.5">
                          <span className="text-indigo-600 font-mono shrink-0">[{p.code}]</span>
                          <span className="truncate">{p.name}</span>
                        </div>
                        <div className="mt-1.5 h-1 rounded-full bg-slate-200 overflow-hidden" aria-hidden="true">
                          <div className={`h-full rounded-full ${color.bg}`} style={{ width: `${p.progressPercent}%` }} />
                        </div>
                      </div>
                      <span className="font-mono tabular-nums text-slate-600 font-semibold shrink-0">
                        {p.progressPercent}%
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Zone 2: Chỉ số nhanh của dự án (chỉ hiện trên màn hình rộng) */}
      <div className="hidden xl:flex items-center gap-3 text-xs text-slate-600">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span>Tiến độ: <strong className="font-mono text-slate-900">{activeProject.progressPercent}%</strong></span>
        </span>
        <span className="text-slate-300 dark:text-slate-500">|</span>
        <span>Hạn chót: <strong className="font-mono text-slate-900">{activeProject.targetEndDate}</strong></span>
        <span className="text-slate-300 dark:text-slate-500">|</span>
        <span>Nhiệm vụ: <strong className="font-mono text-slate-900">{projectTasks.length} việc</strong></span>
      </div>

      {/* Zone 3: Actions & Role Switcher */}
      <div className="flex items-center gap-1 sm:gap-3 shrink-0">
        {/* Quick Report Export */}
        <button
          onClick={() => {
            printPeriodicReport(
              activeProject,
              projectTasks,
              projectUseCases,
              projectQualityGates?.phases || [],
              'weekly',
              currentUser.name,
              projectSnapshots
            );
          }}
          className="hidden lg:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200"
          title="In hoặc Xuất Báo Cáo định dạng PDF chuẩn"
        >
          <Printer className="w-3.5 h-3.5 text-slate-600" />
          <span>In / Xuất PDF</span>
        </button>

        <button
          onClick={() => exportTasksToCSV(activeProject, projectTasks, users, projectUseCases)}
          className="hidden lg:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200"
          title="Tải tệp CSV tương thích Excel"
        >
          <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
          <span>Xuất Excel</span>
        </button>

        {/* Audio Sound Toggle */}
        <button
          onClick={toggleSound}
          className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          title={soundMuted ? 'Bật chuông thông báo' : 'Tắt chuông thông báo'}
        >
          {soundMuted ? <VolumeX className="w-4 h-4 text-slate-400" /> : <Volume2 className="w-4 h-4 text-indigo-600" />}
        </button>

        <ThemeToggle />

        {/* Notification Bell */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setIsNotifOpen(!isNotifOpen)}
            className="relative p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
            title="Thông báo nhắc nhở deadline và cảnh báo"
          >
            <Bell className="w-4 h-4" />
            {unreadNotificationCount > 0 && (
              <span className="absolute top-1 right-1 flex items-center justify-center w-4 h-4 text-[10px] font-bold text-white bg-rose-600 rounded-full animate-bounce">
                {unreadNotificationCount}
              </span>
            )}
          </button>

          {/* Notification Dropdown Panel */}
          {isNotifOpen && (
            <div className="absolute right-0 mt-2 w-[min(24rem,calc(100vw-1.5rem))] bg-white border border-slate-200 rounded-2xl shadow-2xl py-3 z-50">
              <div className="flex items-center justify-between px-4 pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <h4 className="font-semibold text-xs text-slate-900 uppercase tracking-wider">Thông Báo Deadline & Cảnh Báo</h4>
                  <span className="text-[11px] font-mono font-medium text-slate-500">({notifications.length})</span>
                </div>
                {unreadNotificationCount > 0 && (
                  <button
                    onClick={markAllNotificationsAsRead}
                    className="text-[11px] text-indigo-600 hover:text-indigo-800 font-medium"
                  >
                    Đã đọc tất cả
                  </button>
                )}
              </div>

              <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                {notifications.length === 0 ? (
                  <div className="py-6 text-center text-xs text-slate-500">Không có thông báo mới</div>
                ) : (
                  notifications.map(n => (
                    <div
                      key={n.id}
                      onClick={() => markNotificationAsRead(n.id)}
                      className={`p-3 text-xs transition-colors hover:bg-slate-50 cursor-pointer ${
                        !n.isRead ? 'bg-indigo-50/40' : ''
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        {n.type === 'overdue' ? (
                          <AlertTriangle className="w-4 h-4 text-rose-700 shrink-0 mt-0.5" />
                        ) : n.type === 'deadline_warning' ? (
                          <Clock className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                        ) : (
                          <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                        )}
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-slate-900">{n.title}</span>
                            <span className="text-[10px] text-slate-500">{n.createdAt}</span>
                          </div>
                          <p className="text-slate-600 text-[11px] mt-1 leading-relaxed">{n.message}</p>
                          {n.taskId && canManageProject && (
                            <div className="mt-2 flex items-center gap-2">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  sendDeadlineReminder(n.taskId!);
                                }}
                                className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded border border-indigo-200 transition-colors"
                              >
                                <Send className="w-3 h-3" />
                                <span>Gửi nhắc nhở thành viên</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Current User & Role Switcher */}
        <div className="relative" ref={userRef}>
          <button
            onClick={() => setIsUserDropdownOpen(!isUserDropdownOpen)}
            className="flex items-center gap-2.5 p-1.5 pr-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
          >
            <div className={`w-7 h-7 rounded-full text-white text-xs font-semibold flex items-center justify-center ${currentUser.avatarColor}`}>
              {currentUser.name.charAt(0)}
            </div>
            <div className="text-left hidden md:block">
              <div className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                <span>{currentUser.name}</span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 bg-slate-100 text-slate-600 rounded">
                  {currentUser.role.toUpperCase()}
                </span>
              </div>
              <div className="text-[10px] text-slate-500 truncate max-w-[140px]">{currentUser.department}</div>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>

          {/* Account dropdown */}
          {isUserDropdownOpen && (
            <div className="absolute right-0 mt-2 w-[min(18rem,calc(100vw-1.5rem))] bg-white border border-slate-200 rounded-2xl shadow-2xl py-2 z-50">
              <div className="px-3 py-1.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <Shield className="w-3 h-3 text-indigo-600" />
                <span>Tài khoản đang đăng nhập</span>
              </div>
              <div className="px-3 py-2 flex items-center gap-2.5">
                <div className={`w-9 h-9 rounded-full text-white text-sm font-semibold flex items-center justify-center shrink-0 ${currentUser.avatarColor}`}>
                  {currentUser.name.charAt(0)}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-900 truncate">{currentUser.name}</div>
                  <div className="text-[11px] text-slate-500 truncate">{currentUser.email}</div>
                  <div className="text-[11px] text-indigo-700 mt-0.5">
                    {roleNameMap[currentUser.role]} · {activeProject.code}
                  </div>
                </div>
              </div>
              {isAdmin && (
                <div className="border-t border-slate-100 mt-1 pt-1">
                  <div className="px-3 py-1 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Quản trị</div>
                  <button
                    onClick={() => {
                      setIsUserDropdownOpen(false);
                      scanDeadlines();
                    }}
                    className="w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                    title="Quét ngay task quá hạn / sắp đến hạn và tạo thông báo (hệ thống cũng tự quét lúc 8:00 mỗi sáng)"
                  >
                    <Clock className="w-3.5 h-3.5 text-amber-700" />
                    <span>Quét deadline ngay</span>
                  </button>
                  <button
                    onClick={() => {
                      setIsUserDropdownOpen(false);
                      if (window.confirm('Nạp thêm 3 dự án demo? (Bỏ qua nếu đã nạp trước đó)')) seedDemoData();
                    }}
                    className="w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Nạp dữ liệu demo</span>
                  </button>
                </div>
              )}
              <div className="border-t border-slate-100 mt-1 pt-1">
                <button
                  onClick={() => {
                    setIsUserDropdownOpen(false);
                    void signOut();
                  }}
                  className="w-full text-left px-3 py-2 text-xs text-rose-700 hover:bg-rose-50 flex items-center gap-2"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Đăng xuất</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
