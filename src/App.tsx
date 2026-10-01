/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { DashboardView } from './components/dashboard/DashboardView';
import { ProjectsView } from './components/projects/ProjectsView';
import { TasksView } from './components/tasks/TasksView';
import { UseCasesView } from './components/usecases/UseCasesView';
import { QualityGatesView } from './components/quality/QualityGatesView';
import { ReportsView } from './components/reports/ReportsView';
import { TeamView } from './components/team/TeamView';

const MainLayout: React.FC = () => {
  const { activeTab } = useApp();

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
    </div>
  );
};

export default function App() {
  return (
    <AppProvider>
      <MainLayout />
    </AppProvider>
  );
}
