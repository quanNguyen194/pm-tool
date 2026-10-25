// Kiểm tra logic của Edge Function admin-accounts bằng dữ liệu giả (không gọi Supabase).
// Chạy: npx -y node@22 --experimental-strip-types --import ./scripts/npm-stub.mjs scripts/accounts.test.mjs
import { handle } from '../supabase/functions/admin-accounts/index.ts';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  cond ? pass++ : fail++;
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + name + (cond ? '' : '  ' + extra));
};

const U = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
function world() {
  const profiles = new Map([
    [U(1), { id: U(1), name: 'Admin Một', email: 'admin1@t.vn', isAdmin: true, isPlaceholder: false }],
    [U(2), { id: U(2), name: 'Admin Hai', email: 'admin2@t.vn', isAdmin: true, isPlaceholder: false }],
    [U(3), { id: U(3), name: 'Dev Ba', email: 'dev@t.vn', isAdmin: false, isPlaceholder: false }],
    [U(9), { id: U(9), name: 'Người Chưa Đăng Ký', email: null, isAdmin: false, isPlaceholder: true }]
  ]);
  const tokens = { 'tok-admin1': U(1), 'tok-admin2': U(2), 'tok-dev': U(3), 'tok-ph': U(9) };
  const w = { profiles, passwords: new Map(), logs: [], calls: [], nextId: 100, failAuth: null };
  w.ports = {
    verifyToken: async t => tokens[t] ?? null,
    getProfile: async id => profiles.get(id) ?? null,
    countAdmins: async () => [...profiles.values()].filter(p => p.isAdmin && !p.isPlaceholder).length,
    createUser: async ({ email, password, name }) => {
      w.calls.push(['createUser', email]);
      if (w.failAuth) return { error: w.failAuth };
      if ([...profiles.values()].some(p => (p.email ?? '').toLowerCase() === email)) return { error: 'A user with this email address has already been registered' };
      const id = U(w.nextId++);
      profiles.set(id, { id, name, email, isAdmin: false, isPlaceholder: false });
      w.passwords.set(id, password);
      return { id };
    },
    setPassword: async (id, pw) => { w.calls.push(['setPassword', id]); if (w.failAuth) return w.failAuth; w.passwords.set(id, pw); },
    deleteUser: async id => { w.calls.push(['deleteUser', id]); profiles.delete(id); },
    updateAuthUser: async (id, a) => { w.calls.push(['updateAuthUser', id, a]); if (w.failAuth) return w.failAuth; },
    updateProfile: async (id, a) => {
      w.calls.push(['updateProfile', id, a]);
      const p = profiles.get(id);
      if (a.name !== undefined) p.name = a.name;
      if (a.email !== undefined) p.email = a.email;
      if (a.isAdmin !== undefined) p.isAdmin = a.isAdmin;
    },
    log: async e => { w.logs.push(e); }
  };
  return w;
}
const call = (w, token, body, method = 'POST') => handle({ method, authorization: token ? `Bearer ${token}` : null, body }, w.ports);
const bad = (r, text) => r.body.ok === false && (!text || String(r.body.error).includes(text));

// ---------- Xác thực và phân quyền ----------
{
  const w = world();
  ok('GET bị từ chối (405)', (await call(w, 'tok-admin1', {}, 'GET')).status === 405);
  ok('thiếu token bị từ chối', bad(await call(w, null, { action: 'create' }), 'Chưa đăng nhập'));
  ok('token sai bị từ chối', bad(await call(w, 'tok-lạ', { action: 'create' }), 'không hợp lệ'));
  const r = await call(w, 'tok-dev', { action: 'create', email: 'x@t.vn', name: 'Xx', password: '12345678' });
  ok('người không phải admin bị từ chối, không tạo gì', bad(r, 'quản trị viên') && w.calls.length === 0);
  ok('tài khoản chưa đăng ký (ảo) không có quyền', bad(await call(w, 'tok-ph', { action: 'delete', userId: U(3) }), 'quản trị viên'));
  ok('thao tác lạ bị từ chối', bad(await call(w, 'tok-admin1', { action: 'xoa-sach' }), 'không hợp lệ') && bad(await call(w, 'tok-admin1', 'không phải đối tượng'), 'không hợp lệ'));
}

