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
  | 'edit_quality_items'
  | 'issue_create'
  | 'issue_update'
  | 'issue_edit'
  | 'issue_assign'
  | 'issue_delete'
  | 'config_issue_types'
  | 'config_issue_statuses'
  | 'export';

export interface PermissionRow {
  id: PermissionId;
  group: string;
  label: string;
  description: string;
  /** Vai trò có quyền theo MẶC ĐỊNH (quản trị viên cấu hình có thể đổi ở các quyền `configurable`). */
  roles: Role[];
  /** Quyền có kiểm tra thật ở CSDL nên quản trị viên cấu hình được (bảng role_permissions, migration 0021). */
  configurable?: boolean;
  /** Quyền không tách riêng ở CSDL: đi theo một quyền khác (VD nhắc việc/xác nhận tiêu chí đi theo Quản lý dự án). */
  follows?: PermissionId;
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
    configurable: true,
    group: 'Dự án',
    label: 'Sửa thông tin dự án, quản lý thành viên và vai trò',
    description: 'Chỉnh sửa lộ trình, phân công PM, thêm/xóa thành viên, đổi vai trò',
    roles: ['admin', 'pm']
  },
  {
    id: 'remind_report',
    follows: 'manage_project',
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
    configurable: true,
    group: 'Nhiệm vụ',
    label: 'Tạo, sửa, phân công nhiệm vụ; cập nhật tiến độ',
    description: 'Kéo thả trạng thái, sửa tiến độ %, nỗ lực, đánh giá, liên kết use case',
    roles: ['admin', 'pm', 'dev', 'ba', 'tester']
  },
  {
    id: 'write_usecases',
    configurable: true,
    group: 'Use case',
    label: 'Tạo, sửa module/use case và tiêu chí nghiệm thu',
    description: 'Cây 3 cấp, luồng nghiệp vụ, thuộc tính, nguồn gốc; xóa use case',
    roles: ['admin', 'pm', 'dev', 'ba']
  },
  {
    id: 'stage_analysis',
    configurable: true,
    group: 'Use case',
    label: 'Tick bước Phân tích',
    description: 'Bước 1/5 (10% tiến độ use case)',
    roles: ['admin', 'pm', 'ba']
  },
  {
    id: 'stage_design',
    configurable: true,
    group: 'Use case',
    label: 'Tick bước Thiết kế',
    description: 'Bước 2/5 (10%); tự tick Phân tích nếu chưa xong',
    roles: ['admin', 'pm', 'ba']
  },
  {
    id: 'stage_coding',
    configurable: true,
    group: 'Use case',
    label: 'Tick bước Lập trình',
    description: 'Bước 3/5 (40%); cần các bước trước đã xong mới tick được',
    roles: ['admin', 'pm', 'dev']
  },
  {
    id: 'stage_testing',
    configurable: true,
    group: 'Use case',
    label: 'Tick bước Kiểm thử',
    description: 'Bước 4/5 (25%); cần các bước trước đã xong',
    roles: ['admin', 'pm', 'tester']
  },
  {
    id: 'stage_acceptance',
    configurable: true,
    group: 'Use case',
    label: 'Tick bước Nghiệm thu',
    description: 'Bước 5/5 (15%)',
    roles: ['admin', 'pm']
  },
  {
    id: 'tick_criteria',
    follows: 'manage_project',
    group: 'Use case',
    label: 'Xác nhận tiêu chí nghiệm thu (dự án tính tiến độ theo tiêu chí)',
    description: 'Tick từng tiêu chí nghiệm thu, quyết định tiến độ use case ở mô hình theo tiêu chí',
    roles: ['admin', 'pm']
  },
  {
    id: 'edit_quality_items',
    configurable: true,
    group: 'Chất lượng',
    label: 'Thêm, sửa, xóa tiêu chuẩn Quality Gates',
    description: 'Định nghĩa các tiêu chuẩn của từng giai đoạn (kể cả tiêu chuẩn mặc định của dự án)',
    roles: ['admin', 'pm']
  },
  {
    id: 'issue_create',
    configurable: true,
    group: 'Lỗi & yêu cầu',
    label: 'Ghi nhận lỗi / yêu cầu thay đổi (issue)',
    description: 'Tạo issue mới kèm mô tả, mức ưu tiên và tệp đính kèm',
    roles: ['admin', 'pm', 'dev', 'ba', 'tester']
  },
  {
    id: 'issue_update',
    configurable: true,
    group: 'Lỗi & yêu cầu',
    label: 'Cập nhật issue: đổi trạng thái, bình luận, đính kèm',
    description: 'Mọi thay đổi đều được lưu vào nhật ký (ai, làm gì, lúc nào)',
    roles: ['admin', 'pm', 'dev', 'ba', 'tester']
  },
  {
    id: 'issue_edit',
    configurable: true,
    group: 'Lỗi & yêu cầu',
    label: 'Sửa nội dung issue',
    description: 'Tiêu đề, mô tả, loại, ưu tiên, hạn xử lý. Người báo luôn sửa được issue của mình khi còn ở trạng thái khởi tạo',
    roles: ['admin', 'pm', 'ba']
  },
  {
    id: 'issue_assign',
    configurable: true,
    group: 'Lỗi & yêu cầu',
    label: 'Phân công người xử lý issue',
    description: 'Chọn hoặc đổi người xử lý',
    roles: ['admin', 'pm']
  },
  {
    id: 'issue_delete',
    configurable: true,
    group: 'Lỗi & yêu cầu',
    label: 'Xóa issue và ghi chú',
    description: 'Xóa hẳn issue (kèm nhật ký) hoặc xóa nội dung một ghi chú',
    roles: ['admin', 'pm']
  },
  {
    id: 'config_issue_types',
    configurable: true,
    group: 'Lỗi & yêu cầu',
    label: 'Cấu hình loại và độ ưu tiên issue',
    description: 'Thêm, đổi tên, đổi màu, sắp xếp, ẩn các loại (Bug, Yêu cầu thay đổi...) và các mức độ ưu tiên (Khẩn cấp, Cao, Vừa, Thấp...)',
    roles: ['admin', 'pm']
  },
  {
    id: 'config_issue_statuses',
    configurable: true,
    group: 'Lỗi & yêu cầu',
    label: 'Cấu hình trạng thái issue',
    description: 'Thêm, đổi tên, đổi màu, sắp xếp, ẩn các trạng thái và chọn trạng thái khởi tạo',
    roles: ['admin', 'pm']
  },
  {
    id: 'approve_quality',
    configurable: true,
    group: 'Chất lượng',
    label: 'Thẩm định tiêu chuẩn Quality Gates',
    description: 'Đánh giá Đạt/Chưa đạt các tiêu chuẩn DoD từng giai đoạn',
    roles: ['admin', 'pm', 'tester']
  }
];

