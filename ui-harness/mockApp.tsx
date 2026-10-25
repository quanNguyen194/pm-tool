import React, { createContext, useContext, useMemo, useState } from 'react';
import { useRouter } from '../src/router/Router';

const iso = (n: number) => new Date(Date.now() + 7 * 3600000 + n * 86400000).toISOString().slice(0, 10);
const users = [
  { id: 'u1', name: 'quan.ntm194', email: 'quan@example.com', avatarColor: 'bg-blue-600', role: 'admin', isAdmin: true, isPlaceholder: false, department: 'PMO' },
  { id: 'u2', name: 'Lê Hoàng Long Rất Dài Để Thử Cắt Chữ', email: 'long.le.hoang.dai@example.com', avatarColor: 'bg-emerald-700', role: 'dev', isAdmin: false, isPlaceholder: false, department: 'Khối Kỹ Thuật & Phát Triển Phần Mềm' },
  { id: 'u3', name: 'Đỗ Bích Ngọc', email: 'ngoc@example.com', avatarColor: 'bg-amber-700', role: 'tester', isAdmin: false, isPlaceholder: false, department: 'QA' },
  { id: 'u4', name: 'Phạm Minh Anh', email: 'anh@example.com', avatarColor: 'bg-blue-600', role: 'ba', isAdmin: false, isPlaceholder: false, department: 'BA' },
  { id: 'u5', name: 'Nguyễn Văn Chưa Đăng Ký', email: '', avatarColor: 'bg-zinc-700', role: 'dev', isAdmin: false, isPlaceholder: true, department: '' }
];
const mk = (id: string, code: string, title: string, status: string, priority: string, a: string, s: number, d: number, est: number, act: number, uc?: string, extra: any = {}) => ({
  id, projectId: 'p1', code, title, description: 'Mô tả chi tiết của nhiệm vụ ' + code + ' để kiểm tra việc cắt dòng trên màn hình nhỏ.', status, priority, assigneeId: a,
  collaboratorIds: [], department: 'dev', phase: 'Giai đoạn 3: Phát triển Sprint', estimatedEffort: est, actualEffort: act, startDate: iso(s), dueDate: iso(d),
  actualEndDate: status === 'done' ? iso(d - 1) : undefined, progressPercent: status === 'done' ? 100 : status === 'review' ? 70 : status === 'in_progress' ? 40 : 0,
  assessment: undefined, deliverable: 'Tài liệu thiết kế và mã nguồn đã được review, kèm báo cáo kiểm thử.', notes: 'Phụ thuộc vào đội hạ tầng cấp môi trường.',
  tags: ['Security', 'Backend'], useCaseIds: uc ? [uc] : [], ...extra
});
const tasks = [
  mk('t1', 'OB-101', 'Tích hợp Module Xác thực sinh trắc học eKYC và CCCD gắn chip', 'in_progress', 'urgent', 'u1', -7, 1, 5, 3.5, 'uc1', { collaboratorIds: ['u2', 'u3', 'u4'], department: 'dev', progressPercent: 40, assessment: 'at_risk', useCaseIds: ['uc1', 'uc2', 'uc11', 'uc12', 'uc121', 'uc122', 'b1', 'b2', 'b3', 'b4', 'b5'] }),
  mk('t2', 'OB-102', 'Xây dựng dịch vụ Chuyển tiền nhanh NAPAS 24/7 qua mã QR VietQR', 'in_progress', 'high', 'u2', -6, 3, 4, 2.5, 'uc2', { collaboratorIds: ['u3'], progressPercent: 75 }),
  mk('t3', 'OB-103', 'Thực hiện kiểm thử xâm nhập bảo mật chuẩn PCI-DSS', 'todo', 'urgent', 'u2', -3, -1, 4.5, 0, 'uc1', { department: 'tester' }),
  mk('t4', 'OB-104', 'Thiết kế giao diện Dark Mode màn hình tổng quan', 'review', 'medium', 'u3', -16, 2, 2.5, 2.8, undefined, { department: 'ba', collaboratorIds: ['u1'], progressPercent: 90 }),
  mk('t5', 'OB-105', 'Hoàn thiện tài liệu kiến trúc microservices', 'done', 'high', 'u1', -52, -21, 6, 5.5, 'uc1', { department: 'pm' }),
  mk('t6', 'OB-106', 'Tác vụ chưa giao', 'todo', 'low', '', -1, 9, 1, 0, undefined, { department: undefined })
];
const proj = (id: string, code: string, name: string, p: number, status = 'in_progress') => ({
  id, code, name, visibility: id === 'p1' ? 'public' : 'private',
  description: 'Nền tảng Internet Banking & Mobile Banking thế hệ mới hỗ trợ thanh toán tức thì, định danh điện tử eKYC và bảo mật đa lớp sinh trắc học.',
  status, priority: 'urgent', managerId: 'u1', startDate: iso(-60), targetEndDate: iso(45), budget: 1850000000, progressPercent: p, currentPhase: 'phase_3', progressModel: 'stages', memberIds: ['u1', 'u2', 'u3']
});
const projects = [
  proj('p1', 'OMNI-BANK', 'Hệ Thống Ngân Hàng Số Omni-Channel', 53),
  proj('p2', 'E-SHOP-B2B', 'Sàn Thương Mại Điện Tử & Phân Phối B2B', 78),
  proj('p3', 'GPDN_DNMB_EVNNPC_QTVT_251004', 'Hệ Thống Y Tế & Khám Bệnh Trực Tuyến TeleHealth', 36, 'planning')
];
const crit = (id: string, d: string, c: boolean) => ({ id, description: d, completed: c });
const mkUc = (id: string, code: string, title: string, parentId: string | undefined, status: string, pct: number, crits: any[] = []) => ({
  id, projectId: 'p1', parentId, kind: 'usecase', tags: ['Web'], complexity: 'medium', transactions: 4, necessity: 'B', stagesDone: [] as any[], origin: 'contract', changeNote: '', agreedWhen: '', code, title, actor: 'Khách hàng cá nhân',
  description: 'Cho phép khách hàng thực hiện nghiệp vụ từ xa thông qua ứng dụng di động.', priority: 'high', status, progressPercent: pct,
  mainFlow: ['1. Nhập số điện thoại và xác thực OTP', '2. Chụp ảnh 2 mặt CCCD gắn chip', '3. Quét khuôn mặt sinh trắc học'], alternateFlow: ['3a. Ảnh mờ: yêu cầu chụp lại'],
  acceptanceCriteria: crits, assignedTo: 'u2', updatedAt: iso(-2)
});
const useCases = [
  mkUc('uc1', 'UC-OB-01', 'Đăng ký tài khoản và Định danh điện tử (eKYC)', undefined, 'developing', 68),
  mkUc('uc11', 'UC-OB-01.1', 'Xác thực số điện thoại bằng OTP', 'uc1', 'completed', 100, [crit('a1', 'OTP gửi trong 5 giây', true), crit('a2', 'Khóa sau 3 lần nhập sai', true)]),
  mkUc('uc12', 'UC-OB-01.2', 'Nhận diện giấy tờ và khuôn mặt', 'uc1', 'developing', 36),
  mkUc('uc121', 'UC-OB-01.2.1', 'Quét OCR hai mặt CCCD gắn chip', 'uc12', 'developing', 50, [crit('b1', 'Độ chính xác OCR đạt trên 98%', true), crit('b2', 'Phản hồi không quá 5 giây', false)]),
  mkUc('uc122', 'UC-OB-01.2.2', 'Chống giả mạo khuôn mặt (Liveness)', 'uc12', 'approved', 22, [crit('c1', 'Chống giả mạo ảnh tĩnh', false)]),
  mkUc('uc2', 'UC-OB-02', 'Chuyển tiền nhanh liên ngân hàng Napas 24/7 & VietQR', undefined, 'approved', 40, [crit('d1', 'Tự động tra cứu tên người nhận trong 1.5s', false)])
];
const mkGroup = (id: string, code: string, title: string, parentId: string | undefined, tag: string) => ({
  ...mkUc(id, code, title, parentId, 'draft', 0), kind: 'group', tags: [tag], actor: '', description: '', mainFlow: [], alternateFlow: [], complexity: undefined, transactions: undefined
});
const bulk: any[] = [
  mkGroup('m1', 'W-I', 'Quản lý định danh vật tư, thiết bị', undefined, 'Web'),
  mkGroup('m11', 'W-I.1', 'Cấu hình thông số định danh vật tư, thiết bị với tên dài để thử cắt chữ trên màn hình nhỏ', 'm1', 'Web'),
  mkGroup('m2', 'TH', 'Tích hợp dữ liệu', undefined, 'Tích hợp dữ liệu'),
  mkGroup('m21', 'TH-I', 'Lấy dữ liệu từ Kho', 'm2', 'Tích hợp dữ liệu')
];
for (let i = 1; i <= 60; i++) {
  const num = String(100 + i).padStart(3, '0');
  const inWeb = i <= 20;
  bulk.push({
    ...mkUc('b' + i, 'UC-' + num, (inWeb ? 'Quản lý cấu hình danh mục số ' : 'Lấy dữ liệu thiết bị - Thông số vận hành số ') + i, inWeb ? 'm11' : 'm21', i % 7 === 0 ? 'completed' : 'draft', i % 7 === 0 ? 100 : 0),
    tags: [inWeb ? 'Web' : 'Tích hợp dữ liệu'], complexity: ['simple', 'medium', 'complex'][i % 3 === 0 ? 2 : i % 2], transactions: (i % 5) + 1
  });
}
const stageOf = (stages: string[]) => stages.map(stage => ({ stage, doneBy: 'u2', doneAt: new Date().toISOString() }));
bulk.forEach((u, i) => {
  if (u.kind === 'usecase') u.stagesDone = stageOf(['analysis', 'design', 'coding', 'testing', 'acceptance'].slice(0, i % 6));
});
bulk.forEach((u, i) => {
  if (u.kind !== 'usecase') return;
  if (i % 9 === 0) Object.assign(u, { origin: 'added', changeNote: 'Bổ sung theo yêu cầu của Ban 10 sau khi khảo sát nghiệp vụ', agreedWhen: 'Sau khi khảo sát nghiệp vụ vào tháng 01/2026' });
  if (i % 17 === 0) Object.assign(u, { origin: 'adjusted', changeNote: 'Theo hợp đồng: 5 transaction (Trung bình) → sau điều chỉnh: 9 transaction (Phức tạp). Tăng 4 transaction.' });
});
bulk.push(
  { ...mkUc('x1', 'KTH-001', 'Quản lý cấu hình dữ liệu ghi vào thẻ RFID', 'm11', 'cancelled', 0), tags: ['Web'], changeNote: 'Khách hàng không có nhu cầu thực hiện phương thức định danh bằng RFID', agreedWhen: 'Sau khi khảo sát nghiệp vụ vào tháng 01/2026' },
  mkGroup('mx', 'KTH-W', 'Không thực hiện (Web)', undefined, 'Web'),
  { ...mkUc('x2', 'KTH-002', 'Quản lý thanh lý', 'mx', 'cancelled', 0), tags: ['Web'], changeNote: 'Khách hàng không có nhu cầu quản lý thanh lý VTTB trên hệ thống' }
);
useCases.push(...bulk);
const items = (p: string, titles: string[]) =>
  titles.map((t, i) => ({
    id: p + i, title: t, description: 'Mô tả tiêu chuẩn ' + (i + 1) + ' của giai đoạn.', isMandatory: i % 3 !== 2, isPassed: p === "phase_1" ? true : i % 2 === 0,
    checkedBy: i % 2 === 0 ? 'quan.ntm194 (ADMIN)' : undefined, checkedAt: i % 2 === 0 ? iso(-9) : undefined, notes: i === 0 ? 'Đã ký kết hợp đồng tài trợ và cam kết mốc tiến độ.' : undefined
  }));
