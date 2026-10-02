import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { buildProgressChartSvg, ChartMode, plannedProgressToday } from '../../utils/chartSvg';

/** Mức chênh (điểm %) giữa thực tế và kế hoạch, kèm nhãn + màu hiển thị. */
export function scheduleStatus(actual: number, planned: number): { label: string; className: string } {
  const diff = actual - planned;
  if (diff >= 5) return { label: `Vượt kế hoạch ${diff} điểm %`, className: 'text-emerald-700' };
  if (diff <= -10) return { label: `Chậm ${-diff} điểm % so với kế hoạch`, className: 'text-rose-700' };
  if (diff < 0) return { label: `Hơi chậm ${-diff} điểm % so với kế hoạch`, className: 'text-amber-700' };
  return { label: 'Đúng kế hoạch', className: 'text-emerald-700' };
}

export const ProgressChart: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { activeProject, projectSnapshots } = useApp();
  const [mode, setMode] = useState<ChartMode>('progress');
  const holder = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);

  // Dựng SVG theo bề rộng thật của khung (làm tròn theo bước 20px để tránh vẽ lại liên tục khi kéo cửa sổ)
  useEffect(() => {
    const el = holder.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(entries => {
      const w = Math.round(entries[0].contentRect.width / 20) * 20;
      if (w > 0) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const svg = useMemo(
    () => buildProgressChartSvg(projectSnapshots, activeProject, { mode, width }),
    [projectSnapshots, activeProject, mode, width]
  );

  const planned = plannedProgressToday(activeProject);
  const status = scheduleStatus(activeProject.progressPercent, planned);

  return (
    <div className={`bg-white border border-slate-200 rounded-2xl p-5 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Biểu Đồ Tiến Độ Theo Thời Gian</h3>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Thực tế <strong className="text-slate-800">{activeProject.progressPercent}%</strong> · Kế hoạch hôm nay{' '}
            <strong className="text-slate-800">{planned}%</strong> ·{' '}
            <span className={`font-semibold ${status.className}`}>{status.label}</span>
          </p>
        </div>
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg" role="tablist" aria-label="Loại biểu đồ">
          {(
            [
              { id: 'progress', label: 'Tiến độ %' },
              { id: 'burndown', label: 'Burndown' }
            ] as { id: ChartMode; label: string }[]
          ).map(tab => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={mode === tab.id}
              onClick={() => setMode(tab.id)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                mode === tab.id ? 'bg-white text-slate-900 shadow-xs font-semibold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* SVG do buildProgressChartSvg tạo ra từ số và ngày, không chứa văn bản người dùng nhập */}
      <div ref={holder} dangerouslySetInnerHTML={{ __html: svg }} />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-4 h-0.5 bg-indigo-600" /> Thực tế
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-4 border-t border-dashed border-slate-400" /> Kế hoạch lý tưởng
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-4 border-t border-dotted border-amber-500" /> Hôm nay
        </span>
        {projectSnapshots.length < 2 && (
          <span className="text-slate-500">Biểu đồ sẽ đầy dần theo từng ngày làm việc.</span>
        )}
      </div>
    </div>
  );
};
