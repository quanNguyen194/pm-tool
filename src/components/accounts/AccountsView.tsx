import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Copy, Eye, EyeOff, GitMerge, KeyRound, Loader2, Pencil, Plus, RefreshCw, Search, Trash2, UserCog, UserX, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { supabase } from '../../lib/supabase';
import { useConfirm } from '../common/ConfirmDialog';
import { SearchSelect } from '../common/SearchSelect';

interface Account {
  id: string;
  name: string;
  email: string | null;
  department: string;
  isAdmin: boolean;
  isPlaceholder: boolean;
  createdAt: string;
  lastSignInAt: string | null;
  emailConfirmed: boolean;
  projectCount: number;
}
interface LogRow {
  id: number;
  at: string;
  actorName: string;
  action: 'create' | 'reset_password' | 'delete' | 'update';
  targetLabel: string;
  detail: string | null;
}

const ACTION_LABEL: Record<LogRow['action'], string> = {
  create: 'Tạo tài khoản',
  reset_password: 'Đặt lại mật khẩu',
  delete: 'Xóa tài khoản',
  update: 'Sửa tài khoản'
};

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' }) : '—');
const inputCls =
  'w-full text-xs border border-slate-300 rounded-lg px-3 py-2 bg-white text-slate-900 placeholder:text-slate-500 focus-visible:outline-2 focus-visible:outline-indigo-500 disabled:opacity-60';
const labelCls = 'block text-xs font-semibold text-slate-700 mb-1';