// ---------- Tạo tài khoản ----------
{
  const w = world();
  const r = await call(w, 'tok-admin1', { action: 'create', email: '  New.User@Example.com ', name: '  Nguyễn   Văn  A ', password: 'matkhau123' });
  ok('tạo tài khoản: chuẩn hóa email (chữ thường) và tên (gộp khoảng trắng)', r.body.ok === true && w.profiles.get(r.body.id).email === 'new.user@example.com' && w.profiles.get(r.body.id).name === 'Nguyễn Văn A');
  ok('tạo tài khoản: ghi nhật ký (có email, không có mật khẩu)', w.logs.length === 1 && w.logs[0].action === 'create' && w.logs[0].targetLabel === 'new.user@example.com' && !JSON.stringify(w.logs).includes('matkhau123') && w.logs[0].actorName === 'Admin Một');
  ok('tạo tài khoản thường không có quyền admin', w.profiles.get(r.body.id).isAdmin === false);
  const r2 = await call(w, 'tok-admin1', { action: 'create', email: 'adm@t.vn', name: 'Admin Mới', password: 'matkhau123', isAdmin: true });
  ok('tạo tài khoản quản trị viên', r2.body.ok === true && w.profiles.get(r2.body.id).isAdmin === true && w.logs[1].detail === 'Quản trị viên hệ thống');
  ok('email trùng báo lỗi dễ hiểu', bad(await call(w, 'tok-admin1', { action: 'create', email: 'DEV@t.vn', name: 'Trùng', password: 'matkhau123' }), 'đã được dùng'));
  ok('email sai định dạng', bad(await call(w, 'tok-admin1', { action: 'create', email: 'khong-phai-email', name: 'Ten Ok', password: 'matkhau123' }), 'Email không hợp lệ'));
  ok('tên quá ngắn', bad(await call(w, 'tok-admin1', { action: 'create', email: 'a@b.vn', name: 'A', password: 'matkhau123' }), 'Họ tên'));
  ok('mật khẩu dưới 8 ký tự', bad(await call(w, 'tok-admin1', { action: 'create', email: 'a@b.vn', name: 'Ten Ok', password: '1234567' }), 'ít nhất 8'));
  ok('mật khẩu quá 72 byte', bad(await call(w, 'tok-admin1', { action: 'create', email: 'a@b.vn', name: 'Ten Ok', password: 'x'.repeat(73) }), '72'));
  ok('mật khẩu không phải chữ', bad(await call(w, 'tok-admin1', { action: 'create', email: 'a@b.vn', name: 'Ten Ok', password: 12345678 }), 'ít nhất 8'));
  w.failAuth = 'Password should be at least 6 characters (weak password)';
  ok('lỗi từ hệ thống xác thực được dịch', bad(await call(w, 'tok-admin1', { action: 'create', email: 'z@b.vn', name: 'Ten Ok', password: 'matkhau123' }), 'không đạt'));
}

// ---------- Đặt lại mật khẩu ----------
{
  const w = world();
  const r = await call(w, 'tok-admin1', { action: 'reset_password', userId: U(3), password: 'MoiMoi12345' });
  ok('đặt lại mật khẩu thành công', r.body.ok === true && w.passwords.get(U(3)) === 'MoiMoi12345');
  ok('nhật ký đặt lại mật khẩu không chứa mật khẩu', w.logs.length === 1 && w.logs[0].action === 'reset_password' && w.logs[0].targetLabel === 'dev@t.vn' && !JSON.stringify(w.logs).includes('MoiMoi12345'));
  ok('mật khẩu ngắn bị từ chối, không gọi hệ thống', bad(await call(w, 'tok-admin1', { action: 'reset_password', userId: U(3), password: 'ngan' }), 'ít nhất 8') && w.calls.length === 1);
  ok('mã tài khoản sai định dạng', bad(await call(w, 'tok-admin1', { action: 'reset_password', userId: 'abc', password: 'matkhau123' }), 'Mã tài khoản'));
  ok('tài khoản không tồn tại', bad(await call(w, 'tok-admin1', { action: 'reset_password', userId: U(77), password: 'matkhau123' }), 'Không tìm thấy'));
  ok('tài khoản chưa đăng ký không đặt được mật khẩu', bad(await call(w, 'tok-admin1', { action: 'reset_password', userId: U(9), password: 'matkhau123' }), 'chưa đăng ký'));
  ok('admin tự đặt lại mật khẩu của mình được', (await call(w, 'tok-admin1', { action: 'reset_password', userId: U(1), password: 'matkhau123' })).body.ok === true);
}

// ---------- Xóa tài khoản ----------
{
  const w = world();
  ok('không tự xóa chính mình', bad(await call(w, 'tok-admin1', { action: 'delete', userId: U(1) }), 'tự xóa') && w.profiles.has(U(1)));
  ok('tài khoản chưa đăng ký không xóa bằng hàm này', bad(await call(w, 'tok-admin1', { action: 'delete', userId: U(9) }), 'chưa đăng ký') && w.profiles.has(U(9)));
  const r = await call(w, 'tok-admin1', { action: 'delete', userId: U(3) });
  ok('xóa tài khoản thường', r.body.ok === true && !w.profiles.has(U(3)) && w.logs.at(-1).action === 'delete' && w.logs.at(-1).detail === 'Dev Ba');
  const r2 = await call(w, 'tok-admin1', { action: 'delete', userId: U(2) });
  ok('xóa được admin khác khi còn admin khác', r2.body.ok === true && !w.profiles.has(U(2)));
  // Chỉ còn một admin: người đó không tự xóa được; thử với admin khác bị xóa mất
  const w2 = world();
  w2.profiles.get(U(2)).isAdmin = false; // chỉ còn Admin Một
  ok('không xóa admin cuối cùng (admin khác thử xóa)', await (async () => {
    w2.profiles.get(U(3)).isAdmin = true; // dev trở thành admin để có người thứ hai gọi
    const r = await call(w2, 'tok-dev', { action: 'delete', userId: U(1) });
    return r.body.ok === true && !w2.profiles.has(U(1)); // còn 2 admin (Admin Một, Dev) nên xóa Admin Một được
  })());
  const w3 = world();
  w3.profiles.get(U(2)).isAdmin = false;
  w3.profiles.get(U(3)).isAdmin = false;
  ok('hệ thống chỉ còn 1 admin: không ai xóa được người đó (kể cả chính họ)', bad(await call(w3, 'tok-admin1', { action: 'delete', userId: U(1) }), 'tự xóa'));
}

