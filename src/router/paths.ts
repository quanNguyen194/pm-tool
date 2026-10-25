// Đường dẫn của ứng dụng: phân tích và dựng lại. Không phụ thuộc React để kiểm thử bằng node.
//
//   /                                   -> chuyển tới tổng quan của dự án gần nhất
//   /projects                           -> danh sách dự án
//   /p/<mã dự án>                       -> tổng quan dự án
//   /p/<mã dự án>/tasks[/<mã nhiệm vụ>] -> nhiệm vụ (kèm ?view=kanban|gantt|table), mở chi tiết nếu có mã
//   /p/<mã dự án>/usecases[/<mã use case>]
//   /p/<mã dự án>/issues[/<số issue>]   (kèm ?view=board)
//   /p/<mã dự án>/quality | reports | team
//   /s/<mã chia sẻ>[/...]               -> chế độ khách (chia sẻ cho người chưa có tài khoản)

export type AppTab = 'dashboard' | 'projects' | 'tasks' | 'usecases' | 'quality' | 'issues' | 'reports' | 'team';

export type AppRoute =
  | { kind: 'root' }
  | { kind: 'app'; tab: AppTab; projectCode?: string; itemCode?: string }
  | { kind: 'share'; token: string; rest: string[] }
  | { kind: 'unknown' };

const TAB_BY_SEGMENT: Record<string, AppTab> = {
  tasks: 'tasks',
  usecases: 'usecases',
  issues: 'issues',
  quality: 'quality',
  reports: 'reports',
  team: 'team'
};
/** Các tab có thể mở một mục cụ thể theo mã. */
const TABS_WITH_ITEM = new Set<AppTab>(['tasks', 'usecases', 'issues']);

const decode = (s: string): string | null => {
  try {
    return decodeURIComponent(s);
  } catch {
    return null;
  }
};

export function parsePath(pathname: string): AppRoute {
  const raw = pathname.split('/').filter(Boolean);
  const seg: string[] = [];
  for (const r of raw) {
    const d = decode(r);
    if (d === null) return { kind: 'unknown' };
    seg.push(d);
  }
  if (seg.length === 0) return { kind: 'root' };
  if (seg[0] === 'projects' && seg.length === 1) return { kind: 'app', tab: 'projects' };
  if (seg[0] === 's' && seg.length >= 2) return { kind: 'share', token: seg[1], rest: seg.slice(2) };
  if (seg[0] === 'p' && seg.length >= 2) {
    const projectCode = seg[1];
    if (seg.length === 2) return { kind: 'app', tab: 'dashboard', projectCode };
    const tab = TAB_BY_SEGMENT[seg[2]];
    if (!tab) return { kind: 'unknown' };
    if (seg.length === 3) return { kind: 'app', tab, projectCode };
    if (seg.length === 4 && TABS_WITH_ITEM.has(tab)) return { kind: 'app', tab, projectCode, itemCode: seg[3] };
  }
  return { kind: 'unknown' };
}

export interface PathTarget {
  tab: AppTab;
  projectCode?: string;
  itemCode?: string;
}

const enc = (s: string) => encodeURIComponent(s);

export function buildPath(t: PathTarget): string {
  if (t.tab === 'projects') return '/projects';
  if (!t.projectCode) return '/';
  const base = `/p/${enc(t.projectCode)}`;
  if (t.tab === 'dashboard') return base;
  const tabPath = `${base}/${t.tab}`;
  return t.itemCode && TABS_WITH_ITEM.has(t.tab) ? `${tabPath}/${enc(t.itemCode)}` : tabPath;
}

/** Đường dẫn của link chia sẻ (khách): /s/<mã>[/tab[/mục]] */
export function buildSharePath(token: string, rest: string[] = []): string {
  return `/s/${enc(token)}${rest.map(r => `/${enc(r)}`).join('')}`;
}
