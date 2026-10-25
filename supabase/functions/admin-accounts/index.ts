// Edge Function "admin-accounts": quản trị tài khoản đăng nhập (tạo, sửa, đặt lại mật khẩu, xóa) dành cho quản trị viên hệ thống.
//
// Vì sao cần hàm này: các thao tác trên là quản trị xác thực của Supabase, cần khóa service_role mà trình duyệt không được giữ.
// Supabase tự cấp khóa đó cho Edge Function (biến môi trường SUPABASE_SERVICE_ROLE_KEY), nên không phải đưa khóa cho ai.
//
// Triển khai: Dashboard > Edge Functions > Deploy a new function > Via Editor, đặt tên `admin-accounts`, dán toàn bộ file này,
// Deploy; sau đó vào trang chi tiết của hàm, tab Details, tắt "Enforce JWT verification" (hàm tự xác thực). Xem docs/ACCOUNTS.md.
//
// Phần logic (`handle`) không phụ thuộc Deno nên kiểm thử được bằng node với dữ liệu giả (scripts/accounts.test.mjs).
// Lưu ý: import ở đầu file phải là import tĩnh (Edge Runtime không cho import động địa chỉ ngoài).

// @ts-ignore: Edge Runtime (Deno) hiểu specifier npm:; tsc và node thì không (bản thử nghiệm thay bằng scripts/npm-stub.mjs)
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

export interface ProfileInfo {
  id: string;
  name: string;
  email: string | null;
  isAdmin: boolean;
  isPlaceholder: boolean;
}

export interface Ports {
  /** Id người dùng của JWT, hoặc null nếu JWT không hợp lệ. */
  verifyToken(token: string): Promise<string | null>;
  getProfile(id: string): Promise<ProfileInfo | null>;
  /** Số quản trị viên thật (không tính tài khoản chưa đăng ký). */
  countAdmins(): Promise<number>;
  createUser(a: { email: string; password: string; name: string }): Promise<{ id?: string; error?: string }>;
  setPassword(id: string, password: string): Promise<string | undefined>;
  deleteUser(id: string): Promise<string | undefined>;
  updateAuthUser(id: string, a: { email?: string; name?: string }): Promise<string | undefined>;
  updateProfile(id: string, a: { name?: string; email?: string; isAdmin?: boolean }): Promise<string | undefined>;
  log(e: { actorId: string; actorName: string; action: string; targetId: string | null; targetLabel: string; detail?: string }): Promise<void>;
}

