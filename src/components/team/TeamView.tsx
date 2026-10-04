import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { MemberRole, Role } from '../../types';
import { MEMBER_ROLES, ROLE_BADGES, ROLE_DESCRIPTIONS, ROLE_NAMES, ROLE_SHORT } from '../../utils/roles';
import { WorkloadBar } from './WorkloadPanel';
import { computeWorkload } from '../../utils/workload';
import {
  Shield,
  CheckCircle2,
  XCircle,
  Building,
  UserPlus,
  Trash2
} from 'lucide-react';

export const TeamView: React.FC = () => {
  const {
    users,
    currentUser,
    projectTasks,
    activeProject,
    canManageProject,
    addMember,
    setMemberRole,
    removeMember
  } = useApp();

  const workloadById = new Map(computeWorkload(users, projectTasks).map(w => [w.user.id, w]));

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<MemberRole>('dev');
  const [inviting, setInviting] = useState(false);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviting(true);
    const ok = await addMember(inviteEmail.trim(), inviteRole);
    setInviting(false);
    if (ok) setInviteEmail('');
  };

  const permissionsMatrix: {
    permission: string;
    description: string;
    roles: Record<Role, boolean>;
  }[] = [
    {
      permission: 'Khởi tạo & Quản lý Dự Án',
      description: 'Tạo dự án mới (chỉ Admin), chỉnh sửa thông tin, lộ trình, phân công PM và thành viên',
      roles: { admin: true, pm: true, dev: false, ba: false, tester: false, viewer: false }
    },
    {
      permission: 'Tạo & Phân Công Nhiệm Vụ',
      description: 'Tạo task, chọn người chủ trì/phối hợp, bộ phận, deadline, tiến độ và nỗ lực',
      roles: { admin: true, pm: true, dev: true, ba: true, tester: true, viewer: false }
    },
    {
      permission: 'Cập Nhật Tiến Độ Công Việc',
      description: 'Kéo thả đổi trạng thái trên Kanban, sửa tiến độ %, nỗ lực thực tế và đánh giá',
      roles: { admin: true, pm: true, dev: true, ba: true, tester: true, viewer: false }
    },
    {
      permission: 'Tạo & Sửa Use Case',
      description: 'Tạo use case theo cây 3 cấp, sửa luồng nghiệp vụ và tiêu chí nghiệm thu',
      roles: { admin: true, pm: true, dev: true, ba: true, tester: false, viewer: false }
    },
    {
      permission: 'Xác Nhận Tiêu Chí Nghiệm Thu',
      description: 'Tick hoàn thành tiêu chí nghiệm thu của use case (quyết định tiến độ use case)',
      roles: { admin: true, pm: true, dev: false, ba: false, tester: false, viewer: false }
    },
    {
      permission: 'Thẩm Định Tiêu Chuẩn Quality Gates',
      description: 'Đánh giá Đạt/Chưa đạt các tiêu chuẩn kiểm soát chất lượng DoD từng giai đoạn',
      roles: { admin: true, pm: true, dev: false, ba: false, tester: true, viewer: false }
    },
    {
      permission: 'Xuất Báo Cáo Định Kỳ & Bàn Giao',
      description: 'Xuất tệp báo cáo PDF/Excel và sao lưu dữ liệu toàn diện của dự án',
      roles: { admin: true, pm: true, dev: true, ba: true, tester: true, viewer: true }
    },
    {
      permission: 'Gửi Nhắc Nhở Deadline & Tạo Báo Cáo',
      description: 'Gửi nhắc việc thủ công tới người chủ trì và tạo báo cáo định kỳ ngay',
      roles: { admin: true, pm: true, dev: false, ba: false, tester: false, viewer: false }
    }
  ];

  const matrixRoles: Role[] = ['admin', 'pm', 'dev', 'ba', 'tester', 'viewer'];

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-900 tracking-tight">Đội Ngũ Dự Án & Ma Trận Phân Quyền (RBAC)</h1>
        <p className="text-xs text-slate-500 mt-1">
          Quyền hạn theo vai trò trong từng dự án. Quản trị viên và PM thêm thành viên bằng email (người đó cần đăng ký tài khoản trước)
        </p>
      </div>

      {/* Current identity + invite */}
      <div className="bg-indigo-50/70 border border-indigo-200 rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-indigo-600" />
          <h3 className="text-xs font-bold text-indigo-950 uppercase tracking-wider">
            Vai Trò Của Bạn Trong Dự Án [{activeProject.code}]
          </h3>
        </div>
        <p className="text-xs text-indigo-900">
          Bạn đăng nhập là <strong>{currentUser.name}</strong> ({currentUser.email}) với vai trò{' '}
          <strong>{ROLE_NAMES[currentUser.role]}</strong>. {ROLE_DESCRIPTIONS[currentUser.role]}.
        </p>

        {canManageProject && (
          <form onSubmit={handleInvite} className="flex flex-col sm:flex-row gap-2 pt-1">
            <input
              type="email"
              required
              value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)}
              placeholder="Email thành viên (đã đăng ký tài khoản)"
              className="flex-1 px-3 py-2 text-xs border border-indigo-200 rounded-lg bg-white focus:outline-indigo-500"
            />
            <select
              value={inviteRole}
              onChange={e => setInviteRole(e.target.value as MemberRole)}
              className="px-3 py-2 text-xs border border-indigo-200 rounded-lg bg-white"
            >
              {MEMBER_ROLES.map(r => (
                <option key={r} value={r}>
                  {ROLE_SHORT[r]}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={inviting}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 rounded-lg"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Thêm vào dự án</span>
            </button>
          </form>
        )}
      </div>

      {/* Permissions Matrix Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
        <div className="p-4 border-b border-slate-200 bg-slate-50/80">
          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
            Ma Trận Phân Quyền Chi Tiết (Role-Based Access Control)
          </h3>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Bảng quy định quyền hạn cụ thể cho từng vai trò trong quy trình vận hành dự án
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/50 text-slate-700 font-semibold text-[11px]">
                <th className="py-3 px-4">Chức Năng & Quyền Hạn</th>
                {matrixRoles.map(r => (
                  <th key={r} className="py-3 px-3 text-center w-20">
                    {r === 'admin' ? 'Admin' : r === 'viewer' ? 'Quan sát' : ROLE_SHORT[r]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {permissionsMatrix.map((item, idx) => (
                <tr key={idx} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-3 px-4">
                    <div className="font-semibold text-slate-900">{item.permission}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{item.description}</div>
                  </td>
                  {matrixRoles.map(role => {
                    const hasPerm = item.roles[role];
                    return (
                      <td key={role} className="py-3 px-3 text-center">
                        {hasPerm ? (
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-100 text-emerald-700">
                            <CheckCircle2 className="w-4 h-4" />
                          </span>
                        ) : (
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-100 text-slate-400">
                            <XCircle className="w-4 h-4" />
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Team Members Directory */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Danh Bạ Thành Viên & Phụ Trách Công Việc
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Danh sách nhân sự tham gia dự án [{activeProject.code}]
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {users.map(user => {
            const userTasks = projectTasks.filter(t => t.assigneeId === user.id);
            const userDoneTasks = userTasks.filter(t => t.status === 'done').length;

            return (
              <div
                key={user.id}
                className="p-4 rounded-2xl border border-slate-200 bg-slate-50/40 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-9 h-9 rounded-full text-white text-xs font-bold flex items-center justify-center shadow-xs ${user.avatarColor}`}
                      >
                        {user.name.charAt(0)}
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-900">{user.name}</div>
                        <div className="text-[11px] text-slate-500 truncate max-w-[150px]">{user.email}</div>
                      </div>
                    </div>

                    {canManageProject && !user.isAdmin && user.id !== currentUser.id ? (
                      <div className="flex items-center gap-1">
                        <select
                          value={user.role}
                          onChange={e => setMemberRole(user.id, e.target.value as MemberRole)}
                          className="text-[10px] font-mono px-1 py-0.5 rounded border border-slate-300 bg-white"
                          aria-label={`Vai trò của ${user.name}`}
                        >
                          {MEMBER_ROLES.map(r => (
                            <option key={r} value={r}>
                              {ROLE_SHORT[r]}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => {
                            if (window.confirm(`Gỡ ${user.name} khỏi dự án ${activeProject.code}?`)) removeMember(user.id);
                          }}
                          className="p-1 text-rose-700 hover:bg-rose-50 rounded"
                          title="Gỡ khỏi dự án"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${ROLE_BADGES[user.role]}`}>
                        {ROLE_SHORT[user.role]}
                      </span>
                    )}
                  </div>

                  <div className="text-[11px] text-slate-600 mt-2 mb-3">
                    <div className="flex items-center gap-1.5 text-slate-500 mb-1">
                      <Building className="w-3 h-3 text-slate-400" />
                      <span>{user.department}</span>
                    </div>
                  </div>
                </div>

                {/* Workload stats */}
                <div className="pt-2 border-t border-slate-200/80 space-y-1.5 text-xs text-slate-500">
                  <WorkloadBar active={userTasks.length - userDoneTasks} done={userDoneTasks} />
                  <div className="flex items-center justify-between">
                    <span>Khối lượng:</span>
                    <span className="font-mono font-semibold text-slate-800">
                      {userTasks.length - userDoneTasks} mở · {userDoneTasks} xong
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Ngày công:</span>
                    <span className="font-mono tabular-nums text-slate-700">
                      {workloadById.get(user.id)?.actualEffort ?? 0}/{workloadById.get(user.id)?.estimatedEffort ?? 0} ngày
                    </span>
                  </div>
                  {(workloadById.get(user.id)?.overdue ?? 0) > 0 && (
                    <div className="flex items-center justify-between text-rose-700 font-semibold">
                      <span>Quá hạn:</span>
                      <span className="font-mono">{workloadById.get(user.id)?.overdue} việc</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
