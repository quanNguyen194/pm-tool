import type { ProgressSnapshot } from '../types';

export type ChartMode = 'progress' | 'burndown';

interface ChartProject {
  startDate: string;
  targetEndDate: string;
}

const DAY = 86400000;
// Màu đọc từ biến CSS (đổi theo chế độ sáng/tối); bản in không có biến nên dùng giá trị dự phòng.
const COLORS = {
  actual: 'var(--chart-actual,#4f46e5)',
  area: 'var(--chart-area,rgba(79,70,229,0.09))',
  ideal: 'var(--chart-ideal,#94a3b8)',
  grid: 'var(--chart-grid,#e2e8f0)',
  text: 'var(--chart-text,#64748b)',
  today: 'var(--chart-today,#f59e0b)',
  ring: 'var(--chart-ring,#fff)'
};

const toDay = (iso: string) => Math.floor(Date.parse(iso + 'T00:00:00Z') / DAY);
const fmt = (day: number) => {
  const d = new Date(day * DAY);
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};
const fmtFull = (day: number) => `${fmt(day)}/${new Date(day * DAY).getUTCFullYear()}`;
const todayDay = () => Math.floor((Date.now() + 7 * 3600000) / DAY); // ngày hiện tại theo giờ Việt Nam

/** Kế hoạch lý tưởng (tuyến tính từ ngày bắt đầu đến hạn chót) tại thời điểm hôm nay, tính bằng %. */
export function plannedProgressToday(project: ChartProject): number {
  const start = toDay(project.startDate);
  const end = toDay(project.targetEndDate);
  if (end <= start) return 100;
  return Math.round(Math.min(1, Math.max(0, (todayDay() - start) / (end - start))) * 100);
}

/**
 * Vẽ biểu đồ đường bằng SVG thuần (dùng chung cho Dashboard, Reports và bản in).
 * Chỉ chèn số và ngày đã định dạng, không chèn văn bản người dùng, nên an toàn khi dùng innerHTML.
 */
