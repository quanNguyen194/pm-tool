import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';

const MIG = new URL('../migrations/', import.meta.url);
const db = new PGlite();

// --- Giả lập môi trường Supabase ---
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
  alter default privileges in schema public grant all on sequences to anon, authenticated;
`);
for (const f of ['0001_schema.sql', '0002_quality_template.sql', '0003_rpc_and_seed.sql']) {
  await db.exec(fs.readFileSync(new URL(f, MIG), 'utf8'));
  console.log('applied', f);
}

const ids = {};
for (const [k, email] of Object.entries({
  admin: 'admin@t.vn', pm: 'pm@t.vn', dev: 'dev@t.vn', qa: 'qa@t.vn', viewer: 'viewer@t.vn', outsider: 'out@t.vn',
})) {
  const r = await db.query(`insert into auth.users (email, raw_user_meta_data) values ($1, $2::jsonb) returning id`,
    [email, JSON.stringify({ name: k.toUpperCase() })]);
  ids[k] = r.rows[0].id;
}

const as = async (who) => {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${who ? ids[who] : ''}', false);`);
  await db.exec(`set role ${who ? 'authenticated' : 'anon'};`);
};
const root = async () => { await db.exec(`reset role; select set_config('request.jwt.claim.sub','',false);`); };
const q = async (sql, p) => (await db.query(sql, p)).rows;

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log((cond ? 'PASS' : 'FAIL') + '  ' + name + (cond ? '' : '  ' + extra)); };
const throws = async (name, fn, codeOrText) => {
  try { await fn(); ok(name, false, 'không báo lỗi'); }
  catch (e) { ok(name, !codeOrText || (e.message + (e.code || '')).includes(codeOrText), e.message); }
};

// --- Seed ---
await root();
const admins = await q(`select name from profiles where is_admin`);
ok('người đăng ký đầu tiên là admin duy nhất', admins.length === 1 && admins[0].name === 'ADMIN', JSON.stringify(admins));
console.log('seed:', (await q(`select public.seed_demo_data() as r`))[0].r);
console.log('seed lần 2:', (await q(`select public.seed_demo_data() as r`))[0].r);

const proj = Object.fromEntries((await q(`select code, id from projects`)).map(r => [r.code, r.id]));
ok('3 dự án demo', Object.keys(proj).length === 3);
ok('mỗi dự án có 19 mục checklist', (await q(`select count(*)::int c from quality_items where project_id=$1`, [proj['OMNI-BANK']]))[0].c === 19);
const prog = Object.fromEntries((await q(`select code, progress_percent p from projects`)).map(r => [r.code, r.p]));
console.log('progress sau seed:', prog);
ok('tiến độ dự án được tính từ DB', prog['OMNI-BANK'] > 0 && prog['OMNI-BANK'] < 100);
const ucs = await q(`select code, progress_percent p, status from use_cases order by code`);
ok('seed giữ nguyên progress use case', ucs.find(u => u.code === 'UC-OB-02').p === 60, JSON.stringify(ucs));
ok('quality item đã duyệt có người duyệt', (await q(`select count(*)::int c from quality_items where project_id=$1 and is_passed and checked_by like '%ADMIN%'`, [proj['OMNI-BANK']]))[0].c === 10);

// --- Thành viên ---
await as('admin');
await q(`select add_project_member($1,'pm@t.vn','pm')`, [proj['OMNI-BANK']]);
await q(`select add_project_member($1,'dev@t.vn','developer')`, [proj['OMNI-BANK']]);
await q(`select add_project_member($1,'qa@t.vn','qa')`, [proj['OMNI-BANK']]);
await q(`select add_project_member($1,'VIEWER@t.vn','viewer')`, [proj['OMNI-BANK']]);
await q(`select add_project_member($1,'dev@t.vn','viewer')`, [proj['E-SHOP-B2B']]);
await throws('email chưa đăng ký bị từ chối', () => q(`select add_project_member($1,'ghost@t.vn','viewer')`, [proj['OMNI-BANK']]), 'P0002');

// --- Outsider ---
await as('outsider');
ok('outsider không thấy dự án', (await q(`select count(*)::int c from projects`))[0].c === 0);
ok('outsider không thấy task', (await q(`select count(*)::int c from tasks`))[0].c === 0);
ok('outsider chỉ thấy profile của mình', (await q(`select count(*)::int c from profiles`))[0].c === 1);
ok('outsider không thấy checklist', (await q(`select count(*)::int c from quality_items`))[0].c === 0);

