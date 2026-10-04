// Kiểm tra mô hình tiến độ "5 bước chuẩn", quyền tick theo vai trò, cập nhật hàng loạt và tổng hợp có trọng số.
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';

const MIG = new URL('../migrations/', import.meta.url);
const IMP = new URL('../imports/', import.meta.url);
const PROJECT = 'GPDN_DNMB_EVNNPC_QTVT_251004';
const FILES = ['0001_schema.sql', '0002_quality_template.sql', '0003_rpc_and_seed.sql', '0004_criteria_insert_guard.sql', '0005_deadlines_and_snapshots.sql', '0007_report_schedules.sql', '0008_roles_usecase_tree_task_fields.sql', '0009_usecase_attributes.sql', '0010_usecase_stages.sql', '0011_usecase_origin.sql'];

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

// ---------- Dữ liệu: dự án + 184 use case thật + vài nhiệm vụ ----------
await root();
const pid = (await q(`insert into projects (code, name, start_date, target_end_date, manager_id) values ($1,'QTVT', current_date, current_date+100, $2) returning id`, [PROJECT, ids.pm]))[0].id;
for (const [k, role] of [['ba', 'ba'], ['dev', 'dev'], ['tester', 'tester'], ['viewer', 'viewer']]) {
  await q(`insert into project_members (project_id, user_id, role) values ($1,$2,$3)`, [pid, ids[k], role]);
}
await db.exec(fs.readFileSync(new URL('qtvt_usecases_import.sql', IMP), 'utf8'));
await q(`insert into tasks (project_id, code, title, start_date, due_date, status) values ($1,'T-1','Xong',current_date,current_date+3,'done')`, [pid]);
const uc = async code => (await q(`select id from use_cases where project_id=$1 and code=$2`, [pid, code]))[0].id;
const info = async code => (await q(`select progress_percent p, status s from use_cases where project_id=$1 and code=$2`, [pid, code]))[0];
const stages = async code => (await q(`select stage from use_case_stages where use_case_id=$1 order by stage`, [await uc(code)])).map(r => r.stage);

const U1 = await uc('UC-001'), U2 = await uc('UC-002'), U3 = await uc('UC-003');
const call = async (uuids, stage, done = true) => (await q(`select set_use_case_stages($1::uuid[], $2, $3) n`, [uuids, stage, done]))[0].n;

// ---------- Mô hình "criteria" là mặc định: bước không áp dụng ----------
await as('pm');
ok('mặc định dự án dùng mô hình criteria', (await q(`select progress_model m from projects where id=$1`, [pid]))[0].m === 'criteria');
ok('mô hình criteria: tick bước không có tác dụng (0 thay đổi)', await call([U1], 'analysis') === 0);

// ---------- Bật mô hình stages ----------
await q(`update projects set progress_model='stages' where id=$1`, [pid]);
ok('pm đổi được mô hình sang stages', (await q(`select progress_model m from projects where id=$1`, [pid]))[0].m === 'stages');
await as('dev');
await throws('dev không đổi được mô hình dự án', async () => {
  const r = await q(`update projects set progress_model='criteria' where id=$1 returning id`, [pid]);
  if (r.length === 0) throw new Error('row-level security: không sửa được');
}, 'row-level security');

// ---------- Quyền tick theo vai trò ----------
await as('ba');
ok('ba tick Phân tích -> 10%', (await call([U1], 'analysis')) === 1 && (await info('UC-001')).p === 10);
await throws('ba không tick được Lập trình', () => call([U1], 'coding'), '42501');
ok('ba tick Thiết kế -> 20%', (await call([U1], 'design')) === 1 && (await info('UC-001')).p === 20);
await as('dev');
await throws('dev không tick được Kiểm thử', () => call([U1], 'testing'), '42501');
await throws('dev không tick được Phân tích', () => call([U1], 'analysis'), '42501');
await call([U1], 'coding');
const afterCoding = await info('UC-001');
ok('dev tick Lập trình -> 60% và trạng thái Đang phát triển', afterCoding.p === 60 && afterCoding.s === 'developing', JSON.stringify(afterCoding));
await as('tester');
await call([U1], 'testing');
ok('tester tick Kiểm thử -> 85%', (await info('UC-001')).p === 85);
await throws('tester không tick được Nghiệm thu', () => call([U1], 'acceptance'), '42501');
await as('viewer');
await throws('viewer không tick được bước nào', () => call([U1], 'analysis'), '42501');
await as('outsider');
await throws('người ngoài dự án không tick được', () => call([U1], 'analysis'), '42501');
await as('pm');
await call([U1], 'acceptance');
const done1 = await info('UC-001');
ok('pm tick Nghiệm thu -> 100% và Hoàn thành', done1.p === 100 && done1.s === 'completed', JSON.stringify(done1));
ok('bước ghi nhận người thực hiện', (await q(`select count(*)::int c from use_case_stages where use_case_id=$1 and done_by is not null`, [U1]))[0].c === 5);
await call([U1], 'acceptance', false);
const reopened = await info('UC-001');
ok('bỏ tick Nghiệm thu -> 85% và mở lại (Đang phát triển)', reopened.p === 85 && reopened.s === 'developing', JSON.stringify(reopened));
await as('pm');
await throws('không ghi trực tiếp vào bảng bước', () => q(`insert into use_case_stages (use_case_id, stage) values ($1,'analysis')`, [U2]), 'permission denied');