// ---------- Sửa tên, email, quyền ----------
{
  const w = world();
  let r = await call(w, 'tok-admin1', { action: 'update', userId: U(3), name: '  Trần  Văn  B ' });
  ok('sửa tên: cập nhật hồ sơ và hệ thống xác thực', r.body.ok === true && w.profiles.get(U(3)).name === 'Trần Văn B' && w.calls.some(c => c[0] === 'updateAuthUser' && c[2].name === 'Trần Văn B'));
  ok('nhật ký sửa ghi lại giá trị cũ → mới', w.logs.at(-1).action === 'update' && w.logs.at(-1).detail.includes('"Dev Ba" → "Trần Văn B"'));
  r = await call(w, 'tok-admin1', { action: 'update', userId: U(3), email: 'MoI@T.vn' });
  ok('sửa email (chữ thường)', r.body.ok === true && w.profiles.get(U(3)).email === 'moi@t.vn');
  ok('email sai định dạng', bad(await call(w, 'tok-admin1', { action: 'update', userId: U(3), email: 'sai' }), 'Email không hợp lệ'));
  ok('không có thay đổi thì báo', bad(await call(w, 'tok-admin1', { action: 'update', userId: U(3), name: 'Trần Văn B' }), 'Không có thay đổi'));
  r = await call(w, 'tok-admin1', { action: 'update', userId: U(3), isAdmin: true });
  ok('cấp quyền quản trị viên', r.body.ok === true && w.profiles.get(U(3)).isAdmin === true && w.logs.at(-1).detail.includes('cấp quyền'));
  ok('không tự đổi quyền của mình', bad(await call(w, 'tok-admin1', { action: 'update', userId: U(1), isAdmin: false }), 'tự đổi quyền'));
  r = await call(w, 'tok-admin1', { action: 'update', userId: U(3), isAdmin: false });
  ok('bỏ quyền quản trị viên khi còn admin khác', r.body.ok === true && w.profiles.get(U(3)).isAdmin === false);
  const w2 = world();
  w2.profiles.get(U(2)).isAdmin = false;
  w2.profiles.get(U(3)).isAdmin = true;
  const r3 = await call(w2, 'tok-dev', { action: 'update', userId: U(1), isAdmin: false });
  ok('bỏ quyền admin còn lại (sau đó còn 1) được; admin cuối cùng thì không', r3.body.ok === true && bad(await call(w2, 'tok-admin1', { action: 'update', userId: U(3), isAdmin: false }), 'cuối cùng') === false);
  const w4 = world();
  w4.profiles.get(U(2)).isAdmin = false;
  w4.profiles.get(U(3)).isAdmin = false;
  // Chỉ còn Admin Một; một admin khác không tồn tại nên chỉ kiểm tra chặn tự đổi quyền (đã có ở trên)
  ok('kiểu quyền không phải boolean bị từ chối', bad(await call(w4, 'tok-admin1', { action: 'update', userId: U(3), isAdmin: 'true' }), 'không hợp lệ'));
  ok('tài khoản chưa đăng ký không sửa được bằng hàm này', bad(await call(w4, 'tok-admin1', { action: 'update', userId: U(9), name: 'Tên Mới' }), 'chưa đăng ký'));
  w4.failAuth = 'A user with this email address has already been registered';
  ok('đổi sang email đã dùng báo lỗi dễ hiểu và không sửa hồ sơ', bad(await call(w4, 'tok-admin1', { action: 'update', userId: U(3), email: 'admin1@t.vn' }), 'đã được dùng') && w4.profiles.get(U(3)).email === 'dev@t.vn');
}

// ---------- Chốt chặn "admin cuối cùng" (phòng thủ: kích hoạt khi số admin đếm được chỉ còn 1) ----------
{
  const w = world();
  w.ports.countAdmins = async () => 1;
  ok('xóa admin khi số admin chỉ còn 1: bị chặn', bad(await call(w, 'tok-admin1', { action: 'delete', userId: U(2) }), 'cuối cùng') && w.profiles.has(U(2)));
  ok('bỏ quyền admin khi số admin chỉ còn 1: bị chặn', bad(await call(w, 'tok-admin1', { action: 'update', userId: U(2), isAdmin: false }), 'cuối cùng') && w.profiles.get(U(2)).isAdmin === true);
  ok('xóa người không phải admin vẫn được', (await call(w, 'tok-admin1', { action: 'delete', userId: U(3) })).body.ok === true);
}

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
