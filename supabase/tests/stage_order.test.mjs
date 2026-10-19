// Kiểm tra migration 0020: 5 bước use case làm tuần tự (tick bước sau tự tick các bước trước; bỏ bước trước thì bỏ các bước sau),
// đặt mức tiến độ hàng loạt (đánh dấu + bỏ đánh dấu) và báo cáo quyền truy cập.
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';

const MIG = new URL('../migrations/', import.meta.url);
const FILES = ['0001_schema.sql', '0002_quality_template.sql', '0003_rpc_and_seed.sql', '0004_criteria_insert_guard.sql', '0005_deadlines_and_snapshots.sql', '0007_report_schedules.sql', '0008_roles_usecase_tree_task_fields.sql', '0009_usecase_attributes.sql', '0010_usecase_stages.sql', '0011_usecase_origin.sql', '0012_task_use_cases.sql', '0013_placeholder_accounts.sql', '0018_fix_null_permission_checks.sql', '0020_stage_order.sql'];

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
for (const k of ['admin', 'pm', 'ba', 'dev', 'tester', 'viewer', 'outsider']) {
  ids[k] = (await q(`insert into auth.users (email, raw_user_meta_data) values ($1, $2::jsonb) returning id`, [`${k}@t.vn`, JSON.stringify({ name: k })]))[0].id;
}
const as = async who => {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${who ? ids[who] : ''}', false);`);
  await db.exec(`set role ${who ? 'authenticated' : 'anon'};`);
};
const root = async () => { await db.exec(`reset role; select set_config('request.jwt.claim.sub','',false);`); };

await root();
await q(`update profiles set is_admin = true where id = $1`, [ids.admin]);
const P = (await q(`insert into projects (code,name,start_date,target_end_date,manager_id,progress_model) values ('P','P',current_date,current_date+30,$1,'stages') returning id`, [ids.pm]))[0].id;
for (const r of ['ba', 'dev', 'tester', 'viewer']) await q(`insert into project_members (project_id,user_id,role) values ($1,$2,$3)`, [P, ids[r], r]);
const G = (await q(`insert into use_cases (project_id,code,title,kind) values ($1,'MOD-1','Module','group') returning id`, [P]))[0].id;
const mk = async code => (await q(`insert into use_cases (project_id,parent_id,code,title,complexity) values ($1,$2,$3,$3,'medium') returning id`, [P, G, code]))[0].id;
const U1 = await mk('UC-001'), U2 = await mk('UC-002'), U3 = await mk('UC-003'), U4 = await mk('UC-004');

const stages = async u => (await q(`select stage from use_case_stages where use_case_id = $1 order by stage_index(stage)`, [u])).map(r => r.stage);
const prog = async u => (await q(`select progress_percent p from use_cases where id = $1`, [u]))[0].p;
const stage = async (uuids, s, done = true, actor = null) => (await q(`select set_use_case_stages($1::uuid[], $2, $3, $4) r`, [uuids, s, done, actor]))[0].r;
const level = async (uuids, l, actor = null) => (await q(`select set_use_case_level($1::uuid[], $2, $3) r`, [uuids, l, actor]))[0].r;

// ---------- Tick bước sau => tự tick các bước trước ----------
await as('pm');
let r = await stage([U1], 'coding');
ok('PM tick "Lập trình" -> tự tick Phân tích, Thiết kế', r.changed === 1 && JSON.stringify(await stages(U1)) === JSON.stringify(['analysis', 'design', 'coding']), JSON.stringify(await stages(U1)));
await root();
ok('tiến độ = 10 + 10 + 40 = 60%', (await prog(U1)) === 60);
await as('pm');
r = await stage([U1], 'coding');
ok('tick lại bước đã xong: không thay đổi', r.changed === 0 && r.unchanged === 1);

// ---------- Người không đủ quyền tick các bước trước: bị bỏ qua + báo lại ----------
await as('dev');
r = await stage([U2], 'coding');
ok('DEV tick "Lập trình" khi BA chưa xong Phân tích/Thiết kế -> bị chặn (không tick gì)', r.blocked === 1 && r.changed === 0 && r.blockedCodes[0] === 'UC-002' && (await stages(U2)).length === 0, JSON.stringify(r));
await as('ba');
r = await stage([U2], 'design');
ok('BA tick "Thiết kế" -> tự tick Phân tích', r.changed === 1 && JSON.stringify(await stages(U2)) === JSON.stringify(['analysis', 'design']));
await as('dev');
r = await stage([U2], 'coding');
ok('sau khi BA xong, DEV tick được "Lập trình"', r.changed === 1 && (await stages(U2)).includes('coding'));
await as('tester');
await throws('tester không có quyền bước "Lập trình" -> báo lỗi quyền', () => stage([U3], 'coding'), '42501');

