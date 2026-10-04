// Kiểm tra migration 0012: nhiệm vụ liên kết nhiều use case.
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';

const MIG = new URL('../migrations/', import.meta.url);
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
for (const k of ['admin', 'dev', 'viewer', 'outsider']) {
  ids[k] = (await q(`insert into auth.users (email, raw_user_meta_data) values ($1, $2::jsonb) returning id`, [`${k}@t.vn`, JSON.stringify({ name: k })]))[0].id;
}
const as = async who => {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${who ? ids[who] : ''}', false);`);
  await db.exec(`set role ${who ? 'authenticated' : 'anon'};`);
};
const root = async () => { await db.exec(`reset role; select set_config('request.jwt.claim.sub','',false);`); };

// ---- dữ liệu trước khi có liên kết nhiều (mô phỏng dữ liệu cũ): chạy lại phần backfill sau ----
await root();
const p1 = (await q(`insert into projects (code,name,start_date,target_end_date,manager_id) values ('P1','P1',current_date,current_date+30,$1) returning id`, [ids.admin]))[0].id;
const p2 = (await q(`insert into projects (code,name,start_date,target_end_date,manager_id) values ('P2','P2',current_date,current_date+30,$1) returning id`, [ids.admin]))[0].id;
await q(`insert into project_members (project_id,user_id,role) values ($1,$2,'dev'), ($1,$3,'viewer')`, [p1, ids.dev, ids.viewer]);
const uc = {};
for (const [pid, code] of [[p1, 'A'], [p1, 'B'], [p1, 'C'], [p2, 'X']]) {
  uc[code] = (await q(`insert into use_cases (project_id, code, title) values ($1,$2,$2) returning id`, [pid, code]))[0].id;
}

// Chạy migration 0012 SAU khi đã có nhiệm vụ cũ gắn một use case (kiểm tra backfill)
const oldTask = (await q(`insert into tasks (project_id,code,title,start_date,due_date,use_case_id) values ($1,'OLD','cũ',current_date,current_date+1,$2) returning id`, [p1, uc.A]))[0].id;
await db.exec(fs.readFileSync(new URL('0012_task_use_cases.sql', MIG), 'utf8'));
const links = async tid => (await q(`select u.code from task_use_cases l join use_cases u on u.id=l.use_case_id where l.task_id=$1 order by u.code`, [tid])).map(r => r.code);

ok('backfill: nhiệm vụ cũ có liên kết tương ứng', JSON.stringify(await links(oldTask)) === '["A"]');

// ---- Gắn nhiều use case ----
await as('dev');
const t = (await q(`insert into tasks (project_id,code,title,start_date,due_date) values ($1,'T1','Nhiều UC',current_date,current_date+2) returning id`, [p1]))[0].id;
ok('dev gắn được nhiều use case cho một nhiệm vụ', (await q(`insert into task_use_cases (task_id,use_case_id) values ($1,$2),($1,$3),($1,$4) returning 1`, [t, uc.A, uc.B, uc.C])).length === 3);
ok('liên kết đọc lại đúng', JSON.stringify(await links(t)) === '["A","B","C"]');
await throws('không gắn trùng một cặp', () => q(`insert into task_use_cases (task_id,use_case_id) values ($1,$2)`, [t, uc.A]), 'duplicate');
await throws('không gắn use case của dự án khác', () => q(`insert into task_use_cases (task_id,use_case_id) values ($1,$2)`, [t, uc.X]), '22023');
ok('dev bỏ được một liên kết', (await q(`delete from task_use_cases where task_id=$1 and use_case_id=$2 returning 1`, [t, uc.B])).length === 1);
await throws('không sửa được liên kết (chỉ thêm/xóa)', () => q(`update task_use_cases set use_case_id=$2 where task_id=$1`, [t, uc.B]), 'permission denied');

// ---- Quyền ----
await as('viewer');
ok('viewer xem được liên kết', (await q(`select count(*)::int c from task_use_cases`))[0].c >= 3);
await throws('viewer không gắn được', () => q(`insert into task_use_cases (task_id,use_case_id) values ($1,$2)`, [t, uc.B]), 'row-level security');
ok('viewer không xóa được', (await q(`delete from task_use_cases where task_id=$1 returning 1`, [t])).length === 0);
await as('outsider');
ok('người ngoài dự án không thấy liên kết', (await q(`select count(*)::int c from task_use_cases`))[0].c === 0);
await as(null);
await throws('anon bị chặn', () => q(`select * from task_use_cases`), 'permission denied');

// ---- Đồng bộ với cột cũ tasks.use_case_id (giao diện cũ) ----
await as('dev');
const t2 = (await q(`insert into tasks (project_id,code,title,start_date,due_date,use_case_id) values ($1,'T2','Kiểu cũ',current_date,current_date+2,$2) returning id`, [p1, uc.B]))[0].id;
ok('giao diện cũ ghi use_case_id thì liên kết mới tự có', JSON.stringify(await links(t2)) === '["B"]');
await q(`update tasks set use_case_id=$2 where id=$1`, [t2, uc.C]);
ok('đổi use_case_id thì thêm liên kết mới (không mất liên kết cũ)', JSON.stringify(await links(t2)) === '["B","C"]');

// ---- Xóa use case / nhiệm vụ ----
await root();
await q(`delete from use_cases where id=$1`, [uc.A]);
ok('xóa use case thì liên kết mất, nhiệm vụ còn', JSON.stringify(await links(t)) === '["C"]' && (await q(`select count(*)::int c from tasks where id=$1`, [t]))[0].c === 1);
await q(`delete from tasks where id=$1`, [t]);
ok('xóa nhiệm vụ thì liên kết mất', (await q(`select count(*)::int c from task_use_cases where task_id=$1`, [t]))[0].c === 0);

// ---- Rollback ----
await q(`insert into task_use_cases (task_id,use_case_id) values ($1,$2)`, [t2, uc.B]).catch(() => null);
await q(`update tasks set use_case_id = null where id=$1`, [t2]);
await db.exec(fs.readFileSync(new URL('../rollback/0012_rollback.sql', import.meta.url), 'utf8'));
ok('rollback: bảng liên kết bị gỡ', (await q(`select count(*)::int c from information_schema.tables where table_name='task_use_cases'`))[0].c === 0);
ok('rollback: nhiệm vụ không còn use case chính được gán lại từ liên kết', (await q(`select use_case_id u from tasks where id=$1`, [t2]))[0].u !== null);

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
