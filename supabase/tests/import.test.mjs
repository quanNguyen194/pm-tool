// Kiểm tra file nhập use case (supabase/imports) chạy đúng trên DB đã có migration 0001-0009.
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';

const MIG = new URL('../migrations/', import.meta.url);
const IMP = new URL('../imports/', import.meta.url);
const PROJECT = 'GPDN_DNMB_EVNNPC_QTVT_251004';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log((cond ? 'PASS' : 'FAIL') + '  ' + name + (cond ? '' : '  ' + extra)); };

async function freshDb() {
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
  for (const f of ['0001_schema.sql', '0002_quality_template.sql', '0003_rpc_and_seed.sql', '0004_criteria_insert_guard.sql', '0005_deadlines_and_snapshots.sql', '0007_report_schedules.sql', '0008_roles_usecase_tree_task_fields.sql', '0009_usecase_attributes.sql']) {
    await db.exec(fs.readFileSync(new URL(f, MIG), 'utf8'));
  }
  const u = await db.query(`insert into auth.users (email, raw_user_meta_data) values ('a@t.vn', '{"name":"A"}') returning id`);
  const p = await db.query(
    `insert into projects (code, name, start_date, target_end_date, manager_id) values ($1, 'Dự án QTVT', current_date, current_date + 100, $2) returning id`,
    [PROJECT, u.rows[0].id]);
  await db.query(`insert into tasks (project_id, code, title, start_date, due_date, status) values ($1, 'T-1', 'Việc có sẵn', current_date, current_date + 3, 'done')`, [p.rows[0].id]);
  return { db, pid: p.rows[0].id };
}
const q = async (db, sql, p) => (await db.query(sql, p)).rows;
const run = (db, file) => db.exec(fs.readFileSync(new URL(file, IMP), 'utf8'));

// ---------- 1. Nhập một lần ----------
let { db, pid } = await freshDb();
const progBefore = (await q(db, `select progress_percent p from projects where id=$1`, [pid]))[0].p;
await run(db, 'qtvt_usecases_import.sql');

const count = async (sql, p = [pid]) => (await q(db, sql, p))[0].c;
ok('184 use case', await count(`select count(*)::int c from use_cases where project_id=$1 and kind='usecase'`) === 184);
ok('34 module/nhóm', await count(`select count(*)::int c from use_cases where project_id=$1 and kind='group'`) === 34);
ok('mã UC-001..UC-184 liên tục', await count(`select count(distinct code)::int c from use_cases where project_id=$1 and code ~ '^UC-[0-9]{3}$' and code between 'UC-001' and 'UC-184'`) === 184);
ok('23 module gốc (cấp 1)', await count(`select count(*)::int c from use_cases where project_id=$1 and parent_id is null`) === 23, 'số module gốc');
ok('use case lá = 184 (nhóm nào cũng có con)', await count(`select count(*)::int c from use_cases u where project_id=$1 and not exists (select 1 from use_cases c where c.parent_id=u.id)`) === 184);
ok('không use case nào sâu hơn 3 cấp', await count(`
  with recursive t as (select id, 1 d from use_cases where project_id=$1 and parent_id is null
    union all select u.id, t.d+1 from use_cases u join t on u.parent_id=t.id)
  select max(d)::int c from t`) === 3);

const byTag = Object.fromEntries((await q(db, `select tags[1] t, count(*)::int c from use_cases where project_id=$1 and kind='usecase' group by 1`, [pid])).map(r => [r.t, r.c]));
ok('số UC theo phân hệ khớp Excel (Web 37, Mobile 19, Tích hợp 77, Văn phòng 23, Kho 28)',
  byTag['Web'] === 37 && byTag['Mobile'] === 19 && byTag['Tích hợp dữ liệu'] === 77 && byTag['Văn phòng'] === 23 && byTag['Kho dữ liệu'] === 28, JSON.stringify(byTag));
const cx = Object.fromEntries((await q(db, `select complexity k, count(*)::int c from use_cases where project_id=$1 and kind='usecase' group by 1`, [pid])).map(r => [r.k, r.c]));
ok('độ phức tạp 71 / 109 / 4 khớp Excel', cx.simple === 71 && cx.medium === 109 && cx.complex === 4, JSON.stringify(cx));
ok('tổng transaction = 645', await count(`select sum(transactions)::int c from use_cases where project_id=$1`) === 645);
ok('mọi use case có luồng chính và tác nhân', await count(`select count(*)::int c from use_cases where project_id=$1 and kind='usecase' and (cardinality(main_flow)=0 or actor='')`) === 0);
ok('nhóm không có luồng/tác nhân', await count(`select count(*)::int c from use_cases where project_id=$1 and kind='group' and (cardinality(main_flow)>0 or actor<>'')`) === 0);

