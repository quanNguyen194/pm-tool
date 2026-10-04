import React, { createContext, useContext, useMemo, useState } from 'react';

const iso = (n: number) => new Date(Date.now() + 7 * 3600000 + n * 86400000).toISOString().slice(0, 10);
const users = [
  { id: 'u1', name: 'quan.ntm194', email: 'quan@example.com', avatarColor: 'bg-blue-600', role: 'admin', isAdmin: true, department: 'PMO' },
  { id: 'u2', name: 'Lê Hoàng Long Rất Dài Để Thử Cắt Chữ', email: 'long.le.hoang.dai@example.com', avatarColor: 'bg-emerald-700', role: 'dev', isAdmin: false, department: 'Khối Kỹ Thuật & Phát Triển Phần Mềm' },
  { id: 'u3', name: 'Đỗ Bích Ngọc', email: 'ngoc@example.com', avatarColor: 'bg-amber-700', role: 'tester', isAdmin: false, department: 'QA' },
  { id: 'u4', name: 'Phạm Minh Anh', email: 'anh@example.com', avatarColor: 'bg-blue-600', role: 'ba', isAdmin: false, department: 'BA' }
];
const mk = (id: string, code: string, title: string, status: string, priority: string, a: string, s: number, d: number, est: number, act: number, uc?: string, extra: any = {}) => ({
  id, projectId: 'p1', code, title, description: 'Mô tả chi tiết của nhiệm vụ ' + code + ' để kiểm tra việc cắt dòng trên màn hình nhỏ.', status, priority, assigneeId: a,
  collaboratorIds: [], department: 'dev', phase: 'Giai đoạn 3: Phát triển Sprint', estimatedEffort: est, actualEffort: act, startDate: iso(s), dueDate: iso(d),
  actualEndDate: status === 'done' ? iso(d - 1) : undefined, progressPercent: status === 'done' ? 100 : status === 'review' ? 70 : status === 'in_progress' ? 40 : 0,
  assessment: undefined, deliverable: 'Tài liệu thiết kế và mã nguồn đã được review, kèm báo cáo kiểm thử.', notes: 'Phụ thuộc vào đội hạ tầng cấp môi trường.',
  tags: ['Security', 'Backend'], useCaseId: uc, ...extra
});
const tasks = [
  mk('t1', 'OB-101', 'Tích hợp Module Xác thực sinh trắc học eKYC và CCCD gắn chip', 'in_progress', 'urgent', 'u1', -7, 1, 5, 3.5, 'uc1', { collaboratorIds: ['u2', 'u3', 'u4'], department: 'dev', progressPercent: 40, assessment: 'at_risk' }),
  mk('t2', 'OB-102', 'Xây dựng dịch vụ Chuyển tiền nhanh NAPAS 24/7 qua mã QR VietQR', 'in_progress', 'high', 'u2', -6, 3, 4, 2.5, 'uc2', { collaboratorIds: ['u3'], progressPercent: 75 }),
  mk('t3', 'OB-103', 'Thực hiện kiểm thử xâm nhập bảo mật chuẩn PCI-DSS', 'todo', 'urgent', 'u2', -3, -1, 4.5, 0, 'uc1', { department: 'tester' }),
  mk('t4', 'OB-104', 'Thiết kế giao diện Dark Mode màn hình tổng quan', 'review', 'medium', 'u3', -16, 2, 2.5, 2.8, undefined, { department: 'ba', collaboratorIds: ['u1'], progressPercent: 90 }),
  mk('t5', 'OB-105', 'Hoàn thiện tài liệu kiến trúc microservices', 'done', 'high', 'u1', -52, -21, 6, 5.5, 'uc1', { department: 'pm' }),
  mk('t6', 'OB-106', 'Tác vụ chưa giao', 'todo', 'low', '', -1, 9, 1, 0, undefined, { department: undefined })
];
const proj = (id: string, code: string, name: string, p: number, status = 'in_progress') => ({
  id, code, name,
  description: 'Nền tảng Internet Banking & Mobile Banking thế hệ mới hỗ trợ thanh toán tức thì, định danh điện tử eKYC và bảo mật đa lớp sinh trắc học.',
  status, priority: 'urgent', managerId: 'u1', startDate: iso(-60), targetEndDate: iso(45), budget: 1850000000, progressPercent: p, currentPhase: 'phase_3', memberIds: ['u1', 'u2', 'u3']
});
const projects = [
  proj('p1', 'OMNI-BANK', 'Hệ Thống Ngân Hàng Số Omni-Channel', 53),
  proj('p2', 'E-SHOP-B2B', 'Sàn Thương Mại Điện Tử & Phân Phối B2B', 78),
  proj('p3', 'GPDN_DNMB_EVNNPC_QTVT_251004', 'Hệ Thống Y Tế & Khám Bệnh Trực Tuyến TeleHealth', 36, 'planning')
];
const crit = (id: string, d: string, c: boolean) => ({ id, description: d, completed: c });
const mkUc = (id: string, code: string, title: string, parentId: string | undefined, status: string, pct: number, crits: any[] = []) => ({
  id, projectId: 'p1', parentId, code, title, actor: 'Khách hàng cá nhân',
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

export const MockProvider = ({ children }: any) => {
  const params = new URLSearchParams(location.search);
  const role = params.get('role') || 'admin';
  const [activeTab, setActiveTab] = useState(params.get('page') || 'dashboard');
  const [activeProjectId, setActiveProjectId] = useState('p1');
  (window as any).__setTab = setActiveTab;

  const base = useMemo(() => {
    const isAdmin = role === 'admin';
    const mgr = role === 'admin' || role === 'pm';
    const activeProject = projects.find(p => p.id === activeProjectId)!;
    return {
      activeTab, setActiveTab, activeProjectId, setActiveProjectId, activeProject, projects, tasks, projectTasks: tasks, users, allUsers: users,
      currentUser: { ...users[0], role }, useCases, projectUseCases: useCases, qualityGates: [{ projectId: 'p1', phases }],
      projectQualityGates: { projectId: 'p1', phases }, notifications, unreadNotificationCount: 1, projectSnapshots: snaps,
      reportSchedules: [{ id: 's1', projectId: 'p1', frequency: 'weekly', enabled: true }],
      reportRuns: [{ id: 'r1', projectId: 'p1', frequency: 'weekly', periodStart: iso(-7), periodEnd: iso(-1), createdAt: new Date().toISOString(), summary }],
      toasts: [], isLoading: false, loadError: null, isAdmin, canManageProject: mgr, canManageProjectId: () => mgr,
      canManageTasks: mgr || ['dev', 'ba', 'tester'].includes(role), canManageUseCases: mgr || ['dev', 'ba'].includes(role), canApproveQuality: mgr || role === 'tester', canApproveUseCase: mgr, isViewer: role === 'viewer', soundMuted: false
    };
  }, [activeTab, activeProjectId, role]);

  // Mọi thuộc tính không khai báo (hàm thao tác) trả về hàm rỗng.
  const value = useMemo(() => new Proxy(base as any, { get: (t, k) => (k in t ? t[k] : () => {}) }), [base]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export const useApp = () => useContext(Ctx);

// App.tsx importa AppProvider; trong harness chỉ cần truyền children.
export const AppProvider = ({ children }: any) => children;