const phases = ['phase_1', 'phase_2', 'phase_3', 'phase_4', 'phase_5'].map((id, i) => ({
  id, name: `Giai đoạn ${i + 1}: Tên giai đoạn đầy đủ khá dài`, shortName: ['Khởi tạo & Kế hoạch', 'Phân tích & Thiết kế', 'Phát triển Sprint', 'Kiểm thử QA/QC', 'UAT & Release'][i],
  description: 'Mô tả giai đoạn.', items: items(id, ['Tài liệu Điều lệ Dự án đã được phê duyệt', 'Cơ cấu phân rã công việc (WBS) & Dự toán ngân sách', 'Kế hoạch Quản lý Rủi ro & Ma trận RACI'])
}));
const snaps = Array.from({ length: 61 }, (_, k) => {
  const i = k - 60;
  const t = k / 60;
  return { date: iso(i), progressPercent: Math.round(53 * (t * t * (3 - 2 * t))), tasksTotal: 6, tasksDone: i >= -6 ? 1 : 0, qualityTotal: 15, qualityPassed: 8 };
});
const summary = {
  project: { code: 'OMNI-BANK', name: 'Hệ Thống Ngân Hàng Số', phase: 'phase_3' }, progress: { start: 40, end: 53, delta: 13 },
  tasks: { total: 6, done: 1, inProgress: 2, review: 1, todo: 2, overdue: 1, doneInPeriod: 1 }, useCases: { total: 2, completed: 0 }, quality: { total: 15, passed: 8 },
  attention: [{ code: 'OB-103', title: 'Penetration Test', dueDate: iso(-1), status: 'todo' }]
};
const notifications = [
  { id: 'n1', projectId: 'p1', type: 'overdue', title: 'Cảnh Báo Quá Hạn: OB-103', message: 'Nhiệm vụ "Penetration Test" đã quá hạn chót 1 ngày!', taskId: 't3', createdAt: '02/10/2026 08:00', isRead: false }
];

