/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Suspense, lazy, useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { AppProvider, useApp } from './context/AppContext';
import { isSupabaseConfigured } from './lib/supabase';
import { LoginView } from './components/auth/LoginView';
import { NoProjectsView } from './components/auth/NoProjectsView';
import { Header } from './components/layout/Header';
import { ToastContainer } from './components/layout/ToastContainer';
import { Sidebar } from './components/layout/Sidebar';

// Mỗi màn hình tải riêng khi cần để gói đầu tiên nhẹ hơn.
const DashboardView = lazy(() => import('./components/dashboard/DashboardView').then(m => ({ default: m.DashboardView })));
const ProjectsView = lazy(() => import('./components/projects/ProjectsView').then(m => ({ default: m.ProjectsView })));
const TasksView = lazy(() => import('./components/tasks/TasksView').then(m => ({ default: m.TasksView })));
const UseCasesView = lazy(() => import('./components/usecases/UseCasesView').then(m => ({ default: m.UseCasesView })));
const QualityGatesView = lazy(() => import('./components/quality/QualityGatesView').then(m => ({ default: m.QualityGatesView })));
const ReportsView = lazy(() => import('./components/reports/ReportsView').then(m => ({ default: m.ReportsView })));
const TeamView = lazy(() => import('./components/team/TeamView').then(m => ({ default: m.TeamView })));

const FullScreenMessage: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
    <div className="text-center text-sm text-slate-600 max-w-sm">{children}</div>
  </div>
);

const Spinner: React.FC<{ label: string }> = ({ label }) => (
  <FullScreenMessage>
    <Loader2 className="w-6 h-6 animate-spin text-indigo-600 mx-auto mb-3" />
    {label}
  </FullScreenMessage>
);

const MainLayout: React.FC = () => {
  const { activeTab } = useApp();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Esc đóng ngăn kéo menu trên màn hình nhỏ
  useEffect(() => {
    if (!sidebarOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSidebarOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sidebarOpen]);

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 overflow-hidden font-sans">
      {/* Sidebar Navigation */}
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main View Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Bar Header */}
        <Header onOpenSidebar={() => setSidebarOpen(true)} sidebarOpen={sidebarOpen} />

        {/* Content Viewport */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8">
          <div className="max-w-7xl mx-auto pb-12">
            <Suspense
              fallback={
                <div className="py-20 flex justify-center" role="status" aria-label="Đang tải">
                  <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
                </div>
              }
            >
              {activeTab === 'dashboard' && <DashboardView />}
              {activeTab === 'projects' && <ProjectsView />}
              {activeTab === 'tasks' && <TasksView />}
              {activeTab === 'usecases' && <UseCasesView />}
              {activeTab === 'quality' && <QualityGatesView />}
              {activeTab === 'reports' && <ReportsView />}
              {activeTab === 'team' && <TeamView />}
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  );
};

/** Chọn màn hình theo trạng thái tải dữ liệu / có dự án hay chưa. */
const DataGate: React.FC = () => {
  const { isLoading, loadError, reload, projects } = useApp();
  const { signOut } = useAuth();

  if (isLoading) return <Spinner label="Đang tải dữ liệu..." />;
  if (loadError) {
    return (
      <FullScreenMessage>
        <p className="font-semibold text-slate-900 mb-1">Không tải được dữ liệu</p>
        <p className="mb-4">{loadError}</p>
        <div className="flex items-center justify-center gap-3">
          <button onClick={reload} className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 rounded-lg">
            Thử lại
          </button>
          <button onClick={() => void signOut()} className="px-4 py-2 text-xs font-semibold text-slate-700 border border-slate-300 rounded-lg">
            Đăng xuất
          </button>
        </div>
      </FullScreenMessage>
    );
  }
  return (
    <>
      {projects.length === 0 ? <NoProjectsView /> : <MainLayout />}
      <ToastContainer />
    </>
  );
};

const AuthGate: React.FC = () => {
  const { session, profile, loading, signOut } = useAuth();

  if (!isSupabaseConfigured) {
    return (
      <FullScreenMessage>
        <p className="font-semibold text-slate-900 mb-1">Thiếu cấu hình Supabase</p>
        <p>
          Đặt <code className="font-mono">VITE_SUPABASE_URL</code> và{' '}
          <code className="font-mono">VITE_SUPABASE_ANON_KEY</code> (xem <code className="font-mono">.env.example</code>) rồi build lại.
        </p>
      </FullScreenMessage>
    );
  }
  if (loading) return <Spinner label="Đang kiểm tra phiên đăng nhập..." />;
  if (!session) return <LoginView />;
  if (!profile) {
    return (
      <FullScreenMessage>
        <p className="font-semibold text-slate-900 mb-1">Chưa tải được hồ sơ tài khoản</p>
        <p className="mb-4">Hãy kiểm tra đã chạy đủ các file migration trong Supabase, rồi tải lại trang.</p>
        <button onClick={() => void signOut()} className="px-4 py-2 text-xs font-semibold text-slate-700 border border-slate-300 rounded-lg">
          Đăng xuất
        </button>
      </FullScreenMessage>
    );
  }

  return (
    <AppProvider>
      <DataGate />
    </AppProvider>
  );
};

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AuthGate />
      </AuthProvider>
    </ThemeProvider>
  );
}