const sample = (await q(db, `select title, main_flow[1] f1, cardinality(main_flow) n, parent_id from use_cases where project_id=$1 and code='UC-001'`, [pid]))[0];
ok('UC-001 đúng tên, luồng đánh số, có cha', sample.title.startsWith('Quản lý cấu hình danh sách chủng loại') && sample.f1.startsWith('1. Quản trị phần mềm') && sample.n === 5 && sample.parent_id, JSON.stringify(sample));
const parentOf133 = (await q(db, `select p.code pc, g.code gc from use_cases u join use_cases p on p.id=u.parent_id left join use_cases g on g.id=p.parent_id where u.project_id=$1 and u.code='UC-133'`, [pid]))[0];
ok('UC-133 nằm trong TH-I thuộc module Tích hợp dữ liệu', parentOf133.pc === 'TH-I' && parentOf133.gc === 'TH', JSON.stringify(parentOf133));
const x = (await q(db, `select u.code, p.code pc, g.code gc from use_cases u join use_cases p on p.id=u.parent_id left join use_cases g on g.id=p.parent_id where u.project_id=$1 and u.title like 'Cảnh báo kế hoạch định danh chưa hoàn thành'`, [pid]));
ok('UC trùng tên ở module khác nhau vẫn là bản ghi riêng', x.length >= 1);
const prog = (await q(db, `select progress_percent p from projects where id=$1`, [pid]))[0].p;
console.log(`   (tiến độ dự án: ${progBefore}% -> ${prog}% do 184 use case lá mới ở 0%)`);
ok('tiến độ dự án giảm vì UC mới chưa có tiến độ (hành vi đã ghi chú)', prog < progBefore);

// ---------- 2. Chạy lại không trùng, không ghi đè công việc đã làm ----------
await db.query(`update use_cases set status='developing', description='Mô tả tay', assigned_to=null where project_id=$1 and code='UC-001'`, [pid]);
await db.query(`update use_cases set title='Tên bị sửa tay' where project_id=$1 and code='UC-002'`, [pid]);
await run(db, 'qtvt_usecases_import.sql');
ok('chạy lại vẫn 218 bản ghi', await count(`select count(*)::int c from use_cases where project_id=$1`) === 218);
const keep = (await q(db, `select status, description from use_cases where project_id=$1 and code='UC-001'`, [pid]))[0];
ok('chạy lại giữ nguyên trạng thái/mô tả nhập tay', keep.status === 'developing' && keep.description === 'Mô tả tay', JSON.stringify(keep));
ok('chạy lại đồng bộ lại tên theo Excel', (await q(db, `select title from use_cases where project_id=$1 and code='UC-002'`, [pid]))[0].title !== 'Tên bị sửa tay');

// ---------- 3. Rollback ----------
await run(db, 'qtvt_usecases_rollback.sql');
ok('rollback xóa toàn bộ use case đã nhập', await count(`select count(*)::int c from use_cases where project_id=$1`) === 0);

// ---------- 4. Bản chia nhỏ theo phân hệ cho cùng kết quả ----------
({ db, pid } = await freshDb());
for (const f of fs.readdirSync(new URL('parts/', IMP)).filter(n => n.endsWith('.sql')).sort()) {
  await db.exec(fs.readFileSync(new URL('parts/' + f, IMP), 'utf8'));
}
ok('5 phần cộng lại = 184 UC + 34 nhóm', await count(`select count(*)::int c from use_cases where project_id=$1`) === 218);

// ---------- 5. Thiếu dự án thì báo lỗi rõ ràng ----------
const empty = await freshDb();
await empty.db.query(`update projects set code='KHAC'`);
let msg = '';
try { await run(empty.db, 'qtvt_usecases_import.sql'); } catch (e) { msg = e.message; }
ok('không có dự án đúng mã thì báo lỗi, không nhập gì', msg.includes('Không tìm thấy dự án') && (await q(empty.db, `select count(*)::int c from use_cases`))[0].c === 0, msg);

// ---------- 6. Rollback 0009 ----------
await run(db, 'qtvt_usecases_rollback.sql');
await db.exec(fs.readFileSync(new URL('../rollback/0009_rollback.sql', import.meta.url), 'utf8'));
ok('rollback 0009 gỡ các cột mới', (await q(db, `select count(*)::int c from information_schema.columns where table_name='use_cases' and column_name in ('kind','tags','complexity','transactions','necessity')`))[0].c === 0);

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
