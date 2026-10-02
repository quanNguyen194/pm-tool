import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { MemberRole, Role } from '../../types';
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
  const [inviteRole, setInviteRole] = useState<MemberRole>('developer');
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
      description: 'Tạo dự án mới, chỉnh sửa thông tin ngân sách, lộ trình và phân công PM',
      roles: { admin: true, pm: true, developer: false, qa: false, viewer: false }
    },
    {
      permission: 'Phân Công & Tạo Nhiệm Vụ',
      description: 'Tạo task mới, gán người thực hiện, đặt hạn chót và điều chỉnh độ ưu tiên',
      roles: { admin: true, pm: true, developer: true, qa: false, viewer: false }
    },
    {
      permission: 'Cập Nhật Tiến Độ Công Việc',
      description: 'Kéo thả đổi trạng thái công việc trên bảng Kanban hoặc sửa giờ thực tế',
      roles: { admin: true, pm: true, developer: true, qa: true, viewer: false }
    },
    {
      permission: 'Phê Duyệt Use Case Nghiệp Vụ',
      description: 'Chuyển trạng thái Use Case sang Approved hoặc Completed và duyệt tiêu chí',
      roles: { admin: true, pm: true, developer: false, qa: false, viewer: false }
    },
    {
      permission: 'Thẩm Định Tiêu Chuẩn Quality Gates',
      description: 'Đánh giá Đạt/Chưa đạt các tiêu chuẩn kiểm soát chất lượng DoD từng giai đoạn',
      roles: { admin: true, pm: true, developer: false, qa: true, viewer: false }
    },
    {
      permission: 'Xuất Báo Cáo Định Kỳ & Bàn Giao',
      description: 'Xuất tệp báo cáo PDF/Excel và sao lưu dữ liệu toàn diện của dự án',
      roles: { admin: true, pm: true, developer: true, qa: true, viewer: true }
    },
    {
      permission: 'Kích Hoạt Nhắc Nhở Deadline Tự Động',
      description: 'Gửi cảnh báo và thông báo tức thì tới thành viên khi công việc đến hạn',
      roles: { admin: true, pm: true, developer: true, qa: true, viewer: false }
    }
  ];

  const roleNameMap: Record<Role, { name: string; badge: string; desc: string }> = {
    admin: {
      name: 'Quản Trị Viên (Admin)',
      badge: 'bg-indigo-100 text-indigo-800 border-indigo-200',
      desc: 'Toàn quyền cấu hình hệ thống, quản lý ngân sách và phê duyệt'
    },
    pm: {
      name: 'Quản Lý Dự Án (PM)',
      badge: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      desc: 'Phụ trách tiến độ, điều phối nhân sự và nghiệm thu giai đoạn'
    },
    developer: {
      name: 'Lập Trình Viên (Tech/Dev)',
      badge: 'bg-blue-100 text-blue-800 border-blue-200',
      desc: 'Thực thi nhiệm vụ, cập nhật code và tiến độ use case'
    },
    qa: {
      name: 'Kiểm Thử Viên (QA/QC)',
      badge: 'bg-amber-100 text-amber-800 border-amber-200',
      desc: 'Đảm bảo chất lượng, kiểm định Quality Gates và báo cáo bug'
    },
    viewer: {
      name: 'Khách Hàng / Quan Sát (Viewer)',
      badge: 'bg-slate-100 text-slate-700 border-slate-200',
      desc: 'Chỉ xem bảng điều khiển, tiến độ và xuất báo cáo'
    }
  };

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
          <strong>{roleNameMap[currentUser.role].name}</strong>. {roleNameMap[currentUser.role].desc}.
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
              <option value="pm">PM</option>
              <option value="developer">Developer</option>
              <option value="qa">QA / QC</option>
              <option value="viewer">Viewer</option>
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
                <th className="py-3 px-3 text-center w-24">Admin</th>
                <th className="py-3 px-3 text-center w-24">PM</th>
                <th className="py-3 px-3 text-center w-24">Developer</th>
                <th className="py-3 px-3 text-center w-24">QA / QC</th>
                <th className="py-3 px-3 text-center w-24">Viewer</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {permissionsMatrix.map((item, idx) => (
                <tr key={idx} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-3 px-4">
                    <div className="font-semibold text-slate-900">{item.permission}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{item.description}</div>
                  </td>
                  {(['admin', 'pm', 'developer', 'qa', 'viewer'] as Role[]).map(role => {
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
            const roleInfo = roleNameMap[user.role];

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
                          <option value="pm">PM</option>
                          <option value="developer">DEVELOPER</option>
                          <option value="qa">QA</option>
                          <option value="viewer">VIEWER</option>
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
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${roleInfo.badge}`}>
                        {user.role.toUpperCase()}
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
                    <span>Giờ công:</span>
                    <span className="font-mono tabular-nums text-slate-700">
                      {workloadById.get(user.id)?.actualHours ?? 0}/{workloadById.get(user.id)?.estimatedHours ?? 0}h
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