export const CONFIG_ROLES: Role[] = ['pm', 'dev', 'ba', 'tester', 'viewer'];
export const CONFIGURABLE_IDS: PermissionId[] = PERMISSIONS.filter(p => p.configurable).map(p => p.id);

export interface MatrixCell {
  allowed: boolean;
  /** Giá trị đến từ mặc định có sẵn, cấu hình toàn hệ thống, hay ghi đè riêng của dự án. */
  source: 'default' | 'global' | 'project';
}
export type MatrixData = Partial<Record<PermissionId, Partial<Record<Role, MatrixCell>>>>;

// Ma trận hiệu lực của dự án đang chọn (do AppContext nạp từ CSDL). Chưa nạp được thì dùng mặc định.
let effective: MatrixData | null = null;
export function setEffectiveMatrix(m: MatrixData | null) {
  effective = m;
}

/** Các vai trò có quyền `id` theo cấu hình hiệu lực (quản trị viên luôn có). */
export function rolesWith(id: PermissionId, matrix: MatrixData | null = effective): Role[] {
  const row = PERMISSIONS.find(p => p.id === id);
  if (!row) return [];
  const src = row.follows ?? id;
  const cells = matrix?.[src];
  if (cells && CONFIGURABLE_IDS.includes(src)) return ['admin', ...CONFIG_ROLES.filter(r => cells[r]?.allowed)];
  return PERMISSIONS.find(p => p.id === src)?.roles ?? row.roles;
}

export const can = (role: Role, id: PermissionId): boolean => rolesWith(id).includes(role);

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
  /** Có từ migration 0022; bản DB cũ không trả về. */
  editQualityItems?: boolean;
  /** Có từ migration 0023. */
  issues?: { create: boolean; update: boolean; edit: boolean; assign: boolean; delete: boolean; configTypes: boolean; configStatuses: boolean };
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
    ...(db.issues === undefined
      ? []
      : ([
          ['Ghi nhận issue', can(role, 'issue_create'), db.issues.create],
          ['Cập nhật issue', can(role, 'issue_update'), db.issues.update],
          ['Sửa nội dung issue', can(role, 'issue_edit'), db.issues.edit],
          ['Phân công issue', can(role, 'issue_assign'), db.issues.assign],
          ['Xóa issue', can(role, 'issue_delete'), db.issues.delete],
          ['Cấu hình loại và độ ưu tiên issue', can(role, 'config_issue_types'), db.issues.configTypes],
          ['Cấu hình trạng thái issue', can(role, 'config_issue_statuses'), db.issues.configStatuses]
        ] as [string, boolean, boolean][])),
    ...(db.editQualityItems === undefined ? [] : ([['Thêm/sửa/xóa tiêu chuẩn Quality Gates', can(role, 'edit_quality_items'), db.editQualityItems]] as [string, boolean, boolean][])),
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
