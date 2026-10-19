// Kiểm tra migration 0022: PM thêm / sửa / xóa tiêu chuẩn Quality Gates (kể cả mặc định); thẩm định tách quyền riêng.
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';

const MIG = new URL('../migrations/', import.meta.url);
const FILES = ['0001_schema.sql', '0002_quality_template.sql', '0003_rpc_and_seed.sql', '0004_criteria_insert_guard.sql', '0005_deadlines_and_snapshots.sql', '0007_report_schedules.sql', '0008_roles_usecase_tree_task_fields.sql', '0009_usecase_attributes.sql', '0010_usecase_stages.sql', '0011_usecase_origin.sql', '0012_task_use_cases.sql', '0013_placeholder_accounts.sql', '0018_fix_null_permission_checks.sql', '0020_stage_order.sql', '0021_permission_config.sql', '0022_quality_items_edit.sql'];

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
for (const k of ['admin', 'pm', 'tester', 'dev', 'viewer', 'outsider']) {
  ids[k] = (await q(`insert into auth.users (email, raw_user_meta_data) values ($1, $2::jsonb) returning id`, [`${k}@t.vn`, JSON.stringify({ name: k })]))[0].id;
}
const as = async who => {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${ids[who]}', false); set role authenticated;`);
};
const root = async () => { await db.exec(`reset role; select set_config('request.jwt.claim.sub','',false);`); };

await root();
await q(`update profiles set is_admin = true where id = $1`, [ids.admin]);
const mk = async code => (await q(`insert into projects (code,name,start_date,target_end_date,manager_id) values ($1,$1,current_date,current_date+30,$2) returning id`, [code, ids.pm]))[0].id;
const P = await mk('P'), P2 = await mk('P2');
for (const pid of [P, P2]) for (const r of ['tester', 'dev', 'viewer']) await q(`insert into project_members (project_id,user_id,role) values ($1,$2,$3)`, [pid, ids[r], r]);

const count = async pid => (await q(`select count(*)::int c from quality_items where project_id = $1`, [pid]))[0].c;
const firstItem = async pid => (await q(`select id from quality_items where project_id = $1 order by sort, id limit 1`, [pid]))[0].id;
const ins = (pid, title = 'Tiêu chuẩn mới') => q(`insert into quality_items (project_id, phase_key, title, description, is_mandatory) values ($1,'phase_1',$2,'mô tả',true) returning id`, [pid, title]);
const templateCount = (await q(`select count(*)::int c from quality_template_items`))[0].c;
const n0 = await count(P);
ok('dự án có sẵn tiêu chuẩn mặc định nhân bản từ mẫu', n0 === templateCount && n0 > 0, `${n0} vs ${templateCount}`);

// ---------- PM thêm / sửa / xóa ----------
await as('pm');
const added = (await ins(P))[0].id;
ok('PM thêm được tiêu chuẩn', (await count(P)) === n0 + 1);
await q(`update quality_items set title = 'Đã sửa tên', description = 'Mô tả mới', is_mandatory = false where id = $1`, [added]);
const edited = (await q(`select title, description, is_mandatory from quality_items where id = $1`, [added]))[0];
ok('PM sửa được tên, mô tả, bắt buộc', edited.title === 'Đã sửa tên' && edited.description === 'Mô tả mới' && edited.is_mandatory === false);
const def = await firstItem(P);
const defTitle = (await q(`select title from quality_items where id = $1`, [def]))[0].title;
await q(`update quality_items set title = $2 where id = $1`, [def, defTitle + ' (đã điều chỉnh)']);
ok('PM sửa được tiêu chuẩn MẶC ĐỊNH', (await q(`select title from quality_items where id = $1`, [def]))[0].title.endsWith('(đã điều chỉnh)'));
await q(`delete from quality_items where id = $1`, [def]);
ok('PM xóa được tiêu chuẩn MẶC ĐỊNH', (await count(P)) === n0 && (await q(`select count(*)::int c from quality_items where id = $1`, [def]))[0].c === 0);
await q(`delete from quality_items where id = $1`, [added]);
ok('PM xóa được tiêu chuẩn tự thêm', (await count(P)) === n0 - 1);
await root();
ok('xóa chỉ ảnh hưởng dự án đó: dự án khác và mẫu gốc giữ nguyên', (await count(P2)) === templateCount && (await q(`select count(*)::int c from quality_template_items`))[0].c === templateCount);
ok('ảnh chụp tiến độ trong ngày cập nhật số tiêu chuẩn sau khi xóa', (await q(`select quality_total t from progress_snapshots where project_id = $1 and snap_date = (now() at time zone 'Asia/Ho_Chi_Minh')::date`, [P]))[0].t === n0 - 1);

