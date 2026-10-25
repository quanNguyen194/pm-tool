// Giả lập supabase cho màn hình Tài khoản trong bộ kiểm tra giao diện (không kết nối mạng).
const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * 86400000).toISOString();
const accounts = [
  { id: 'a1', name: 'quan.ntm194', email: 'quan.ntm194@gmail.com', department: 'PMO', isAdmin: true, isPlaceholder: false, createdAt: iso(120), lastSignInAt: iso(0), emailConfirmed: true, projectCount: 3 },
  { id: 'a2', name: 'Lê Hoàng Long Rất Dài Để Thử Cắt Chữ Trong Bảng', email: 'long.le.hoang.rat.dai.de.thu.cat.chu@example-company.com.vn', department: '', isAdmin: false, isPlaceholder: false, createdAt: iso(40), lastSignInAt: iso(2), emailConfirmed: true, projectCount: 2 },
  { id: 'a3', name: 'Đỗ Bích Ngọc', email: 'ngoc@example.com', department: '', isAdmin: false, isPlaceholder: false, createdAt: iso(5), lastSignInAt: null, emailConfirmed: false, projectCount: 0 },
  { id: 'a4', name: 'Người Chưa Đăng Ký', email: null, department: '', isAdmin: false, isPlaceholder: true, createdAt: iso(9), lastSignInAt: null, emailConfirmed: false, projectCount: 1 }
];
const log = [
  { id: 3, at: iso(0), actorName: 'quan.ntm194', action: 'reset_password', targetLabel: 'ngoc@example.com', detail: null },
  { id: 2, at: iso(1), actorName: 'quan.ntm194', action: 'update', targetLabel: 'long.le@example.com', detail: 'cấp quyền quản trị viên' },
  { id: 1, at: iso(5), actorName: 'quan.ntm194', action: 'create', targetLabel: 'ngoc@example.com', detail: null }
];
export const supabase = {
  rpc: async (fn: string) => ({ data: fn === 'admin_list_accounts' ? accounts : fn === 'admin_account_log' ? log : null, error: null }),
  functions: { invoke: async () => ({ data: { ok: true }, error: null }) }
} as any;
