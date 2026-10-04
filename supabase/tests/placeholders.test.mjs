// Kiểm tra migration 0013: gợi ý tài khoản, tài khoản ảo, hợp nhất khi đăng ký, admin chọn người thực hiện.
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
const addUser = async (key, name) => {
  ids[key] = (await q(`insert into auth.users (email, raw_user_meta_data) values ($1, $2::jsonb) returning id`, [`${key}@t.vn`, JSON.stringify({ name })]))[0].id;
};
await addUser('admin', 'Admin User');
await addUser('pm', 'PM User');
await addUser('dev', 'Dev User');
await addUser('tester', 'Tester User');
await addUser('stranger', 'Stranger');
await addUser('outsider', 'Outsider Person');

const as = async who => {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${who ? ids[who] : ''}', false);`);
  await db.exec(`set role ${who ? 'authenticated' : 'anon'};`);
};
const root = async () => { await db.exec(`reset role; select set_config('request.jwt.claim.sub','',false);`); };

// ---------- Dữ liệu ----------
await root();
const P = (await q(`insert into projects (code,name,start_date,target_end_date,manager_id,progress_model) values ('P','P',current_date,current_date+30,$1,'stages') returning id`, [ids.pm]))[0].id;
const P2 = (await q(`insert into projects (code,name,start_date,target_end_date,manager_id) values ('P2','P2',current_date,current_date+30,$1) returning id`, [ids.pm]))[0].id;
await q(`insert into project_members (project_id,user_id,role) values ($1,$2,'dev'), ($1,$3,'tester')`, [P, ids.dev, ids.tester]);
const P3 = (await q(`insert into projects (code,name,start_date,target_end_date,manager_id) values ('P3','P3',current_date,current_date+30,$1) returning id`, [ids.pm]))[0].id;
const UC = (await q(`insert into use_cases (project_id, code, title) values ($1,'UC-001','Một use case') returning id`, [P]))[0].id;
const QI = (await q(`select id from quality_items where project_id=$1 and phase_key='phase_1' and sort=1`, [P]))[0].id;

// ---------- Tài khoản ảo ----------
await as('admin');
const ph = (await q(`select create_placeholder_member($1, 'Nguyễn Văn Ảo', 'dev') id`, [P]))[0].id;
ok('admin tạo được tài khoản ảo và thêm vào dự án', !!ph && (await q(`select count(*)::int c from project_members where project_id=$1 and user_id=$2 and role='dev'`, [P, ph]))[0].c === 1);
ok('tài khoản ảo không có email và được đánh dấu', (await q(`select is_placeholder p, email e from profiles where id=$1`, [ph]))[0].p === true);
await throws('tên trùng tài khoản đã đăng ký bị từ chối', () => q(`select create_placeholder_member($1,'PM User','dev')`, [P]), '23505');
await throws('trùng cả khi khác hoa/thường và khoảng trắng', () => q(`select create_placeholder_member($1,'  pm   USER ','dev')`, [P]), '23505');
await throws('tên quá ngắn bị từ chối', () => q(`select create_placeholder_member($1,'A','dev')`, [P]), '22023');
await throws('vai trò sai bị từ chối', () => q(`select create_placeholder_member($1,'Ai Đó','boss')`, [P]), '22023');
const again = (await q(`select create_placeholder_member($1, 'nguyễn  văn ảo', 'viewer') id`, [P2]))[0].id;
ok('cùng tên thì dùng lại tài khoản ảo cũ (không tạo bản sao)', again === ph && (await q(`select count(*)::int c from profiles where is_placeholder`))[0].c === 1);
await as('pm');
await throws('PM không tạo được tài khoản ảo (chỉ admin)', () => q(`select create_placeholder_member($1,'Ai Đó Khác','dev')`, [P]), '42501');
await as('dev');
ok('thành viên thấy tài khoản ảo cùng dự án', (await q(`select count(*)::int c from profiles where id=$1`, [ph]))[0].c === 1);
await as('stranger');
ok('người ngoài dự án không thấy tài khoản ảo', (await q(`select count(*)::int c from profiles where id=$1`, [ph]))[0].c === 0);
await root();
await throws('chỉ một tài khoản ảo cho mỗi tên (ràng buộc DB)', () => q(`insert into profiles (id,name,is_placeholder) values (gen_random_uuid(),'NGUYỄN VĂN ẢO',true)`), 'duplicate');

