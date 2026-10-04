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
for (const f of ['0001_schema.sql', '0002_quality_template.sql', '0003_rpc_and_seed.sql', '0004_criteria_insert_guard.sql', '0005_deadlines_and_snapshots.sql', '0007_report_schedules.sql', '0008_roles_usecase_tree_task_fields.sql']) {
  await db.exec(fs.readFileSync(new URL(f, MIG), 'utf8'));
  console.log('applied', f);
}

const ids = {};
for (const [k, email] of Object.entries({
  admin: 'admin@t.vn', pm: 'pm@t.vn', dev: 'dev@t.vn', qa: 'qa@t.vn', viewer: 'viewer@t.vn', ba: 'ba@t.vn', outsider: 'out@t.vn',
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

const snapN = (await q(`select count(*)::int c from progress_snapshots`))[0].c;
ok('seed tạo ảnh chụp tiến độ hôm nay cho 3 dự án', snapN === 3, String(snapN));
await q(`select backfill_demo_progress()`);
const snapN2 = (await q(`select count(*)::int c from progress_snapshots`))[0].c;
ok('backfill dựng lịch sử minh họa', snapN2 > 100, String(snapN2));
await q(`select backfill_demo_progress()`);
ok('backfill chạy lại không nhân đôi', (await q(`select count(*)::int c from progress_snapshots`))[0].c === snapN2);
const lastSnap = (await q(`select s.progress_percent p, pr.progress_percent cur from progress_snapshots s join projects pr on pr.id=s.project_id where pr.code='OMNI-BANK' order by snap_date desc limit 1`))[0];
ok('điểm hôm nay khớp tiến độ hiện tại', lastSnap.p === lastSnap.cur, JSON.stringify(lastSnap));

// --- Thành viên ---
await as('admin');
await q(`select add_project_member($1,'pm@t.vn','pm')`, [proj['OMNI-BANK']]);
await q(`select add_project_member($1,'dev@t.vn','dev')`, [proj['OMNI-BANK']]);
await q(`select add_project_member($1,'qa@t.vn','tester')`, [proj['OMNI-BANK']]);
await q(`select add_project_member($1,'VIEWER@t.vn','viewer')`, [proj['OMNI-BANK']]);
await q(`select add_project_member($1,'dev@t.vn','viewer')`, [proj['E-SHOP-B2B']]);
await throws('email chưa đăng ký bị từ chối', () => q(`select add_project_member($1,'ghost@t.vn','viewer')`, [proj['OMNI-BANK']]), 'P0002');

// --- Outsider ---
await as('outsider');
ok('outsider không thấy dự án', (await q(`select count(*)::int c from projects`))[0].c === 0);
ok('outsider không thấy task', (await q(`select count(*)::int c from tasks`))[0].c === 0);
ok('outsider chỉ thấy profile của mình', (await q(`select count(*)::int c from profiles`))[0].c === 1);
ok('outsider không thấy lịch sử tiến độ', (await q(`select count(*)::int c from progress_snapshots`))[0].c === 0);
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

ok('viewer chỉ thấy lịch sử tiến độ của dự án mình', (await q(`select count(distinct project_id)::int c from progress_snapshots`))[0].c === 1);
await throws('viewer không ghi được lịch sử tiến độ', () => q(`insert into progress_snapshots (project_id,snap_date,progress_percent) values ($1,current_date+5,50)`, [proj['OMNI-BANK']]), 'permission denied');

// --- Developer ---
await as('dev');
ok('dev thấy 2 dự án (P1 dev, P2 viewer)', (await q(`select count(*)::int c from projects`))[0].c === 2);
const newTask = await q(`insert into tasks (project_id,code,title,start_date,due_date) values ($1,'DEV-1','Task của dev',current_date,current_date+3) returning id`, [proj['OMNI-BANK']]);
ok('dev tạo được task ở dự án mình làm dev', newTask.length === 1);
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
await throws('dev không chạy quét deadline', () => q(`select scan_deadlines()`), '42501');
await throws('dev không dựng dữ liệu minh họa', () => q(`select backfill_demo_progress()`), '42501');
await throws('dev không gọi seed', () => q(`select seed_demo_data()`), '42501');
await throws('dev không ghi progress_percent project', () => q(`update projects set progress_percent=100 where id=$1`, [proj['OMNI-BANK']]), 'permission denied');
await throws('dev không ghi progress_percent use case', () => q(`update use_cases set progress_percent=100`), 'permission denied');
await throws('dev không tự tạo notification', () => q(`insert into notifications (user_id,type,title,message) values (auth.uid(),'system','a','b')`), 'permission denied');
ok('dev sửa được use case', (await q(`update use_cases set status='in_review' where code='UC-OB-01' returning id`)).length === 1);

const ins = await q(`insert into acceptance_criteria (use_case_id, description, completed) values ((select id from use_cases where code='UC-OB-01'),'x',true) returning completed`);
ok('dev không chèn sẵn tiêu chí đã hoàn thành', ins[0].completed === false, JSON.stringify(ins));

// --- QA ---
await as('qa');
const toggled = await q(`update quality_items set is_passed=true, notes='ok' where project_id=$1 and phase_key='phase_4' and sort=1 returning checked_by, checked_at`, [proj['OMNI-BANK']]);
ok('qa duyệt được checklist, server ghi người duyệt', toggled.length === 1 && toggled[0].checked_by === 'QA (TESTER)' && toggled[0].checked_at, JSON.stringify(toggled));
await throws('qa không tự ghi checked_by', () => q(`update quality_items set checked_by='Sếp' where project_id=$1`, [proj['OMNI-BANK']]), 'permission denied');
ok('qa bỏ duyệt thì xóa checked_by', (await q(`update quality_items set is_passed=false where project_id=$1 and phase_key='phase_4' and sort=1 returning checked_by`, [proj['OMNI-BANK']]))[0].checked_by === null);
const custom = await q(`insert into quality_items (project_id,phase_key,title) values ($1,'phase_5','Mục tùy chỉnh') returning sort`, [proj['OMNI-BANK']]);
ok('qa thêm được mục tùy chỉnh (sort sau mẫu)', custom[0].sort === 1000);
ok('tester sửa được task (ghi chú), không xóa trạng thái của người khác', (await q(`update tasks set notes='qa' where project_id=$1 returning id`, [proj['OMNI-BANK']])).length === 5);

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

// --- Báo cáo định kỳ ---
const rid = (await q(`select generate_report_now($1,'weekly') id`, [proj['OMNI-BANK']]))[0].id;
const rep = (await q(`select summary, period_end - period_start d from report_runs where id=$1`, [rid]))[0];
ok('pm tạo báo cáo tuần ngay (kỳ 7 ngày)', rep.d === 6, String(rep.d));
ok('báo cáo có số liệu dự án/nhiệm vụ/tiến độ', rep.summary.project.code === 'OMNI-BANK' && rep.summary.tasks.total === 5 && rep.summary.progress.end > 0, JSON.stringify(rep.summary).slice(0, 160));
ok('báo cáo liệt kê việc quá hạn cần chú ý (OB-103)', rep.summary.attention.some(a => a.code === 'OB-103'));
await q(`select generate_report_now($1,'weekly')`, [proj['OMNI-BANK']]);
ok('tạo lại cùng kỳ thì ghi đè, không nhân đôi', (await q(`select count(*)::int c from report_runs where project_id=$1`, [proj['OMNI-BANK']]))[0].c === 1);
await throws('loại báo cáo sai bị từ chối', () => q(`select generate_report_now($1,'daily')`, [proj['OMNI-BANK']]), '22023');
await q(`insert into report_schedules (project_id, frequency) values ($1,'weekly'), ($1,'monthly')`, [proj['OMNI-BANK']]);
ok('pm bật lịch báo cáo tuần/tháng', (await q(`select count(*)::int c from report_schedules`))[0].c === 2);
ok('pm tắt được lịch', (await q(`update report_schedules set enabled=false where frequency='monthly' returning id`)).length === 1);
await q(`update report_schedules set enabled=true where frequency='monthly'`);
await throws('pm không tự ghi last_run_on', () => q(`update report_schedules set last_run_on=current_date`), 'permission denied');
await throws('pm không ghi trực tiếp report_runs', () => q(`insert into report_runs (project_id,frequency,period_start,period_end,summary) values ($1,'weekly',current_date,current_date,'{}')`, [proj['OMNI-BANK']]), 'permission denied');
await as('dev');
ok('dev xem được báo cáo của dự án mình', (await q(`select count(*)::int c from report_runs`))[0].c === 1);
await throws('dev không tạo được báo cáo', () => q(`select generate_report_now($1,'weekly')`, [proj['OMNI-BANK']]), '42501');
await throws('dev không bật lịch báo cáo', () => q(`insert into report_schedules (project_id, frequency) values ($1,'weekly')`, [proj['E-SHOP-B2B']]), 'row-level security');
await throws('dev không chạy tạo báo cáo định kỳ', () => q(`select generate_due_reports()`), '42501');
await as('outsider');
await root();
await q(`delete from project_members where project_id=$1 and user_id=$2`, [proj['OMNI-BANK'], ids.outsider]);
await as('outsider');
ok('người ngoài dự án không thấy báo cáo/lịch', (await q(`select (select count(*) from report_runs)::int + (select count(*) from report_schedules)::int c`))[0].c === 0);
await as('admin');
ok('thứ Hai 05/10/2026: tạo đúng 1 báo cáo tuần', (await q(`select generate_due_reports('2026-10-05') n`))[0].n === 1);
ok('chạy lại cùng ngày không tạo trùng', (await q(`select generate_due_reports('2026-10-05') n`))[0].n === 0);
ok('ngày 1/11/2026 (Chủ nhật): chỉ tạo báo cáo tháng', (await q(`select generate_due_reports('2026-11-01') n`))[0].n === 1);
const monthly = (await q(`select period_start::text s, period_end::text e from report_runs where frequency='monthly'`))[0];
ok('báo cáo tháng phủ cả tháng 10', monthly.s === '2026-10-01' && monthly.e === '2026-10-31', JSON.stringify(monthly));
await as(null);
ok('anon gọi được ping() (giữ project không bị tạm dừng)', (await q(`select ping() p`))[0].p !== null);
await throws('anon không đọc được báo cáo', () => q(`select * from report_runs`), 'permission denied');

// --- Admin ---
await as('admin');
ok('admin thấy cả 3 dự án', (await q(`select count(*)::int c from projects`))[0].c === 3);
const np = await q(`insert into projects (code,name,start_date,target_end_date,manager_id) values ('NEW-1','Dự án mới',current_date,current_date+30,(select id from profiles where name='PM')) returning id`);
ok('admin tạo dự án', np.length === 1);
ok('dự án mới được nhân bản 19 mục checklist', (await q(`select count(*)::int c from quality_items where project_id=$1`, [np[0].id]))[0].c === 19);
const members = await q(`select p.name, m.role from project_members m join profiles p on p.id=m.user_id where project_id=$1 order by 1`, [np[0].id]);
ok('PM + admin được gán làm thành viên', members.length === 2 && members.every(m => m.role === 'pm'), JSON.stringify(members));
ok('admin xem được thông báo nhắc việc', (await q(`select count(*)::int c from notifications where type='deadline_warning'`))[0].c === 1);
const scan1 = (await q(`select scan_deadlines() n`))[0].n;
ok('quét deadline tạo thông báo (1 quá hạn + 3 sắp đến hạn)', scan1 === 4, String(scan1));
ok('quét lại không tạo trùng', (await q(`select scan_deadlines() n`))[0].n === 0);
const kinds = Object.fromEntries((await q(`select type, count(*)::int c from notifications where dedupe_key is not null group by 1`)).map(r => [r.type, r.c]));
ok('phân loại đúng overdue / deadline_warning', kinds.overdue === 1 && kinds.deadline_warning === 3, JSON.stringify(kinds));
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
const todaySnap = (await q(`select progress_percent p from progress_snapshots where project_id=$1 order by snap_date desc limit 1`, [proj['OMNI-BANK']]))[0].p;
ok('ảnh chụp hôm nay cập nhật theo tiến độ mới', todaySnap === after, `${todaySnap} vs ${after}`);

// --- Thông báo ---
await as('dev');
ok('dev không thấy thông báo của người khác', (await q(`select count(*)::int c from notifications`))[0].c === 0);
await as('admin');
const n = await q(`update notifications set is_read=true where user_id=auth.uid() returning id`);
ok('người nhận đánh dấu đã đọc', n.length >= 1);

// ============================================================
// 0008: vai trò mới, use case phân cấp, nhiệm vụ mở rộng
// ============================================================
await as('admin');
const OB = proj['OMNI-BANK'];
await q(`select add_project_member($1,'ba@t.vn','ba')`, [OB]);
await throws('vai trò cũ developer bị từ chối', () => q(`select add_project_member($1,'ba@t.vn','developer')`, [OB]), '22023');
await throws('vai trò cũ qa bị từ chối', () => q(`select add_project_member($1,'ba@t.vn','qa')`, [OB]), '22023');
await root();
await q(`update project_members set role='tester' where project_id=$1 and user_id=$2`, [OB, ids.qa]);

// --- BA: use case + nhiệm vụ, không duyệt checklist ---
await as('ba');
const ucRoot = await q(`insert into use_cases (project_id, code, title) values ($1,'UC-T-1','Gốc') returning id`, [OB]);
ok('ba tạo được use case', ucRoot.length === 1);
const ba2 = await q(`insert into use_cases (project_id, code, title, parent_id) values ($1,'UC-T-1.1','Cấp 2',$2) returning id`, [OB, ucRoot[0].id]);
const ba3 = await q(`insert into use_cases (project_id, code, title, parent_id) values ($1,'UC-T-1.1.1','Cấp 3',$2) returning id`, [OB, ba2[0].id]);
ok('tạo được use case 3 cấp', ba3.length === 1);
await throws('cấp 4 bị chặn', () => q(`insert into use_cases (project_id, code, title, parent_id) values ($1,'UC-T-1.1.1.1','Cấp 4',$2)`, [OB, ba3[0].id]), '22023');
await throws('không đặt cha là chính nó', () => q(`update use_cases set parent_id=id where id=$1`, [ucRoot[0].id]), '22023');
await throws('không chuyển vào nhánh con của mình (vòng lặp)', () => q(`update use_cases set parent_id=$2 where id=$1`, [ucRoot[0].id, ba3[0].id]), '22023');
const other = await q(`insert into use_cases (project_id, code, title) values ($1,'UC-T-2','Gốc khác') returning id`, [OB]);
await throws('chuyển nhánh 2 cấp xuống dưới một gốc khác làm vượt 3 cấp', () => q(`update use_cases set parent_id=$2 where id=$1`, [ucRoot[0].id, other[0].id]), '22023');
await throws('cha ở dự án khác bị từ chối', () => q(`insert into use_cases (project_id, code, title, parent_id) values ($1,'UC-X','x',$2)`, [proj['E-SHOP-B2B'], ucRoot[0].id]), 'cùng dự án');
ok('ba tạo được nhiệm vụ', (await q(`insert into tasks (project_id,code,title,start_date,due_date) values ($1,'BA-1','Việc của BA',current_date,current_date+2) returning id`, [OB])).length === 1);
ok('ba không duyệt được checklist', (await q(`update quality_items set is_passed=true where project_id=$1 returning id`, [OB])).length === 0);

// --- Tiến độ use case cha tổng hợp từ con ---
await root();
const tree = (await q(`select code, id, progress_percent p, status from use_cases where code like 'UC-T-1%' order by code`));
const byCode = Object.fromEntries(tree.map(t => [t.code, t]));
await q(`insert into acceptance_criteria (use_case_id, description, completed, sort) values ($1,'a',false,1), ($1,'b',false,2)`, [byCode['UC-T-1.1.1'].id]);
await q(`update acceptance_criteria set completed=true where use_case_id=$1 and sort=1`, [byCode['UC-T-1.1.1'].id]);
let t2 = Object.fromEntries((await q(`select code, progress_percent p from use_cases where code like 'UC-T-1%'`)).map(r => [r.code, r.p]));
ok('use case lá 50% theo tiêu chí', t2['UC-T-1.1.1'] === 50, JSON.stringify(t2));
ok('use case cha cấp 2 lấy 50% từ con', t2['UC-T-1.1'] === 50, JSON.stringify(t2));
ok('use case gốc lấy 50% từ nhánh', t2['UC-T-1'] === 50, JSON.stringify(t2));
await q(`update acceptance_criteria set completed=true where use_case_id=$1`, [byCode['UC-T-1.1.1'].id]);
t2 = Object.fromEntries((await q(`select code, progress_percent p, status from use_cases where code like 'UC-T-1%'`)).map(r => [r.code, r.p + ':' + r.status]));
ok('tất cả con xong thì cha hoàn thành', t2['UC-T-1.1'] === '100:completed' && t2['UC-T-1'].startsWith('100:'), JSON.stringify(t2));
await q(`update acceptance_criteria set completed=false where use_case_id=$1 and sort=2`, [byCode['UC-T-1.1.1'].id]);
t2 = Object.fromEntries((await q(`select code, progress_percent p, status from use_cases where code like 'UC-T-1%'`)).map(r => [r.code, r.p + ':' + r.status]));
ok('bỏ tick thì cha hạ về developing', t2['UC-T-1'] === '50:developing', JSON.stringify(t2));
const projP = (await q(`select progress_percent p from projects where id=$1`, [OB]))[0].p;
const expectUc = (await q(`select round(avg(progress_percent))::int a from use_cases u where project_id=$1 and not exists (select 1 from use_cases c where c.parent_id=u.id)`, [OB]))[0].a;
const expectTask = (await q(`select avg(progress_percent) a from tasks where project_id=$1`, [OB]))[0].a;
ok('tiến độ dự án = 60% task + 40% use case lá', projP === Math.round(Number(expectTask) * 0.6 + expectUc * 0.4), `${projP} vs task ${expectTask} uc ${expectUc}`);
await q(`delete from use_cases where id=$1`, [byCode['UC-T-1'].id]);
ok('xóa use case gốc xóa cả nhánh con', (await q(`select count(*)::int c from use_cases where code like 'UC-T-1%'`))[0].c === 0);

// --- Tester / Dev: quyền ---
await as('qa');
ok('tester sửa được nhiệm vụ', (await q(`update tasks set notes='kiểm thử xong' where code='BA-1' returning id`)).length === 1);
await throws('tester không tạo được use case', () => q(`insert into use_cases (project_id, code, title) values ($1,'UC-Q','x')`, [OB]), 'row-level security');
ok('tester duyệt được checklist', (await q(`update quality_items set is_passed=true where project_id=$1 and phase_key='phase_5' and sort=1 returning id`, [OB])).length === 1);
await as('dev');
ok('dev tạo được use case', (await q(`insert into use_cases (project_id, code, title) values ($1,'UC-D','x') returning id`, [OB])).length === 1);

// --- Nhiệm vụ mở rộng ---
await as('pm');
const nt = await q(`insert into tasks (project_id, code, title, start_date, due_date, assignee_id, department, status, deliverable_description, notes, estimated_effort, actual_effort, assessment)
  values ($1,'NT-1','Việc mới',current_date,current_date+5,$2,'ba','in_progress','Tài liệu SRS','Ghi chú',3.5,1.5,'at_risk') returning id, progress_percent p, actual_end_date`, [OB, ids.pm]);
ok('nhiệm vụ mới ở trạng thái đang làm mặc định 40%', nt[0].p === 40 && nt[0].actual_end_date === null, JSON.stringify(nt[0]));
await throws('bộ phận không hợp lệ bị từ chối', () => q(`update tasks set department='ops' where id=$1`, [nt[0].id]), 'check');
await throws('đánh giá không hợp lệ bị từ chối', () => q(`update tasks set assessment='tot' where id=$1`, [nt[0].id]), 'check');
await throws('tiến độ ngoài 0-100 bị từ chối', () => q(`update tasks set progress_percent=120 where id=$1`, [nt[0].id]), 'check');
ok('thêm 2 người phối hợp', (await q(`insert into task_collaborators (task_id, user_id) values ($1,$2), ($1,$3) returning user_id`, [nt[0].id, ids.dev, ids.qa])).length === 2);
await throws('người phối hợp phải là thành viên dự án', () => q(`insert into task_collaborators (task_id, user_id) values ($1,$2)`, [nt[0].id, ids.outsider]), '22023');
await q(`update tasks set status='done' where id=$1`, [nt[0].id]);
const done = (await q(`select progress_percent p, actual_end_date::text d, (now() at time zone 'Asia/Ho_Chi_Minh')::date::text today from tasks where id=$1`, [nt[0].id]))[0];
ok('chuyển sang Hoàn thành -> 100% + ngày hoàn thành thực tế', done.p === 100 && done.d === done.today, JSON.stringify(done));
await q(`update tasks set status='in_progress' where id=$1`, [nt[0].id]);
const reopened = (await q(`select progress_percent p, actual_end_date d from tasks where id=$1`, [nt[0].id]))[0];
ok('mở lại việc đã xong -> xóa ngày hoàn thành, tiến độ 90%', reopened.p === 90 && reopened.d === null, JSON.stringify(reopened));
await as('viewer');
ok('viewer xem được người phối hợp', (await q(`select count(*)::int c from task_collaborators`))[0].c === 2);
await throws('viewer không thêm được người phối hợp', () => q(`insert into task_collaborators (task_id, user_id) values ($1,$2)`, [nt[0].id, ids.pm]), 'row-level security');
await as('outsider');
ok('người ngoài không thấy người phối hợp', (await q(`select count(*)::int c from task_collaborators`))[0].c === 0);
await as('dev');
ok('dev bỏ được người phối hợp', (await q(`delete from task_collaborators where task_id=$1 and user_id=$2 returning user_id`, [nt[0].id, ids.qa])).length === 1);
await root();
ok('báo cáo chỉ đếm use case lá', (await q(`select (build_report_summary($1, current_date-6, current_date)->'useCases'->>'total')::int t`, [OB]))[0].t === (await q(`select count(*)::int c from use_cases u where project_id=$1 and not exists (select 1 from use_cases c where c.parent_id=u.id)`, [OB]))[0].c);

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
