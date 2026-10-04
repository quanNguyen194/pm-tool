// Kiểm tra migration 0011 + file gắn nguồn gốc use case (bổ sung / điều chỉnh / không thực hiện).
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';

const MIG = new URL('../migrations/', import.meta.url);
const IMP = new URL('../imports/', import.meta.url);
const PROJECT = 'GPDN_DNMB_EVNNPC_QTVT_251004';
const FILES = ['0001_schema.sql', '0002_quality_template.sql', '0003_rpc_and_seed.sql', '0004_criteria_insert_guard.sql', '0005_deadlines_and_snapshots.sql', '0007_report_schedules.sql', '0008_roles_usecase_tree_task_fields.sql', '0009_usecase_attributes.sql', '0010_usecase_stages.sql', '0011_usecase_origin.sql', '0012_task_use_cases.sql'];

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
const q = async (sql, p) => (await db.query(sql, p)).rows;
// Gọi hàm dưới danh nghĩa quản trị viên (người đăng ký đầu tiên).
const asAdmin = async (sql, p) => {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', (select id::text from profiles where is_admin limit 1), false); set role authenticated;`);
  try { return await q(sql, p); } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub','',false);`); }
};
const run = file => db.exec(fs.readFileSync(new URL(file, IMP), 'utf8'));

const adminId = (await q(`insert into auth.users (email, raw_user_meta_data) values ('a@t.vn', '{"name":"A"}') returning id`))[0].id;
const pmId = (await q(`insert into auth.users (email, raw_user_meta_data) values ('pm@t.vn', '{"name":"PM"}') returning id`))[0].id;
const pid = (await q(`insert into projects (code, name, start_date, target_end_date, manager_id) values ($1,'QTVT', current_date, current_date+100, $2) returning id`, [PROJECT, pmId]))[0].id;
await q(`update projects set progress_model='stages' where id=$1`, [pid]);
await run('qtvt_usecases_import.sql');
const progBefore = (await q(`select progress_percent p from projects where id=$1`, [pid]))[0].p;
const count = async (sql, p = [pid]) => (await q(sql, p))[0].c;

// ---------- Nhập nguồn gốc ----------
await run('qtvt_usecases_origin.sql');
ok('83 use case bổ sung', await count(`select count(*)::int c from use_cases where project_id=$1 and origin='added' and status <> 'cancelled'`) === 83);
ok('7 use case điều chỉnh', await count(`select count(*)::int c from use_cases where project_id=$1 and origin='adjusted'`) === 7);
ok('94 use case theo hợp đồng không đổi (184 - 83 bổ sung - 7 điều chỉnh)', await count(`select count(*)::int c from use_cases where project_id=$1 and kind='usecase' and status <> 'cancelled' and origin='contract'`) === 94);
ok('22 use case không thực hiện được thêm', await count(`select count(*)::int c from use_cases where project_id=$1 and status='cancelled'`) === 22);
ok('use case không thực hiện đều mã KTH-xxx và có lý do', await count(`select count(*)::int c from use_cases where project_id=$1 and status='cancelled' and code ~ '^KTH-[0-9]{3}$' and change_note <> ''`) === 22);
const adj = (await q(`select change_note n from use_cases where project_id=$1 and origin='adjusted' and title like 'Yêu cầu bảo trì%'`, [pid]))[0].n;
ok('ghi chú điều chỉnh có số liệu trước/sau', adj.includes('Theo hợp đồng: 7 transaction') && adj.includes('sau điều chỉnh: 8 transaction'), adj);
ok('thời điểm thống nhất được lưu (24 đã khảo sát + 4 tháng 03 + 58 đang chờ chốt phạm vi)', await count(`select count(*)::int c from use_cases where project_id=$1 and agreed_when like 'Sau khi khảo sát%'`) === 28 && await count(`select count(*)::int c from use_cases where project_id=$1 and agreed_when like 'Đang chờ chốt%'`) === 58);
ok('cây vẫn tối đa 3 cấp', await count(`with recursive t as (select id, 1 d from use_cases where project_id=$1 and parent_id is null union all select u.id, t.d+1 from use_cases u join t on u.parent_id=t.id) select max(d)::int c from t`) <= 3);

