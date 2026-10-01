import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  FileBarChart2,
  Printer,
  FileSpreadsheet,
  Download,
  Calendar,
  Layers,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Sparkles
} from 'lucide-react';
import { printPeriodicReport, exportTasksToCSV, exportUseCasesToCSV } from '../../utils/exportUtils';
import { ProgressChart, scheduleStatus } from '../charts/ProgressChart';
import { plannedProgressToday } from '../../utils/chartSvg';

export const ReportsView: React.FC = () => {
  const {
    activeProject,
    projectTasks,
    projectUseCases,
    projectQualityGates,
    currentUser,
    projectSnapshots,
    users
  } = useApp();

  const [reportType, setReportType] = useState<'weekly' | 'monthly' | 'sprint'>('weekly');

  const totalTasks = projectTasks.length;
  const doneTasks = projectTasks.filter(t => t.status === 'done').length;
  const inProgressTasks = projectTasks.filter(t => t.status === 'in_progress').length;
  const reviewTasks = projectTasks.filter(t => t.status === 'review').length;
  const overdueTasks = projectTasks.filter(t => t.status !== 'done' && new Date(t.dueDate) < new Date()).length;

  const totalUseCases = projectUseCases.length;
  const completedUseCases = projectUseCases.filter(u => u.status === 'completed' || u.status === 'tested').length;

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

  const handlePrint = () => {
    printPeriodicReport(
      activeProject,
      projectTasks,
      projectUseCases,
      phases,
      reportType,
      currentUser.name,
      projectSnapshots
    );
  };

  const handleExportBackupJSON = () => {
    const backupData = {
      project: activeProject,
      tasks: projectTasks,
      useCases: projectUseCases,
      qualityGates: projectQualityGates,
      members: users.map(u => ({ id: u.id, name: u.name, email: u.email, role: u.role })),
      progressHistory: projectSnapshots,
      exportedAt: new Date().toISOString(),
      exportedBy: currentUser.name
    };

    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `OmniProject_${activeProject.code}_Backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const reportTypeTitles = {
    weekly: 'Báo Cáo Tiến Độ Định Kỳ Tuần (Weekly Status Report)',
    monthly: 'Báo Cáo Quản Trị Tổng Hợp Tháng (Monthly Executive Report)',
    sprint: 'Báo Cáo Nghiệm Thu & Bàn Giao Sprint (Sprint Release Report)'
  };

  return (
    <div className="space-y-6">
      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Trung Tâm Xuất Báo Cáo Định Kỳ</h1>
            <span className="text-xs font-mono font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
              [{activeProject.code}]
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Tổng hợp dữ liệu tiến độ, kiểm toán tiêu chuẩn chất lượng và xuất bản báo cáo PDF/Excel phục vụ Ban Lãnh Đạo
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handlePrint}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-xs"
          >
            <Printer className="w-4 h-4" />
            <span>In / Xuất PDF Báo Cáo</span>
          </button>
        </div>
      </div>

      {/* Report Type Selector & Export Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-700">Mẫu báo cáo:</span>
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
            {[
              { id: 'weekly', label: 'Báo Cáo Tuần' },
              { id: 'monthly', label: 'Báo Cáo Tháng' },
              { id: 'sprint', label: 'Bàn Giao Sprint' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setReportType(tab.id as any)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  reportType === tab.id
                    ? 'bg-white text-slate-900 shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => exportTasksToCSV(activeProject, projectTasks, users)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-lg border border-slate-200"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            <span>Excel Nhiệm Vụ</span>
          </button>

          <button
            onClick={() => exportUseCasesToCSV(activeProject, projectUseCases)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-lg border border-slate-200"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-blue-600" />
            <span>Excel Use Case</span>
          </button>

          <button
            onClick={handleExportBackupJSON}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-lg border border-slate-200"
          >
            <Download className="w-3.5 h-3.5 text-slate-600" />
            <span>Sao Lưu Dữ Liệu (JSON)</span>
          </button>
        </div>
      </div>

      {/* Live Formatted Report Document Preview */}
      <div className="bg-white border border-slate-200 rounded-xl p-8 max-w-4xl mx-auto shadow-sm">
        {/* Document Header */}
        <div className="border-b-2 border-slate-900 pb-5 mb-6 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <div className="text-xs font-mono font-bold tracking-widest text-slate-400 uppercase">
              OMNIPROJECT ENTERPRISE PMO SUITE
            </div>
            <h2 className="text-xl font-bold text-slate-900 mt-1">{reportTypeTitles[reportType]}</h2>
            <div className="text-sm font-semibold text-indigo-700 mt-1">
              Dự Án: [{activeProject.code}] {activeProject.name}
            </div>
          </div>

          <div className="text-xs text-slate-500 space-y-1 sm:text-right">
            <div>Ngày phát hành: <strong className="text-slate-800 font-mono">{new Date().toLocaleDateString('vi-VN')}</strong></div>
            <div>Người lập báo cáo: <strong className="text-slate-800">{currentUser.name}</strong></div>
            <div>Giai đoạn: <strong className="text-slate-800">{activeProject.currentPhase.toUpperCase()}</strong></div>
          </div>
        </div>

        {/* Executive KPI Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
            <div className="text-[11px] font-semibold text-slate-500 uppercase">Tiến Độ Tổng Thể</div>
            <div className="text-2xl font-bold font-mono text-slate-900 mt-1">{activeProject.progressPercent}%</div>
            <div className={`text-[10px] font-medium ${scheduleStatus(activeProject.progressPercent, plannedProgressToday(activeProject)).className}`}>
              {scheduleStatus(activeProject.progressPercent, plannedProgressToday(activeProject)).label}
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
            <div className="text-[11px] font-semibold text-slate-500 uppercase">Nhiệm Vụ Đã Xong</div>
            <div className="text-2xl font-bold font-mono text-slate-900 mt-1">{doneTasks}/{totalTasks}</div>
            <div className="text-[10px] text-slate-500">{inProgressTasks} đang chạy · {overdueTasks} quá hạn</div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
            <div className="text-[11px] font-semibold text-slate-500 uppercase">Nghiệm Thu Use Case</div>
            <div className="text-2xl font-bold font-mono text-slate-900 mt-1">{completedUseCases}/{totalUseCases}</div>
            <div className="text-[10px] text-slate-500">Đạt tiêu chí kiểm thử</div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
            <div className="text-[11px] font-semibold text-slate-500 uppercase">Tuân Thủ Quality Gate</div>
            <div className="text-2xl font-bold font-mono text-slate-900 mt-1">{qualityRate}%</div>
            <div className="text-[10px] text-slate-500">{passedQualityItems}/{totalQualityItems} tiêu chuẩn đạt</div>
          </div>
        </div>

        <div className="mb-6">
          <ProgressChart />
        </div>

        {/* Section 1: Use Cases Status Table */}
        <div className="mb-6">
          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2 border-l-3 border-indigo-600 pl-2">
            1. Tình Trạng Hoàn Thành Các Use Case Cốt Lõi
          </h3>
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold text-[11px]">
                <tr>
                  <th className="py-2 px-3 w-28">Mã</th>
                  <th className="py-2 px-3">Tên Use Case</th>
                  <th className="py-2 px-3 w-36">Tác Nhân</th>
                  <th className="py-2 px-3 w-28">Trạng Thái</th>
                  <th className="py-2 px-3 w-20 text-right">Tiến Độ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {projectUseCases.map(uc => (
                  <tr key={uc.id}>
                    <td className="py-2 px-3 font-mono font-bold text-indigo-600">{uc.code}</td>
                    <td className="py-2 px-3 font-medium text-slate-900">{uc.title}</td>
                    <td className="py-2 px-3 text-slate-600">{uc.actor}</td>
                    <td className="py-2 px-3 font-mono uppercase text-[10px]">{uc.status}</td>
                    <td className="py-2 px-3 text-right font-mono font-bold">{uc.progressPercent}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Section 2: Tasks & Deadlines */}
        <div className="mb-6">
          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2 border-l-3 border-indigo-600 pl-2">
            2. Danh Sách Công Việc & Cảnh Báo Deadline
          </h3>
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold text-[11px]">
                <tr>
                  <th className="py-2 px-3 w-24">Mã</th>
                  <th className="py-2 px-3">Nhiệm Vụ</th>
                  <th className="py-2 px-3 w-28">Ưu Tiên</th>
                  <th className="py-2 px-3 w-32">Hạn Chót</th>
                  <th className="py-2 px-3 w-28">Trạng Thái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {projectTasks.map(t => {
                  const isPastDue = t.status !== 'done' && new Date(t.dueDate) < new Date();
                  return (
                    <tr key={t.id}>
                      <td className="py-2 px-3 font-mono font-bold text-slate-700">{t.code}</td>
                      <td className="py-2 px-3 font-medium text-slate-900">{t.title}</td>
                      <td className="py-2 px-3 font-mono text-[10px] uppercase">{t.priority}</td>
                      <td className={`py-2 px-3 font-mono ${isPastDue ? 'text-rose-600 font-bold' : 'text-slate-600'}`}>
                        {t.dueDate} {isPastDue && '(QUÁ HẠN)'}
                      </td>
                      <td className="py-2 px-3 font-mono text-[10px] uppercase">{t.status}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Section 3: Quality Gates Checklist */}
        <div className="mb-8">
          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2 border-l-3 border-indigo-600 pl-2">
            3. Kiểm Toán Tiêu Chuẩn Chất Lượng (Quality Gate Assessment)
          </h3>
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold text-[11px]">
                <tr>
                  <th className="py-2 px-3 w-36">Giai Đoạn</th>
                  <th className="py-2 px-3">Tiêu Chuẩn Kiểm Soát</th>
                  <th className="py-2 px-3 w-24 text-center">Bắt Buộc</th>
                  <th className="py-2 px-3 w-28 text-center">Đánh Giá</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {phases.flatMap(p => p.items.map(item => (
                  <tr key={item.id}>
                    <td className="py-2 px-3 font-semibold text-slate-700">{p.shortName}</td>
                    <td className="py-2 px-3">
                      <div className="font-medium text-slate-900">{item.title}</div>
                      {item.notes && <div className="text-[11px] text-slate-500 italic mt-0.5">Ghi chú: {item.notes}</div>}
                    </td>
                    <td className="py-2 px-3 text-center text-slate-600">
                      {item.isMandatory ? 'Bắt buộc' : 'Khuyến nghị'}
                    </td>
                    <td className={`py-2 px-3 text-center font-bold font-mono text-[11px] ${item.isPassed ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {item.isPassed ? '✓ ĐẠT CHUẨN' : '✗ CHƯA ĐẠT'}
                    </td>
                  </tr>
                )))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Sign-off Blocks */}
        <div className="grid grid-cols-3 gap-4 pt-6 border-t border-slate-200 text-center text-xs">
          <div>
            <div className="font-bold text-slate-800 mb-14">QUẢN LÝ DỰ ÁN (PM)</div>
            <div className="text-[11px] text-slate-400 italic">(Ký và xác nhận tiến độ)</div>
          </div>
          <div>
            <div className="font-bold text-slate-800 mb-14">TRƯỞNG NHÓM QA/QC</div>
            <div className="text-[11px] text-slate-400 italic">(Ký xác nhận chất lượng)</div>
          </div>
          <div>
            <div className="font-bold text-slate-800 mb-14">ĐẠI DIỆN NGHIỆP VỤ (PO)</div>
            <div className="text-[11px] text-slate-400 italic">(Ký phê duyệt nghiệm thu)</div>
          </div>
        </div>
      </div>
    </div>
  );
};
