import type { Department, MemberRole, Role } from '../types';

/** Vai trò có thể gán cho thành viên trong một dự án (quản trị viên là quyền toàn hệ thống). */
export const MEMBER_ROLES: MemberRole[] = ['pm', 'dev', 'ba', 'tester', 'viewer'];

export const ROLE_NAMES: Record<Role, string> = {
  admin: 'Quản trị viên (Admin)',
  pm: 'Quản lý dự án (PM)',
  dev: 'Lập trình viên (DEV)',
  ba: 'Phân tích nghiệp vụ (BA)',
  tester: 'Kiểm thử viên (Tester)',
  viewer: 'Quan sát (chỉ xem)'
};

/** Nhãn ngắn dùng cho huy hiệu và ô chọn. */
export const ROLE_SHORT: Record<Role, string> = {
  admin: 'ADMIN',
  pm: 'PM',
  dev: 'DEV',
  ba: 'BA',
  tester: 'TESTER',
  viewer: 'QUAN SÁT'
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  admin: 'Toàn quyền cấu hình hệ thống, tạo dự án và quản lý mọi dự án',
  pm: 'Phụ trách tiến độ, điều phối nhân sự, nghiệm thu giai đoạn và xác nhận tiêu chí nghiệm thu',
  dev: 'Thực thi nhiệm vụ, cập nhật tiến độ; tạo và sửa use case',
  ba: 'Phân tích yêu cầu: tạo và sửa use case, tiêu chí nghiệm thu và nhiệm vụ',
  tester: 'Kiểm thử, cập nhật nhiệm vụ và thẩm định các tiêu chuẩn Quality Gates',
  viewer: 'Chỉ xem bảng điều khiển, tiến độ và xuất báo cáo'
};

export const ROLE_BADGES: Record<Role, string> = {
  admin: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  pm: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  dev: 'bg-blue-100 text-blue-800 border-blue-200',
  ba: 'bg-purple-100 text-purple-800 border-purple-200',
  tester: 'bg-amber-100 text-amber-800 border-amber-200',
  viewer: 'bg-slate-100 text-slate-700 border-slate-200'
};

/** Bộ phận thực hiện của nhiệm vụ. */
export const DEPARTMENT_LABELS: Record<Department, string> = {
  pm: 'PM',
  ba: 'BA',
  dev: 'DEV',
  tester: 'Tester'
};
