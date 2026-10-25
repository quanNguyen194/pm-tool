// Kiểm tra migration 0029: admin ghép thủ công tài khoản chưa đăng ký vào tài khoản thật (nhiệm vụ đã giao chuyển theo).
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';

const MIG = new URL('../migrations/', import.meta.url);
const FILES = ['0001_schema.sql', '0002_quality_template.sql', '0003_rpc_and_seed.sql', '0004_criteria_insert_guard.sql', '0005_deadlines_and_snapshots.sql', '0007_report_schedules.sql', '0008_roles_usecase_tree_task_fields.sql', '0009_usecase_attributes.sql', '0010_usecase_stages.sql', '0011_usecase_origin.sql', '0012_task_use_cases.sql', '0013_placeholder_accounts.sql'];

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
for (const [k, name] of [['admin', 'Admin'], ['pm', 'PM'], ['real', 'Nguyễn Thị Thu Trang'], ['other', 'Người khác']]) {
  ids[k] = (await q(`insert into auth.users (email, raw_user_meta_data) values ($1, $2::jsonb) returning id`, [`${k}@t.vn`, JSON.stringify({ name })]))[0].id;
}
const as = async who => { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${ids[who]}', false); set role authenticated;`); };
const root = async () => { await db.exec(`reset role; select set_config('request.jwt.claim.sub','',false);`); };

await root();
await q(`update profiles set is_admin = true where id = $1`, [ids.admin]);
// Tài khoản chưa đăng ký có TÊN KHÁC tài khoản thật (không tự ghép được)
const PH = (await q(`insert into profiles (id, name, is_placeholder) values (gen_random_uuid(), 'TrangNTT102', true) returning id`))[0].id;
const PH2 = (await q(`insert into profiles (id, name, is_placeholder) values (gen_random_uuid(), 'Người ảo khác', true) returning id`))[0].id;
const P1 = (await q(`insert into projects (code,name,start_date,target_end_date,manager_id) values ('P1','P1',current_date,current_date+9,$1) returning id`, [ids.pm]))[0].id;
const P2 = (await q(`insert into projects (code,name,start_date,target_end_date,manager_id) values ('P2','P2',current_date,current_date+9,$1) returning id`, [ids.pm]))[0].id;
await q(`insert into project_members (project_id,user_id,role) values ($1,$2,'dev'), ($3,$2,'tester'), ($1,$4,'ba')`, [P1, PH, P2, ids.real]);
await q(`insert into project_members (project_id,user_id,role) values ($1,$2,'viewer')`, [P2, ids.real]);
const P3 = (await q(`insert into projects (code,name,start_date,target_end_date,manager_id) values ('P3','P3',current_date,current_date+9,$1) returning id`, [ids.pm]))[0].id;
await q(`insert into project_members (project_id,user_id,role) values ($1,$2,'dev')`, [P3, PH]);
const mkTask = async (pid, code, assignee) => (await q(`insert into tasks (project_id,code,title,start_date,due_date,assignee_id) values ($1,$2,$2,current_date,current_date+3,$3) returning id`, [pid, code, assignee]))[0].id;
const T1 = await mkTask(P1, 'T1', PH), T2 = await mkTask(P1, 'T2', PH), T3 = await mkTask(P2, 'T3', PH), T4 = await mkTask(P2, 'T4', ids.other);
await q(`insert into task_collaborators (task_id,user_id) values ($1,$2), ($3,$2)`, [T4, PH, T1]);
await q(`insert into task_collaborators (task_id,user_id) values ($1,$2)`, [T1, ids.real]); // trùng với bản của tài khoản chưa đăng ký ở T1
await db.exec(fs.readFileSync(new URL('0029_manual_account_merge.sql', MIG), 'utf8'));

ok('tên khác nhau: không có yêu cầu hợp nhất tự động', (await q(`select count(*)::int c from account_merge_requests`))[0].c === 0);

// ---------- Phân quyền ----------
for (const who of ['pm', 'real', 'other']) {
  await as(who);
  await throws(`${who} không xem trước được`, () => q(`select admin_merge_preview($1)`, [PH]), '42501');
  await throws(`${who} không ghép được`, () => q(`select admin_merge_accounts($1,$2)`, [PH, ids.real]), '42501');
}

// ---------- Xem trước ----------
await as('admin');
const pv = (await q(`select admin_merge_preview($1) p`, [PH]))[0].p;
ok('xem trước đếm đúng: 3 dự án, 3 nhiệm vụ đã giao, 2 nhiệm vụ phối hợp', pv.projects === 3 && pv.tasksAssigned === 3 && pv.tasksCollaborating === 2 && pv.projectsManaged === 0, JSON.stringify(pv));

// ---------- Kiểm tra đầu vào ----------
await throws('hai tài khoản giống nhau bị từ chối', () => q(`select admin_merge_accounts($1,$1)`, [PH]), '22023');
await throws('nguồn là tài khoản thật bị từ chối', () => q(`select admin_merge_accounts($1,$2)`, [ids.other, ids.real]), 'chưa đăng ký');
await throws('đích là tài khoản chưa đăng ký bị từ chối', () => q(`select admin_merge_accounts($1,$2)`, [PH, PH2]), 'đã đăng ký');
await throws('tài khoản không tồn tại bị từ chối', () => q(`select admin_merge_accounts($1,$2)`, [PH, '00000000-0000-4000-8000-000000000001']), 'đã đăng ký');

// ---------- Ghép ----------
const res = (await q(`select admin_merge_accounts($1,$2) r`, [PH, ids.real]))[0].r;
ok('ghép thành công, trả về số liệu và tên tài khoản thật', res.tasksAssigned === 3 && res.projects === 3 && res.userName === 'Nguyễn Thị Thu Trang', JSON.stringify(res));
await root();
const assg = await q(`select code, assignee_id from tasks where code in ('T1','T2','T3','T4') order by code`);
ok('mọi nhiệm vụ đã giao cho tài khoản chưa đăng ký chuyển sang tài khoản thật (không phải phân công lại)', assg.filter(a => ['T1', 'T2', 'T3'].includes(a.code)).every(a => a.assignee_id === ids.real));
ok('nhiệm vụ của người khác không bị đụng', assg.find(a => a.code === 'T4').assignee_id === ids.other);
const mem = await q(`select project_id, role from project_members where user_id = $1 order by project_id`, [ids.real]);
ok('thành viên dự án: được thêm vào dự án chưa có (giữ vai trò cũ), giữ nguyên vai trò đang có ở dự án đã có', mem.length === 3 && mem.find(m => m.project_id === P1).role === 'ba' && mem.find(m => m.project_id === P2).role === 'viewer' && mem.find(m => m.project_id === P3).role === 'dev', JSON.stringify(mem));
const col = await q(`select task_id from task_collaborators where user_id = $1 order by task_id`, [ids.real]);
ok('người phối hợp được chuyển, bỏ trùng', col.length === 2 && new Set(col.map(c => c.task_id)).size === 2 && col.some(c => c.task_id === T4) && col.some(c => c.task_id === T1));
ok('tài khoản chưa đăng ký bị xóa', (await q(`select count(*)::int c from profiles where id = $1`, [PH]))[0].c === 0);
ok('không còn yêu cầu hợp nhất nào của tài khoản đã ghép (bản ghi bị xóa cùng tài khoản chưa đăng ký)', (await q(`select count(*)::int c from account_merge_requests where user_id = $1`, [ids.real]))[0].c === 0);
ok('người dùng thật nhận thông báo đã hợp nhất', (await q(`select count(*)::int c from notifications where user_id = $1 and title = 'Tài khoản đã được hợp nhất'`, [ids.real]))[0].c === 1);
ok('tài khoản chưa đăng ký khác không bị ảnh hưởng', (await q(`select count(*)::int c from profiles where id = $1`, [PH2]))[0].c === 1);
await as('admin');
await throws('ghép lại tài khoản đã xóa bị từ chối', () => q(`select admin_merge_accounts($1,$2)`, [PH, ids.real]), 'chưa đăng ký');

// ---------- Dùng lại yêu cầu tự động đang chờ ----------
await root();
const PH3 = (await q(`insert into profiles (id, name, is_placeholder) values (gen_random_uuid(), 'Tên Trùng Sẽ Đăng Ký', true) returning id`))[0].id;
await q(`update profiles set name = 'Tên Trùng Sẽ Đăng Ký' where id = $1`, [ids.other]); // kích hoạt yêu cầu tự động
ok('trùng tên vẫn tạo yêu cầu chờ duyệt như cũ', (await q(`select count(*)::int c from account_merge_requests where placeholder_id = $1 and status = 'pending'`, [PH3]))[0].c === 1);
await as('admin');
await q(`select admin_merge_accounts($1,$2)`, [PH3, ids.other]);
await root();
ok('ghép thủ công dùng lại yêu cầu đang chờ rồi xử lý xong: không còn yêu cầu nào treo', (await q(`select count(*)::int c from account_merge_requests where status = 'pending'`))[0].c === 0 && (await q(`select count(*)::int c from profiles where id = $1`, [PH3]))[0].c === 0);

// ---------- Hoàn tác ----------
await db.exec(fs.readFileSync(new URL('../rollback/0029_rollback.sql', import.meta.url), 'utf8'));
ok('rollback 0029: hai hàm biến mất, dữ liệu đã ghép còn nguyên', (await q(`select count(*)::int c from pg_proc where proname in ('admin_merge_accounts','admin_merge_preview')`))[0].c === 0
  && (await q(`select count(*)::int c from tasks where assignee_id = $1`, [ids.real]))[0].c === 3);

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