// ---------- Hàng loạt: lẫn use case đủ điều kiện và chưa đủ ----------
await as('dev');
r = await stage([U1, U2, U3, U4], 'coding');
ok('DEV tick hàng loạt: U1, U2 đã xong (không đổi), U3 và U4 bị chặn (chưa có Phân tích/Thiết kế)', r.changed === 0 && r.unchanged === 2 && r.blocked === 2, JSON.stringify(r));
await as('ba');
await stage([U3], 'design');
await as('dev');
r = await stage([U1, U2, U3, U4], 'coding');
ok('sau khi BA xong U3: DEV tick được U3, U4 vẫn bị chặn', r.changed === 1 && r.blocked === 1 && r.blockedCodes[0] === 'UC-004', JSON.stringify(r));

// ---------- Bỏ đánh dấu: bỏ bước trước thì bỏ cả các bước sau ----------
await as('ba');
r = await stage([U1], 'analysis', false);
ok('BA bỏ "Phân tích" nhưng "Lập trình" đã xong (của DEV) -> bị chặn, không đổi gì', r.blocked === 1 && (await stages(U1)).length === 3, JSON.stringify(r));
await as('pm');
r = await stage([U1], 'design', false);
ok('PM bỏ "Thiết kế" -> Thiết kế và Lập trình cùng bị bỏ, Phân tích giữ', r.changed === 1 && JSON.stringify(await stages(U1)) === JSON.stringify(['analysis']));
r = await stage([U1], 'analysis', false);
ok('bỏ "Phân tích" -> về 0', JSON.stringify(await stages(U1)) === '[]');
await root();
ok('tiến độ về 0%', (await prog(U1)) === 0);

// ---------- Đặt mức tiến độ hàng loạt (đánh dấu + bỏ đánh dấu) ----------
await as('pm');
r = await level([U1, U2, U3, U4], 3);
ok('đặt mức 3 cho 4 use case: ai cũng có Phân tích, Thiết kế, Lập trình', (await Promise.all([U1, U2, U3, U4].map(stages))).every(s => JSON.stringify(s) === JSON.stringify(['analysis', 'design', 'coding'])), JSON.stringify(r));
r = await level([U1, U2, U3, U4], 1);
ok('hạ về mức 1: chỉ còn Phân tích (bỏ đánh dấu hàng loạt)', r.changed === 4 && (await Promise.all([U1, U2, U3, U4].map(stages))).every(s => JSON.stringify(s) === JSON.stringify(['analysis'])), JSON.stringify(r));
r = await level([U1, U2, U3, U4], 0);
ok('đặt mức 0: bỏ hết các bước', r.changed === 4 && (await Promise.all([U1, U2, U3, U4].map(stages))).every(s => s.length === 0));
r = await level([U1, U2, U3, U4], 0);
ok('đặt lại cùng mức: không thay đổi', r.changed === 0 && r.unchanged === 4);
r = await level([U1], 5);
await root();
ok('mức 5 = đủ 5 bước = 100%', (await prog(U1)) === 100);
await as('dev');
r = await level([U1], 1);
ok('DEV hạ mức về 1 nhưng không có quyền bỏ Thiết kế/Kiểm thử/Nghiệm thu -> bị chặn', r.blocked === 1 && (await stages(U1)).length === 5, JSON.stringify(r));
await as('pm');
await level([U1], 0);

// ---------- Kiểm tra đầu vào, quyền, bỏ qua nhóm/hủy ----------
await throws('mức ngoài 0..5 bị từ chối', () => level([U1], 6), '22023');
await throws('quá 500 use case bị từ chối', () => level(Array.from({ length: 501 }, () => U1), 1), '22023');
await throws('bước không hợp lệ bị từ chối', () => stage([U1], 'deploy'), '22023');
r = await level([G], 3);
ok('nhóm/module bị bỏ qua (không đếm)', r.changed === 0 && r.blocked === 0 && r.unchanged === 0);
await root();
await q(`update use_cases set status = 'cancelled' where id = $1`, [U4]);
await as('pm');
r = await level([U4], 3);
ok('use case "Không thực hiện" bị bỏ qua', r.changed === 0 && (await stages(U4)).length === 0);
await as('viewer');
await throws('quan sát không đổi được bước', () => stage([U1], 'analysis'), '42501');
await as('outsider');
await throws('người ngoài dự án không đổi được bước', () => stage([U1], 'analysis'), '42501');

// ---------- Dữ liệu cũ lệch thứ tự được sửa dần ----------
await root();
await q(`insert into use_case_stages (use_case_id, stage) values ($1, 'testing')`, [U2]); // chỉ có "Kiểm thử" (thứ tự cũ)
await as('pm');
await level([U2], 0);
await root();
await q(`insert into use_case_stages (use_case_id, stage) values ($1, 'testing')`, [U2]);
await as('pm');
r = await stage([U2], 'coding');
ok('dữ liệu cũ lệch thứ tự: tick Lập trình điền đủ Phân tích, Thiết kế, giữ Kiểm thử', JSON.stringify(await stages(U2)) === JSON.stringify(['analysis', 'design', 'coding', 'testing']), JSON.stringify(await stages(U2)));
r = await stage([U2], 'design', false);
ok('bỏ Thiết kế bỏ luôn Lập trình và Kiểm thử đã có', JSON.stringify(await stages(U2)) === JSON.stringify(['analysis']));
await level([U2], 0);