// ---------- Gợi ý + thêm theo id ----------
await as('pm');
const sug = await q(`select * from suggest_accounts($1, '')`, [P]);
ok('gợi ý chỉ gồm tài khoản chưa thuộc dự án (có tài khoản ảo)', sug.every(s => ![ids.dev, ids.tester, ids.pm, ph].includes(s.id)) && sug.some(s => s.id === ids.stranger));
ok('gợi ý theo tên (không phân biệt hoa/thường)', (await q(`select * from suggest_accounts($1, 'STRAN')`, [P])).map(r => r.id).join() === ids.stranger);
ok('gợi ý theo email', (await q(`select * from suggest_accounts($1, 'stranger@t')`, [P])).length === 1);
ok('ký tự đặc biệt không làm hỏng tìm kiếm', (await q(`select * from suggest_accounts($1, '%_')`, [P])).length === 0);
const phSug = await q(`select * from suggest_accounts($1, 'ảo')`, [P3]);
ok('tài khoản ảo (chưa ở dự án này) xuất hiện trong gợi ý và được đánh dấu', phSug.length === 1 && phSug[0].is_placeholder === true && phSug[0].email === null);
await as('dev');
await throws('thành viên thường không xem được gợi ý', () => q(`select * from suggest_accounts($1,'')`, [P]), '42501');
await as('pm');
await q(`select add_project_member_by_id($1,$2,'ba')`, [P, ids.stranger]);
ok('PM thêm thành viên theo id', (await q(`select role from project_members where project_id=$1 and user_id=$2`, [P, ids.stranger]))[0].role === 'ba');
await throws('vai trò sai khi thêm theo id', () => q(`select add_project_member_by_id($1,$2,'developer')`, [P, ids.stranger]), '22023');
await throws('id không tồn tại', () => q(`select add_project_member_by_id($1,gen_random_uuid(),'dev')`, [P]), 'P0002');
await as('dev');
await throws('thành viên thường không thêm được theo id', () => q(`select add_project_member_by_id($1,$2,'dev')`, [P, ids.stranger]), '42501');

// ---------- Admin chọn người thực hiện: bước use case ----------
await as('pm');
await throws('PM không chọn được người thực hiện khác', () => q(`select set_use_case_stages($1::uuid[],'analysis',true,$2)`, [[UC], ids.dev]), '42501');
ok('PM tick bình thường (người thực hiện là chính mình)', (await q(`select set_use_case_stages($1::uuid[],'analysis',true) n`, [[UC]]))[0].n === 1);
await as('admin');
ok('admin tick và ghi nhận tài khoản ảo là người thực hiện', (await q(`select set_use_case_stages($1::uuid[],'coding',true,$2) n`, [[UC], ph]))[0].n === 1);
await root();
const byStage = Object.fromEntries((await q(`select stage, done_by from use_case_stages where use_case_id=$1`, [UC])).map(r => [r.stage, r.done_by]));
ok('người tick bước được ghi đúng', byStage.analysis === ids.pm && byStage.coding === ph, JSON.stringify(byStage));
await as('admin');
await throws('người thực hiện phải là thành viên dự án', () => q(`select set_use_case_stages($1::uuid[],'design',true,$2)`, [[UC], ids.outsider]), '22023');
await as('admin');
ok('admin để trống người thực hiện thì ghi chính admin', (await q(`select set_use_case_stages($1::uuid[],'design',true) n`, [[UC]]))[0].n === 1);
await root();
ok('done_by = admin khi không chọn', (await q(`select done_by from use_case_stages where use_case_id=$1 and stage='design'`, [UC]))[0].done_by === ids.admin);

// ---------- Admin chọn người thực hiện: duyệt chất lượng ----------
await as('admin');
await q(`select set_quality_item($1, true, 'ok', $2)`, [QI, ids.dev]);
await root();
const qi = (await q(`select checked_by, checked_at, notes, is_passed from quality_items where id=$1`, [QI]))[0];
ok('duyệt chất lượng ghi nhận người được admin chọn kèm vai trò', qi.is_passed && qi.checked_by === 'Dev User (DEV)' && qi.notes === 'ok', JSON.stringify(qi));
await as('admin');
await q(`select set_quality_item($1, false)`, [QI]);
await q(`select set_quality_item($1, true)`, [QI]);
await root();
ok('admin không chọn người thì ghi chính admin', (await q(`select checked_by from quality_items where id=$1`, [QI]))[0].checked_by === 'Admin User (ADMIN)');
await as('pm');
await throws('PM không chọn được người duyệt khác', () => q(`select set_quality_item($1, false, null, $2)`, [QI, ids.dev]), '42501');
await q(`select set_quality_item($1, false)`, [QI]);
await q(`select set_quality_item($1, true)`, [QI]);
await root();
ok('PM duyệt bình thường ghi chính PM', (await q(`select checked_by from quality_items where id=$1`, [QI]))[0].checked_by === 'PM User (PM)');
await as('dev');
await throws('DEV không có quyền duyệt chất lượng', () => q(`select set_quality_item($1, false)`, [QI]), '42501');
await as('tester');
await q(`update quality_items set is_passed=false where id=$1`, [QI]);
await q(`update quality_items set is_passed=true where id=$1`, [QI]);
await root();
ok('đường cập nhật trực tiếp cũ vẫn ghi đúng người duyệt', (await q(`select checked_by from quality_items where id=$1`, [QI]))[0].checked_by === 'Tester User (TESTER)');

