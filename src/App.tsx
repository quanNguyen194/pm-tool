/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Loader2, X } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AppProvider, useApp } from './context/AppContext';
import { isSupabaseConfigured } from './lib/supabase';
import { LoginView } from './components/auth/LoginView';
import { NoProjectsView } from './components/auth/NoProjectsView';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { DashboardView } from './components/dashboard/DashboardView';
import { ProjectsView } from './components/projects/ProjectsView';
import { TasksView } from './components/tasks/TasksView';
import { UseCasesView } from './components/usecases/UseCasesView';
import { QualityGatesView } from './components/quality/QualityGatesView';
import { ReportsView } from './components/reports/ReportsView';
import { TeamView } from './components/team/TeamView';

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
  const { activeTab, actionError, clearActionError, actionNotice, clearActionNotice } = useApp();

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 overflow-hidden font-sans">
      {/* Sidebar Navigation */}
      <Sidebar />

      {/* Main View Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Bar Header */}
        <Header />

        {/* Content Viewport */}
        <main className="flex-1 overflow-y-auto p-6 md:p-8">
          <div className="max-w-7xl mx-auto pb-12">
            {activeTab === 'dashboard' && <DashboardView />}
            {activeTab === 'projects' && <ProjectsView />}
            {activeTab === 'tasks' && <TasksView />}
            {activeTab === 'usecases' && <UseCasesView />}
            {activeTab === 'quality' && <QualityGatesView />}
            {activeTab === 'reports' && <ReportsView />}
            {activeTab === 'team' && <TeamView />}
          </div>
        </main>
      </div>

      {actionNotice && (
        <div
          role="status"
          className="fixed bottom-4 left-4 z-[60] max-w-sm flex items-start gap-3 bg-emerald-600 text-white text-xs rounded-lg shadow-xl px-4 py-3"
        >
          <span className="flex-1 leading-relaxed">{actionNotice}</span>
          <button onClick={clearActionNotice} className="shrink-0 text-white/80 hover:text-white" aria-label="Đóng">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {actionError && (
        <div
          role="alert"
          className="fixed bottom-4 right-4 z-[60] max-w-sm flex items-start gap-3 bg-rose-600 text-white text-xs rounded-lg shadow-xl px-4 py-3"
        >
          <span className="flex-1 leading-relaxed">{actionError}</span>
          <button onClick={clearActionError} className="shrink-0 text-white/80 hover:text-white" aria-label="Đóng">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
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
  if (projects.length === 0) return <NoProjectsView />;
  return <MainLayout />;
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
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  );
}
