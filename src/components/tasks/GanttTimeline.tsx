import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Task, TaskStatus, User } from '../../types';

const DAY_MS = 86400000;
const RANGES = [2, 4, 6] as const;
const ROW_H = 44;

/** Chuyển 'YYYY-MM-DD' thành số ngày kể từ epoch (không phụ thuộc múi giờ). */
const dayIndex = (iso: string) => Math.floor(Date.parse(iso.slice(0, 10) + 'T00:00:00Z') / DAY_MS);
const todayIndex = () => {
  const d = new Date();
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS);
};
const fromIndex = (n: number) => new Date(n * DAY_MS);
const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

// `theme-fixed` giữ nguyên màu thật của thanh ở cả chế độ tối (chữ trắng luôn đủ tương phản).
const STATUS_BAR: Record<TaskStatus, { bg: string; label: string }> = {
  todo: { bg: 'bg-slate-500', label: 'Cần làm' },
  in_progress: { bg: 'bg-indigo-600', label: 'Đang thực hiện' },
  review: { bg: 'bg-amber-700', label: 'Chờ thẩm định' },
  done: { bg: 'bg-emerald-700', label: 'Hoàn thành' }
};

interface GanttTimelineProps {
  tasks: Task[];
  userMap: Map<string, User>;
  /** Bấm vào một dòng (chỉ truyền khi người dùng được sửa nhiệm vụ). */
  onTaskClick?: (task: Task) => void;
}