// ---------- Hợp nhất khi đăng ký trùng tên ----------
await root();
const tk = (await q(`insert into tasks (project_id,code,title,start_date,due_date,assignee_id) values ($1,'T1','việc',current_date,current_date+1,$2) returning id`, [P, ph]))[0].id;
await q(`insert into task_collaborators (task_id,user_id) values ($1,$2)`, [tk, ph]);
await addUser('newbie', 'nguyễn văn ảo');
const req = (await q(`select id, status from account_merge_requests where placeholder_id=$1 and user_id=$2`, [ph, ids.newbie]));
ok('đăng ký trùng tên tạo yêu cầu hợp nhất đang chờ', req.length === 1 && req[0].status === 'pending');
ok('chưa duyệt thì dữ liệu chưa đổi', (await q(`select count(*)::int c from profiles where id=$1 and is_placeholder`, [ph]))[0].c === 1 && (await q(`select assignee_id a from tasks where id=$1`, [tk]))[0].a === ph);
ok('admin nhận thông báo hợp nhất', (await q(`select count(*)::int c from notifications where user_id=$1 and title='Yêu cầu hợp nhất tài khoản'`, [ids.admin]))[0].c === 1);
ok('người không phải admin không nhận thông báo này', (await q(`select count(*)::int c from notifications where user_id<>$1 and title='Yêu cầu hợp nhất tài khoản'`, [ids.admin]))[0].c === 0);
await addUser('plain', 'Một Người Hoàn Toàn Khác');
ok('đăng ký tên khác không tạo yêu cầu', (await q(`select count(*)::int c from account_merge_requests where user_id=$1`, [ids.plain]))[0].c === 0);
await as('pm');
ok('PM không thấy yêu cầu hợp nhất', (await q(`select count(*)::int c from account_merge_requests`))[0].c === 0);
await throws('PM không duyệt được', () => q(`select approve_account_merge($1)`, [req[0].id]), '42501');
await root();
// tài khoản thật đã ở dự án P2 với vai trò khác: phải giữ vai trò của họ
await q(`insert into project_members (project_id,user_id,role) values ($1,$2,'tester')`, [P2, ids.newbie]);
await as('admin');
await q(`select approve_account_merge($1)`, [req[0].id]);
await root();
ok('sau duyệt: tài khoản ảo bị xóa', (await q(`select count(*)::int c from profiles where id=$1`, [ph]))[0].c === 0);
ok('thành viên dự án P chuyển sang tài khoản thật với vai trò dev', (await q(`select role from project_members where project_id=$1 and user_id=$2`, [P, ids.newbie]))[0]?.role === 'dev');
ok('dự án P2: giữ vai trò sẵn có của tài khoản thật (không bị ghi đè)', (await q(`select role from project_members where project_id=$1 and user_id=$2`, [P2, ids.newbie]))[0].role === 'tester');
ok('người phụ trách + người phối hợp chuyển sang tài khoản thật', (await q(`select assignee_id a from tasks where id=$1`, [tk]))[0].a === ids.newbie && (await q(`select count(*)::int c from task_collaborators where task_id=$1 and user_id=$2`, [tk, ids.newbie]))[0].c === 1);
ok('người tick bước (done_by) chuyển sang tài khoản thật', (await q(`select done_by from use_case_stages where use_case_id=$1 and stage='coding'`, [UC]))[0].done_by === ids.newbie);
ok('yêu cầu được đánh dấu đã duyệt', (await q(`select status from account_merge_requests where id=$1`, [req[0].id]))[0]?.status === 'approved' || (await q(`select count(*)::int c from account_merge_requests where id=$1`, [req[0].id]))[0].c === 0);
ok('tài khoản thật nhận thông báo đã hợp nhất', (await q(`select count(*)::int c from notifications where user_id=$1 and title='Tài khoản đã được hợp nhất'`, [ids.newbie]))[0].c === 1);
await throws('không duyệt lại được yêu cầu đã xử lý', async () => { await as('admin'); await q(`select approve_account_merge($1)`, [req[0].id]); }, 'P0002');