// ---------- Hàng loạt ----------
await as('tester');
ok('tester đánh dấu Kiểm thử cho 3 use case cùng lúc', (await call([U1, U2, U3], 'testing')) === 2, 'UC-001 đã có sẵn nên chỉ 2 thay đổi');
ok('chạy lại không thay đổi gì', (await call([U1, U2, U3], 'testing')) === 0);
ok('UC-002 có 25%', (await info('UC-002')).p === 25);
await as('pm');
const group = await uc('W-I.1');
ok('nhóm/module bị bỏ qua khi tick (0 thay đổi)', (await call([group], 'analysis')) === 0);
await throws('quá 500 use case một lần bị từ chối', () => call(Array.from({ length: 501 }, () => U1), 'analysis'), '22023');
await throws('bước không hợp lệ bị từ chối', () => call([U1], 'deploy'), '22023');

// ---------- Tổng hợp có trọng số ----------
await root();
const leaves = await q(`select u.code, u.progress_percent p, u.complexity c from use_cases u join use_cases g on g.id=u.parent_id where g.code='W-I.1' order by u.code`);
const w = c => ({ simple: 5, complex: 15 }[c] ?? 10);
const expected = Math.round(leaves.reduce((s, l) => s + l.p * w(l.c), 0) / leaves.reduce((s, l) => s + w(l.c), 0));
const grp = (await q(`select progress_percent p from use_cases where project_id=$1 and code='W-I.1'`, [pid]))[0].p;
ok('nhóm = trung bình có trọng số các use case lá', grp === expected && grp > 0, `${grp} vs ${expected} ${JSON.stringify(leaves)}`);
const modLeaves = await q(`select u.progress_percent p, u.complexity c from use_cases u where u.project_id=$1 and u.kind='usecase' and u.code ~ '^UC-0(0[1-9]|1[0-8])$'`, [pid]);
const modExpected = Math.round(modLeaves.reduce((s, l) => s + l.p * w(l.c), 0) / modLeaves.reduce((s, l) => s + w(l.c), 0));
ok('module W-I (18 use case đầu) tổng hợp đúng qua 2 cấp', (await q(`select progress_percent p from use_cases where project_id=$1 and code='W-I'`, [pid]))[0].p === modExpected, String(modExpected));

// ---------- Tiến độ dự án ----------
const allLeaves = await q(`select progress_percent p, complexity c from use_cases u where project_id=$1 and kind='usecase'`, [pid]);
const ucAvg = allLeaves.reduce((s, l) => s + l.p * w(l.c), 0) / allLeaves.reduce((s, l) => s + w(l.c), 0);
const expectProject = Math.round(100 * 0.6 + ucAvg * 0.4);
ok('tiến độ dự án = 60% nhiệm vụ + 40% use case lá có trọng số', (await q(`select progress_percent p from projects where id=$1`, [pid]))[0].p === expectProject, String(expectProject));

// ---------- Tiêu chí nghiệm thu không quyết định tiến độ khi dùng stages ----------
await as('pm');
await q(`insert into acceptance_criteria (use_case_id, description, completed) values ($1,'a',false)`, [U2]);
await q(`update acceptance_criteria set completed=true where use_case_id=$1`, [U2]);
ok('stages: tick tiêu chí không đổi tiến độ (vẫn 25%)', (await info('UC-002')).p === 25);

// ---------- Đổi lại sang criteria ----------
await q(`update projects set progress_model='criteria' where id=$1`, [pid]);
ok('đổi về criteria: tiến độ tính lại theo tiêu chí (UC-002 = 100%)', (await info('UC-002')).p === 100);
ok('đổi về criteria: use case không có tiêu chí về 0%', (await info('UC-005')).p === 0 && (await info('UC-001')).p === 0);

// ---------- Báo cáo đếm use case lá, không đếm nhóm ----------
await root();
ok('báo cáo: tổng use case = 184 (không tính 34 nhóm)', (await q(`select (build_report_summary($1, current_date-6, current_date)->'useCases'->>'total')::int t`, [pid]))[0].t === 184);

// ---------- Rollback 0010 ----------
await root();
await db.exec(fs.readFileSync(new URL('../rollback/0010_rollback.sql', import.meta.url), 'utf8'));
ok('rollback 0010 gỡ bảng bước và cột mô hình',
  (await q(`select count(*)::int c from information_schema.tables where table_name='use_case_stages'`))[0].c === 0 &&
  (await q(`select count(*)::int c from information_schema.columns where table_name='projects' and column_name='progress_model'`))[0].c === 0);
await q(`update use_cases set status='developing' where project_id=$1 and code='UC-005'`, [pid]);
ok('sau rollback hệ thống vẫn cập nhật được use case', (await info('UC-005')).s === 'developing');
await q(`insert into acceptance_criteria (use_case_id, description, completed) values ($1,'x',true)`, [await uc('UC-005')]);
ok('sau rollback tiêu chí nghiệm thu quyết định tiến độ lại (UC-005 = 100%)', (await info('UC-005')).p === 100);

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