/** Biểu đồ Gantt: mỗi nhiệm vụ là một thanh từ ngày bắt đầu đến hạn chót. */
export const GanttTimeline: React.FC<GanttTimelineProps> = ({ tasks, userMap, onTaskClick }) => {
  const [weeks, setWeeks] = useState<(typeof RANGES)[number]>(4);
  // Lệch so với mốc mặc định (một tuần trước hôm nay), tính bằng ngày.
  const [offset, setOffset] = useState(0);

  const today = todayIndex();
  const total = weeks * 7;
  const start = today - 7 + offset;
  const cellW = weeks === 2 ? 56 : weeks === 4 ? 40 : 30;

  const days = useMemo(() => Array.from({ length: total }, (_, i) => start + i), [start, total]);

  // Hàng tháng: gom các ngày liên tiếp cùng tháng.
  const months = useMemo(() => {
    const out: { label: string; span: number }[] = [];
    days.forEach(d => {
      const dt = fromIndex(d);
      const label = `Tháng ${dt.getUTCMonth() + 1}/${dt.getUTCFullYear()}`;
      const last = out[out.length - 1];
      if (last && last.label === label) last.span++;
      else out.push({ label, span: 1 });
    });
    return out;
  }, [days]);

  const rows = useMemo(
    () =>
      [...tasks].sort((a, b) => dayIndex(a.startDate) - dayIndex(b.startDate) || a.code.localeCompare(b.code)),
    [tasks]
  );

  const rangeLabel = `${fromIndex(start).toLocaleDateString('vi-VN', { timeZone: 'UTC' })} - ${fromIndex(start + total - 1).toLocaleDateString('vi-VN', { timeZone: 'UTC' })}`;
  const todayCol = today - start;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
      {/* Thanh điều khiển */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-slate-200">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setOffset(o => o - 7)}
            className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-lg border border-slate-200"
            aria-label="Lùi một tuần"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => setOffset(0)}
            className="px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-lg border border-slate-200"
          >
            Hôm nay
          </button>
          <button
            onClick={() => setOffset(o => o + 7)}
            className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-lg border border-slate-200"
            aria-label="Tiến một tuần"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <span className="ml-2 text-xs font-mono text-slate-600">{rangeLabel}</span>
        </div>

        <div className="flex items-center gap-3">
          <ul className="hidden md:flex items-center gap-3 text-[11px] text-slate-500" aria-label="Chú giải màu">
            {(Object.keys(STATUS_BAR) as TaskStatus[]).map(s => (
              <li key={s} className="flex items-center gap-1.5">
                <span className={`theme-fixed inline-block w-2.5 h-2.5 rounded-sm ${STATUS_BAR[s].bg}`} />
                {STATUS_BAR[s].label}
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg" role="group" aria-label="Khoảng thời gian">
            {RANGES.map(w => (
              <button
                key={w}
                onClick={() => setWeeks(w)}
                aria-pressed={weeks === w}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                  weeks === w ? 'bg-white text-slate-900 shadow-xs font-semibold' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {w} tuần
              </button>
            ))}
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="py-12 text-center text-xs text-slate-500">Không có nhiệm vụ nào để hiển thị</div>
      ) : (
        <div className="overflow-x-auto">
          <div className="flex" style={{ width: 'max-content', minWidth: '100%' }}>
            {/* Cột tên nhiệm vụ (dính bên trái khi cuộn ngang) */}
            <div className="sticky left-0 z-10 w-36 sm:w-72 shrink-0 bg-white border-r border-slate-200">
              <div className="h-[60px] px-3 flex items-end pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                Nhiệm vụ ({rows.length})
              </div>
              {rows.map(task => {
                const assignee = userMap.get(task.assigneeId);
                return (
                  <div
                    key={task.id}
                    style={{ height: ROW_H }}
                    className="px-3 flex items-center gap-2 border-b border-slate-100"
                  >
                    <div
                      className={`w-5 h-5 rounded-full text-white text-[9px] font-bold flex items-center justify-center shrink-0 ${assignee?.avatarColor || 'bg-zinc-700'}`}
                      title={assignee?.name || 'Chưa phân công'}
                    >
                      {assignee?.name.charAt(0) || '?'}
                    </div>
                    <div className="min-w-0">
                      <div className="font-mono text-[10px] font-bold text-indigo-600">{task.code}</div>
                      <div className="text-[11px] text-slate-800 truncate" title={task.title}>
                        {task.title}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Vùng thời gian */}
            <div style={{ width: total * cellW }} className="shrink-0">
              {/* Tiêu đề: tháng + ngày */}
              <div className="h-[60px] border-b border-slate-200">
                <div className="flex h-[28px] border-b border-slate-100">
                  {months.map((m, i) => (
                    <div
                      key={i}
                      style={{ width: m.span * cellW }}
                      className="px-2 flex items-center text-[11px] font-semibold text-slate-700 border-l border-slate-100 overflow-hidden whitespace-nowrap"
                    >
                      {m.label}
                    </div>
                  ))}
                </div>
                <div className="flex h-[31px]">
                  {days.map(d => {
                    const dt = fromIndex(d);
                    const dow = dt.getUTCDay();
                    const isToday = d === today;
                    return (
                      <div
                        key={d}
                        style={{ width: cellW }}
                        className={`flex flex-col items-center justify-center text-[10px] leading-tight border-l border-slate-100 ${
                          isToday ? 'bg-rose-600 text-white font-bold theme-fixed' : dow === 0 || dow === 6 ? 'text-slate-500' : 'text-slate-600'
                        }`}
                      >
                        <span>{dt.getUTCDate()}</span>
                        <span className="opacity-80">{WEEKDAYS[dow]}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Thân: cột kẻ, vạch hôm nay và các thanh */}
              <div className="relative">
                {days.map((d, i) => {
                  const dow = fromIndex(d).getUTCDay();
                  return (
                    <div
                      key={d}
                      aria-hidden="true"
                      style={{ left: i * cellW, width: cellW }}
                      className={`absolute inset-y-0 border-l border-slate-100 ${dow === 0 || dow === 6 ? 'bg-slate-50/80' : ''}`}
                    />
                  );
                })}
                {todayCol >= 0 && todayCol < total && (
                  <div
                    aria-hidden="true"
                    style={{ left: todayCol * cellW + cellW / 2 }}
                    className="absolute inset-y-0 w-px bg-rose-500/70 z-[1]"
                  />
                )}

                {rows.map(task => {
                  const s = dayIndex(task.startDate);
                  const e = Math.max(dayIndex(task.dueDate), s);
                  const from = Math.max(s, start);
                  const to = Math.min(e, start + total - 1);
                  const outLeft = e < start;
                  const outRight = s > start + total - 1;
                  const isLate = task.status !== 'done' && e < today;
                  const bar = STATUS_BAR[task.status];
                  const text = `${task.code}: ${task.startDate} đến ${task.dueDate}, ${bar.label}${isLate ? ', QUÁ HẠN' : ''}`;
                  const clickable = !!onTaskClick;

                  return (
                    <div key={task.id} style={{ height: ROW_H }} className="relative border-b border-slate-100">
                      {outLeft || outRight ? (
                        <span
                          className={`absolute top-1/2 -translate-y-1/2 text-[10px] text-slate-500 ${outLeft ? 'left-1' : 'right-1'}`}
                          title={text}
                        >
                          {outLeft ? (
                            <>
                              <ChevronLeft className="w-3 h-3 inline -mt-px" /> kết thúc trước khoảng này
                            </>
                          ) : (
                            <>
                              bắt đầu sau khoảng này <ChevronRight className="w-3 h-3 inline -mt-px" />
                            </>
                          )}
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={!clickable}
                          onClick={() => onTaskClick?.(task)}
                          title={text}
                          aria-label={text}
                          style={{ left: (from - start) * cellW + 2, width: (to - from + 1) * cellW - 4, top: 8, height: ROW_H - 16 }}
                          className={`theme-fixed absolute z-[2] rounded-md ${bar.bg} text-white text-[11px] font-medium px-2 flex items-center overflow-hidden whitespace-nowrap text-left shadow-xs ${
                            isLate ? 'ring-2 ring-rose-400' : ''
                          } ${clickable ? 'cursor-pointer hover:brightness-110' : 'cursor-default'}`}
                        >
                          {s < start && <ChevronLeft className="w-3 h-3 shrink-0 mr-1" aria-hidden="true" />}
                          <span className="truncate">{task.title}</span>
                          {e > start + total - 1 && <ChevronRight className="w-3 h-3 shrink-0 ml-auto pl-1 box-content" aria-hidden="true" />}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
