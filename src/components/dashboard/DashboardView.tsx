import React from 'react';
import { useApp } from '../../context/AppContext';
import { ProgressChart } from '../charts/ProgressChart';
import {
  TrendingUp,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ShieldCheck,
  Boxes,
  ArrowRight,
  Send,
  Calendar,
  Sparkles,
  Layers,
  UserCheck
} from 'lucide-react';

export const DashboardView: React.FC = () => {
  const {
    activeProject,
    projectTasks,
    projectUseCases,
    projectQualityGates,
    users,
    setActiveTab,
    sendDeadlineReminder
  } = useApp();

  const userMap = new Map(users.map(u => [u.id, u]));

  // Metrics
  const totalTasks = projectTasks.length;
  const doneTasks = projectTasks.filter(t => t.status === 'done').length;
  const inProgressTasks = projectTasks.filter(t => t.status === 'in_progress').length;
  const reviewTasks = projectTasks.filter(t => t.status === 'review').length;
  const todoTasks = projectTasks.filter(t => t.status === 'todo').length;

  // Deadline alerts
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const overdueTasks = projectTasks.filter(t => {
    if (t.status === 'done') return false;
    const due = new Date(t.dueDate);
    due.setHours(0, 0, 0, 0);
    return due < today;
  });

  const approachingTasks = projectTasks.filter(t => {
    if (t.status === 'done') return false;
    const due = new Date(t.dueDate);
    due.setHours(0, 0, 0, 0);
    const diff = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return diff >= 0 && diff <= 2;
  });

  // Quality Gates metrics
  const phases = projectQualityGates?.phases || [];
  let totalQualityItems = 0;
  let passedQualityItems = 0;
  phases.forEach(p => {
    p.items.forEach(i => {
      totalQualityItems++;
      if (i.isPassed) passedQualityItems++;
    });
  });
  const qualityRate = totalQualityItems > 0 ? Math.round((passedQualityItems / totalQualityItems) * 100) : 100;

  // Use Case metrics
  const totalUseCases = projectUseCases.length;
  const completedUseCases = projectUseCases.filter(u => u.status === 'completed' || u.status === 'tested').length;
  const ucAvgProgress = totalUseCases > 0
    ? Math.round(projectUseCases.reduce((sum, u) => sum + u.progressPercent, 0) / totalUseCases)
    : 0;

  const phaseNames: Record<string, string> = {
    phase_1: 'Giai đoạn 1: Khởi tạo',
    phase_2: 'Giai đoạn 2: Thiết kế',
    phase_3: 'Giai đoạn 3: Sprint Dev',
    phase_4: 'Giai đoạn 4: Kiểm thử QA',
    phase_5: 'Giai đoạn 5: UAT & Release'
  };

  return (
    <div className="space-y-6">
      {/* Top Banner / Hero Card */}
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-indigo-600 mb-1">
              <span className="font-mono">[{activeProject.code}]</span>
              <span>·</span>
              <span className="capitalize">{activeProject.status.replace('_', ' ')}</span>
              <span>·</span>
              <span>Ưu tiên {activeProject.priority.toUpperCase()}</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{activeProject.name}</h1>
            <p className="text-sm text-slate-600 mt-1 max-w-3xl leading-relaxed">
              {activeProject.description}
            </p>
          </div>

          <div className="flex items-center gap-4 bg-slate-50 border border-slate-200/80 rounded-xl p-4 shrink-0">
            <div>
              <div className="text-xs text-slate-500 font-medium">Tiến Độ Dự Án</div>
              <div className="text-3xl font-bold text-slate-900 font-mono tabular-nums">
                {activeProject.progressPercent}%
              </div>
              <div className="text-[11px] text-emerald-600 font-medium mt-0.5">
                {phaseNames[activeProject.currentPhase]}
              </div>
            </div>
            <div className="w-16 h-16 rounded-full border-4 border-indigo-100 border-t-indigo-600 flex items-center justify-center font-mono font-bold text-xs text-indigo-700 bg-white">
              {activeProject.progressPercent}%
            </div>
          </div>
        </div>

        {/* 5-Phase Project Timeline */}
        <div className="mt-6 pt-5 border-t border-slate-100">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
            <span className="font-medium text-slate-700">Lộ Trình Các Giai Đoạn Phát Triển (5 Stage Gates):</span>
            <span className="font-mono">{activeProject.startDate} → {activeProject.targetEndDate}</span>
          </div>

          <div className="grid grid-cols-5 gap-2">
            {[
              { id: 'phase_1', title: '1. Khởi Tạo' },
              { id: 'phase_2', title: '2. Phân Tích & Thiết Kế' },
              { id: 'phase_3', title: '3. Phát Triển Sprint' },
              { id: 'phase_4', title: '4. Kiểm Thử QA/QC' },
              { id: 'phase_5', title: '5. UAT & Release' }
            ].map((p, idx) => {
              const currentPhaseIndex = ['phase_1', 'phase_2', 'phase_3', 'phase_4', 'phase_5'].indexOf(activeProject.currentPhase);
              const isPast = idx < currentPhaseIndex;
              const isCurrent = idx === currentPhaseIndex;

              return (
                <div
                  key={p.id}
                  onClick={() => setActiveTab('quality')}
                  className={`p-2.5 rounded-lg border text-xs cursor-pointer transition-all ${
                    isCurrent
                      ? 'bg-indigo-50 border-indigo-300 text-indigo-900 font-semibold ring-1 ring-indigo-200'
                      : isPast
                      ? 'bg-emerald-50/60 border-emerald-200 text-emerald-800'
                      : 'bg-slate-50 border-slate-200 text-slate-500'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-[10px] uppercase">
                      {isCurrent ? '● Đang chạy' : isPast ? '✓ Hoàn thành' : '○ Sắp tới'}
                    </span>
                  </div>
                  <div className="truncate font-medium">{p.title}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Overdue / Approaching Deadline Alert Box (if applicable) */}
      {(overdueTasks.length > 0 || approachingTasks.length > 0) && (
        <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-semibold text-amber-900">
                  Cảnh Báo Deadline Tự Động: Có {overdueTasks.length} nhiệm vụ quá hạn và {approachingTasks.length} nhiệm vụ sắp đến hạn (&lt; 48 giờ)
                </h3>
                <div className="mt-2 space-y-1.5">
                  {overdueTasks.map(t => {
                    const assignee = userMap.get(t.assigneeId);
                    return (
                      <div key={t.id} className="flex items-center justify-between gap-3 text-xs bg-white/80 p-2 rounded border border-rose-200">
                        <div className="flex items-center gap-2">
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-100 text-rose-800">
                            QUÁ HẠN {t.dueDate}
                          </span>
                          <span className="font-semibold text-slate-800">[{t.code}]</span>
                          <span className="text-slate-700">{t.title}</span>
                          <span className="text-slate-400">·</span>
                          <span className="text-slate-500 font-medium">Phụ trách: {assignee?.name}</span>
                        </div>
                        <button
                          onClick={() => sendDeadlineReminder(t.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 rounded border border-rose-200 transition-colors shrink-0"
                        >
                          <Send className="w-3 h-3" />
                          <span>Gửi nhắc nhở</span>
                        </button>
                      </div>
                    );
                  })}
                  {approachingTasks.map(t => {
                    const assignee = userMap.get(t.assigneeId);
                    return (
                      <div key={t.id} className="flex items-center justify-between gap-3 text-xs bg-white/80 p-2 rounded border border-amber-200">
                        <div className="flex items-center gap-2">
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-100 text-amber-800">
                            HẠN CHÓT {t.dueDate}
                          </span>
                          <span className="font-semibold text-slate-800">[{t.code}]</span>
                          <span className="text-slate-700">{t.title}</span>
                          <span className="text-slate-400">·</span>
                          <span className="text-slate-500 font-medium">Phụ trách: {assignee?.name}</span>
                        </div>
                        <button
                          onClick={() => sendDeadlineReminder(t.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-amber-800 bg-amber-50 hover:bg-amber-100 rounded border border-amber-200 transition-colors shrink-0"
                        >
                          <Send className="w-3 h-3" />
                          <span>Gửi nhắc nhở</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* KPI Cards Row (Single Elevation) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Nhiệm vụ */}
        <div
          onClick={() => setActiveTab('tasks')}
          className="bg-white border border-slate-200 rounded-xl p-5 hover:border-slate-300 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Nhiệm Vụ Dự Án</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 font-mono tabular-nums">{doneTasks}/{totalTasks}</span>
            <span className="text-xs text-slate-500">hoàn thành</span>
          </div>
          <div className="w-full bg-slate-100 h-2 rounded-full mt-3 overflow-hidden">
            <div
              className="bg-emerald-500 h-full rounded-full transition-all"
              style={{ width: `${totalTasks > 0 ? (doneTasks / totalTasks) * 100 : 0}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-500 mt-2">
            <span>{inProgressTasks} đang chạy · {reviewTasks} chờ duyệt</span>
            <span className="text-indigo-600 font-medium group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
              Xem <ArrowRight className="w-3 h-3 inline" />
            </span>
          </div>
        </div>

        {/* Card 2: Use Cases */}
        <div
          onClick={() => setActiveTab('usecases')}
          className="bg-white border border-slate-200 rounded-xl p-5 hover:border-slate-300 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Use Cases Nghiệp Vụ</span>
            <Boxes className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 font-mono tabular-nums">{completedUseCases}/{totalUseCases}</span>
            <span className="text-xs text-slate-500">đạt chuẩn</span>
          </div>
          <div className="w-full bg-slate-100 h-2 rounded-full mt-3 overflow-hidden">
            <div
              className="bg-indigo-600 h-full rounded-full transition-all"
              style={{ width: `${ucAvgProgress}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-500 mt-2">
            <span>Tiến độ trung bình {ucAvgProgress}%</span>
            <span className="text-indigo-600 font-medium group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
              Xem <ArrowRight className="w-3 h-3 inline" />
            </span>
          </div>
        </div>

        {/* Card 3: Quality Gates */}
        <div
          onClick={() => setActiveTab('quality')}
          className="bg-white border border-slate-200 rounded-xl p-5 hover:border-slate-300 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Quality Gates (DoD)</span>
            <ShieldCheck className="w-4 h-4 text-blue-600" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 font-mono tabular-nums">{qualityRate}%</span>
            <span className="text-xs text-slate-500">tuân thủ</span>
          </div>
          <div className="w-full bg-slate-100 h-2 rounded-full mt-3 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${qualityRate >= 80 ? 'bg-blue-600' : 'bg-amber-500'}`}
              style={{ width: `${qualityRate}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-500 mt-2">
            <span>{passedQualityItems}/{totalQualityItems} tiêu chuẩn đạt</span>
            <span className="text-indigo-600 font-medium group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
              Xem <ArrowRight className="w-3 h-3 inline" />
            </span>
          </div>
        </div>

        {/* Card 4: Thành viên */}
        <div
          onClick={() => setActiveTab('team')}
          className="bg-white border border-slate-200 rounded-xl p-5 hover:border-slate-300 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Đội Ngũ Dự Án</span>
            <UserCheck className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 font-mono tabular-nums">
              {activeProject.memberIds.length}
            </span>
            <span className="text-xs text-slate-500">nhân sự</span>
          </div>
          <div className="flex items-center -space-x-2 mt-3">
            {activeProject.memberIds.map(mid => {
              const u = userMap.get(mid);
              if (!u) return null;
              return (
                <div
                  key={mid}
                  title={`${u.name} (${u.role.toUpperCase()})`}
                  className={`w-7 h-7 rounded-full text-white text-[11px] font-bold flex items-center justify-center border-2 border-white ${u.avatarColor}`}
                >
                  {u.name.charAt(0)}
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-500 mt-2">
            <span>Phân quyền 5 vai trò</span>
            <span className="text-indigo-600 font-medium group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
              Xem <ArrowRight className="w-3 h-3 inline" />
            </span>
          </div>
        </div>
      </div>

      {/* Biểu đồ tiến độ theo thời gian */}
      <ProgressChart />

      {/* Main 2-Column Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Column 1: Biểu đồ phân bổ trạng thái công việc & Nhiệm vụ ưu tiên */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Phân Bổ Trạng Thái Công Việc</h3>
                <p className="text-xs text-slate-500">Tỷ lệ các nhiệm vụ theo chu trình thực hiện</p>
              </div>
              <button
                onClick={() => setActiveTab('tasks')}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
              >
                Mở bảng Kanban →
              </button>
            </div>

            {/* Segmented status bar chart */}
            <div className="space-y-2">
              <div className="h-4 w-full bg-slate-100 rounded-lg overflow-hidden flex">
                <div
                  style={{ width: `${totalTasks > 0 ? (doneTasks / totalTasks) * 100 : 0}%` }}
                  className="bg-emerald-500 h-full transition-all"
                  title={`Hoàn thành: ${doneTasks}`}
                />
                <div
                  style={{ width: `${totalTasks > 0 ? (reviewTasks / totalTasks) * 100 : 0}%` }}
                  className="bg-amber-400 h-full transition-all"
                  title={`Chờ duyệt: ${reviewTasks}`}
                />
                <div
                  style={{ width: `${totalTasks > 0 ? (inProgressTasks / totalTasks) * 100 : 0}%` }}
                  className="bg-indigo-500 h-full transition-all"
                  title={`Đang làm: ${inProgressTasks}`}
                />
                <div
                  style={{ width: `${totalTasks > 0 ? (todoTasks / totalTasks) * 100 : 0}%` }}
                  className="bg-slate-300 h-full transition-all"
                  title={`Cần làm: ${todoTasks}`}
                />
              </div>

              {/* Status Legend */}
              <div className="grid grid-cols-4 gap-2 pt-2 text-center text-xs">
                <div className="p-2 rounded bg-slate-50 border border-slate-100">
                  <div className="text-[10px] text-slate-500">Cần Làm</div>
                  <div className="font-bold text-slate-700 font-mono">{todoTasks}</div>
                </div>
                <div className="p-2 rounded bg-indigo-50 border border-indigo-100">
                  <div className="text-[10px] text-indigo-600">Đang Làm</div>
                  <div className="font-bold text-indigo-700 font-mono">{inProgressTasks}</div>
                </div>
                <div className="p-2 rounded bg-amber-50 border border-amber-100">
                  <div className="text-[10px] text-amber-700">Chờ Duyệt</div>
                  <div className="font-bold text-amber-800 font-mono">{reviewTasks}</div>
                </div>
                <div className="p-2 rounded bg-emerald-50 border border-emerald-100">
                  <div className="text-[10px] text-emerald-600">Hoàn Thành</div>
                  <div className="font-bold text-emerald-700 font-mono">{doneTasks}</div>
                </div>
              </div>
            </div>

            {/* Top Tasks List */}
            <div className="mt-5">
              <div className="text-xs font-semibold text-slate-700 mb-2 uppercase tracking-wider font-mono">
                Nhiệm Vụ Đang Chạy
              </div>
              <div className="divide-y divide-slate-100">
                {projectTasks.slice(0, 4).map(task => {
                  const assignee = userMap.get(task.assigneeId);
                  return (
                    <div key={task.id} className="py-2.5 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 min-w-0 pr-2">
                        <span className="font-mono text-slate-500 text-[11px] shrink-0">[{task.code}]</span>
                        <span className="font-medium text-slate-900 truncate">{task.title}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] font-mono text-slate-500">{task.dueDate}</span>
                        <div
                          className={`w-5 h-5 rounded-full text-white text-[10px] font-bold flex items-center justify-center ${assignee?.avatarColor || 'bg-slate-400'}`}
                          title={assignee?.name}
                        >
                          {assignee?.name.charAt(0) || '?'}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Column 2: Tiến độ Use Cases Nghiệp Vụ */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Tiến Độ Use Cases Nghiệp Vụ</h3>
                <p className="text-xs text-slate-500">Đặc tả và mức độ hoàn thành từng ca sử dụng</p>
              </div>
              <button
                onClick={() => setActiveTab('usecases')}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
              >
                Quản lý Use Case →
              </button>
            </div>

            <div className="space-y-3">
              {projectUseCases.map(uc => {
                const totalCriteria = uc.acceptanceCriteria.length;
                const completedCriteria = uc.acceptanceCriteria.filter(c => c.completed).length;

                return (
                  <div key={uc.id} className="p-3 rounded-lg border border-slate-100 bg-slate-50/50">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-indigo-600">[{uc.code}]</span>
                        <span className="text-xs font-semibold text-slate-800">{uc.title}</span>
                      </div>
                      <span className="font-mono text-xs font-bold text-slate-700">{uc.progressPercent}%</span>
                    </div>

                    <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden mb-2">
                      <div
                        className="bg-indigo-600 h-full rounded-full transition-all"
                        style={{ width: `${uc.progressPercent}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span>Tác nhân: <strong className="text-slate-700">{uc.actor}</strong></span>
                      <span>
                        Tiêu chí nghiệm thu: <strong className="text-slate-700 font-mono">{completedCriteria}/{totalCriteria}</strong>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Tiêu chuẩn chất lượng: <strong className="text-slate-900">{passedQualityItems}/{totalQualityItems} tiêu chí đạt</strong></span>
            <button
              onClick={() => setActiveTab('quality')}
              className="text-indigo-600 font-medium hover:underline"
            >
              Kiểm tra Quality Gate
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
