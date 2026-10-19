// Kiểm tra migration 0021: quản trị viên cấu hình ma trận phân quyền (toàn hệ thống / theo dự án) và các hàm can_* phản ánh đúng.
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';

const MIG = new URL('../migrations/', import.meta.url);
const FILES = ['0001_schema.sql', '0002_quality_template.sql', '0003_rpc_and_seed.sql', '0004_criteria_insert_guard.sql', '0005_deadlines_and_snapshots.sql', '0007_report_schedules.sql', '0008_roles_usecase_tree_task_fields.sql', '0009_usecase_attributes.sql', '0010_usecase_stages.sql', '0011_usecase_origin.sql', '0012_task_use_cases.sql', '0013_placeholder_accounts.sql', '0018_fix_null_permission_checks.sql', '0020_stage_order.sql', '0021_permission_config.sql'];

const db = new PGlite();
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}');
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
for (const k of ['admin', 'pm', 'ba', 'dev', 'tester', 'viewer', 'outsider', 'newbie']) {
  ids[k] = (await q(`insert into auth.users (email, raw_user_meta_data) values ($1, $2::jsonb) returning id`, [`${k}@t.vn`, JSON.stringify({ name: k })]))[0].id;
}
const as = async who => {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${who ? ids[who] : ''}', false);`);
  await db.exec(`set role ${who ? 'authenticated' : 'anon'};`);
};
const root = async () => { await db.exec(`reset role; select set_config('request.jwt.claim.sub','',false);`); };

await root();
await q(`update profiles set is_admin = true where id = $1`, [ids.admin]);
const mkProject = async code => (await q(`insert into projects (code,name,start_date,target_end_date,manager_id,progress_model) values ($1,$1,current_date,current_date+30,$2,'stages') returning id`, [code, ids.pm]))[0].id;
const P = await mkProject('P'), P2 = await mkProject('P2');
for (const pid of [P, P2]) for (const r of ['ba', 'dev', 'tester', 'viewer']) await q(`insert into project_members (project_id,user_id,role) values ($1,$2,$3)`, [pid, ids[r], r]);
const G = (await q(`insert into use_cases (project_id,code,title,kind) values ($1,'MOD-1','m','group') returning id`, [P]))[0].id;
const U1 = (await q(`insert into use_cases (project_id,parent_id,code,title) values ($1,$2,'UC-001','u1') returning id`, [P, G]))[0].id;

const report = async (who, pid = P) => { await as(who); return (await q(`select my_access_report($1) r`, [pid]))[0].r; };
const matrix = async (pid = null) => (await q(`select get_permission_matrix($1) m`, [pid]))[0].m;
const setPerm = async (pid, changes) => (await q(`select set_role_permissions($1, $2::jsonb) r`, [pid, JSON.stringify(changes)]))[0].r;
const keys = ['analysis', 'design', 'coding', 'testing', 'acceptance'];

// ---------- Mặc định = ma trận cũ ----------
const expect = {
  pm: { manage: 1, tasks: 1, ucs: 1, quality: 1, st: [1, 1, 1, 1, 1] },
  ba: { manage: 0, tasks: 1, ucs: 1, quality: 0, st: [1, 1, 0, 0, 0] },
  dev: { manage: 0, tasks: 1, ucs: 1, quality: 0, st: [0, 0, 1, 0, 0] },
  tester: { manage: 0, tasks: 1, ucs: 0, quality: 1, st: [0, 0, 0, 1, 0] },
  viewer: { manage: 0, tasks: 0, ucs: 0, quality: 0, st: [0, 0, 0, 0, 0] }
};
const same = (rep, e) => rep.manage === !!e.manage && rep.writeTasks === !!e.tasks && rep.writeUseCases === !!e.ucs && rep.approveQuality === !!e.quality && keys.every((k, i) => rep.stages[k] === !!e.st[i]);
for (const [who, e] of Object.entries(expect)) ok(`mặc định: ${who} đúng ma trận cũ`, same(await report(who), e));
{
  const m = await matrix(P);
  const allDefault = Object.values(m).every(row => Object.values(row).every(c => c.source === 'default'));
  ok('ma trận hiệu lực ban đầu: 9 quyền x 5 vai trò, tất cả là mặc định', Object.keys(m).length === 9 && allDefault);
}

