import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Stethoscope } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { AccessReport, compareWithDb } from '../../utils/permissions';
import { ROLE_NAMES } from '../../utils/roles';
import type { Role } from '../../types';

/**
 * Kiểm tra quyền THỰC TẾ trong CSDL (không phải bảng lý thuyết): vai trò CSDL đang ghi nhận, số dòng đọc được so với tổng số
 * dòng thật, từng quyền, và chỗ nào giao diện lệch với CSDL. Dùng để trả lời "vì sao tôi không thấy / không sửa được?".
 */
export const AccessCheckPanel: React.FC = () => {
  const { currentUser, users, canManageProject, getAccessReport, getMemberAccessReport, activeProject } = useApp();
  const [target, setTarget] = useState(''); // '' = chính mình
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ who: string; role: Role; report: AccessReport } | null>(null);

  const run = async () => {
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const member = target ? users.find(u => u.id === target) : undefined;
      const report = target ? await getMemberAccessReport(target) : await getAccessReport();
      setResult({ who: member ? member.name : 'Bạn', role: (member ? member.role : currentUser.role) as Role, report });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(
        /function .* does not exist|Could not find the function|schema cache/i.test(msg)
          ? 'Hệ thống chưa có chức năng kiểm tra quyền: quản trị viên cần chạy migration 0020 (supabase/migrations/0020_stage_order.sql).'
          : msg
      );
    } finally {
      setBusy(false);
    }
  };

  const r = result?.report;
  const mismatches = result && r ? compareWithDb(result.role, r) : [];
  const unreadable = r?.total && r.visible && (r.visible.useCases < r.total.useCases || r.visible.tasks < r.total.tasks);

  return (
    <section className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3" aria-label="Kiểm tra quyền thực tế">
      <div className="flex flex-wrap items-center gap-2">
        <Stethoscope className="w-4 h-4 text-indigo-600" aria-hidden="true" />
        <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Kiểm tra quyền thực tế trong dự án [{activeProject.code}]</h3>
      </div>
      <p className="text-[11px] text-slate-600">
        Đối chiếu với cơ sở dữ liệu: vai trò đang được ghi nhận, số use case/nhiệm vụ đọc được, và các quyền thật. Dùng khi có người báo không xem hoặc không
        sửa được dữ liệu.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {canManageProject && (
          <label className="flex items-center gap-1.5 text-xs text-slate-700">
            <span>Kiểm tra cho:</span>
            <select
              value={target}
              onChange={e => setTarget(e.target.value)}
              className="text-xs bg-slate-50 border border-slate-200 rounded-md px-2 py-1"
              aria-label="Thành viên cần kiểm tra"
            >
              <option value="">Chính tôi</option>
              {users
                .filter(u => u.id !== currentUser.id)
                .map(u => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.role.toUpperCase()})
                  </option>
                ))}
            </select>
          </label>
        )}
        <button
          onClick={() => void run()}
          disabled={busy}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 rounded-lg"
        >
          {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
          <span>Kiểm tra ngay</span>
        </button>
      </div>

      {error && (
        <div role="alert" className="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg p-3">
          {error}
        </div>
      )}

      {result && r && (
        <div className="space-y-3 text-xs" role="status">
          <div className="text-slate-800">
            <strong>{result.who}</strong>: vai trò trong CSDL ={' '}
            <strong>{r.isAdmin ? 'Quản trị viên (toàn hệ thống)' : r.role ? ROLE_NAMES[r.role as Role] ?? r.role : 'KHÔNG thuộc dự án này'}</strong>
            {!r.view && <span className="text-rose-700"> — không có quyền xem dự án (cần được thêm vào Đội ngũ)</span>}
          </div>

          {r.visible && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {(['useCases', 'tasks', 'members'] as const).map(k => {
                const total = r.total ? r.total[k] : null;
                const bad = total !== null && r.visible![k] < total;
                return (
                  <div key={k} className={`rounded-lg border p-2.5 ${bad ? 'bg-rose-50 border-rose-200' : 'bg-slate-50 border-slate-200'}`}>
                    <div className="text-[11px] text-slate-600">{k === 'useCases' ? 'Use case' : k === 'tasks' ? 'Nhiệm vụ' : 'Thành viên'} đọc được</div>
                    <div className={`font-mono font-bold ${bad ? 'text-rose-700' : 'text-slate-900'}`}>
                      {r.visible![k]}
                      {total !== null && <span className="font-normal text-slate-600"> / {total} thật</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {unreadable && (
            <div className="flex gap-2 text-rose-800 bg-rose-50 border border-rose-200 rounded-lg p-3" role="alert">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>
                Tài khoản này đọc được ÍT dữ liệu hơn thực tế: chính sách bảo mật (RLS) của CSDL đang chặn một phần. Hãy báo quản trị hệ thống kèm ảnh chụp
                màn hình này.
              </span>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5">
            {(
              [
                ['Xem dự án', r.view],
                ['Quản lý dự án/thành viên', r.manage],
                ['Tạo/sửa nhiệm vụ', r.writeTasks],
                ['Tạo/sửa use case', r.writeUseCases],
                ['Thẩm định Quality Gates', r.approveQuality],
                ['Tick Phân tích', r.stages.analysis],
                ['Tick Thiết kế', r.stages.design],
                ['Tick Lập trình', r.stages.coding],
                ['Tick Kiểm thử', r.stages.testing],
                ['Tick Nghiệm thu', r.stages.acceptance]
              ] as [string, boolean][]
            ).map(([label, on]) => (
              <div key={label} className="flex items-center gap-1.5 text-slate-800">
                <CheckCircle2 className={`w-3.5 h-3.5 ${on ? 'text-emerald-700' : 'text-slate-400'}`} aria-hidden="true" />
                <span className={on ? '' : 'text-slate-600'}>
                  {label}: <strong>{on ? 'có' : 'không'}</strong>
                </span>
              </div>
            ))}
          </div>

          {mismatches.length > 0 ? (
            <div className="text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-3" role="alert">
              <div className="font-semibold mb-1">Giao diện và CSDL không khớp nhau ở {mismatches.length} mục:</div>
              <ul className="list-disc pl-4 space-y-0.5">
                {mismatches.map(m => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
              <div className="mt-1">Hãy tải lại trang; nếu vẫn lệch, báo quản trị hệ thống.</div>
            </div>
          ) : (
            <div className="text-emerald-800">Giao diện khớp hoàn toàn với quyền trong CSDL.</div>
          )}
        </div>
      )}
    </section>
  );
};
