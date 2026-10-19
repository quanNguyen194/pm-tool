import type { Role } from '../types';

/**
 * Ma trận phân quyền DUY NHẤT của giao diện: bảng hiển thị ở màn Đội ngũ và các cờ quyền (canManageTasks...) đều lấy từ đây,
 * nên bảng và hành vi luôn khớp nhau. Quyền thật do CSDL chốt (hàm can_* / chính sách RLS); mục "Quyền của tôi"
 * ở màn Đội ngũ đối chiếu hai bên để phát hiện lệch.
 */
export type PermissionId =
  | 'view'
  | 'create_project'
  | 'manage_project'
  | 'remind_report'
  | 'actor_override'
  | 'write_tasks'
  | 'write_usecases'
  | 'stage_analysis'
  | 'stage_design'
  | 'stage_coding'
  | 'stage_testing'
  | 'stage_acceptance'
  | 'tick_criteria'
  | 'approve_quality'
  | 'export';

export interface PermissionRow {
  id: PermissionId;
  group: string;
  label: string;
  description: string;
  roles: Role[];
}

export const ALL_ROLES: Role[] = ['admin', 'pm', 'dev', 'ba', 'tester', 'viewer'];

export const PERMISSIONS: PermissionRow[] = [
  {
    id: 'view',
    group: 'Xem',
    label: 'Xem dự án, nhiệm vụ, use case và báo cáo',
    description: 'Mọi thành viên của dự án (kể cả Quan sát) đều xem được toàn bộ dữ liệu của dự án đó',
    roles: ['admin', 'pm', 'dev', 'ba', 'tester', 'viewer']
  },
  {
    id: 'export',
    group: 'Xem',
    label: 'Xuất báo cáo, tệp CSV/PDF và sao lưu',
    description: 'Xuất báo cáo định kỳ, danh sách nhiệm vụ và sao lưu dữ liệu dự án',
    roles: ['admin', 'pm', 'dev', 'ba', 'tester', 'viewer']
  },
  {
    id: 'create_project',
    group: 'Dự án',
    label: 'Tạo dự án mới',
    description: 'Chỉ quản trị viên hệ thống',
    roles: ['admin']
  },
  {
    id: 'manage_project',
    group: 'Dự án',
    label: 'Sửa thông tin dự án, quản lý thành viên và vai trò',
    description: 'Chỉnh sửa lộ trình, phân công PM, thêm/xóa thành viên, đổi vai trò',
    roles: ['admin', 'pm']
  },
  {
    id: 'remind_report',
    group: 'Dự án',
    label: 'Gửi nhắc nhở deadline, tạo báo cáo ngay',
    description: 'Nhắc việc thủ công tới người chủ trì và tạo báo cáo định kỳ',
    roles: ['admin', 'pm']
  },
  {
    id: 'actor_override',
    group: 'Dự án',
    label: 'Ghi nhận người khác là người thực hiện',
    description: 'Khi tick bước hoặc duyệt chất lượng, chọn thành viên khác làm người thực hiện',
    roles: ['admin']
  },
  {
    id: 'write_tasks',
    group: 'Nhiệm vụ',
    label: 'Tạo, sửa, phân công nhiệm vụ; cập nhật tiến độ',
    description: 'Kéo thả trạng thái, sửa tiến độ %, nỗ lực, đánh giá, liên kết use case',
    roles: ['admin', 'pm', 'dev', 'ba', 'tester']
  },
  {
    id: 'write_usecases',
    group: 'Use case',
    label: 'Tạo, sửa module/use case và tiêu chí nghiệm thu',
    description: 'Cây 3 cấp, luồng nghiệp vụ, thuộc tính, nguồn gốc; xóa use case',
    roles: ['admin', 'pm', 'dev', 'ba']
  },
  {
    id: 'stage_analysis',
    group: 'Use case',
    label: 'Tick bước Phân tích',
    description: 'Bước 1/5 (10% tiến độ use case)',
    roles: ['admin', 'pm', 'ba']
  },
  {
    id: 'stage_design',
    group: 'Use case',
    label: 'Tick bước Thiết kế',
    description: 'Bước 2/5 (10%); tự tick Phân tích nếu chưa xong',
    roles: ['admin', 'pm', 'ba']
  },
  {
    id: 'stage_coding',
    group: 'Use case',
    label: 'Tick bước Lập trình',
    description: 'Bước 3/5 (40%); cần Phân tích và Thiết kế đã xong (BA/PM) mới tick được',
    roles: ['admin', 'pm', 'dev']
  },
  {
    id: 'stage_testing',
    group: 'Use case',
    label: 'Tick bước Kiểm thử',
    description: 'Bước 4/5 (25%); cần các bước trước đã xong',
    roles: ['admin', 'pm', 'tester']
  },
  {
    id: 'stage_acceptance',
    group: 'Use case',
    label: 'Tick bước Nghiệm thu',
    description: 'Bước 5/5 (15%); chỉ PM/Admin',
    roles: ['admin', 'pm']
  },
  {
    id: 'tick_criteria',
    group: 'Use case',
    label: 'Xác nhận tiêu chí nghiệm thu (dự án tính tiến độ theo tiêu chí)',
    description: 'Tick từng tiêu chí nghiệm thu, quyết định tiến độ use case ở mô hình theo tiêu chí',
    roles: ['admin', 'pm']
  },
  {
    id: 'approve_quality',
    group: 'Chất lượng',
    label: 'Thẩm định tiêu chuẩn Quality Gates',
    description: 'Đánh giá Đạt/Chưa đạt các tiêu chuẩn DoD từng giai đoạn',
    roles: ['admin', 'pm', 'tester']
  }
];