// ---------- Chỉ quản trị viên được cấu hình ----------
for (const who of ['pm', 'dev', 'outsider']) {
  await as(who);
  await throws(`${who} không cấu hình được`, () => setPerm(null, [{ role: 'dev', permission: 'manage_project', allowed: true }]), '42501');
  await throws(`${who} không reset được`, () => q(`select reset_role_permissions(null)`), '42501');
  await throws(`${who} không xem được nhật ký`, () => q(`select get_permission_log(null)`), '42501');
}
await as(null);
await throws('khách chưa đăng nhập không cấu hình được', () => setPerm(null, []), 'permission denied');
await as('dev');
await throws('không ghi trực tiếp vào bảng cấu hình', () => q(`insert into role_permissions (role, permission, allowed) values ('dev','manage_project',true)`), 'permission denied');
await as('outsider');
await throws('người ngoài dự án không xem được ma trận dự án', () => matrix(P), '42501');
ok('ai đăng nhập cũng xem được ma trận toàn hệ thống', Object.keys(await matrix(null)).length === 9);

// ---------- Kiểm tra đầu vào ----------
await as('admin');
await throws('không cấu hình vai trò admin', () => setPerm(null, [{ role: 'admin', permission: 'write_tasks', allowed: false }]), '22023');
await throws('không cấu hình quyền cố định (view)', () => setPerm(null, [{ role: 'dev', permission: 'view', allowed: false }]), '22023');
await throws('danh sách trống bị từ chối', () => setPerm(null, []), '22023');
await throws('quá 100 thay đổi bị từ chối', () => setPerm(null, Array.from({ length: 101 }, () => ({ role: 'dev', permission: 'write_tasks', allowed: false }))), '22023');
await throws('dự án không tồn tại', () => setPerm('00000000-0000-0000-0000-000000000009', [{ role: 'dev', permission: 'write_tasks', allowed: false }]), 'P0002');
await throws('thiếu giá trị allowed bị từ chối', () => setPerm(null, [{ role: 'dev', permission: 'write_tasks' }]), '22023');
await throws('lỗi giữa chừng không lưu gì (nguyên khối)', () => setPerm(null, [{ role: 'viewer', permission: 'write_tasks', allowed: true }, { role: 'zzz', permission: 'write_tasks', allowed: true }]), '22023');
await root();
ok('không còn dòng nào sau lỗi', (await q(`select count(*)::int c from role_permissions`))[0].c === 0 && (await q(`select count(*)::int c from role_permission_log`))[0].c === 0);

// ---------- Cấu hình toàn hệ thống ----------
await as('admin');
let r = await setPerm(null, [{ role: 'dev', permission: 'manage_project', allowed: true }, { role: 'ba', permission: 'write_usecases', allowed: false }, { role: 'viewer', permission: 'write_tasks', allowed: true }]);
ok('lưu 3 thay đổi toàn hệ thống', r.changed === 3);
ok('DEV được cấp quản lý dự án (ở cả hai dự án)', (await report('dev', P)).manage === true && (await report('dev', P2)).manage === true);
ok('BA bị thu quyền sửa use case', (await report('ba')).writeUseCases === false && (await report('dev')).writeUseCases === true);
await as('ba');
await throws('BA bị thu quyền: không tạo được use case (RLS)', () => q(`insert into use_cases (project_id,code,title) values ($1,'UC-BA','x')`, [P]), 'row-level security');
await as('dev');
ok('DEV có quyền quản lý: thêm được thành viên', (await q(`select add_project_member($1,'newbie@t.vn','viewer')`, [P])).length === 1);
await as('viewer');
ok('Quan sát được cấp quyền nhiệm vụ: tạo được nhiệm vụ', (await q(`insert into tasks (project_id,code,title,start_date,due_date) values ($1,'T-V','việc',current_date,current_date+1) returning id`, [P])).length === 1);
await as('tester');
await throws('vai trò không được cấp vẫn bị chặn (tester không có quyền quản lý)', () => q(`select add_project_member($1,'outsider@t.vn','viewer')`, [P]), '42501');
{
  await as('admin');
  const m = await matrix(null);
  ok('ma trận ghi rõ nguồn "global" cho ô đã đổi và "default" cho ô còn lại', m.manage_project.dev.source === 'global' && m.manage_project.dev.allowed === true && m.write_usecases.ba.allowed === false && m.write_tasks.pm.source === 'default');
}

// ---------- Ghi đè theo dự án thắng cấu hình toàn hệ thống ----------
await as('admin');
await setPerm(P, [{ role: 'dev', permission: 'manage_project', allowed: false }]);
ok('dự án P: ghi đè thu lại quyền quản lý của DEV', (await report('dev', P)).manage === false);
ok('dự án P2 vẫn theo cấu hình toàn hệ thống (DEV quản lý được)', (await report('dev', P2)).manage === true);
{
  const m = await matrix(P);
  ok('ma trận dự án P: nguồn "project" cho ô ghi đè, "global" cho ô kế thừa', m.manage_project.dev.source === 'project' && m.write_usecases.ba.source === 'global');
}
await as('admin');
await setPerm(P, [{ role: 'dev', permission: 'manage_project', allowed: true }]);
await root();
ok('đặt lại đúng bằng giá trị kế thừa thì ghi đè bị xóa (không lưu thừa)', (await q(`select count(*)::int c from role_permissions where project_id = $1`, [P]))[0].c === 0);