// ---------- PM vẫn thẩm định; không đổi dự án/giai đoạn ----------
await as('pm');
const target = await firstItem(P);
await q(`select set_quality_item($1, true, 'ổn')`, [target]);
ok('PM thẩm định Đạt như cũ', (await q(`select is_passed p from quality_items where id = $1`, [target]))[0].p === true);
await throws('không chuyển tiêu chuẩn sang giai đoạn khác', () => q(`update quality_items set phase_key = 'phase_2' where id = $1`, [target]), 'permission denied');

// ---------- Tester: thẩm định được, định nghĩa không ----------
await as('tester');
await throws('tester không thêm được tiêu chuẩn (mặc định)', () => ins(P), 'row-level security');
await throws('tester không sửa nội dung tiêu chuẩn', () => q(`update quality_items set title = 'hack' where id = $1`, [target]), '42501');
await q(`update quality_items set notes = 'tester ghi chú' where id = $1`, [target]);
ok('tester vẫn ghi chú được', (await q(`select notes from quality_items where id = $1`, [target]))[0].notes === 'tester ghi chú');
await q(`select set_quality_item($1, false)`, [target]);
ok('tester vẫn thẩm định (bỏ Đạt) được', (await q(`select is_passed p from quality_items where id = $1`, [target]))[0].p === false);
await q(`delete from quality_items where id = $1`, [target]);
await root();
ok('tester không xóa được (không có dòng nào bị xóa)', (await q(`select count(*)::int c from quality_items where id = $1`, [target]))[0].c === 1);

// ---------- Người khác ----------
for (const who of ['dev', 'viewer', 'outsider']) {
  await as(who);
  await throws(`${who} không thêm được tiêu chuẩn`, () => ins(P), 'row-level security');
  await q(`update quality_items set notes = 'x' where id = $1`, [target]).catch(() => null);
  await q(`delete from quality_items where id = $1`, [target]);
}
await root();
ok('dev/viewer/người ngoài không xóa và không sửa được gì', (await q(`select count(*)::int c from quality_items where id = $1 and notes is distinct from 'x'`, [target]))[0].c === 1);

// ---------- Admin luôn có quyền; cấu hình cấp cho tester ----------
await as('admin');
await ins(P, 'Admin thêm');
ok('admin thêm được', (await count(P)) === n0);
await q(`select set_role_permissions($1, $2::jsonb)`, [P, JSON.stringify([{ role: 'tester', permission: 'edit_quality_items', allowed: true }])]);
await as('tester');
const tid = (await ins(P, 'Tester thêm sau khi được cấp'))[0].id;
await q(`update quality_items set title = 'Tester sửa' where id = $1`, [tid]);
await q(`delete from quality_items where id = $1`, [tid]);
ok('admin cấp quyền cho tester ở dự án P: tester thêm/sửa/xóa được', (await q(`select count(*)::int c from quality_items where id = $1`, [tid]))[0].c === 0);
await throws('...nhưng chỉ ở dự án P (dự án P2 vẫn bị chặn)', () => ins(P2), 'row-level security');

// ---------- Báo cáo quyền + ma trận ----------
await as('pm');
ok('my_access_report có editQualityItems cho PM', (await q(`select my_access_report($1) r`, [P]))[0].r.editQualityItems === true);
await as('tester');
ok('...và đúng theo cấu hình cho tester (P bật, P2 tắt)', (await q(`select my_access_report($1) r`, [P]))[0].r.editQualityItems === true && (await q(`select my_access_report($1) r`, [P2]))[0].r.editQualityItems === false);
await as('pm');
{
  const m = (await q(`select get_permission_matrix($1) m`, [P]))[0].m;
  ok('ma trận hiệu lực có 10 quyền, mặc định chỉ PM có quyền sửa tiêu chuẩn', Object.keys(m).length === 10 && m.edit_quality_items.pm.allowed === true && m.edit_quality_items.tester.source === 'project' && m.edit_quality_items.dev.allowed === false);
}

// ---------- Hoàn tác ----------
await root();
await db.exec(fs.readFileSync(new URL('../rollback/0022_rollback.sql', import.meta.url), 'utf8'));
await as('tester');
ok('rollback 0022: tester lại thêm được tiêu chuẩn như trước', (await ins(P2, 'Sau rollback')).length === 1);
await as('pm');
ok('rollback 0022: PM vẫn xóa được', (await q(`delete from quality_items where project_id = $1 and title = 'Sau rollback' returning id`, [P2])).length === 1);
ok('rollback 0022: ma trận về 9 quyền', Object.keys((await q(`select get_permission_matrix($1) m`, [P]))[0].m).length === 9);

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