// ---------- Từ chối ----------
await root();
await as('admin');
const ph2 = (await q(`select create_placeholder_member($1,'Trần Thị B','dev') id`, [P]))[0].id;
await root();
await addUser('tranb', 'trần thị b');
const req2 = (await q(`select id from account_merge_requests where placeholder_id=$1`, [ph2]))[0].id;
await as('admin');
await q(`select reject_account_merge($1)`, [req2]);
await root();
ok('từ chối: giữ nguyên cả hai tài khoản', (await q(`select count(*)::int c from profiles where id in ($1,$2)`, [ph2, ids.tranb]))[0].c === 2 && (await q(`select status from account_merge_requests where id=$1`, [req2]))[0].status === 'rejected');

// ---------- Đổi tên cũng kích hoạt ----------
await as('admin');
const ph3 = (await q(`select create_placeholder_member($1,'Lê Văn C','dev') id`, [P]))[0].id;
await root();
await as('dev');
await q(`update profiles set name='lê văn c' where id=auth.uid()`);
await root();
ok('tài khoản thật đổi tên trùng tài khoản ảo thì cũng tạo yêu cầu', (await q(`select count(*)::int c from account_merge_requests where placeholder_id=$1 and user_id=$2 and status='pending'`, [ph3, ids.dev]))[0].c === 1);
await as('admin');
await throws('admin đổi tên tài khoản ảo trùng tài khoản đã đăng ký bị chặn', () => q(`update profiles set name='Tester User' where id=$1`, [ph3]), '23505');

// ---------- Xóa tài khoản ảo ----------
const ph4 = (await q(`select create_placeholder_member($1,'Phạm D','viewer') id`, [P]))[0].id;
await as('pm');
await throws('PM không xóa được tài khoản ảo', () => q(`select delete_placeholder($1)`, [ph4]), '42501');
await as('admin');
await q(`select delete_placeholder($1)`, [ph4]);
await throws('không xóa tài khoản thật bằng hàm này', () => q(`select delete_placeholder($1)`, [ids.stranger]), 'P0002');

// ---------- Xóa tài khoản đăng nhập thì xóa profile (thay cho cascade cũ) ----------
await root();
await q(`delete from auth.users where id=$1`, [ids.plain]);
ok('xóa tài khoản đăng nhập thì profile cũng mất', (await q(`select count(*)::int c from profiles where id=$1`, [ids.plain]))[0].c === 0);

// ---------- Rollback 0013 ----------
await root();
const phLeft = (await q(`select count(*)::int c from profiles where is_placeholder`))[0].c;
await db.exec(fs.readFileSync(new URL('../rollback/0013_rollback.sql', import.meta.url), 'utf8'));
ok('rollback 0013: trước khi gỡ vẫn còn tài khoản ảo (bài test có ý nghĩa)', phLeft >= 1);
ok('rollback 0013: không còn cột is_placeholder', (await q(`select count(*)::int c from information_schema.columns where table_name='profiles' and column_name='is_placeholder'`))[0].c === 0);
ok('rollback 0013: gắn lại ràng buộc profiles -> auth.users', (await q(`select count(*)::int c from pg_constraint where conrelid='public.profiles'::regclass and contype='f' and confrelid='auth.users'::regclass`))[0].c === 1);
ok('rollback 0013: set_use_case_stages quay về một bản (không nhập nhằng)', (await q(`select count(*)::int c from pg_proc where proname='set_use_case_stages'`))[0].c === 1);
await as('admin');
const tick = await q(`select set_use_case_stages($1::uuid[],'testing',true) n`, [[UC]]);
await root();
ok('rollback 0013: tick bước vẫn chạy', tick[0].n === 1);
await q(`delete from auth.users where id=$1`, [ids.stranger]);
ok('rollback 0013: xóa tài khoản đăng nhập vẫn xóa profile (cascade)', (await q(`select count(*)::int c from profiles where id=$1`, [ids.stranger]))[0].c === 0);

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