// --- Anon ---
await as(null);
await throws('anon bị chặn đọc projects', () => q(`select * from projects`), 'permission denied');

// --- Viewer ---
await as('viewer');
ok('viewer thấy đúng 1 dự án', (await q(`select count(*)::int c from projects`))[0].c === 1);
ok('viewer thấy profile đồng đội', (await q(`select count(*)::int c from profiles`))[0].c >= 5);
await throws('viewer không tạo được task', () => q(`insert into tasks (project_id,code,title,start_date,due_date) values ($1,'X-1','x',current_date,current_date)`, [proj['OMNI-BANK']]), 'row-level security');
ok('viewer không sửa được task', (await q(`update tasks set status='done' where project_id=$1 returning id`, [proj['OMNI-BANK']])).length === 0);
ok('viewer không duyệt được checklist', (await q(`update quality_items set is_passed=true where project_id=$1 returning id`, [proj['OMNI-BANK']])).length === 0);
ok('viewer không xóa được task', (await q(`delete from tasks where project_id=$1 returning id`, [proj['OMNI-BANK']])).length === 0);

// --- Developer ---
await as('dev');
ok('dev thấy 2 dự án (P1 developer, P2 viewer)', (await q(`select count(*)::int c from projects`))[0].c === 2);
const newTask = await q(`insert into tasks (project_id,code,title,start_date,due_date) values ($1,'DEV-1','Task của dev',current_date,current_date+3) returning id`, [proj['OMNI-BANK']]);
ok('dev tạo được task ở dự án mình làm developer', newTask.length === 1);
ok('dev kéo task sang done', (await q(`update tasks set status='done' where id=$1 returning id`, [newTask[0].id])).length === 1);
await throws('dev không tạo task ở dự án mình chỉ là viewer', () => q(`insert into tasks (project_id,code,title,start_date,due_date) values ($1,'DEV-2','x',current_date,current_date)`, [proj['E-SHOP-B2B']]), 'row-level security');
ok('dev xóa task của mình', (await q(`delete from tasks where id=$1 returning id`, [newTask[0].id])).length === 1);
ok('dev không duyệt được checklist', (await q(`update quality_items set is_passed=true where project_id=$1 returning id`, [proj['OMNI-BANK']])).length === 0);
ok('dev không sửa được dự án', (await q(`update projects set name='hack' where id=$1 returning id`, [proj['OMNI-BANK']])).length === 0);
await throws('dev không tạo được dự án', () => q(`insert into projects (code,name,start_date,target_end_date) values ('HACK','h',current_date,current_date)`), 'row-level security');
await throws('dev không tick tiêu chí nghiệm thu', () => q(`update acceptance_criteria set completed = not completed where use_case_id=(select id from use_cases where code='UC-OB-01')`), '42501');
await throws('dev không tự thành admin', () => q(`update profiles set is_admin=true where id=auth.uid()`), '42501');
await throws('dev không đổi email profile', () => q(`update profiles set email='x@x.vn' where id=auth.uid()`), 'permission denied');
await throws('dev không thêm thành viên', () => q(`select add_project_member($1,'out@t.vn','viewer')`, [proj['OMNI-BANK']]), '42501');
await throws('dev không gửi nhắc việc', () => q(`select send_task_reminder((select id from tasks where code='OB-101'))`), '42501');
await throws('dev không gọi seed', () => q(`select seed_demo_data()`), '42501');
await throws('dev không ghi progress_percent project', () => q(`update projects set progress_percent=100 where id=$1`, [proj['OMNI-BANK']]), 'permission denied');
await throws('dev không ghi progress_percent use case', () => q(`update use_cases set progress_percent=100`), 'permission denied');
await throws('dev không tự tạo notification', () => q(`insert into notifications (user_id,type,title,message) values (auth.uid(),'system','a','b')`), 'permission denied');
ok('dev sửa được use case', (await q(`update use_cases set status='in_review' where code='UC-OB-01' returning id`)).length === 1);

