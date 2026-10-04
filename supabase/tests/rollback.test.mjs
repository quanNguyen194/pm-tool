// Kiểm tra rollback 0008 chạy được trên dữ liệu thật (cú pháp + gộp vai trò + công thức cũ).
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';

const MIG = new URL('../migrations/', import.meta.url);
const db = new PGlite();
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create publication supabase_realtime;
  grant usage on schema public, auth to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated, public;
`);
for (const f of ['0001_schema.sql', '0002_quality_template.sql', '0003_rpc_and_seed.sql', '0004_criteria_insert_guard.sql', '0005_deadlines_and_snapshots.sql', '0007_report_schedules.sql', '0008_roles_usecase_tree_task_fields.sql']) {
  await db.exec(fs.readFileSync(new URL(f, MIG), 'utf8'));
}

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log((cond ? 'PASS' : 'FAIL') + '  ' + name + (cond ? '' : '  ' + extra)); };
const q = async (sql, p) => (await db.query(sql, p)).rows;

for (const [email, name] of [['a@t.vn', 'A'], ['b@t.vn', 'B'], ['c@t.vn', 'C'], ['d@t.vn', 'D']]) {
  await db.query(`insert into auth.users (email, raw_user_meta_data) values ($1, $2::jsonb)`, [email, JSON.stringify({ name })]);
}
await q(`select seed_demo_data()`);
const pid = (await q(`select id from projects where code='OMNI-BANK'`))[0].id;
await q(`select add_project_member($1,'b@t.vn','dev')`, [pid]);
await q(`select add_project_member($1,'c@t.vn','ba')`, [pid]);
await q(`select add_project_member($1,'d@t.vn','tester')`, [pid]);

await db.exec(fs.readFileSync(new URL('../rollback/0008_rollback.sql', import.meta.url), 'utf8'));

const roles = Object.fromEntries((await q(`select p.name, m.role from project_members m join profiles p on p.id=m.user_id where project_id=$1`, [pid])).map(r => [r.name, r.role]));
ok('dev -> developer', roles.B === 'developer', JSON.stringify(roles));
ok('ba -> developer', roles.C === 'developer', JSON.stringify(roles));
ok('tester -> qa', roles.D === 'qa', JSON.stringify(roles));
ok('add_project_member nhận vai trò cũ', (await q(`select add_project_member($1,'d@t.vn','qa') r`, [pid])).length === 1);
let rejected = false;
try { await q(`select add_project_member($1,'d@t.vn','tester')`, [pid]); } catch { rejected = true; }
ok('vai trò mới bị từ chối sau rollback', rejected);
ok('tiến độ dự án tính lại không lỗi', (await q(`select progress_percent p from projects where id=$1`, [pid]))[0].p >= 0);

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
