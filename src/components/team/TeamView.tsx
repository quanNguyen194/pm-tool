import React from 'react';
import { useApp } from '../../context/AppContext';
import { MemberRole } from '../../types';
import { MEMBER_ROLES, ROLE_BADGES, ROLE_DESCRIPTIONS, ROLE_NAMES, ROLE_SHORT } from '../../utils/roles';
import { WorkloadBar } from './WorkloadPanel';
import { MemberInvite } from './MemberInvite';
import { MergeRequestsPanel } from './MergeRequestsPanel';
import { PermissionMatrix } from './PermissionMatrix';
import { AccessCheckPanel } from './AccessCheckPanel';
import { computeWorkload } from '../../utils/workload';
import {
  Shield,
  Building,
  UserX,
  Trash2
} from 'lucide-react';

export const TeamView: React.FC = () => {
  const {
    users,
    currentUser,
    projectTasks,
    activeProject,
    canManageProject,
    isAdmin,
    setMemberRole,
    removeMember,
    deletePlaceholder
  } = useApp();

  const workloadById = new Map(computeWorkload(users, projectTasks).map(w => [w.user.id, w]));

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-900 tracking-tight">Đội Ngũ Dự Án & Ma Trận Phân Quyền (RBAC)</h1>
        <p className="text-xs text-slate-500 mt-1">
          Quyền hạn theo vai trò trong từng dự án. Quản trị viên và PM thêm thành viên bằng cách gõ tên/email rồi chọn tài khoản gợi ý. Quản trị viên còn thêm được người chưa đăng ký (tài khoản ảo)
        </p>
      </div>

      <MergeRequestsPanel />

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

        {canManageProject && <MemberInvite projectCode={activeProject.code} />}
      </div>

      <PermissionMatrix myRole={currentUser.role} />

      <AccessCheckPanel />

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
                        {user.isPlaceholder ? (
                          <div
                            className="inline-block mt-0.5 text-[10px] font-semibold text-amber-800 bg-amber-100 border border-amber-200 rounded px-1.5 py-0.5"
                            title="Người do admin thêm trước, chưa có tài khoản đăng nhập"
                          >
                            Chưa đăng ký
                          </div>
                        ) : (
                          <div className="text-[11px] text-slate-500 truncate max-w-[150px]">{user.email}</div>
                        )}
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
                        {isAdmin && user.isPlaceholder && (
                          <button
                            onClick={() => {
                              if (window.confirm(`Xóa hẳn tài khoản chưa đăng ký "${user.name}" khỏi hệ thống?\nNgười này sẽ rời mọi dự án; nhiệm vụ họ phụ trách thành chưa giao.`)) {
                                deletePlaceholder(user.id);
                              }
                            }}
                            className="p-1 text-rose-700 hover:bg-rose-50 rounded"
                            title="Xóa hẳn tài khoản chưa đăng ký"
                            aria-label={`Xóa hẳn ${user.name}`}
                          >
                            <UserX className="w-3.5 h-3.5" />
                          </button>
                        )}
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