// --- QA ---
await as('qa');
const toggled = await q(`update quality_items set is_passed=true, notes='ok' where project_id=$1 and phase_key='phase_4' and sort=1 returning checked_by, checked_at`, [proj['OMNI-BANK']]);
ok('qa duyệt được checklist, server ghi người duyệt', toggled.length === 1 && toggled[0].checked_by === 'QA (QA)' && toggled[0].checked_at, JSON.stringify(toggled));
await throws('qa không tự ghi checked_by', () => q(`update quality_items set checked_by='Sếp' where project_id=$1`, [proj['OMNI-BANK']]), 'permission denied');
ok('qa bỏ duyệt thì xóa checked_by', (await q(`update quality_items set is_passed=false where project_id=$1 and phase_key='phase_4' and sort=1 returning checked_by`, [proj['OMNI-BANK']]))[0].checked_by === null);
const custom = await q(`insert into quality_items (project_id,phase_key,title) values ($1,'phase_5','Mục tùy chỉnh') returning sort`, [proj['OMNI-BANK']]);
ok('qa thêm được mục tùy chỉnh (sort sau mẫu)', custom[0].sort === 1000);
ok('qa không sửa được task', (await q(`update tasks set status='done' where project_id=$1 returning id`, [proj['OMNI-BANK']])).length === 0);

// --- PM ---
await as('pm');
ok('pm sửa được dự án', (await q(`update projects set name='Omni Bank v2' where id=$1 returning id`, [proj['OMNI-BANK']])).length === 1);
await throws('pm không tạo được dự án (chỉ admin)', () => q(`insert into projects (code,name,start_date,target_end_date) values ('PMP','h',current_date,current_date)`), 'row-level security');
await q(`select add_project_member($1,'out@t.vn','viewer')`, [proj['OMNI-BANK']]);
ok('pm thêm thành viên mới', true);
await q(`update acceptance_criteria set completed=true where use_case_id=(select id from use_cases where code='UC-OB-01')`);
const uc1 = (await q(`select progress_percent p, status from use_cases where code='UC-OB-01'`))[0];
ok('tick hết tiêu chí -> use case 100% + completed', uc1.p === 100 && uc1.status === 'completed', JSON.stringify(uc1));
await q(`select send_task_reminder((select id from tasks where code='OB-101'))`);
ok('pm gửi nhắc việc', true);

// --- Admin ---
await as('admin');
ok('admin thấy cả 3 dự án', (await q(`select count(*)::int c from projects`))[0].c === 3);
const np = await q(`insert into projects (code,name,start_date,target_end_date,manager_id) values ('NEW-1','Dự án mới',current_date,current_date+30,(select id from profiles where name='PM')) returning id`);
ok('admin tạo dự án', np.length === 1);
ok('dự án mới được nhân bản 19 mục checklist', (await q(`select count(*)::int c from quality_items where project_id=$1`, [np[0].id]))[0].c === 19);
const members = await q(`select p.name, m.role from project_members m join profiles p on p.id=m.user_id where project_id=$1 order by 1`, [np[0].id]);
ok('PM + admin được gán làm thành viên', members.length === 2 && members.every(m => m.role === 'pm'), JSON.stringify(members));
ok('admin xem được thông báo nhắc việc', (await q(`select count(*)::int c from notifications where type='deadline_warning'`))[0].c === 1);
ok('admin cấp quyền admin cho người khác', (await q(`update profiles set is_admin=true where name='PM' returning id`)).length === 1);
await q(`update profiles set is_admin=false where name='PM'`);
const dels = await q(`delete from projects where id=$1 returning id`, [np[0].id]);
ok('admin xóa dự án (cascade)', dels.length === 1 && (await q(`select count(*)::int c from quality_items where project_id=$1`, [np[0].id]))[0].c === 0);

// --- Tiến độ tự cập nhật ---
await root();
const before = (await q(`select progress_percent p from projects where code='OMNI-BANK'`))[0].p;
await q(`update tasks set status='done' where project_id=$1`, [proj['OMNI-BANK']]);
const after = (await q(`select progress_percent p from projects where code='OMNI-BANK'`))[0].p;
ok('tiến độ dự án tăng khi task xong', after > before, `${before} -> ${after}`);

// --- Thông báo ---
await as('dev');
ok('dev không thấy thông báo của người khác', (await q(`select count(*)::int c from notifications`))[0].c === 0);
await as('admin');
const n = await q(`update notifications set is_read=true where user_id=auth.uid() returning id`);
ok('người nhận đánh dấu đã đọc', n.length >= 1);

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