export interface HttpIn {
  method: string;
  authorization: string | null;
  body: unknown;
}
export interface HttpOut {
  status: number;
  body: Record<string, unknown>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const ok = (extra: Record<string, unknown> = {}): HttpOut => ({ status: 200, body: { ok: true, ...extra } });
// Lỗi nghiệp vụ trả 200 kèm ok:false để giao diện hiện đúng thông báo tiếng Việt
const fail = (error: string): HttpOut => ({ status: 200, body: { ok: false, error } });

const cleanName = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim();
const cleanEmail = (s: unknown) => String(s ?? '').trim().toLowerCase();

function checkPassword(p: unknown): string | null {
  if (typeof p !== 'string' || p.length < 8) return 'Mật khẩu phải có ít nhất 8 ký tự.';
  // bcrypt chỉ dùng 72 byte đầu
  if (new TextEncoder().encode(p).length > 72) return 'Mật khẩu tối đa 72 byte (khoảng 72 ký tự không dấu).';
  return null;
}

function mapAuthError(msg: string): string {
  if (/already (been )?registered|already exists|duplicate|exists/i.test(msg)) return 'Email này đã được dùng bởi một tài khoản khác.';
  if (/password/i.test(msg) && /(weak|short|least|characters)/i.test(msg)) return 'Mật khẩu không đạt yêu cầu của hệ thống (quá ngắn hoặc quá yếu).';
  return msg;
}

export async function handle(req: HttpIn, ports: Ports): Promise<HttpOut> {
  if (req.method !== 'POST') return { status: 405, body: { ok: false, error: 'Chỉ nhận POST' } };

  // 1. Xác thực người gọi và kiểm tra quyền quản trị
  const token = (req.authorization ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return fail('Chưa đăng nhập.');
  const actorId = await ports.verifyToken(token);
  if (!actorId) return fail('Phiên đăng nhập không hợp lệ. Hãy đăng nhập lại.');
  const actor = await ports.getProfile(actorId);
  if (!actor || !actor.isAdmin || actor.isPlaceholder) return fail('Chỉ quản trị viên hệ thống mới được quản lý tài khoản.');

  const b = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
  const action = String(b.action ?? '');
  const log = (act: string, targetId: string | null, targetLabel: string, detail?: string) =>
    ports.log({ actorId: actor.id, actorName: actor.name, action: act, targetId, targetLabel, detail });

  // 2. Tạo tài khoản
  if (action === 'create') {
    const email = cleanEmail(b.email);
    const name = cleanName(b.name);
    if (!EMAIL.test(email) || email.length > 254) return fail('Email không hợp lệ.');
    if (name.length < 2 || name.length > 80) return fail('Họ tên phải từ 2 đến 80 ký tự.');
    const pwErr = checkPassword(b.password);
    if (pwErr) return fail(pwErr);
    const r = await ports.createUser({ email, password: b.password as string, name });
    if (r.error || !r.id) return fail(mapAuthError(r.error ?? 'Không tạo được tài khoản.'));
    let note: string | undefined;
    if (b.isAdmin === true) {
      const e = await ports.updateProfile(r.id, { isAdmin: true });
      if (e) note = 'Đã tạo tài khoản nhưng chưa đặt được quyền quản trị: ' + e;
    }
    await log('create', r.id, email, b.isAdmin === true && !note ? 'Quản trị viên hệ thống' : undefined);
    return ok({ id: r.id, warning: note });
  }

  // Các thao tác còn lại cần một tài khoản đích có thật
  const targetId = String(b.userId ?? '');
  if (!UUID.test(targetId)) return fail('Mã tài khoản không hợp lệ.');
  const target = await ports.getProfile(targetId);
  if (!target) return fail('Không tìm thấy tài khoản.');
  if (target.isPlaceholder) return fail('Đây là tài khoản chưa đăng ký (không có đăng nhập). Hãy dùng nút Xóa tài khoản chưa đăng ký.');
  const label = target.email || target.name;

  // 3. Đặt lại mật khẩu
  if (action === 'reset_password') {
    const pwErr = checkPassword(b.password);
    if (pwErr) return fail(pwErr);
    const e = await ports.setPassword(targetId, b.password as string);
    if (e) return fail(mapAuthError(e));
    await log('reset_password', targetId, label);
    return ok();
  }

  // 4. Xóa tài khoản
  if (action === 'delete') {
    if (targetId === actor.id) return fail('Bạn không thể tự xóa tài khoản của chính mình.');
    if (target.isAdmin && (await ports.countAdmins()) <= 1) return fail('Không thể xóa quản trị viên cuối cùng của hệ thống.');
    const e = await ports.deleteUser(targetId);
    if (e) return fail(e);
    await log('delete', targetId, label, target.name);
    return ok();
  }

  // 5. Sửa tên, email, quyền quản trị
  if (action === 'update') {
    const changes: string[] = [];
    let name: string | undefined;
    let email: string | undefined;
    if (b.name !== undefined) {
      name = cleanName(b.name);
      if (name.length < 2 || name.length > 80) return fail('Họ tên phải từ 2 đến 80 ký tự.');
      if (name !== target.name) changes.push(`tên "${target.name}" → "${name}"`);
      else name = undefined;
    }
    if (b.email !== undefined) {
      email = cleanEmail(b.email);
      if (!EMAIL.test(email) || email.length > 254) return fail('Email không hợp lệ.');
      if (email !== (target.email ?? '').toLowerCase()) changes.push(`email ${target.email ?? '—'} → ${email}`);
      else email = undefined;
    }
    let isAdmin: boolean | undefined;
    if (b.isAdmin !== undefined) {
      if (typeof b.isAdmin !== 'boolean') return fail('Giá trị quyền quản trị không hợp lệ.');
      if (b.isAdmin !== target.isAdmin) {
        if (targetId === actor.id) return fail('Bạn không thể tự đổi quyền quản trị của chính mình.');
        if (!b.isAdmin && (await ports.countAdmins()) <= 1) return fail('Không thể bỏ quyền của quản trị viên cuối cùng.');
        isAdmin = b.isAdmin;
        changes.push(b.isAdmin ? 'cấp quyền quản trị viên' : 'bỏ quyền quản trị viên');
      }
    }
    if (changes.length === 0) return fail('Không có thay đổi nào để lưu.');
    if (name !== undefined || email !== undefined) {
      const e = await ports.updateAuthUser(targetId, { email, name });
      if (e) return fail(mapAuthError(e));
    }
    const e2 = await ports.updateProfile(targetId, { name, email, isAdmin });
    if (e2) return fail(e2);
    await log('update', targetId, label, changes.join('; '));
    return ok();
  }

  return fail('Thao tác không hợp lệ.');
}

// ---------------------------------------------------------------------------------------------------------------
// Phần chạy trên Supabase Edge Runtime (Deno). Không chạy khi kiểm thử bằng node.
// ---------------------------------------------------------------------------------------------------------------
declare const Deno: any;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

if (typeof Deno !== 'undefined' && typeof Deno.serve === 'function') {
  const admin = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const ports: Ports = {
    verifyToken: async token => {
      const { data, error } = await admin.auth.getUser(token);
      return error || !data?.user ? null : data.user.id;
    },
    getProfile: async id => {
      const { data } = await admin.from('profiles').select('id,name,email,is_admin,is_placeholder').eq('id', id).maybeSingle();
      return data ? { id: data.id, name: data.name, email: data.email, isAdmin: !!data.is_admin, isPlaceholder: !!data.is_placeholder } : null;
    },
    countAdmins: async () => {
      const { count } = await admin.from('profiles').select('id', { count: 'exact', head: true }).eq('is_admin', true).eq('is_placeholder', false);
      return count ?? 0;
    },
    createUser: async ({ email, password, name }) => {
      const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name } });
      return error ? { error: error.message } : { id: data.user.id };
    },
    setPassword: async (id, password) => (await admin.auth.admin.updateUserById(id, { password })).error?.message,
    deleteUser: async id => (await admin.auth.admin.deleteUser(id)).error?.message,
    updateAuthUser: async (id, a) => {
      const attrs: Record<string, unknown> = {};
      if (a.email) {
        attrs.email = a.email;
        attrs.email_confirm = true;
      }
      if (a.name) attrs.user_metadata = { name: a.name };
      return (await admin.auth.admin.updateUserById(id, attrs)).error?.message;
    },
    updateProfile: async (id, a) => {
      const row: Record<string, unknown> = {};
      if (a.name !== undefined) row.name = a.name;
      if (a.email !== undefined) row.email = a.email;
      if (a.isAdmin !== undefined) row.is_admin = a.isAdmin;
      if (Object.keys(row).length === 0) return undefined;
      return (await admin.from('profiles').update(row).eq('id', id)).error?.message;
    },
    log: async e => {
      await admin.from('account_audit_log').insert({
        actor_id: e.actorId,
        actor_name: e.actorName,
        action: e.action,
        target_id: e.targetId,
        target_label: e.targetLabel,
        detail: e.detail ?? null
      });
    }
  };

  Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    let body: unknown = null;
    try {
      body = await req.json();
    } catch {
      /* thân rỗng: handle() sẽ báo thao tác không hợp lệ */
    }
    try {
      const out = await handle({ method: req.method, authorization: req.headers.get('Authorization'), body }, ports);
      return new Response(JSON.stringify(out.body), { status: out.status, headers: { ...CORS, 'Content-Type': 'application/json' } });
    } catch (e) {
      console.error('admin-accounts', e);
      return new Response(JSON.stringify({ ok: false, error: 'Lỗi máy chủ không xác định.' }), {
        status: 500,
        headers: { ...CORS, 'Content-Type': 'application/json' }
      });
    }
  });
}
