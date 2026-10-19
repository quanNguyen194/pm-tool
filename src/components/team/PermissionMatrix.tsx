import React, { useEffect, useRef } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import type { Role } from '../../types';
import { ALL_ROLES, permissionGroups } from '../../utils/permissions';
import { ROLE_NAMES, ROLE_SHORT } from '../../utils/roles';

/** Ma trận phân quyền theo dữ liệu duy nhất ở utils/permissions.ts (cùng nguồn với các cờ quyền của ứng dụng). */
export const PermissionMatrix: React.FC<{ myRole: Role }> = ({ myRole }) => {
  const groups = permissionGroups();
  const scroller = useRef<HTMLDivElement>(null);
  const meCol = useRef<HTMLTableCellElement>(null);
  // Màn hình hẹp: cuộn ngang để cột của chính mình hiện giữa khung.
  useEffect(() => {
    const box = scroller.current;
    const col = meCol.current;
    if (box && col && box.scrollWidth > box.clientWidth) {
      const first = box.querySelector('th')?.offsetWidth ?? 0; // cột đầu dính trái che một phần khung
      box.scrollLeft = col.offsetLeft - first - Math.max(0, (box.clientWidth - first - col.offsetWidth) / 2);
    }
  }, [myRole]);
  const headerName = (r: Role) => (r === 'admin' ? 'Admin' : r === 'viewer' ? 'Quan sát' : ROLE_SHORT[r]);

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
      <div className="p-4 border-b border-slate-200 bg-slate-50/80">
        <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Ma Trận Phân Quyền Chi Tiết</h3>
        <p className="text-[11px] text-slate-600 mt-0.5">
          Quyền theo vai trò của từng người trong dự án này. Cột của bạn được tô màu. Mọi thành viên (kể cả Quan sát) đều xem được dữ liệu
          dự án; các vai trò khác nhau ở chỗ được <strong>sửa</strong> gì.
        </p>
      </div>

      <div ref={scroller} className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/50 text-slate-700 font-semibold text-[11px]">
              <th scope="col" className="py-3 px-4 sticky left-0 bg-slate-50 z-10">
                Chức năng & quyền hạn
              </th>
              {ALL_ROLES.map(r => (
                <th
                  key={r}
                  ref={r === myRole ? meCol : undefined}
                  scope="col"
                  title={ROLE_NAMES[r]}
                  className={`py-3 px-3 text-center w-20 ${r === myRole ? 'bg-indigo-100 text-indigo-800' : ''}`}
                >
                  {headerName(r)}
                  {r === myRole && <div className="text-[10px] font-medium">(Bạn)</div>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map(g => (
              <React.Fragment key={g.group}>
                <tr className="bg-slate-100/70">
                  <th scope="rowgroup" colSpan={ALL_ROLES.length + 1} className="py-1.5 px-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                    {g.group}
                  </th>
                </tr>
                {g.rows.map(row => (
                  <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50/70 transition-colors">
                    <th scope="row" className="py-2.5 px-3 sm:px-4 text-left font-normal sticky left-0 bg-white z-10 min-w-[150px] sm:min-w-[220px] max-w-[170px] sm:max-w-none">
                      <div className="font-semibold text-slate-900">{row.label}</div>
                      <div className="text-[11px] text-slate-600 mt-0.5">{row.description}</div>
                    </th>
                    {ALL_ROLES.map(r => {
                      const has = row.roles.includes(r);
                      return (
                        <td key={r} className={`py-2.5 px-3 text-center ${r === myRole ? 'bg-indigo-50/70' : ''}`}>
                          <span
                            className={`inline-flex items-center justify-center w-6 h-6 rounded-full ${
                              has ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {has ? <CheckCircle2 className="w-4 h-4" aria-label="Có quyền" /> : <XCircle className="w-4 h-4" aria-label="Không có quyền" />}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <p className="p-3 text-[11px] text-slate-600 border-t border-slate-100 bg-slate-50/50">
        5 bước use case làm <strong>tuần tự</strong>: tick một bước sẽ tự tick các bước trước (nếu bạn có quyền với các bước đó), bỏ một bước sẽ bỏ cả các
        bước sau. Quản trị viên hệ thống có mọi quyền ở mọi dự án.
      </p>
    </div>
  );
};
