import React from 'react';
import { useApp } from '../../context/AppContext';
import { Role, User } from '../../types';
import {
  Users2,
  Shield,
  CheckCircle2,
  XCircle,
  Sparkles,
  Mail,
  Building,
  UserCheck
} from 'lucide-react';

export const TeamView: React.FC = () => {
  const {
    users,
    currentUser,
    setCurrentUser,
    projectTasks,
    activeProject
  } = useApp();

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
          Thiết lập quyền hạn chi tiết cho từng vai trò và chuyển đổi nhanh để kiểm thử giao diện phân quyền
        </p>
      </div>

      {/* Quick Role Tester Bar */}
      <div className="bg-indigo-50/70 border border-indigo-200 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <Shield className="w-4 h-4 text-indigo-600" />
          <h3 className="text-xs font-bold text-indigo-950 uppercase tracking-wider">
            Mô Phỏng Trải Nghiệm Phân Quyền Trực Tiếp
          </h3>
        </div>
        <p className="text-xs text-indigo-800 mb-3">
          Nhấp vào các nút bên dưới để đổi sang vai trò tương ứng và kiểm tra ngay quyền truy cập trên toàn hệ thống:
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {users.map(user => {
            const isCurrent = user.id === currentUser.id;
            return (
              <button
                key={user.id}
                onClick={() => setCurrentUser(user)}
                className={`p-2.5 rounded-lg border text-left transition-all ${
                  isCurrent
                    ? 'bg-white border-indigo-600 ring-2 ring-indigo-500/20 shadow-xs'
                    : 'bg-white/80 border-indigo-200/80 hover:bg-white text-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-mono font-bold uppercase text-indigo-700">
                    {user.role}
                  </span>
                  {isCurrent && <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600" />}
                </div>
                <div className="text-xs font-bold text-slate-900 truncate">{user.name}</div>
                <div className="text-[10px] text-slate-500 truncate">{roleNameMap[user.role].name}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Permissions Matrix Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
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
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
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
                className="p-4 rounded-xl border border-slate-200 bg-slate-50/40 flex flex-col justify-between"
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

                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${roleInfo.badge}`}>
                      {user.role.toUpperCase()}
                    </span>
                  </div>

                  <div className="text-[11px] text-slate-600 mt-2 mb-3">
                    <div className="flex items-center gap-1.5 text-slate-500 mb-1">
                      <Building className="w-3 h-3 text-slate-400" />
                      <span>{user.department}</span>
                    </div>
                  </div>
                </div>

                {/* Workload stats */}
                <div className="pt-2 border-t border-slate-200/80 flex items-center justify-between text-xs text-slate-500">
                  <span>Khối lượng:</span>
                  <span className="font-mono font-semibold text-slate-800">
                    {userTasks.length} việc ({userDoneTasks} hoàn thành)
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