/** Mật khẩu ngẫu nhiên 14 ký tự, bỏ các ký tự dễ nhầm (0/O, 1/l/I), luôn có chữ hoa, chữ thường và số. */
function generatePassword(): string {
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789'];
  const all = sets.join('');
  const rnd = (n: number) => crypto.getRandomValues(new Uint32Array(1))[0] % n;
  const chars = sets.map(s => s[rnd(s.length)]);
  while (chars.length < 14) chars.push(all[rnd(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = rnd(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

/** Gọi Edge Function admin-accounts; trả về thông báo lỗi tiếng Việt (hoặc null nếu thành công). */
async function callAccounts(body: Record<string, unknown>): Promise<{ error: string | null; id?: string; warning?: string }> {
  const { data, error } = await supabase.functions.invoke('admin-accounts', { body });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      try {
        const j = await ctx.json();
        if (j?.error) return { error: String(j.error) };
      } catch {
        /* dùng thông báo chung bên dưới */
      }
    }
    const msg = error.message || '';
    if (/Failed to send|FunctionsFetchError|FunctionsRelayError|not found|404/i.test(msg) || (ctx && ctx.status === 404)) {
      return { error: 'Không gọi được hàm "admin-accounts" trên Supabase: hàm chưa được triển khai, hoặc bị lỗi khi khởi động (xem Edge Functions > admin-accounts > Logs). Hướng dẫn trong docs/ACCOUNTS.md.' };
    }
    return { error: msg || 'Không gọi được máy chủ.' };
  }
  const d = data as { ok?: boolean; error?: string; id?: string; warning?: string } | null;
  if (!d || d.ok !== true) return { error: d?.error || 'Thao tác không thành công.' };
  return { error: null, id: d.id, warning: d.warning };
}

const Backdrop: React.FC<{ label: string; onClose: () => void; busy?: boolean; children: React.ReactNode }> = ({ label, onClose, busy, children }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && !document.querySelector('[role="alertdialog"]') && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);
  return createPortal(
    <div className="modal-backdrop-in fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 dark:bg-black/60 backdrop-blur-[2px] p-4" onMouseDown={e => e.target === e.currentTarget && !busy && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={label} className="modal-pop-in bg-white border border-slate-200 rounded-xl shadow-xl w-full max-w-md max-h-[92vh] overflow-y-auto p-6">
        {children}
      </div>
    </div>,
    document.body
  );
};

const DialogHeader: React.FC<{ title: string; onClose: () => void; disabled?: boolean }> = ({ title, onClose, disabled }) => (
  <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100 mb-4">
    <h3 className="text-base font-bold text-slate-900">{title}</h3>
    <button type="button" onClick={onClose} disabled={disabled} aria-label="Đóng" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
      <X className="w-5 h-5" />
    </button>
  </div>
);

/** Ô mật khẩu có nút hiện/ẩn và tạo ngẫu nhiên. */
const PasswordField: React.FC<{ id: string; value: string; onChange: (v: string) => void; disabled?: boolean }> = ({ id, value, onChange, disabled }) => {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label htmlFor={id} className={labelCls}>Mật khẩu (tối thiểu 8 ký tự)</label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input id={id} type={show ? 'text' : 'password'} value={value} onChange={e => onChange(e.target.value)} disabled={disabled} autoComplete="new-password" className={`${inputCls} pr-9 font-mono`} />
          <button type="button" onClick={() => setShow(s => !s)} aria-label={show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-800">
            {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        <button
          type="button"
          onClick={() => {
            onChange(generatePassword());
            setShow(true);
          }}
          disabled={disabled}
          className="inline-flex items-center gap-1.5 px-3 text-xs font-medium text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap"
        >
          <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" /> Tạo ngẫu nhiên
        </button>
      </div>
    </div>
  );
};

/** Hiện mật khẩu đúng một lần sau khi tạo / đặt lại, kèm nút sao chép. */
const OneTimePassword: React.FC<{ email: string; password: string; onClose: () => void; title: string }> = ({ email, password, onClose, title }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`Email: ${email}\nMật khẩu: ${password}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      /* người dùng tự chép từ ô bên dưới */
    }
  };
  return (
    <Backdrop label={title} onClose={onClose}>
      <DialogHeader title={title} onClose={onClose} />
      <p className="text-xs text-slate-700">Hãy gửi thông tin đăng nhập này cho người dùng. <strong>Mật khẩu chỉ hiện lần này</strong>, hệ thống không lưu lại nên không xem lại được.</p>
      <dl className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs space-y-1.5">
        <div className="flex gap-2"><dt className="text-slate-600 w-16 shrink-0">Email</dt><dd className="font-mono text-slate-900 break-all">{email}</dd></div>
        <div className="flex gap-2"><dt className="text-slate-600 w-16 shrink-0">Mật khẩu</dt><dd className="font-mono font-bold text-slate-900 break-all select-all">{password}</dd></div>
      </dl>
      <p className="mt-2 text-[11px] text-slate-600">Nên yêu cầu người dùng đổi mật khẩu sau lần đăng nhập đầu tiên.</p>
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={() => void copy()} className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-800 border border-slate-300 rounded-lg hover:bg-slate-50">
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-700" /> : <Copy className="w-3.5 h-3.5" />} {copied ? 'Đã sao chép' : 'Sao chép'}
        </button>
        <button type="button" onClick={onClose} className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg">Đã lưu, đóng</button>
      </div>
    </Backdrop>
  );
};

const CreateDialog: React.FC<{ onClose: () => void; onDone: (email: string, password: string) => void }> = ({ onClose, onDone }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const r = await callAccounts({ action: 'create', name, email, password, isAdmin });
    setBusy(false);
    if (r.error) setError(r.error);
    else onDone(email.trim().toLowerCase(), password);
  };

  return (
    <Backdrop label="Tạo tài khoản mới" onClose={onClose} busy={busy}>
      <form onSubmit={submit}>
        <DialogHeader title="Tạo tài khoản mới" onClose={onClose} disabled={busy} />
        <div className="space-y-3.5">
          <div>
            <label htmlFor="ac-name" className={labelCls}>Họ tên</label>
            <input id="ac-name" autoFocus value={name} onChange={e => setName(e.target.value)} maxLength={80} disabled={busy} className={inputCls} />
          </div>
          <div>
            <label htmlFor="ac-email" className={labelCls}>Email đăng nhập</label>
            <input id="ac-email" type="email" value={email} onChange={e => setEmail(e.target.value)} disabled={busy} className={inputCls} />
          </div>
          <PasswordField id="ac-pw" value={password} onChange={setPassword} disabled={busy} />
          <label className="flex items-start gap-2 text-xs text-slate-800 cursor-pointer">
            <input type="checkbox" checked={isAdmin} onChange={e => setIsAdmin(e.target.checked)} disabled={busy} className="mt-0.5 rounded border-slate-300 text-indigo-600" />
            <span>Quản trị viên hệ thống <span className="text-slate-600">(toàn quyền; chỉ cấp cho người thật sự cần)</span></span>
          </label>
          <p className="text-[11px] text-slate-600">Tài khoản dùng được ngay, không cần xác nhận email. Nếu họ tên trùng một người đã được thêm sẵn (chưa đăng ký) thì hệ thống tạo yêu cầu hợp nhất để bạn duyệt.</p>
        </div>
        {error && <p role="alert" className="mt-4 text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg p-2.5">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="px-4 py-2 text-xs font-semibold text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50">Hủy bỏ</button>
          <button type="submit" disabled={busy} className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 rounded-lg">
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />} Tạo tài khoản
          </button>
        </div>
      </form>
    </Backdrop>
  );
};

const ResetDialog: React.FC<{ account: Account; onClose: () => void; onDone: (password: string) => void }> = ({ account, onClose, onDone }) => {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const r = await callAccounts({ action: 'reset_password', userId: account.id, password });
    setBusy(false);
    if (r.error) setError(r.error);
    else onDone(password);
  };
  return (
    <Backdrop label="Đặt lại mật khẩu" onClose={onClose} busy={busy}>
      <form onSubmit={submit}>
        <DialogHeader title="Đặt lại mật khẩu" onClose={onClose} disabled={busy} />
        <p className="text-xs text-slate-700 mb-3">Tài khoản: <strong>{account.name}</strong> <span className="font-mono text-slate-600">({account.email})</span></p>
        <PasswordField id="rs-pw" value={password} onChange={setPassword} disabled={busy} />
        <p className="mt-2 text-[11px] text-slate-600">Không có email nào được gửi. Bạn sẽ thấy mật khẩu một lần để chuyển cho người dùng. Các phiên đăng nhập đang mở của họ có thể còn hiệu lực đến khi hết hạn.</p>
        {error && <p role="alert" className="mt-4 text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg p-2.5">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="px-4 py-2 text-xs font-semibold text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50">Hủy bỏ</button>
          <button type="submit" disabled={busy || !password} className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 rounded-lg">
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />} Đặt lại mật khẩu
          </button>
        </div>
      </form>
    </Backdrop>
  );
};

const EditDialog: React.FC<{ account: Account; isSelf: boolean; onClose: () => void; onDone: () => void }> = ({ account, isSelf, onClose, onDone }) => {
  const [name, setName] = useState(account.name);
  const [email, setEmail] = useState(account.email ?? '');
  const [isAdmin, setIsAdmin] = useState(account.isAdmin);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const body: Record<string, unknown> = { action: 'update', userId: account.id };
    if (name.trim() !== account.name) body.name = name;
    if (email.trim().toLowerCase() !== (account.email ?? '').toLowerCase()) body.email = email;
    if (isAdmin !== account.isAdmin) body.isAdmin = isAdmin;
    if (Object.keys(body).length === 2) {
      setError('Chưa có thay đổi nào để lưu.');
      return;
    }
    setBusy(true);
    setError('');
    const r = await callAccounts(body);
    setBusy(false);
    if (r.error) setError(r.error);
    else onDone();
  };
  return (
    <Backdrop label="Sửa tài khoản" onClose={onClose} busy={busy}>
      <form onSubmit={submit}>
        <DialogHeader title="Sửa tài khoản" onClose={onClose} disabled={busy} />
        <div className="space-y-3.5">
          <div>
            <label htmlFor="ed-name" className={labelCls}>Họ tên</label>
            <input id="ed-name" autoFocus value={name} onChange={e => setName(e.target.value)} maxLength={80} disabled={busy} className={inputCls} />
          </div>
          <div>
            <label htmlFor="ed-email" className={labelCls}>Email đăng nhập</label>
            <input id="ed-email" type="email" value={email} onChange={e => setEmail(e.target.value)} disabled={busy} className={inputCls} />
            <p className="mt-1 text-[11px] text-slate-600">Đổi email thì người dùng đăng nhập bằng email mới ngay (không cần xác nhận lại).</p>
          </div>
          <label className="flex items-start gap-2 text-xs text-slate-800 cursor-pointer">
            <input type="checkbox" checked={isAdmin} onChange={e => setIsAdmin(e.target.checked)} disabled={busy || isSelf} className="mt-0.5 rounded border-slate-300 text-indigo-600" />
            <span>
              Quản trị viên hệ thống
              {isSelf && <span className="text-slate-600"> (không tự đổi quyền của chính mình)</span>}
            </span>
          </label>
        </div>
        {error && <p role="alert" className="mt-4 text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg p-2.5">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="px-4 py-2 text-xs font-semibold text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50">Hủy bỏ</button>
          <button type="submit" disabled={busy} className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 rounded-lg">
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />} Lưu thay đổi
          </button>
        </div>
      </form>
    </Backdrop>
  );
};

/** Ghép tài khoản chưa đăng ký vào tài khoản thật: nhiệm vụ đã giao, dự án, phối hợp... chuyển sang tài khoản thật. */
const MergeDialog: React.FC<{ placeholder: Account; realAccounts: Account[]; onClose: () => void; onDone: (summary: string) => void }> = ({ placeholder, realAccounts, onClose, onDone }) => {
  const [target, setTarget] = useState('');
  const [preview, setPreview] = useState<{ projects: number; tasksAssigned: number; tasksCollaborating: number; projectsManaged: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    void supabase.rpc('admin_merge_preview', { p_placeholder: placeholder.id }).then(r => {
      if (!alive) return;
      if (r.error) setError(/admin_merge_preview/.test(r.error.message) && /function|schema cache/i.test(r.error.message) ? 'Cơ sở dữ liệu chưa có chức năng ghép tài khoản. Hãy chạy migration supabase/migrations/0029_manual_account_merge.sql.' : r.error.message);
      else setPreview(r.data as typeof preview);
    });
    return () => {
      alive = false;
    };
  }, [placeholder.id]);

  const options = useMemo(() => realAccounts.map(a => ({ id: a.id, label: a.name, sub: a.email ?? '' })), [realAccounts]);
  const chosen = realAccounts.find(a => a.id === target);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!target) return;
    setBusy(true);
    setError('');
    const r = await supabase.rpc('admin_merge_accounts', { p_placeholder: placeholder.id, p_user: target });
    setBusy(false);
    if (r.error) setError(r.error.message);
    else {
      const d = r.data as { tasksAssigned: number; projects: number; userName: string };
      onDone(`Đã ghép "${placeholder.name}" vào "${d.userName}": chuyển ${d.tasksAssigned} nhiệm vụ đã giao và ${d.projects} dự án.`);
    }
  };

  return (
    <Backdrop label="Ghép với tài khoản thật" onClose={onClose} busy={busy}>
      <form onSubmit={submit}>
        <DialogHeader title="Ghép với tài khoản thật" onClose={onClose} disabled={busy} />
        <p className="text-xs text-slate-700 mb-3">
          Tài khoản chưa đăng ký: <strong>{placeholder.name}</strong>
        </p>
        <span className={labelCls}>Ghép vào tài khoản đã đăng ký</span>
        <SearchSelect value={target} onChange={setTarget} options={options} placeholder="Gõ tên hoặc email để tìm…" ariaLabel="Tài khoản thật cần ghép vào" disabled={busy} />
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-800">
          {preview ? (
            <>
              <p className="font-semibold mb-1">Sẽ chuyển sang {chosen ? <span className="text-indigo-800">{chosen.name}</span> : 'tài khoản thật'}:</p>
              <ul className="list-disc pl-4 space-y-0.5">
                <li>{preview.tasksAssigned} nhiệm vụ đang giao (không phải phân công lại)</li>
                <li>{preview.tasksCollaborating} nhiệm vụ đang phối hợp</li>
                <li>Tư cách thành viên của {preview.projects} dự án (nếu người thật đã ở trong dự án, giữ vai trò hiện có của họ)</li>
                {preview.projectsManaged > 0 && <li>Vai trò quản lý của {preview.projectsManaged} dự án</li>}
                <li>Các bước use case, tiêu chuẩn chất lượng đã tick</li>
              </ul>
            </>
          ) : error ? null : (
            <span className="inline-flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> Đang tính…</span>
          )}
        </div>
        <p className="mt-2 text-[11px] text-slate-600">Sau khi ghép, tài khoản chưa đăng ký bị xóa và <strong>không thể hoàn tác</strong>. Người dùng thật nhận một thông báo.</p>
        {error && <p role="alert" className="mt-3 text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg p-2.5">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="px-4 py-2 text-xs font-semibold text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50">Hủy bỏ</button>
          <button type="submit" disabled={busy || !target || !preview} className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 rounded-lg">
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />} Ghép tài khoản
          </button>
        </div>
      </form>
    </Backdrop>
  );
};

type Filter = 'all' | 'admin' | 'member' | 'placeholder';

/** Màn hình quản lý mọi tài khoản của hệ thống (chỉ quản trị viên): xem, tạo, sửa, đặt lại mật khẩu, xóa. */
export const AccountsView: React.FC = () => {
  const confirm = useConfirm();
  const { currentUser, deletePlaceholder, notify } = useApp();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [log, setLog] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [dialog, setDialog] = useState<{ kind: 'create' } | { kind: 'edit' | 'reset' | 'merge'; account: Account } | null>(null);
  const [secret, setSecret] = useState<{ title: string; email: string; password: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [a, l] = await Promise.all([supabase.rpc('admin_list_accounts'), supabase.rpc('admin_account_log', { p_limit: 20 })]);
    if (a.error) {
      setError(/admin_list_accounts/.test(a.error.message) && /function|schema cache/i.test(a.error.message)
        ? 'Cơ sở dữ liệu chưa có chức năng quản lý tài khoản. Hãy chạy migration supabase/migrations/0028_account_admin.sql rồi tải lại trang.'
        : a.error.message);
      setAccounts([]);
    } else {
      setError('');
      setAccounts((a.data as Account[]) ?? []);
    }
    setLog(l.error ? [] : ((l.data as LogRow[]) ?? []));
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return accounts.filter(a => {
      if (filter === 'admin' && !(a.isAdmin && !a.isPlaceholder)) return false;
      if (filter === 'member' && (a.isAdmin || a.isPlaceholder)) return false;
      if (filter === 'placeholder' && !a.isPlaceholder) return false;
      return !q || a.name.toLowerCase().includes(q) || (a.email ?? '').toLowerCase().includes(q);
    });
  }, [accounts, query, filter]);

  const counts = useMemo(
    () => ({
      all: accounts.length,
      admin: accounts.filter(a => a.isAdmin && !a.isPlaceholder).length,
      member: accounts.filter(a => !a.isAdmin && !a.isPlaceholder).length,
      placeholder: accounts.filter(a => a.isPlaceholder).length
    }),
    [accounts]
  );

  const remove = async (a: Account) => {
    const ok = await confirm({
      title: a.isPlaceholder ? 'Xóa tài khoản chưa đăng ký?' : 'Xóa tài khoản?',
      message: a.isPlaceholder
        ? 'Tài khoản này sẽ bị xóa khỏi hệ thống: người này rời mọi dự án và các nhiệm vụ họ phụ trách thành chưa giao.'
        : 'Người này mất quyền đăng nhập ngay, rời mọi dự án, và các nhiệm vụ họ phụ trách thành chưa giao. Dữ liệu họ đã nhập (nhiệm vụ, bình luận…) vẫn được giữ.',
      target: { title: a.name, badge: a.isPlaceholder ? 'CHƯA ĐĂNG KÝ' : a.email ?? '', description: a.projectCount > 0 ? `Đang tham gia ${a.projectCount} dự án` : undefined },
      warnings: ['Không thể hoàn tác.'],
      confirmLabel: 'Xác nhận xóa',
      tone: 'danger'
    });
    if (!ok) return;
    if (a.isPlaceholder) {
      deletePlaceholder(a.id);
      setTimeout(() => void load(), 1200);
      return;
    }
    const r = await callAccounts({ action: 'delete', userId: a.id });
    if (r.error) notify('error', r.error);
    else notify('success', `Đã xóa tài khoản ${a.email ?? a.name}`);
    void load();
  };

  const badge = (a: Account) =>
    a.isPlaceholder ? (
      <span className="whitespace-nowrap text-[10px] font-bold px-1.5 py-0.5 rounded border bg-slate-100 text-slate-700 border-slate-200">Chưa đăng ký</span>
    ) : a.isAdmin ? (
      <span className="whitespace-nowrap text-[10px] font-bold px-1.5 py-0.5 rounded border bg-indigo-100 text-indigo-800 border-indigo-200">Quản trị viên</span>
    ) : (
      <span className="whitespace-nowrap text-[10px] font-bold px-1.5 py-0.5 rounded border bg-emerald-100 text-emerald-800 border-emerald-200">Thành viên</span>
    );

  const actions = (a: Account) => {
    const self = a.id === currentUser.id;
    const btn = 'p-1.5 rounded-md text-slate-600 hover:text-indigo-700 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent';
    return (
      <div className="flex items-center justify-end gap-0.5">
        {!a.isPlaceholder && (
          <>
            <button type="button" onClick={() => setDialog({ kind: 'edit', account: a })} className={btn} title="Sửa tên, email, quyền" aria-label={`Sửa ${a.name}`}>
              <Pencil className="w-4 h-4" />
            </button>
            <button type="button" onClick={() => setDialog({ kind: 'reset', account: a })} className={btn} title="Đặt lại mật khẩu" aria-label={`Đặt lại mật khẩu của ${a.name}`}>
              <KeyRound className="w-4 h-4" />
            </button>
          </>
        )}
        {a.isPlaceholder && (
          <button type="button" onClick={() => setDialog({ kind: 'merge', account: a })} className={btn} title="Ghép với tài khoản thật (chuyển nhiệm vụ đã giao)" aria-label={`Ghép ${a.name} với tài khoản thật`}>
            <GitMerge className="w-4 h-4" />
          </button>
        )}
        <button
          type="button"
          onClick={() => void remove(a)}
          disabled={self}
          className="p-1.5 rounded-md text-rose-700 hover:bg-rose-50 disabled:opacity-30 disabled:hover:bg-transparent"
          title={self ? 'Không thể tự xóa chính mình' : a.isPlaceholder ? 'Xóa tài khoản chưa đăng ký' : 'Xóa tài khoản'}
          aria-label={`Xóa ${a.name}`}
        >
          {a.isPlaceholder ? <UserX className="w-4 h-4" /> : <Trash2 className="w-4 h-4" />}
        </button>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <UserCog className="w-5 h-5 text-indigo-600" aria-hidden="true" /> Quản Lý Tài Khoản
          </h1>
          <p className="text-xs text-slate-600 mt-1">Mọi tài khoản trên hệ thống. Chỉ quản trị viên thấy màn hình này. Mật khẩu không bao giờ được hiển thị lại sau khi tạo hoặc đặt lại.</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void load()} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" /> Làm mới
          </button>
          <button type="button" onClick={() => setDialog({ kind: 'create' })} className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs">
            <Plus className="w-4 h-4" aria-hidden="true" /> Tạo tài khoản
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg p-3">{error}</p>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-3 space-y-3">
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4 text-slate-500 shrink-0" aria-hidden="true" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Tìm theo tên hoặc email…"
            aria-label="Tìm tài khoản theo tên hoặc email"
            className="w-full text-xs placeholder:text-slate-500 text-slate-900 bg-transparent outline-none"
          />
        </div>
        <div role="group" aria-label="Lọc loại tài khoản" className="flex flex-wrap gap-1.5 text-xs">
          {(
            [
              ['all', 'Tất cả'],
              ['admin', 'Quản trị viên'],
              ['member', 'Thành viên'],
              ['placeholder', 'Chưa đăng ký']
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              aria-pressed={filter === k}
              onClick={() => setFilter(k)}
              className={`px-2.5 py-1 rounded-full border font-medium ${filter === k ? 'bg-indigo-50 border-indigo-300 text-indigo-800' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}`}
            >
              {label} <span className="font-mono tabular-nums">{counts[k]}</span>
            </button>
          ))}
        </div>
      </div>

      {loading && accounts.length === 0 ? (
        <div className="py-16 flex justify-center" role="status" aria-label="Đang tải">
          <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
        </div>
      ) : shown.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-xs text-slate-600">Không có tài khoản nào khớp.</div>
      ) : (
        <>
          {/* Bảng (từ md) */}
          <div className="relative hidden md:block rounded-2xl border border-slate-200 bg-white overflow-x-auto">
            <table className="w-full text-xs text-left min-w-[860px]">
              <thead className="bg-slate-50 border-b border-slate-200 text-[11px] text-slate-700">
                <tr>
                  <th scope="col" className="py-2.5 px-3">Tên</th>
                  <th scope="col" className="py-2.5 px-3">Email</th>
                  <th scope="col" className="py-2.5 px-3">Loại</th>
                  <th scope="col" className="py-2.5 px-3 text-right">Dự án</th>
                  <th scope="col" className="py-2.5 px-3">Tạo lúc</th>
                  <th scope="col" className="py-2.5 px-3">Đăng nhập gần nhất</th>
                  <th scope="col" className="py-2.5 px-3 text-right"><span className="sr-only">Thao tác</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shown.map(a => (
                  <tr key={a.id} className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-3 font-semibold text-slate-900">
                      {a.name}
                      {a.id === currentUser.id && <span className="ml-1.5 text-[10px] font-medium text-slate-600">(bạn)</span>}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-800 break-all">
                      {a.email ?? <span className="text-slate-600 font-sans">—</span>}
                      {a.email && !a.emailConfirmed && <span className="ml-1.5 text-[10px] font-sans font-semibold text-amber-800">chưa xác nhận</span>}
                    </td>
                    <td className="py-2.5 px-3">{badge(a)}</td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-800">{a.projectCount}</td>
                    <td className="py-2.5 px-3 text-slate-700 font-mono tabular-nums whitespace-nowrap">{fmt(a.createdAt)}</td>
                    <td className="py-2.5 px-3 text-slate-700 font-mono tabular-nums whitespace-nowrap">{a.isPlaceholder ? '—' : fmt(a.lastSignInAt)}</td>
                    <td className="py-2.5 px-3">{actions(a)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Thẻ (dưới md) */}
          <ul className="md:hidden space-y-2.5">
            {shown.map(a => (
              <li key={a.id} className="rounded-2xl border border-slate-200 bg-white p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-900 break-words">
                      {a.name}
                      {a.id === currentUser.id && <span className="ml-1.5 text-[10px] font-medium text-slate-600">(bạn)</span>}
                    </div>
                    <div className="mt-0.5 text-[11px] font-mono text-slate-700 break-all">{a.email ?? '—'}</div>
                  </div>
                  {badge(a)}
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600">
                  <span>{a.projectCount} dự án · Đăng nhập: {a.isPlaceholder ? '—' : fmt(a.lastSignInAt)}</span>
                  {actions(a)}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <section aria-label="Nhật ký thao tác" className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2">Nhật ký thao tác gần đây</h2>
        {log.length === 0 ? (
          <p className="text-xs text-slate-600">Chưa có thao tác nào được ghi lại.</p>
        ) : (
          <ul className="divide-y divide-slate-100 text-xs">
            {log.map(l => (
              <li key={l.id} className="py-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="font-mono tabular-nums text-slate-600 shrink-0">{fmt(l.at)}</span>
                <strong className="text-slate-900">{l.actorName || 'Quản trị viên'}</strong>
                <span className="text-slate-700">{ACTION_LABEL[l.action]}</span>
                <span className="font-mono text-slate-800 break-all">{l.targetLabel}</span>
                {l.detail && <span className="text-slate-600">({l.detail})</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {dialog?.kind === 'create' && (
        <CreateDialog
          onClose={() => setDialog(null)}
          onDone={(email, password) => {
            setDialog(null);
            setSecret({ title: 'Đã tạo tài khoản', email, password });
            void load();
          }}
        />
      )}
      {dialog?.kind === 'reset' && (
        <ResetDialog
          account={dialog.account}
          onClose={() => setDialog(null)}
          onDone={password => {
            setSecret({ title: 'Đã đặt lại mật khẩu', email: dialog.account.email ?? '', password });
            setDialog(null);
            void load();
          }}
        />
      )}
      {dialog?.kind === 'merge' && (
        <MergeDialog
          placeholder={dialog.account}
          realAccounts={accounts.filter(a => !a.isPlaceholder)}
          onClose={() => setDialog(null)}
          onDone={summary => {
            setDialog(null);
            notify('success', summary);
            void load();
          }}
        />
      )}
      {dialog?.kind === 'edit' && (
        <EditDialog
          account={dialog.account}
          isSelf={dialog.account.id === currentUser.id}
          onClose={() => setDialog(null)}
          onDone={() => {
            setDialog(null);
            notify('success', 'Đã lưu thay đổi tài khoản');
            void load();
          }}
        />
      )}
      {secret && <OneTimePassword title={secret.title} email={secret.email} password={secret.password} onClose={() => setSecret(null)} />}
    </div>
  );
};
