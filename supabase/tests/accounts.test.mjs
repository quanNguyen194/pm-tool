// Kiểm tra migration 0028: danh sách tài khoản và nhật ký cho quản trị viên.
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';

const MIG = new URL('../migrations/', import.meta.url);
const FILES = ['0001_schema.sql', '0002_quality_template.sql', '0003_rpc_and_seed.sql', '0004_criteria_insert_guard.sql', '0005_deadlines_and_snapshots.sql', '0007_report_schedules.sql', '0008_roles_usecase_tree_task_fields.sql', '0009_usecase_attributes.sql', '0010_usecase_stages.sql', '0011_usecase_origin.sql', '0012_task_use_cases.sql', '0013_placeholder_accounts.sql'];

const db = new PGlite();
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}', last_sign_in_at timestamptz, email_confirmed_at timestamptz);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create publication supabase_realtime;
  grant usage on schema public, auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated, public;
`);
for (const f of FILES) await db.exec(fs.readFileSync(new URL(f, MIG), 'utf8'));

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log((cond ? 'PASS' : 'FAIL') + '  ' + name + (cond ? '' : '  ' + extra)); };
const throws = async (name, fn, text) => {
  try { await fn(); ok(name, false, 'không báo lỗi'); }
  catch (e) { ok(name, !text || (e.message + (e.code || '')).includes(text), e.message); }
};
const q = async (sql, p) => (await db.query(sql, p)).rows;

const ids = {};
for (const k of ['admin', 'dev', 'viewer']) {
  ids[k] = (await q(`insert into auth.users (email, raw_user_meta_data, last_sign_in_at, email_confirmed_at) values ($1, $2::jsonb, $3, $4) returning id`,
    [`${k}@t.vn`, JSON.stringify({ name: 'Người ' + k }), k === 'dev' ? '2026-10-01T00:00:00Z' : null, k === 'viewer' ? null : '2026-09-01T00:00:00Z']))[0].id;
}
const as = async who => { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${who ? ids[who] : ''}', false); set role ${who ? 'authenticated' : 'anon'};`); };
const root = async () => { await db.exec(`reset role; select set_config('request.jwt.claim.sub','',false);`); };

await root();
await q(`update profiles set is_admin = true where id = $1`, [ids.admin]);
const P = (await q(`insert into projects (code,name,start_date,target_end_date,manager_id) values ('P','P',current_date,current_date+5,$1) returning id`, [ids.dev]))[0].id;
await q(`insert into project_members (project_id,user_id,role) values ($1,$2,'viewer') on conflict do nothing`, [P, ids.viewer]);
await q(`insert into profiles (id, name, is_placeholder) values (gen_random_uuid(), 'Chưa Đăng Ký', true)`);
await db.exec(fs.readFileSync(new URL('0028_account_admin.sql', MIG), 'utf8'));

await as('admin');
const list = (await q(`select admin_list_accounts() l`))[0].l;
ok('admin xem được mọi tài khoản (thật và chưa đăng ký)', list.length === 4);
ok('mỗi dòng có tên, email, loại, số dự án', list.every(a => 'name' in a && 'email' in a && 'isAdmin' in a && 'isPlaceholder' in a && typeof a.projectCount === 'number'));
const dev = list.find(a => a.email === 'dev@t.vn');
ok('đăng nhập gần nhất lấy từ auth.users', !!dev.lastSignInAt && list.find(a => a.email === 'admin@t.vn').lastSignInAt === null);
ok('trạng thái xác nhận email đúng', dev.emailConfirmed === true && list.find(a => a.email === 'viewer@t.vn').emailConfirmed === false);
ok('số dự án tham gia đúng', dev.projectCount === 1 && list.find(a => a.email === 'viewer@t.vn').projectCount === 1 && list.find(a => a.email === 'admin@t.vn').projectCount === 0);
ok('tài khoản chưa đăng ký xếp cuối và không có email', list[list.length - 1].isPlaceholder === true && list[list.length - 1].email === null);
ok('danh sách không chứa mật khẩu hay mã băm', !JSON.stringify(list).match(/password|encrypted/i));

for (const who of ['dev', 'viewer']) {
  await as(who);
  await throws(`${who} không xem được danh sách tài khoản`, () => q(`select admin_list_accounts()`), '42501');
  await throws(`${who} không xem được nhật ký`, () => q(`select admin_account_log()`), '42501');
  await throws(`${who} không đọc trực tiếp bảng nhật ký`, () => q(`select * from account_audit_log`), 'permission denied');
}
await as(null);
await throws('khách ẩn danh không gọi được hàm', () => q(`select admin_list_accounts()`), 'permission denied');

await root();
await q(`insert into account_audit_log (actor_id, actor_name, action, target_id, target_label, detail) values ($1,'Admin','create',$2,'a@t.vn',null), ($1,'Admin','reset_password',$2,'a@t.vn',null), ($1,'Admin','delete',null,'b@t.vn','B')`, [ids.admin, ids.dev]);
await throws('nhật ký từ chối hành động lạ (ràng buộc)', () => q(`insert into account_audit_log (action) values ('hack')`), 'check');
await as('admin');
const log = (await q(`select admin_account_log(2) l`))[0].l;
ok('nhật ký trả về mới nhất trước và đúng giới hạn', log.length === 2 && log[0].action === 'delete' && log[1].action === 'reset_password');
await root();
await q(`delete from profiles where id = $1`, [ids.admin]).catch(() => undefined);
ok('xóa hồ sơ người thao tác không làm mất dòng nhật ký', (await q(`select count(*)::int c from account_audit_log`))[0].c >= 3);

await root();
await db.exec(fs.readFileSync(new URL('../rollback/0028_rollback.sql', import.meta.url), 'utf8'));
ok('rollback 0028: bảng và hàm biến mất, tài khoản còn nguyên', (await q(`select to_regclass('public.account_audit_log') t`))[0].t === null
  && (await q(`select count(*)::int c from pg_proc where proname in ('admin_list_accounts','admin_account_log')`))[0].c === 0
  && (await q(`select count(*)::int c from profiles`))[0].c >= 2);

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
