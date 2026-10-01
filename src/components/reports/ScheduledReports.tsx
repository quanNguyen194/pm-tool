import React from 'react';
import { CalendarClock, FilePlus2, Printer } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { ReportFrequency } from '../../types';
import { printStoredReport } from '../../utils/exportUtils';

const FREQUENCY_LABELS: Record<ReportFrequency, string> = {
  weekly: 'Tuần',
  monthly: 'Tháng',
  sprint: 'Sprint'
};

const fmt = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('vi-VN');

/** Lịch báo cáo tự động + lịch sử các bản báo cáo hệ thống đã chốt. */
export const ScheduledReports: React.FC<{ reportType: ReportFrequency }> = ({ reportType }) => {
  const { reportSchedules, reportRuns, setReportSchedule, generateReportNow, canManageProject, currentUser } = useApp();

  const isOn = (f: 'weekly' | 'monthly') => !!reportSchedules.find(s => s.frequency === f)?.enabled;

  const schedules: { frequency: 'weekly' | 'monthly'; title: string; desc: string }[] = [
    { frequency: 'weekly', title: 'Báo cáo tuần', desc: 'Tự tạo sáng thứ Hai (8:10), tổng hợp 7 ngày trước' },
    { frequency: 'monthly', title: 'Báo cáo tháng', desc: 'Tự tạo sáng ngày 1 hằng tháng, tổng hợp tháng trước' }
  ];

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-900">Báo Cáo Định Kỳ Tự Động</h3>
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Hệ thống tự chốt số liệu và lưu lại theo lịch, bạn có thể xem và in lại bất kỳ lúc nào.
          </p>
        </div>
        {canManageProject && (
          <button
            onClick={() => generateReportNow(reportType)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg"
          >
            <FilePlus2 className="w-3.5 h-3.5" />
            <span>Tạo báo cáo {FREQUENCY_LABELS[reportType].toLowerCase()} ngay</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {schedules.map(s => (
          <label
            key={s.frequency}
            className={`flex items-start gap-3 p-3 rounded-lg border ${
              isOn(s.frequency) ? 'border-indigo-200 bg-indigo-50/50' : 'border-slate-200 bg-slate-50/50'
            } ${canManageProject ? 'cursor-pointer' : 'cursor-default'}`}
          >
            <input
              type="checkbox"
              checked={isOn(s.frequency)}
              disabled={!canManageProject}
              onChange={e => setReportSchedule(s.frequency, e.target.checked)}
              className="mt-0.5 accent-indigo-600"
            />
            <span>
              <span className="block text-xs font-semibold text-slate-900">{s.title}</span>
              <span className="block text-[11px] text-slate-500">{s.desc}</span>
            </span>
          </label>
        ))}
      </div>
      {!canManageProject && (
        <p className="text-[11px] text-slate-400 italic">* Chỉ quản trị viên hoặc PM mới đổi được lịch.</p>
      )}

      <div>
        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Lịch sử báo cáo đã tạo</h4>
        {reportRuns.length === 0 ? (
          <p className="text-xs text-slate-400 py-3">Chưa có báo cáo nào. Bật lịch ở trên hoặc bấm "Tạo báo cáo ngay".</p>
        ) : (
          <div className="border border-slate-200 rounded-lg overflow-hidden divide-y divide-slate-100">
            {reportRuns.slice(0, 10).map(run => {
              const delta = run.summary.progress.delta;
              return (
                <div key={run.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-xs">
                  <div className="min-w-0">
                    <span className="font-semibold text-slate-900">Báo cáo {FREQUENCY_LABELS[run.frequency].toLowerCase()}</span>
                    <span className="text-slate-500">
                      {' '}
                      · {fmt(run.periodStart)} - {fmt(run.periodEnd)}
                    </span>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      Tiến độ <strong className="text-slate-800">{run.summary.progress.end}%</strong>
                      {delta !== null && (
                        <span className={delta >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                          {' '}
                          ({delta >= 0 ? '+' : ''}
                          {delta})
                        </span>
                      )}{' '}
                      · {run.summary.tasks.done}/{run.summary.tasks.total} việc xong · {run.summary.tasks.overdue} quá hạn
                    </div>
                  </div>
                  <button
                    onClick={() => printStoredReport(run, currentUser.name)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium text-slate-700 border border-slate-200 hover:bg-slate-50 rounded-lg"
                  >
                    <Printer className="w-3 h-3" />
                    <span>Xem / In</span>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
