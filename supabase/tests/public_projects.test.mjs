// Kiểm tra migration 0027: dự án Công khai / Riêng tư và hàm duy nhất dành cho người chưa đăng nhập (get_public_project).
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';

const MIG = new URL('../migrations/', import.meta.url);
const FILES = ['0001_schema.sql', '0002_quality_template.sql', '0003_rpc_and_seed.sql', '0004_criteria_insert_guard.sql', '0005_deadlines_and_snapshots.sql', '0007_report_schedules.sql', '0008_roles_usecase_tree_task_fields.sql', '0009_usecase_attributes.sql', '0010_usecase_stages.sql', '0011_usecase_origin.sql', '0012_task_use_cases.sql', '0013_placeholder_accounts.sql', '0014_telegram_notify.sql', '0015_telegram_timeout.sql', '0016_reminder_feedback.sql', '0017_daily_digest.sql', '0018_fix_null_permission_checks.sql', '0020_stage_order.sql', '0021_permission_config.sql', '0022_quality_items_edit.sql', '0023_issues.sql', '0025_issue_priorities.sql', '0026_telegram_links.sql'];

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
  create schema net; create schema vault;
  create function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000) returns bigint language sql as $$ select 1::bigint $$;
  create table vault.decrypted_secrets (name text, decrypted_secret text);
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
for (const k of ['admin', 'pm', 'dev', 'viewer', 'outsider', 'other']) {
  ids[k] = (await q(`insert into auth.users (email, raw_user_meta_data) values ($1, $2::jsonb) returning id`, [`${k}@secret.vn`, JSON.stringify({ name: k })]))[0].id;
}
const as = async who => { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${who ? ids[who] : ''}', false); set role ${who ? 'authenticated' : 'anon'};`); };
const root = async () => { await db.exec(`reset role; select set_config('request.jwt.claim.sub','',false);`); };

await root();
await q(`update profiles set is_admin = true where id = $1`, [ids.admin]);
const P = (await q(`insert into projects (code,name,start_date,target_end_date,manager_id,budget) values ('PUB-1','Dự án công khai',current_date-10,current_date+30,$1,987654321) returning id`, [ids.pm]))[0].id;
const P2 = (await q(`insert into projects (code,name,start_date,target_end_date,manager_id) values ('OTHER-1','Dự án khác',current_date-10,current_date+30,$1) returning id`, [ids.other]))[0].id;
await q(`insert into project_members (project_id,user_id,role) values ($1,$2,'dev'), ($1,$3,'viewer')`, [P, ids.dev, ids.viewer]);
const T1 = (await q(`insert into tasks (project_id,code,title,start_date,due_date,assignee_id) values ($1,'PUB-T1','Nhiệm vụ 1',current_date-3,current_date+3,$2) returning id`, [P, ids.dev]))[0].id;
await q(`insert into tasks (project_id,code,title,start_date,due_date,assignee_id) values ($1,'OTH-T1','Nhiệm vụ dự án khác',current_date-3,current_date+3,$2)`, [P2, ids.other]);
const UC = (await q(`insert into use_cases (project_id,code,title) values ($1,'UC-1','Use case 1') returning id`, [P]))[0].id;
await q(`insert into acceptance_criteria (use_case_id, title) values ($1,'Tiêu chí 1')`, [UC]).catch(async () => q(`insert into acceptance_criteria (use_case_id, description) values ($1,'Tiêu chí 1')`, [UC]));
const ty = (await q(`select id from issue_types where project_id=$1 limit 1`, [P]))[0].id;
const st = (await q(`select id from issue_statuses where project_id=$1 and is_initial`, [P]))[0].id;
const pr = (await q(`select id from issue_priorities where project_id=$1 and is_default`, [P]))[0].id;
const IS = (await q(`insert into issues (project_id, number, type_id, status_id, priority_id, title, reporter_id) values ($1, 1, $2, $3, $4, 'Lỗi công khai', $5) returning id`, [P, ty, st, pr, ids.viewer]))[0].id;
await q(`insert into issue_journals (issue_id, user_id, notes) values ($1, $2, 'Bình luận công khai')`, [IS, ids.dev]);
await q(`update quality_items set is_passed = true where id = (select id from quality_items where project_id=$1 limit 1)`, [P]).catch(() => undefined);

await db.exec(fs.readFileSync(new URL('0027_public_projects.sql', MIG), 'utf8'));
const pub = async code => (await q(`select get_public_project($1) d`, [code]))[0].d;

// ---------- Mặc định riêng tư ----------
await root();
ok('mọi dự án mặc định Riêng tư', (await q(`select count(*)::int c from projects where visibility <> 'private'`))[0].c === 0);
await as(null);
ok('khách ẩn danh: dự án Riêng tư trả null', (await pub('PUB-1')) === null);
ok('khách ẩn danh: mã không tồn tại trả null (giống dự án riêng tư)', (await pub('KHONG-CO')) === null && (await pub('')) === null && (await pub(null)) === null);
await throws('khách ẩn danh không đọc trực tiếp bảng dự án', () => q(`select * from projects`), 'permission denied');
await throws('khách ẩn danh không đọc trực tiếp bảng nhiệm vụ', () => q(`select * from tasks`), 'permission denied');
await throws('khách ẩn danh không đọc trực tiếp hồ sơ người dùng', () => q(`select * from profiles`), 'permission denied');
await throws('khách ẩn danh không đổi được chế độ truy cập', () => q(`select set_project_visibility($1, 'public')`, [P]), 'permission denied');

// ---------- Ai được đổi chế độ truy cập ----------
for (const who of ['dev', 'viewer', 'outsider']) {
  await as(who);
  await throws(`${who} không đổi được chế độ truy cập`, () => q(`select set_project_visibility($1, 'public')`, [P]), '42501');
}
await as('pm');
await throws('giá trị chế độ truy cập sai bị từ chối', () => q(`select set_project_visibility($1, 'cong-khai')`, [P]), '22023');
await throws('PM dự án khác không đổi được dự án này', async () => { await as('other'); await q(`select set_project_visibility($1, 'public')`, [P]); }, '42501');
await as('pm');
await q(`select set_project_visibility($1, 'public')`, [P]);
await root();
ok('PM đổi sang Công khai được', (await q(`select visibility from projects where id=$1`, [P]))[0].visibility === 'public');

// ---------- Khách ẩn danh xem dự án Công khai ----------
await as(null);
let d = await pub('PUB-1');
ok('khách ẩn danh nhận được dữ liệu dự án Công khai', !!d && d.project.name === 'Dự án công khai' && d.code === 'PUB-1');
ok('không có ngân sách (không lộ thông tin tài chính)', d.project.budget === undefined && d.project.created_by === undefined);
ok('có nhiệm vụ, use case, tiêu chí, issue, nhật ký của dự án', d.tasks.length === 1 && d.use_cases.length === 1 && d.acceptance_criteria.length === 1 && d.issues.length === 1 && d.issue_journals.length === 1 && d.issue_types.length > 0 && d.issue_statuses.length > 0 && d.issue_priorities.length > 0);
ok('có tiêu chuẩn chất lượng của dự án', d.quality_items.length > 0 && d.quality_phase_defs.length > 0);
ok('chỉ dữ liệu của đúng dự án này (không lẫn dự án khác)', d.tasks.every(t => t.project_id === P) && !JSON.stringify(d).includes('OTH-T1') && !JSON.stringify(d).includes('Dự án khác'));
ok('danh sách thành viên đúng vai trò (gồm cả PM tự thêm)', d.members.length === 3 && d.members.some(m => m.user_id === ids.pm && m.role === 'pm') && d.members.some(m => m.user_id === ids.dev && m.role === 'dev'));
ok('hồ sơ người dùng không có email (kể cả khi dùng email thật trong bảng)', d.profiles.length >= 3 && d.profiles.every(p => p.email === '') && !JSON.stringify(d).includes('@secret.vn'));
ok('hồ sơ chỉ gồm người liên quan tới dự án này (không có người chỉ ở dự án khác, không có admin lạ)', !d.profiles.some(p => p.id === ids.other || p.id === ids.admin || p.id === ids.outsider), JSON.stringify(d.profiles.map(p => p.name)));
ok('không có trường tệp đính kèm / thông báo / lịch báo cáo', !('issue_attachments' in d) && !('notifications' in d) && !('report_schedules' in d));
ok('tra theo mã không phân biệt hoa thường', (await pub('pub-1'))?.code === 'PUB-1' && (await pub('  Pub-1 '))?.code === 'PUB-1');
ok('tra theo id dự án', (await pub(P))?.code === 'PUB-1');

// Người đăng nhập nhưng không phải thành viên cũng gọi được (xem như khách)
await as('outsider');
ok('người đăng nhập không thuộc dự án cũng nhận dữ liệu công khai', (await pub('PUB-1'))?.code === 'PUB-1');

// ---------- Mã cũ ----------
await root();
await q(`update projects set code = 'PUB-2' where id=$1`, [P]);
await as(null);
ok('đổi mã dự án: mã cũ vẫn tra ra dự án, trả về mã hiện tại để giao diện chuyển hướng', (await pub('PUB-1'))?.code === 'PUB-2' && (await pub('PUB-2'))?.code === 'PUB-2');

// ---------- Chế độ truy cập của dự án khác không bị ảnh hưởng ----------
ok('dự án khác vẫn Riêng tư', (await pub('OTHER-1')) === null);

// ---------- Chuyển về Riêng tư ----------
await as('admin');
await q(`select set_project_visibility($1, 'private')`, [P]);
await as(null);
ok('chuyển về Riêng tư: khách không còn xem được (cả mã cũ lẫn mã mới)', (await pub('PUB-2')) === null && (await pub('PUB-1')) === null);
await as('outsider');
ok('người đăng nhập không thuộc dự án cũng không xem được khi Riêng tư', (await pub('PUB-2')) === null);

// ---------- Hoàn tác 0027 ----------
await root();
await q(`update projects set visibility='public' where id=$1`, [P]);
await db.exec(fs.readFileSync(new URL('../rollback/0027_rollback.sql', import.meta.url), 'utf8'));
ok('rollback 0027: cột và hàm biến mất', (await q(`select count(*)::int c from information_schema.columns where table_name='projects' and column_name='visibility'`))[0].c === 0
  && (await q(`select count(*)::int c from pg_proc where proname in ('get_public_project','set_project_visibility')`))[0].c === 0);
ok('rollback 0027: dự án và dữ liệu khác còn nguyên', (await q(`select count(*)::int c from projects`))[0].c === 2 && (await q(`select count(*)::int c from tasks`))[0].c === 2);

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