// ---------- Quyền theo bước ----------
await as('pm');
await q(`select set_use_case_level($1::uuid[], 4)`, [[U1]]);
await as('tester');
let lv = (await q(`select set_use_case_level($1::uuid[], 5) r`, [[U1]]))[0].r;
ok('tester chưa có quyền Nghiệm thu: bị chặn', lv.blocked === 1 && lv.changed === 0, JSON.stringify(lv));
await as('admin');
await setPerm(null, [{ role: 'tester', permission: 'stage_acceptance', allowed: true }]);
await as('tester');
lv = (await q(`select set_use_case_level($1::uuid[], 5) r`, [[U1]]))[0].r;
ok('sau khi admin cấp Nghiệm thu cho tester: đặt được mức 5', lv.changed === 1, JSON.stringify(lv));
ok('báo cáo quyền của tester phản ánh bước Nghiệm thu', (await report('tester')).stages.acceptance === true);

// ---------- Quản trị viên luôn đủ quyền; báo cáo thành viên theo cấu hình ----------
await as('admin');
await setPerm(null, ['manage_project', 'write_tasks', 'write_usecases', 'approve_quality', 'stage_analysis', 'stage_design', 'stage_coding', 'stage_testing', 'stage_acceptance'].flatMap(p => ['pm', 'dev', 'ba', 'tester', 'viewer'].map(role => ({ role, permission: p, allowed: false }))));
const adm = await report('admin');
ok('tắt hết mọi quyền của mọi vai trò: admin vẫn đủ quyền', adm.manage && adm.writeTasks && adm.writeUseCases && adm.approveQuality && keys.every(k => adm.stages[k]));
const pmRep = await report('pm');
ok('...và PM mất hết quyền sửa (nhưng vẫn xem được)', pmRep.view === true && !pmRep.manage && !pmRep.writeTasks && !pmRep.writeUseCases && !pmRep.approveQuality && keys.every(k => !pmRep.stages[k]));
await as('admin');
{
  const mem = (await q(`select member_access_report($1,$2) r`, [P, ids.dev]))[0].r;
  ok('member_access_report theo cấu hình hiệu lực (khớp my_access_report của DEV)', JSON.stringify([mem.manage, mem.writeTasks, mem.writeUseCases]) === JSON.stringify([false, false, false]));
}

// ---------- Khôi phục ----------
r = (await q(`select reset_role_permissions(null) r`))[0].r;
ok('khôi phục mặc định toàn hệ thống xóa mọi ghi đè', r.removed > 0);
for (const [who, e] of Object.entries(expect)) ok(`sau khôi phục: ${who} lại đúng ma trận cũ`, same(await report(who), e));
await as('admin');
await setPerm(P, [{ role: 'viewer', permission: 'write_tasks', allowed: true }]);
r = (await q(`select reset_role_permissions($1) r`, [P]))[0].r;
ok('khôi phục theo dự án chỉ xóa ghi đè của dự án đó', r.removed === 1 && (await report('viewer', P)).writeTasks === false);

// ---------- Nhật ký ----------
await as('admin');
const log = (await q(`select get_permission_log(null, 500) l`))[0].l;
ok('nhật ký ghi lại các thay đổi (người đổi, giá trị cũ/mới)', Array.isArray(log) && log.length > 10 && log.every(l => l.by === 'admin' && typeof l.from === 'boolean' && typeof l.to === 'boolean'), JSON.stringify(log[0]));
ok('nhật ký của dự án tách riêng nhật ký toàn hệ thống', (await q(`select get_permission_log($1, 50) l`, [P]))[0].l.length === 4);

// ---------- Hoàn tác 0021 ----------
await setPerm(null, [{ role: 'dev', permission: 'manage_project', allowed: true }]);
await root();
await db.exec(fs.readFileSync(new URL('../rollback/0021_rollback.sql', import.meta.url), 'utf8'));
ok('rollback 0021: bảng và hàm cấu hình biến mất', (await q(`select to_regclass('public.role_permissions') t`))[0].t === null
  && (await q(`select count(*)::int c from pg_proc where proname in ('set_role_permissions','role_has_perm','perm_default','get_permission_matrix')`))[0].c === 0);
for (const [who, e] of Object.entries(expect)) ok(`rollback 0021: ${who} trở về ma trận cố định`, same(await report(who), e));
await as('outsider');
ok('rollback 0021: người ngoài dự án vẫn không có quyền nào', (await q(`select my_access_report($1) r`, [P]))[0].r.view === false);

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