const Ctx = createContext<any>(null);


const ISSUE_TYPES = [
  { id: 'ty1', projectId: 'p1', name: 'Bug', color: 'rose', sort: 10, active: true },
  { id: 'ty2', projectId: 'p1', name: 'Yêu cầu thay đổi (CR)', color: 'amber', sort: 20, active: true },
  { id: 'ty3', projectId: 'p1', name: 'Cải tiến', color: 'blue', sort: 30, active: true },
  { id: 'ty4', projectId: 'p1', name: 'Câu hỏi / Hỗ trợ', color: 'purple', sort: 40, active: false }
];
const ISSUE_PRIORITIES = [
  { id: 'pr1', projectId: 'p1', name: 'Khẩn cấp', color: 'rose', sort: 10, active: true, isDefault: false },
  { id: 'pr2', projectId: 'p1', name: 'Cao', color: 'amber', sort: 20, active: true, isDefault: false },
  { id: 'pr3', projectId: 'p1', name: 'Vừa', color: 'blue', sort: 30, active: true, isDefault: true },
  { id: 'pr4', projectId: 'p1', name: 'Thấp', color: 'slate', sort: 40, active: true, isDefault: false }
];
const ISSUE_STATUSES = [
  ['Mới', 'blue', 'open', true], ['Đang thực hiện', 'indigo', 'in_progress', false], ['Code xong', 'purple', 'in_progress', false],
  ['Test xong', 'emerald', 'in_progress', false], ['Chờ triển khai', 'amber', 'in_progress', false], ['Sẵn sàng bàn giao', 'emerald', 'in_progress', false],
  ['Đóng', 'slate', 'closed', false], ['Mở lại', 'rose', 'open', false], ['Chưa hoàn thiện', 'amber', 'open', false]
].map(([name, color, category, initial], i) => ({ id: `st${i + 1}`, projectId: 'p1', name, color, category, sort: (i + 1) * 10, active: true, initial }));
const isoAgo = (daysAgo: number) => new Date(Date.now() - daysAgo * 86400000).toISOString();
const ymd = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
const ISSUES = [
  { id: 'is1', projectId: 'p1', number: 12, typeId: 'ty1', statusId: 'st2', title: 'Không đăng nhập được bằng tài khoản SSO sau khi đổi mật khẩu, màn hình trắng', description: '1. Đổi mật khẩu\n2. Đăng xuất\n3. Đăng nhập lại bằng SSO -> trắng trang.', priorityId: 'pr1', severity: 'critical', environment: 'UAT', reporterId: 'u3', assigneeId: 'u2', dueDate: ymd(-2), useCaseId: 'uc1', createdAt: isoAgo(5), updatedAt: isoAgo(0) },
  { id: 'is2', projectId: 'p1', number: 11, typeId: 'ty2', statusId: 'st1', title: 'Bổ sung cột Mã vật tư vào báo cáo tồn kho', description: '', priorityId: 'pr3', environment: '', reporterId: 'u1', createdAt: isoAgo(3), updatedAt: isoAgo(3) },
  { id: 'is3', projectId: 'p1', number: 10, typeId: 'ty1', statusId: 'st7', title: 'Sai tổng tiền khi áp dụng 2 mã giảm giá', description: 'Đã sửa và test xong.', priorityId: 'pr2', severity: 'major', environment: 'PROD', reporterId: 'u3', assigneeId: 'u2', createdAt: isoAgo(10), updatedAt: isoAgo(1), closedAt: isoAgo(1) },
  { id: 'is4', projectId: 'p1', number: 9, typeId: 'ty3', statusId: 'st8', title: 'Cải thiện tốc độ tải danh sách nhiệm vụ', description: '', priorityId: 'pr4', environment: '', reporterId: 'u4', assigneeId: 'u4', dueDate: ymd(5), createdAt: isoAgo(12), updatedAt: isoAgo(2) }
];
const svgPic = (seed: string) =>
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><rect width="320" height="200" fill="hsl(${(seed.length * 47) % 360},60%,80%)"/><text x="20" y="110" font-size="28" fill="#334155">${seed.slice(-12)}</text></svg>`);
const ISSUE_ATTACHMENTS = [
  { id: 'at1', issueId: 'is1', projectId: 'p1', journalId: 'j1', uploaderId: 'u3', fileName: 'man-hinh-loi-dang-nhap-sau-khi-doi-mat-khau.png', mimeType: 'image/png', sizeBytes: 820 * 1024, kind: 'image', storagePath: 'p1/is1/at1.png', createdAt: isoAgo(5) },
  { id: 'at2', issueId: 'is1', projectId: 'p1', uploaderId: 'u2', fileName: 'log.webp', mimeType: 'image/webp', sizeBytes: 140 * 1024, kind: 'image', storagePath: 'p1/is1/at2.webp', createdAt: isoAgo(2) },
  { id: 'at3', issueId: 'is1', projectId: 'p1', uploaderId: 'u3', fileName: 'tai-hien.mp4', mimeType: 'video/mp4', sizeBytes: 17 * 1024 * 1024, kind: 'video', storagePath: 'p1/is1/at3.mp4', createdAt: isoAgo(5) }
];
const ISSUE_JOURNALS = [
  { id: 'j1', issueId: 'is1', userId: 'u3', notes: 'Lỗi xảy ra 100% trên UAT, đính kèm log phía dưới.', createdAt: isoAgo(5), details: [] },
  { id: 'j2', issueId: 'is1', userId: 'u1', parentId: 'j1', notes: 'Đã nhận. Giao cho Long xử lý.', createdAt: isoAgo(4), details: [] },
  { id: 'j3', issueId: 'is1', userId: 'u1', notes: 'Giao việc', createdAt: isoAgo(4), details: [{ id: 1, field: 'assignee', oldValue: '—', newValue: 'Lê Hoàng Long' }, { id: 2, field: 'priority', oldValue: 'Cao', newValue: 'Khẩn cấp' }] },
  { id: 'j4', issueId: 'is1', userId: 'u2', notes: 'Bắt đầu kiểm tra phiên đăng nhập.', createdAt: isoAgo(2), details: [{ id: 3, field: 'status', oldValue: 'Mới', newValue: 'Đang thực hiện' }] },
  { id: 'j5', issueId: 'is1', userId: 'u3', parentId: 'j4', notes: 'Cần sớm vì khách hàng chờ.', createdAt: isoAgo(1), details: [] },
  { id: 'j6', issueId: 'is1', userId: 'u2', parentId: 'j5', notes: 'OK, sáng mai có bản vá.', createdAt: isoAgo(0), details: [] },
  { id: 'j7', issueId: 'is1', userId: 'u1', notes: '', createdAt: isoAgo(0), details: [{ id: 4, field: 'description', oldValue: 'Mô tả cũ', newValue: 'Mô tả mới chi tiết hơn' }] },
  { id: 'j8', issueId: 'is1', userId: 'u3', notes: 'Bổ sung ảnh chụp lỗi', createdAt: isoAgo(0), details: [{ id: 5, field: 'attachment', newValue: 'man-hinh-loi.png' }, { id: 6, field: 'attachment', oldValue: 'anh-cu.png' }] }
];

export const MockProvider = ({ children }: any) => {
  const params = new URLSearchParams(location.search);
  const role = params.get('role') || 'admin';
  const [activeTab, setActiveTab] = useState(params.get('page') || 'dashboard');
  const [activeProjectId, setActiveProjectId] = useState('p1');
  // Mục đang mở lấy từ ?item=task:<mã> | issue:<số> (thay cho địa chỉ thật của ứng dụng)
  const router = useRouter();
  const itemParam = router.query.get('item');
  const itemCode = itemParam ? itemParam.split(':')[1] : null;
  const itemHref = (kind: string, code: string) => {
    const q = new URLSearchParams(location.search);
    q.set('item', `${kind}:${code}`);
    return `?${q.toString()}`;
  };
  (window as any).__setTab = setActiveTab;
  const [issueView, setIssueView] = useState<'list' | 'board'>(params.get('view') === 'board' ? 'board' : 'list');
  (window as any).__setIssueView = setIssueView;

  const base = useMemo(() => {
    const isAdmin = role === 'admin';
    const mgr = role === 'admin' || role === 'pm';
    const activeProject = projects.find(p => p.id === activeProjectId)!;
    return {
      isGuest: params.get('guest') === '1', guestDenied: false, visibilityAvailable: true, setProjectVisibility: async () => true,
      activeTab, setActiveTab,
      routeItemCode: itemCode, routeProjectMissing: false,
      hrefFor: (t: any) => (t.taskId ? itemHref('task', tasks.find(x => x.id === t.taskId)?.code ?? '') : t.issueId ? itemHref('issue', String(ISSUES.find(x => x.id === t.issueId)?.number ?? '')) : '#'),
      copyLink: async () => undefined,
      closeItem: () => router.setQuery('item', null),
      openTask: (taskId: string) => { setActiveTab('tasks'); router.navigate(itemHref('task', tasks.find(x => x.id === taskId)?.code ?? '')); },
      openIssue: (issueId: string) => { setActiveTab('issues'); router.navigate(itemHref('issue', String(ISSUES.find(x => x.id === issueId)?.number ?? ''))); },
      openUseCase: () => undefined,
      activeProjectId, setActiveProjectId, activeProject, projects, tasks, projectTasks: tasks, users, allUsers: users,
      currentUser: { ...users[0], role }, useCases, projectUseCases: useCases, qualityGates: [{ projectId: 'p1', phases }],
      projectQualityGates: { projectId: 'p1', phases }, notifications, unreadNotificationCount: 1, projectSnapshots: snaps,
      reportSchedules: [{ id: 's1', projectId: 'p1', frequency: 'weekly', enabled: true }],
      reportRuns: [{ id: 'r1', projectId: 'p1', frequency: 'weekly', periodStart: isoAgo(-7), periodEnd: isoAgo(-1), createdAt: new Date().toISOString(), summary }],
      mergeRequests: [{ id: 'm1', placeholderId: 'u5', userId: 'u3', status: 'pending', createdAt: new Date().toISOString() }],
      suggestAccounts: async (q: string) =>
        [
          { id: 's1', name: 'Hoàng Văn Gợi Ý', email: 'goiy@example.com', avatarColor: 'bg-blue-600', isPlaceholder: false },
          { id: 's2', name: 'Trần Thị Mới Thêm Trước', email: '', avatarColor: 'bg-zinc-700', isPlaceholder: true }
        ].filter(s => !q || s.name.toLowerCase().includes(q.toLowerCase()) || s.email.includes(q.toLowerCase())),
      getTelegram: async () => ({ chatId: '', enabled: true, configured: false, botUsername: 'omni_pm_bot' }),
      saveTelegram: async () => null,
      testTelegram: async () => ({ ok: false, message: 'Bad Request: chat not found' }),
      setUseCaseLevel: async () => true,
      getAccessReport: async () => ({
        role: role === 'admin' ? null : role, isAdmin: role === 'admin', view: true, manage: role === 'admin' || role === 'pm',
        writeTasks: role !== 'viewer', writeUseCases: role !== 'viewer' && role !== 'tester', approveQuality: role === 'admin' || role === 'pm' || role === 'tester',
        stages: { analysis: role === 'admin' || role === 'pm' || role === 'ba', design: role === 'admin' || role === 'pm' || role === 'ba', coding: role === 'admin' || role === 'pm' || role === 'dev', testing: role === 'admin' || role === 'pm' || role === 'tester', acceptance: role === 'admin' || role === 'pm' },
        visible: { useCases: 73, tasks: 6, members: 4 }, total: { useCases: 73, tasks: 6, members: 4 }
      }),
      getMemberAccessReport: async () => ({
        role: 'dev', isAdmin: false, view: true, manage: false, writeTasks: true, writeUseCases: true, approveQuality: false,
        stages: { analysis: false, design: false, coding: true, testing: false, acceptance: false }
      }),
      permissionMatrix: (() => {
        const m: any = {};
        const defaults: Record<string, string[]> = {
          manage_project: ['pm'], write_tasks: ['pm', 'dev', 'ba', 'tester'], write_usecases: ['pm', 'dev', 'ba'], approve_quality: ['pm', 'tester'],
          stage_analysis: ['pm', 'ba'], stage_design: ['pm', 'ba'], stage_coding: ['pm', 'dev'], stage_testing: ['pm', 'tester'], stage_acceptance: ['pm']
        };
        for (const [p, rs] of Object.entries(defaults)) {
          m[p] = {};
          for (const r of ['pm', 'dev', 'ba', 'tester', 'viewer']) m[p][r] = { allowed: rs.includes(r), source: 'default' };
        }
        m.write_usecases.ba = { allowed: false, source: 'global' }; // một ô tùy chỉnh để thử hiển thị chấm đánh dấu
        m.manage_project.dev = { allowed: true, source: 'project' };
        return m;
      })(),
      getPermissionMatrix: async () => {
        const m: any = {};
        for (const p of ['manage_project', 'write_tasks', 'write_usecases', 'approve_quality', 'stage_analysis', 'stage_design', 'stage_coding', 'stage_testing', 'stage_acceptance']) {
          m[p] = {};
          for (const r of ['pm', 'dev', 'ba', 'tester', 'viewer']) m[p][r] = { allowed: p === 'write_tasks' ? r !== 'viewer' : r === 'pm', source: 'default' };
        }
        return m;
      },
      savePermissions: async () => null,
      resetPermissions: async () => ({ removed: 2 }),
      getPermissionLog: async () => [
        { role: 'dev', permission: 'manage_project', from: false, to: true, by: 'quan.ntm194', at: new Date().toISOString() },
        { role: 'ba', permission: 'write_usecases', from: true, to: false, by: 'quan.ntm194', at: new Date().toISOString() }
      ],
      removeMember: (id: string) => { (window as any).__removed = id; },
      editQualityItem: () => undefined,
      deleteQualityItem: () => undefined,
      issuesAvailable: true,
      issueView,
      setIssueView,
      attachmentsAvailable: true,
      getIssueAttachments: (id: string) => ISSUE_ATTACHMENTS.filter(a => a.issueId === id),
      getAttachmentUrls: async (paths: string[]) => Object.fromEntries(paths.map(p => [p, svgPic(p)])),
      deleteIssueAttachment: async () => true,
      getAttachmentUsage: async () => ({ projectBytes: 18 * 1024 * 1024, projectCount: 3, totalBytes: role === 'admin' ? 640 * 1024 * 1024 : undefined, capBytes: 900 * 1024 * 1024 }),
      issueTypes: ISSUE_TYPES,
      issueStatuses: ISSUE_STATUSES,
      issuePriorities: ISSUE_PRIORITIES,
      saveIssuePriorities: async () => null,
      projectIssues: ISSUES,
      getIssueJournals: (id: string) => ISSUE_JOURNALS.filter(j => j.issueId === id),
      canCreateIssue: role !== 'viewer', canUpdateIssue: role !== 'viewer', canEditIssue: mgr || role === 'ba', canAssignIssue: mgr, canDeleteIssue: mgr,
      canConfigIssueTypes: mgr, canConfigIssueStatuses: mgr,
      createIssue: async () => ({ id: 'i1', number: 99 }), updateIssue: async () => true, editIssueNote: async () => true, deleteIssueNote: async () => true, deleteIssue: async () => true,
      saveIssueTypes: async () => null, saveIssueStatuses: async () => null,
      toasts: [], isLoading: false, loadError: null, isAdmin, canManageProject: mgr, canManageProjectId: () => mgr,
      canManageTasks: mgr || ['dev', 'ba', 'tester'].includes(role), canManageUseCases: mgr || ['dev', 'ba'].includes(role), canTickStage: (st: string) => mgr || (role === 'ba' && ['analysis', 'design'].includes(st)) || (role === 'dev' && st === 'coding') || (role === 'tester' && st === 'testing'), canApproveQuality: mgr || role === 'tester', canEditQualityItems: mgr, canApproveUseCase: mgr, isViewer: role === 'viewer', soundMuted: false
    };
  }, [activeTab, activeProjectId, role, itemCode, router.search]);

  // Mọi thuộc tính không khai báo (hàm thao tác) trả về hàm rỗng.
  const value = useMemo(() => new Proxy(base as any, { get: (t, k) => (k in t ? t[k] : () => {}) }), [base]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export const useApp = () => useContext(Ctx);

// App.tsx importa AppProvider; trong harness chỉ cần truyền children.
export const AppProvider = ({ children }: any) => children;