export const can = (role: Role, id: PermissionId): boolean => PERMISSIONS.find(p => p.id === id)?.roles.includes(role) ?? false;

/** Nhóm các dòng theo `group`, giữ thứ tự xuất hiện. */
export function permissionGroups(): { group: string; rows: PermissionRow[] }[] {
  const out: { group: string; rows: PermissionRow[] }[] = [];
  PERMISSIONS.forEach(p => {
    let g = out.find(x => x.group === p.group);
    if (!g) out.push((g = { group: p.group, rows: [] }));
    g.rows.push(p);
  });
  return out;
}

/** Báo cáo quyền thực tế từ CSDL (RPC my_access_report / member_access_report). */
export interface AccessReport {
  role: string | null;
  isAdmin: boolean;
  view: boolean;
  manage: boolean;
  writeTasks: boolean;
  writeUseCases: boolean;
  approveQuality: boolean;
  stages: Record<'analysis' | 'design' | 'coding' | 'testing' | 'acceptance', boolean>;
  visible?: { useCases: number; tasks: number; members: number };
  total?: { useCases: number; tasks: number; members: number } | null;
}

/** So khung quyền giao diện (theo vai trò) với báo cáo của CSDL; trả về danh sách điểm lệch dễ đọc. */
export function compareWithDb(role: Role, db: AccessReport): string[] {
  const checks: [string, boolean, boolean][] = [
    ['Xem dự án', can(role, 'view'), db.view],
    ['Quản lý dự án và thành viên', can(role, 'manage_project'), db.manage],
    ['Tạo/sửa nhiệm vụ', can(role, 'write_tasks'), db.writeTasks],
    ['Tạo/sửa use case', can(role, 'write_usecases'), db.writeUseCases],
    ['Thẩm định Quality Gates', can(role, 'approve_quality'), db.approveQuality],
    ['Tick bước Phân tích', can(role, 'stage_analysis'), db.stages.analysis],
    ['Tick bước Thiết kế', can(role, 'stage_design'), db.stages.design],
    ['Tick bước Lập trình', can(role, 'stage_coding'), db.stages.coding],
    ['Tick bước Kiểm thử', can(role, 'stage_testing'), db.stages.testing],
    ['Tick bước Nghiệm thu', can(role, 'stage_acceptance'), db.stages.acceptance]
  ];
  return checks
    .filter(([, ui, server]) => ui !== server)
    .map(([name, ui, server]) => `${name}: giao diện ${ui ? 'cho phép' : 'không cho phép'} nhưng CSDL ${server ? 'cho phép' : 'không cho phép'}`);
}