export function buildProgressChartSvg(
  snapshots: ProgressSnapshot[],
  project: ChartProject,
  opts: { mode: ChartMode; /** Bề rộng khung chứa (px). Mặc định 640; truyền bề rộng thật để chữ không bị co nhỏ trên điện thoại. */ width?: number }
): string {
  const W = Math.max(280, Math.round(opts.width ?? 640));
  const compact = W < 480;
  const H = compact ? 220 : 260;
  const m = { l: compact ? 34 : 40, r: compact ? 10 : 16, t: 14, b: 30 };
  const iw = W - m.l - m.r;
  const ih = H - m.t - m.b;

  const label = opts.mode === 'progress' ? 'Biểu đồ tiến độ theo thời gian' : 'Biểu đồ burndown công việc';
  const svgOpen = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${label}" style="display:block;max-width:100%;height:auto;font-family:system-ui,sans-serif">`;

  const points = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));
  if (points.length === 0) {
    return `${svgOpen}<text x="${W / 2}" y="${H / 2}" text-anchor="middle" font-size="13" style="fill:${COLORS.text}">Chưa có dữ liệu lịch sử tiến độ</text></svg>`;
  }

  const start = Math.min(toDay(project.startDate), toDay(points[0].date));
  const end = Math.max(toDay(project.targetEndDate), toDay(points[points.length - 1].date), start + 1);
  const maxTasks = Math.max(1, ...points.map(p => p.tasksTotal));
  const yMax = opts.mode === 'progress' ? 100 : maxTasks;

  const x = (day: number) => m.l + ((day - start) / (end - start)) * iw;
  const y = (v: number) => m.t + ih - (Math.max(0, Math.min(yMax, v)) / yMax) * ih;
  const value = (p: ProgressSnapshot) => (opts.mode === 'progress' ? p.progressPercent : Math.max(0, p.tasksTotal - p.tasksDone));
  const unit = opts.mode === 'progress' ? '%' : ' việc còn lại';

  const parts: string[] = [svgOpen];

  // Lưới ngang + nhãn trục Y
  const burndownTicks =
    maxTasks <= 8
      ? Array.from({ length: maxTasks + 1 }, (_, i) => i)
      : [0, 1, 2, 3, 4].map(i => Math.round((maxTasks * i) / 4));
  const ticks = opts.mode === 'progress' ? [0, 25, 50, 75, 100] : burndownTicks;
  [...new Set(ticks)].forEach(t => {
    parts.push(
      `<line x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}" style="stroke:${COLORS.grid}" stroke-width="1"/>`,
      `<text x="${m.l - 6}" y="${y(t) + 4}" text-anchor="end" font-size="10" style="fill:${COLORS.text}">${t}${opts.mode === 'progress' ? '%' : ''}</text>`
    );
  });

  // Nhãn trục X (ít nhãn hơn trên màn hình hẹp)
  const xTicks = compact ? 2 : 4;
  for (let i = 0; i <= xTicks; i++) {
    const d = Math.round(start + ((end - start) * i) / xTicks);
    parts.push(
      `<text x="${x(d)}" y="${H - 10}" text-anchor="${i === 0 ? 'start' : i === xTicks ? 'end' : 'middle'}" font-size="10" style="fill:${COLORS.text}">${fmt(d)}</text>`
    );
  }

  // Đường kế hoạch lý tưởng
  const idealStart = opts.mode === 'progress' ? 0 : maxTasks;
  const idealEnd = opts.mode === 'progress' ? 100 : 0;
  parts.push(
    `<line x1="${x(toDay(project.startDate))}" y1="${y(idealStart)}" x2="${x(toDay(project.targetEndDate))}" y2="${y(idealEnd)}" style="stroke:${COLORS.ideal}" stroke-width="1.5" stroke-dasharray="5 4"><title>Kế hoạch lý tưởng</title></line>`
  );

  // Đường "hôm nay"
  const t = todayDay();
  if (t >= start && t <= end) {
    parts.push(
      `<line x1="${x(t)}" x2="${x(t)}" y1="${m.t}" y2="${m.t + ih}" style="stroke:${COLORS.today}" stroke-width="1" stroke-dasharray="2 3"/>`,
      `<text x="${x(t)}" y="${m.t + 9}" text-anchor="${x(t) > W - 60 ? 'end' : 'start'}" dx="${x(t) > W - 60 ? -4 : 4}" font-size="10" style="fill:${COLORS.today}">Hôm nay</text>`
    );
  }

  // Đường thực tế + vùng tô
  const coords = points.map(p => `${x(toDay(p.date)).toFixed(1)},${y(value(p)).toFixed(1)}`);
  if (points.length > 1) {
    const first = x(toDay(points[0].date)).toFixed(1);
    const last = x(toDay(points[points.length - 1].date)).toFixed(1);
    parts.push(
      `<polygon points="${first},${y(0)} ${coords.join(' ')} ${last},${y(0)}" style="fill:${COLORS.area}"/>`,
      `<polyline points="${coords.join(' ')}" fill="none" style="stroke:${COLORS.actual}" stroke-width="2.25" stroke-linejoin="round" stroke-linecap="round"/>`
    );
  }

  // Điểm dữ liệu (có tooltip). Nhiều điểm thì chỉ vẽ điểm cuối + điểm cách quãng.
  const step = points.length > 40 ? Math.ceil(points.length / 20) : 1;
  points.forEach((p, i) => {
    const isLast = i === points.length - 1;
    if (!isLast && i % step !== 0) return;
    parts.push(
      `<circle cx="${x(toDay(p.date)).toFixed(1)}" cy="${y(value(p)).toFixed(1)}" r="${isLast ? 4.5 : 3}" style="fill:${COLORS.actual};stroke:${COLORS.ring}" stroke-width="1.5"><title>${fmtFull(toDay(p.date))}: ${value(p)}${unit}</title></circle>`
    );
  });

  parts.push('</svg>');
  return parts.join('');
}
