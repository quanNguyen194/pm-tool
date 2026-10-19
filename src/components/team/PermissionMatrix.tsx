import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, History, Loader2, Lock, Pencil, RotateCcw, XCircle } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import type { Role } from '../../types';
import { ALL_ROLES, MatrixData, PERMISSIONS, PermissionId, permissionGroups, rolesWith } from '../../utils/permissions';
import { ROLE_NAMES, ROLE_SHORT } from '../../utils/roles';

type Scope = 'global' | 'project';
const key = (id: PermissionId, role: Role) => `${id}|${role}`;

interface LogRow { role: string; permission: string; from: boolean; to: boolean; by: string; at: string }

/**
 * Ma trận phân quyền. Mọi người xem được ma trận hiệu lực của dự án (ô tùy chỉnh được đánh dấu); quản trị viên bấm "Chỉnh sửa"
 * để đổi quyền của các vai trò, áp dụng cho toàn hệ thống hoặc riêng dự án đang chọn. Quản trị viên luôn có mọi quyền.
 */
export const PermissionMatrix: React.FC<{ myRole: Role }> = ({ myRole }) => {
  const { isAdmin, activeProject, permissionMatrix, getPermissionMatrix, savePermissions, resetPermissions, getPermissionLog } = useApp();
  const groups = permissionGroups();
  const headerName = (r: Role) => (r === 'admin' ? 'Admin' : r === 'viewer' ? 'Quan sát' : ROLE_SHORT[r]);

  const [editing, setEditing] = useState(false);
  const [scope, setScope] = useState<Scope>('project');
  const [base, setBase] = useState<MatrixData | null>(null);
  const [draft, setDraft] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [logOpen, setLogOpen] = useState(false);
  const [log, setLog] = useState<LogRow[] | null>(null);
  const [logScope, setLogScope] = useState<Scope>('project');

  const shown: MatrixData | null = editing ? base : permissionMatrix;
  const label = (id: string) => PERMISSIONS.find(p => p.id === id)?.label ?? id;

  const cellValue = (id: PermissionId, role: Role): boolean => {
    const k = key(id, role);
    if (editing && k in draft) return draft[k];
    return rolesWith(id, shown).includes(role);
  };
  const baseValue = (id: PermissionId, role: Role) => rolesWith(id, base).includes(role);

  const loadBase = async (sc: Scope) => {
    setBusy(true);
    setError('');
    try {
      setBase(await getPermissionMatrix(sc));
      setDraft({});
    } catch (e) {
      setError(
        /does not exist|schema cache|Could not find the function/i.test(e instanceof Error ? e.message : String(e))
          ? 'Hệ thống chưa có chức năng cấu hình phân quyền: cần chạy migration 0021 (supabase/migrations/0021_permission_config.sql).'
          : e instanceof Error ? e.message : String(e)
      );
      setEditing(false);
    } finally {
      setBusy(false);
    }
  };

  const startEdit = async () => {
    setEditing(true);
    await loadBase(scope);
  };
  const changeScope = async (sc: Scope) => {
    if (sc === scope) return;
    if (Object.keys(draft).length > 0 && !window.confirm('Chuyển phạm vi sẽ bỏ các thay đổi chưa lưu. Tiếp tục?')) return;
    setScope(sc);
    await loadBase(sc);
  };
  const cancel = () => {
    setEditing(false);
    setDraft({});
    setError('');
  };

  const toggle = (id: PermissionId, role: Role) => {
    const k = key(id, role);
    const next = !cellValue(id, role);
    setDraft(d => {
      const copy = { ...d };
      if (next === baseValue(id, role)) delete copy[k];
      else copy[k] = next;
      return copy;
    });
  };

  const changes = useMemo(
    () =>
      Object.entries(draft).map(([k, allowed]) => {
        const [permission, role] = k.split('|');
        return { role, permission: permission as PermissionId, allowed };
      }),
    [draft]
  );

  // Cảnh báo rủi ro dựa trên giá trị SAU khi áp dụng thay đổi.
  const warnings = useMemo(() => {
    const out: string[] = [];
    const finalVal = (id: PermissionId, role: Role) => (key(id, role) in draft ? draft[key(id, role)] : baseValue(id, role));
    const granted = (['dev', 'ba', 'tester', 'viewer'] as Role[]).filter(r => finalVal('manage_project', r));
    if (granted.length)
      out.push(
        `Cấp "Quản lý dự án" cho ${granted.map(r => ROLE_SHORT[r]).join(', ')}: họ sẽ thêm/xóa thành viên, đổi vai trò, nhắc việc, tạo báo cáo và xác nhận tiêu chí nghiệm thu.`
      );
    if (!finalVal('manage_project', 'pm')) out.push('PM không còn quyền quản lý dự án: chỉ quản trị viên hệ thống quản lý được thành viên và vai trò.');
    (['write_tasks', 'write_usecases'] as PermissionId[]).forEach(id => {
      if (!finalVal(id, 'pm')) out.push(`PM không còn quyền "${label(id)}".`);
    });
    return out;
  }, [draft, base]);

  const save = async () => {
    if (changes.length === 0) return;
    const where = scope === 'global' ? 'TOÀN HỆ THỐNG (mọi dự án)' : `riêng dự án ${activeProject.code}`;
    if (!window.confirm(`Lưu ${changes.length} thay đổi phân quyền, áp dụng ${where}?${warnings.length ? '\n\nLưu ý:\n- ' + warnings.join('\n- ') : ''}`)) return;
    setBusy(true);
    const err = await savePermissions(scope, changes);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    setEditing(false);
    setDraft({});
    setError('');
    setLog(null);
  };

  const reset = async () => {
    const where = scope === 'global' ? 'toàn hệ thống' : `dự án ${activeProject.code}`;
    if (!window.confirm(`Khôi phục ${where} về ${scope === 'global' ? 'mặc định có sẵn' : 'cấu hình toàn hệ thống'}? Mọi ghi đè của phạm vi này sẽ bị xóa.`)) return;
    setBusy(true);
    const res = await resetPermissions(scope);
    setBusy(false);
    if ('error' in res) {
      setError(res.error);
      return;
    }
    setEditing(false);
    setDraft({});
    setError('');
    setLog(null);
  };

  const loadLog = async (sc: Scope) => {
    setLogScope(sc);
    setLog(null);
    try {
      setLog(await getPermissionLog(sc));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setLog([]);
    }
  };
  const openLog = async () => {
    const next = !logOpen;
    setLogOpen(next);
    if (next && log === null) await loadLog(logScope);
  };
  useEffect(() => {
    setLog(null);
    setLogOpen(false);
  }, [activeProject.id]);

  // Màn hình hẹp: cuộn ngang để cột của chính mình hiện giữa khung.
  const scroller = useRef<HTMLDivElement>(null);
  const meCol = useRef<HTMLTableCellElement>(null);
  useEffect(() => {
    const box = scroller.current;
    const col = meCol.current;
    if (box && col && box.scrollWidth > box.clientWidth) {
      const first = box.querySelector('th')?.offsetWidth ?? 0; // cột đầu dính trái che một phần khung
      box.scrollLeft = col.offsetLeft - first - Math.max(0, (box.clientWidth - first - col.offsetWidth) / 2);
    }
  }, [myRole]);

  const overrides = useMemo(() => {
    let project = 0;
    let global = 0;
    Object.values(permissionMatrix ?? {}).forEach(row => Object.values(row ?? {}).forEach(c => (c?.source === 'project' ? project++ : c?.source === 'global' ? global++ : 0)));
    return { project, global };
  }, [permissionMatrix]);

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
      <div className="p-4 border-b border-slate-200 bg-slate-50/80 space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Ma Trận Phân Quyền Chi Tiết</h3>
            <p className="text-[11px] text-slate-600 mt-0.5">
              Quyền theo vai trò của từng người trong dự án này. Cột của bạn được tô màu. Mọi thành viên (kể cả Quan sát) đều xem được dữ liệu dự án; các vai
              trò khác nhau ở chỗ được <strong>sửa</strong> gì.
            </p>
          </div>
          {isAdmin && !editing && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => void openLog()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg"
                aria-expanded={logOpen}
              >
                <History className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Lịch sử thay đổi</span>
              </button>
              <button
                onClick={() => void startEdit()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg"
              >
                <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Chỉnh sửa phân quyền</span>
              </button>
            </div>
          )}
        </div>

        {(overrides.project > 0 || overrides.global > 0) && !editing && (
          <p className="text-[11px] text-slate-700">
            Ma trận này đã được tùy chỉnh: {overrides.global > 0 && <span><span className="font-semibold">{overrides.global}</span> ô theo cấu hình toàn hệ thống</span>}
            {overrides.global > 0 && overrides.project > 0 && ', '}
            {overrides.project > 0 && <span><span className="font-semibold">{overrides.project}</span> ô ghi đè riêng cho dự án này</span>}. Ô tùy chỉnh có chấm màu.
          </p>
        )}

        {editing && (
          <div className="space-y-2 pt-1">
            <div role="radiogroup" aria-label="Phạm vi áp dụng" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-800">
              <span className="font-semibold">Áp dụng cho:</span>
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input type="radio" name="perm-scope" checked={scope === 'project'} onChange={() => void changeScope('project')} disabled={busy} />
                <span>Chỉ dự án <span className="font-mono">{activeProject.code}</span></span>
              </label>
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input type="radio" name="perm-scope" checked={scope === 'global'} onChange={() => void changeScope('global')} disabled={busy} />
                <span>Toàn hệ thống (mọi dự án, trừ dự án có ghi đè riêng)</span>
              </label>
            </div>
            <p className="text-[11px] text-slate-700">
              Bấm vào ô để bật/tắt quyền. Cột Admin và các dòng có <Lock className="inline w-3 h-3" aria-hidden="true" /> cố định. Ô đang thay đổi được viền vàng.
            </p>
          </div>
        )}
      </div>

      {error && (
        <div role="alert" className="mx-4 mt-3 text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg p-3">
          {error}
        </div>
      )}

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
                      <div className="font-semibold text-slate-900 flex items-start gap-1">
                        <span>{row.label}</span>
                        {editing && !row.configurable && <Lock className="w-3 h-3 mt-0.5 shrink-0 text-slate-500" aria-label="Quyền cố định" />}
                      </div>
                      <div className="text-[11px] text-slate-600 mt-0.5">
                        {row.follows ? `Đi theo quyền "${label(row.follows)}". ` : ''}
                        {row.description}
                      </div>
                    </th>
                    {ALL_ROLES.map(r => {
                      const has = cellValue(row.id, r);
                      const editable = editing && row.configurable && r !== 'admin';
                      const cell = (row.configurable && r !== 'admin' ? permissionMatrix?.[row.id]?.[r] : undefined);
                      const changed = editing && key(row.id, r) in draft;
                      const dot = !editing && cell && cell.source !== 'default';
                      const icon = has ? (
                        <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                      ) : (
                        <XCircle className="w-4 h-4" aria-hidden="true" />
                      );
                      const tone = has ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600';
                      return (
                        <td key={r} className={`py-2.5 px-3 text-center ${r === myRole ? 'bg-indigo-50/70' : ''}`}>
                          {editable ? (
                            <button
                              type="button"
                              onClick={() => toggle(row.id, r)}
                              disabled={busy}
                              aria-pressed={has}
                              aria-label={`${ROLE_NAMES[r]} – ${row.label}: ${has ? 'có quyền' : 'không có quyền'}`}
                              className={`inline-flex items-center justify-center w-7 h-7 rounded-full border-2 transition-colors ${tone} ${
                                changed ? 'border-amber-500' : 'border-transparent hover:border-indigo-300'
                              } focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500`}
                            >
                              {icon}
                            </button>
                          ) : (
                            <span
                              className={`relative inline-flex items-center justify-center w-6 h-6 rounded-full ${tone}`}
                              title={dot ? (cell!.source === 'project' ? 'Ghi đè riêng cho dự án này' : 'Đã tùy chỉnh (toàn hệ thống)') : undefined}
                            >
                              {icon}
                              {dot && (
                                <span
                                  aria-hidden="true"
                                  className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ring-2 ring-white ${cell!.source === 'project' ? 'bg-amber-500' : 'bg-indigo-600'}`}
                                />
                              )}
                              {has ? <span className="sr-only">Có quyền</span> : <span className="sr-only">Không có quyền</span>}
                            </span>
                          )}
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

      {editing && (
        <div className="p-3 border-t border-slate-200 bg-slate-50/60 space-y-2">
          {warnings.map(w => (
            <div key={w} className="flex gap-2 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-2.5" role="note">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{w}</span>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => void save()}
              disabled={busy || changes.length === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg"
            >
              {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
              <span>{changes.length ? `Lưu ${changes.length} thay đổi` : 'Chưa có thay đổi'}</span>
            </button>
            <button onClick={cancel} disabled={busy} className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg">
              Hủy
            </button>
            <button
              onClick={() => void reset()}
              disabled={busy}
              className="ml-auto inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-rose-700 bg-white border border-rose-300 hover:bg-rose-50 rounded-lg"
              title="Xóa mọi ghi đè của phạm vi đang chọn"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Khôi phục mặc định</span>
            </button>
          </div>
        </div>
      )}

      {isAdmin && logOpen && !editing && (
        <div className="p-4 border-t border-slate-200 bg-white text-xs" aria-label="Lịch sử thay đổi phân quyền">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="font-semibold text-slate-900">Lịch sử thay đổi (mới nhất trước):</span>
            {(['project', 'global'] as Scope[]).map(sc => (
              <button
                key={sc}
                onClick={() => void loadLog(sc)}
                aria-pressed={logScope === sc}
                className={`px-2.5 py-1 rounded-md border text-[11px] font-medium ${logScope === sc ? 'bg-indigo-50 text-indigo-800 border-indigo-300' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'}`}
              >
                {sc === 'project' ? `Dự án ${activeProject.code}` : 'Toàn hệ thống'}
              </button>
            ))}
          </div>
          {log === null ? (
            <span className="text-slate-600">Đang tải…</span>
          ) : log.length === 0 ? (
            <span className="text-slate-600">Chưa có thay đổi nào ở phạm vi này.</span>
          ) : (
            <ul className="space-y-1">
              {log.map((l, i) => (
                <li key={i} className="text-slate-800">
                  <span className="font-mono text-slate-600">{new Date(l.at).toLocaleString('vi-VN')}</span> · {l.by}: <strong>{ROLE_SHORT[l.role as Role] ?? l.role}</strong> – {label(l.permission)}:{' '}
                  {l.from ? 'Có' : 'Không'} → <strong>{l.to ? 'Có' : 'Không'}</strong>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <p className="p-3 text-[11px] text-slate-600 border-t border-slate-100 bg-slate-50/50">
        5 bước use case làm <strong>tuần tự</strong>: tick một bước sẽ tự tick các bước trước (nếu bạn có quyền với các bước đó), bỏ một bước sẽ bỏ cả các
        bước sau. Quản trị viên hệ thống có mọi quyền ở mọi dự án và không bị ma trận này hạn chế.
      </p>
    </div>
  );
};