// ---------- Admin chọn người thực hiện ----------
await as('admin');
await level([U3], 2, ids.ba);
await root();
ok('admin đặt mức 2 và ghi nhận BA là người thực hiện cả hai bước', (await q(`select count(*)::int c from use_case_stages where use_case_id=$1 and done_by=$2`, [U3, ids.ba]))[0].c === 2);
await as('pm');
await throws('PM không chọn được người thực hiện khác', () => level([U3], 3, ids.ba), '42501');

// ---------- Báo cáo quyền ----------
const myReport = async who => { await as(who); return (await q(`select my_access_report($1) r`, [P]))[0].r; };
const roleExpect = {
  admin: { view: true, manage: true, writeTasks: true, writeUseCases: true, approveQuality: true, st: [1, 1, 1, 1, 1] },
  pm: { view: true, manage: true, writeTasks: true, writeUseCases: true, approveQuality: true, st: [1, 1, 1, 1, 1] },
  ba: { view: true, manage: false, writeTasks: true, writeUseCases: true, approveQuality: false, st: [1, 1, 0, 0, 0] },
  dev: { view: true, manage: false, writeTasks: true, writeUseCases: true, approveQuality: false, st: [0, 0, 1, 0, 0] },
  tester: { view: true, manage: false, writeTasks: true, writeUseCases: false, approveQuality: true, st: [0, 0, 0, 1, 0] },
  viewer: { view: true, manage: false, writeTasks: false, writeUseCases: false, approveQuality: false, st: [0, 0, 0, 0, 0] },
  outsider: { view: false, manage: false, writeTasks: false, writeUseCases: false, approveQuality: false, st: [0, 0, 0, 0, 0] }
};
const keys = ['analysis', 'design', 'coding', 'testing', 'acceptance'];
const reports = {};
for (const [who, e] of Object.entries(roleExpect)) {
  const rep = await myReport(who);
  reports[who] = rep;
  const same = rep.view === e.view && rep.manage === e.manage && rep.writeTasks === e.writeTasks && rep.writeUseCases === e.writeUseCases && rep.approveQuality === e.approveQuality && keys.every((k, i) => rep.stages[k] === !!e.st[i]);
  ok(`my_access_report(${who}) đúng ma trận quyền`, same, JSON.stringify(rep));
}
ok('DEV là thành viên: đọc được đủ use case (số thấy = tổng số thật)', reports.dev.visible.useCases === reports.dev.total.useCases && reports.dev.visible.useCases === 5, JSON.stringify([reports.dev.visible, reports.dev.total]));
ok('người ngoài dự án: không thấy dòng nào và không biết tổng', reports.outsider.visible.useCases === 0 && reports.outsider.total === null, JSON.stringify(reports.outsider));
ok('vai trò hiển thị đúng', reports.dev.role === 'dev' && reports.outsider.role === null && reports.admin.isAdmin === true);

// member_access_report phải khớp my_access_report của chính người đó (một nguồn sự thật)
await as('pm');
for (const who of ['admin', 'pm', 'ba', 'dev', 'tester', 'viewer', 'outsider']) {
  const m = (await q(`select member_access_report($1,$2) r`, [P, ids[who]]))[0].r;
  const mine = reports[who];
  const same = ['view', 'manage', 'writeTasks', 'writeUseCases', 'approveQuality'].every(k => m[k] === mine[k]) && keys.every(k => m.stages[k] === mine.stages[k]) && m.role === mine.role;
  ok(`member_access_report(${who}) khớp my_access_report`, same, JSON.stringify([m, mine]));
}
await as('dev');
await throws('DEV không xem được quyền của người khác', () => q(`select member_access_report($1,$2)`, [P, ids.ba]), '42501');
await as('outsider');
await throws('người ngoài không xem được quyền thành viên', () => q(`select member_access_report($1,$2)`, [P, ids.ba]), '42501');
await as(null);
await throws('khách chưa đăng nhập không gọi được', () => q(`select my_access_report($1)`, [P]), 'permission denied');

// ---------- Hoàn tác 0020 ----------
await root();
await db.exec(fs.readFileSync(new URL('../rollback/0020_rollback.sql', import.meta.url), 'utf8'));
ok('rollback 0020: chỉ còn một set_use_case_stages, các hàm mới biến mất', (await q(`select count(*)::int c from pg_proc where proname = 'set_use_case_stages'`))[0].c === 1
  && (await q(`select count(*)::int c from pg_proc where proname in ('set_use_case_level','my_access_report','member_access_report','stage_index')`))[0].c === 0);
await as('pm');
const old = (await q(`select set_use_case_stages($1::uuid[], 'analysis', true) n`, [[U1]]))[0].n;
ok('rollback 0020: set_use_case_stages trả số nguyên như 0013 và vẫn tick được', old === 1);

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