// ---------- Không thực hiện không ảnh hưởng số liệu ----------
ok('số use case lá hoạt động vẫn 184', await count(`select count(*)::int c from use_cases u where project_id=$1 and kind='usecase' and status<>'cancelled' and not exists (select 1 from use_cases c where c.parent_id=u.id)`) === 184);
ok('báo cáo chỉ đếm 184 use case (không đếm không thực hiện)', (await q(`select (build_report_summary($1, current_date-6, current_date)->'useCases'->>'total')::int t`, [pid]))[0].t === 184);
ok('tiến độ dự án không đổi sau khi thêm use case không thực hiện', (await q(`select progress_percent p from projects where id=$1`, [pid]))[0].p === progBefore);
const ucId = async code => (await q(`select id from use_cases where project_id=$1 and code=$2`, [pid, code]))[0].id;
ok('hàng loạt bỏ qua use case không thực hiện (0 thay đổi)', (await asAdmin(`select set_use_case_stages($1::uuid[], 'analysis', true) n`, [[await ucId('KTH-001')]]))[0].n === 0);

// ---------- Đổi trạng thái thành "Không thực hiện" tính lại các cấp trên ----------
const lastUc = await ucId('UC-001');
await asAdmin(`select set_use_case_stages($1::uuid[], 'coding', true)`, [[lastUc]]);
const mod = async () => (await q(`select progress_percent p from use_cases where project_id=$1 and code='W-I.1'`, [pid]))[0].p;
const before = await mod();
await q(`update use_cases set status='cancelled' where id=$1`, [lastUc]);
ok('đổi một use case sang Không thực hiện thì nhóm cha tính lại (bỏ nó ra)', (await mod()) !== before, `${before} -> ${await mod()}`);
await q(`update use_cases set status='developing' where id=$1`, [lastUc]);
ok('đưa lại về hoạt động thì nhóm cha tính lại như cũ', (await mod()) === before);

// ---------- Chạy lại + rollback ----------
await q(`update use_cases set status='approved' where project_id=$1 and code='UC-010'`, [pid]);
await run('qtvt_usecases_origin.sql');
ok('chạy lại không nhân đôi (vẫn 22 không thực hiện)', await count(`select count(*)::int c from use_cases where project_id=$1 and status='cancelled'`) === 22);
ok('chạy lại không ghi đè trạng thái đã đổi', (await q(`select status s from use_cases where project_id=$1 and code='UC-010'`, [pid]))[0].s === 'approved');
await run('qtvt_usecases_origin_rollback.sql');
ok('rollback xóa use case không thực hiện và trả nguồn gốc về mặc định',
  await count(`select count(*)::int c from use_cases where project_id=$1 and (status='cancelled' or origin <> 'contract')`) === 0);
ok('rollback không đụng 184 use case đã nhập', await count(`select count(*)::int c from use_cases where project_id=$1 and kind='usecase'`) === 184);

// ---------- Thiếu use case nền thì báo lỗi rõ ràng ----------
await run('qtvt_usecases_rollback.sql');
let msg = '';
try { await run('qtvt_usecases_origin.sql'); } catch (e) { msg = e.message; }
ok('chưa nhập danh sách chính thì báo lỗi hướng dẫn chạy import trước', msg.includes('qtvt_usecases_import.sql'), msg);

// ---------- Rollback migration 0011 ----------
await run('qtvt_usecases_import.sql');
await run('qtvt_usecases_origin.sql');
await db.exec(fs.readFileSync(new URL('../rollback/0011_rollback.sql', import.meta.url), 'utf8'));
ok('rollback 0011 gỡ cột nguồn gốc và trạng thái cancelled',
  await count(`select count(*)::int c from information_schema.columns where table_name='use_cases' and column_name in ('origin','change_note','agreed_when')`, []) === 0 &&
  await count(`select count(*)::int c from use_cases where status='cancelled'`, []) === 0);
ok('sau rollback 0011 hệ thống vẫn cập nhật tiến độ (0010)', (await asAdmin(`select set_use_case_stages($1::uuid[], 'analysis', true) n`, [[await ucId('UC-002')]]))[0].n === 1);

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
