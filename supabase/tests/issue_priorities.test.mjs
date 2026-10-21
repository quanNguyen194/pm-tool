// Kiểm tra migration 0025: độ ưu tiên issue cấu hình được (bảng, chuyển dữ liệu cũ, create/update issue, cấu hình, quyền, hoàn tác).
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';

const MIG = new URL('../migrations/', import.meta.url);
const BEFORE = ['0001_schema.sql', '0002_quality_template.sql', '0003_rpc_and_seed.sql', '0004_criteria_insert_guard.sql', '0005_deadlines_and_snapshots.sql', '0007_report_schedules.sql', '0008_roles_usecase_tree_task_fields.sql', '0009_usecase_attributes.sql', '0010_usecase_stages.sql', '0011_usecase_origin.sql', '0012_task_use_cases.sql', '0013_placeholder_accounts.sql', '0014_telegram_notify.sql', '0018_fix_null_permission_checks.sql', '0020_stage_order.sql', '0021_permission_config.sql', '0022_quality_items_edit.sql'];

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
for (const f of BEFORE) await db.exec(fs.readFileSync(new URL(f, MIG), 'utf8'));

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
let current = null;
const as = async who => { current = who; await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${ids[who]}', false); set role authenticated;`); };
const root = async () => { current = null; await db.exec(`reset role; select set_config('request.jwt.claim.sub','',false);`); };
const asRoot = async fn => { const prev = current; await root(); try { return await fn(); } finally { if (prev) await as(prev); } };

await root();
await q(`update profiles set is_admin = true where id = $1`, [ids.admin]);
const mkProject = async code => (await q(`insert into projects (code,name,start_date,target_end_date,manager_id) values ($1,$1,current_date,current_date+30,$2) returning id`, [code, ids.pm]))[0].id;
await db.exec(fs.readFileSync(new URL('0023_issues.sql', MIG), 'utf8'));

// Dự án và issue TRƯỚC khi chạy 0025 (độ ưu tiên còn là chữ)
const POLD = await mkProject('POLD'), P2 = await mkProject('P2old');
for (const pid of [POLD, P2]) for (const r of ['ba', 'dev', 'tester', 'viewer']) await q(`insert into project_members (project_id,user_id,role) values ($1,$2,$3)`, [pid, ids[r], r]);
const oldTypeId = async pid => (await q(`select id from issue_types where project_id=$1 and name='Bug'`, [pid]))[0].id;
await as('pm');
const oldIssue = {};
for (const pr of ['urgent', 'high', 'medium', 'low']) {
  oldIssue[pr] = (await q(`select create_issue($1,$2,$3,'',$4) r`, [POLD, await oldTypeId(POLD), 'cũ ' + pr, pr]))[0].r.id;
}
await q(`select update_issue($1, $2::jsonb, '')`, [oldIssue.medium, JSON.stringify({ priority: 'high' })]);
await q(`select update_issue($1, $2::jsonb, '')`, [oldIssue.medium, JSON.stringify({ priority: 'medium' })]);
await root();
ok('trước 0025 có nhật ký "Trung bình"', (await q(`select count(*)::int c from issue_journal_details where field='priority' and (old_value='Trung bình' or new_value='Trung bình')`))[0].c === 2);

await db.exec(fs.readFileSync(new URL('0025_issue_priorities.sql', MIG), 'utf8'));

// ---------- Nạp mặc định + chuyển dữ liệu ----------
const prios = async pid => asRoot(async () => q(`select id, name, color, is_active, is_default, sort from issue_priorities where project_id=$1 order by sort`, [pid]));
const prioId = async (pid, name) => (await prios(pid)).find(p => p.name === name).id;
for (const [label, pid] of [['dự án có sẵn trước 0025 (backfill)', POLD]]) {
  const c = await prios(pid);
  ok(`${label}: 4 mức Khẩn cấp, Cao, Vừa, Thấp theo thứ tự`, c.map(p => p.name).join('|') === 'Khẩn cấp|Cao|Vừa|Thấp', JSON.stringify(c));
  ok(`${label}: "Vừa" là mặc định, đủ 4 mức đang bật`, c.filter(p => p.is_default).length === 1 && c.find(p => p.is_default).name === 'Vừa' && c.every(p => p.is_active));
}
const P = await mkProject('P');
for (const r of ['ba', 'dev', 'tester', 'viewer']) await q(`insert into project_members (project_id,user_id,role) values ($1,$2,$3)`, [P, ids[r], r]);
ok('dự án mới được nạp 4 mức độ ưu tiên (trigger)', (await prios(P)).map(p => p.name).join('|') === 'Khẩn cấp|Cao|Vừa|Thấp');
await root();
{
  const rows = await q(`select i.title, p.name pn from issues i join issue_priorities p on p.id = i.priority_id where i.project_id = $1 order by i.title`, [POLD]);
  const map = Object.fromEntries(rows.map(r => [r.title, r.pn]));
  ok('issue cũ được chuyển đúng theo tên (urgent→Khẩn cấp, high→Cao, medium→Vừa, low→Thấp)', map['cũ urgent'] === 'Khẩn cấp' && map['cũ high'] === 'Cao' && map['cũ medium'] === 'Vừa' && map['cũ low'] === 'Thấp', JSON.stringify(map));
  ok('cột priority (chữ) đã bị bỏ', (await q(`select count(*)::int c from information_schema.columns where table_name='issues' and column_name='priority'`))[0].c === 0);
  ok('nhật ký cũ "Trung bình" đổi thành "Vừa"', (await q(`select count(*)::int c from issue_journal_details where field='priority' and (old_value='Trung bình' or new_value='Trung bình')`))[0].c === 0
    && (await q(`select count(*)::int c from issue_journal_details where field='priority' and (old_value='Vừa' or new_value='Vừa')`))[0].c === 2);
}

// ---------- Tạo / cập nhật issue ----------
const typeId = pid => asRoot(async () => (await q(`select id from issue_types where project_id=$1 and name='Bug'`, [pid]))[0].id);
const create = async (pid, title, prio = null) => (await q(`select create_issue($1,$2,$3,'',$4) r`, [pid, await typeId(pid), title, prio]))[0].r;
const prioOf = async id => asRoot(async () => (await q(`select p.name from issues i join issue_priorities p on p.id = i.priority_id where i.id=$1`, [id]))[0].name);
await as('dev');
const a = await create(P, 'Mặc định');
ok('tạo issue không chọn độ ưu tiên thì lấy mức mặc định "Vừa"', (await prioOf(a.id)) === 'Vừa');
const b = await create(P, 'Khẩn', await prioId(P, 'Khẩn cấp'));
ok('tạo issue với độ ưu tiên chọn sẵn', (await prioOf(b.id)) === 'Khẩn cấp');
await throws('độ ưu tiên của dự án khác bị từ chối', async () => create(P, 'x', await prioId(POLD, 'Cao')), 'không hợp lệ');
await throws('độ ưu tiên không tồn tại bị từ chối', () => create(P, 'x', '00000000-0000-0000-0000-000000000001'), 'không hợp lệ');
const r1 = (await q(`select update_issue($1,$2::jsonb,'') r`, [a.id, JSON.stringify({ priority_id: await prioId(P, 'Cao') })]))[0].r;
ok('đổi độ ưu tiên qua priority_id', (await prioOf(a.id)) === 'Cao' && r1.changed === 1);
ok('nhật ký ghi giá trị cũ → mới bằng tên mức', JSON.stringify(await asRoot(() => q(`select field, old_value, new_value from issue_journal_details where journal_id=$1`, [r1.journalId]))) === JSON.stringify([{ field: 'priority', old_value: 'Vừa', new_value: 'Cao' }]));
await throws('khóa "priority" kiểu cũ không còn được phép', () => q(`select update_issue($1,$2::jsonb,'')`, [a.id, JSON.stringify({ priority: 'high' })]), 'không được phép');
await throws('đổi sang mức của dự án khác bị từ chối', async () => q(`select update_issue($1,$2::jsonb,'')`, [a.id, JSON.stringify({ priority_id: await prioId(POLD, 'Thấp') })]), 'không hợp lệ');
await throws('priority_id null bị từ chối', () => q(`select update_issue($1,$2::jsonb,'')`, [a.id, JSON.stringify({ priority_id: null })]), 'không hợp lệ');
await as('viewer');
await throws('Quan sát không đổi được độ ưu tiên', async () => q(`select update_issue($1,$2::jsonb,'')`, [a.id, JSON.stringify({ priority_id: await prioId(P, 'Thấp') })]), '42501');

// ---------- Đọc (RLS) ----------
await as('viewer');
ok('thành viên (kể cả Quan sát) đọc được độ ưu tiên', (await q(`select count(*)::int c from issue_priorities where project_id=$1`, [P]))[0].c === 4);
await as('outsider');
ok('người ngoài dự án không đọc được', (await q(`select count(*)::int c from issue_priorities`))[0].c === 0);

// ---------- Cấu hình ----------
const items = async pid => (await prios(pid)).map(p => ({ id: p.id, name: p.name, color: p.color, active: p.is_active, default: p.is_default }));
const save = async (pid, list, del = []) => q(`select save_issue_priorities($1,$2::jsonb,$3::uuid[])`, [pid, JSON.stringify(list), del]);
await as('dev');
await throws('DEV không có quyền cấu hình độ ưu tiên', async () => save(P, await items(P)), '42501');
await as('pm');
{
  let l = await items(P);
  l.splice(2, 0, { name: 'Rất cao', color: 'purple', active: true, default: false });
  l = l.filter(x => x.name !== 'Thấp').concat([{ id: (await prioId(P, 'Thấp')), name: 'Thấp nhất', color: 'slate', active: true, default: false }]);
  await save(P, l);
  const c = await prios(P);
  ok('PM thêm mức, đổi tên, sắp xếp lại', c.map(p => p.name).join('|') === 'Khẩn cấp|Cao|Rất cao|Vừa|Thấp nhất', c.map(p => p.name).join('|'));
  ok('mức mặc định giữ nguyên "Vừa"', c.filter(p => p.is_default).length === 1 && c.find(p => p.is_default).name === 'Vừa');
}
{
  const l = await items(P);
  await throws('tên trùng nhau bị từ chối', () => save(P, l.map(x => (x.name === 'Cao' ? { ...x, name: 'khẩn cấp' } : x))), 'trùng');
  await throws('không có mức mặc định bị từ chối', () => save(P, l.map(x => ({ ...x, default: false }))), 'đúng một');
  await throws('hai mức mặc định bị từ chối', () => save(P, l.map(x => ({ ...x, default: x.name === 'Cao' || x.default }))), 'đúng một');
  await throws('mức mặc định bị ẩn bị từ chối', () => save(P, l.map(x => (x.default ? { ...x, active: false } : x))), 'đúng một');
  await throws('danh sách quá dài bị từ chối', () => save(P, Array.from({ length: 13 }, (_, n) => ({ name: 'm' + n, color: 'blue', active: true, default: n === 0 }))), 'tối đa 12');
  await throws('màu sai bị từ chối (ràng buộc)', () => save(P, l.map(x => (x.name === 'Cao' ? { ...x, color: 'pink' } : x))), 'check');
  await throws('mức của dự án khác không sửa được', async () => save(P, [{ ...(await items(POLD))[0] }, ...l]), 'không thuộc dự án');
}
{
  // đổi mặc định sang "Cao"; issue mới lấy mức đó
  const l = await items(P);
  await save(P, l.map(x => ({ ...x, default: x.name === 'Cao' })));
  const c = await create(P, 'Theo mặc định mới');
  ok('đổi mức mặc định sang "Cao": issue mới lấy mức này', (await prioOf(c.id)) === 'Cao');
}
{
  // ẩn một mức đang dùng: issue cũ vẫn giữ, issue mới không chọn được; xóa mức đang dùng bị chặn
  const l = await items(P);
  const hidden = await prioId(P, 'Khẩn cấp');
  await save(P, l.map(x => (x.id === hidden ? { ...x, active: false } : x)));
  ok('ẩn mức đang có issue dùng: issue cũ giữ nguyên', (await prioOf(b.id)) === 'Khẩn cấp');
  await throws('tạo issue mới với mức đã ẩn bị từ chối', () => create(P, 'x', hidden), 'đã bị ẩn');
  await throws('xóa mức đang có issue dùng bị chặn', async () => save(P, (await items(P)).filter(x => x.id !== hidden), [hidden]), 'đang có issue');
  const upd = await q(`select update_issue($1,$2::jsonb,'bình luận') r`, [b.id, JSON.stringify({})]).catch(e => e);
  ok('issue ở mức đã ẩn vẫn bình luận được', !(upd instanceof Error), upd.message);
  const unused = await prioId(P, 'Rất cao');
  await save(P, (await items(P)).filter(x => x.id !== unused), [unused]);
  ok('xóa mức chưa có issue dùng', !(await prios(P)).some(p => p.name === 'Rất cao'));
}
await as('viewer');
await throws('Quan sát không cấu hình được', async () => save(P, await items(P)), '42501');
await as('admin');
await q(`select set_role_permissions($1, $2::jsonb)`, [P, JSON.stringify([{ role: 'dev', permission: 'config_issue_types', allowed: true }])]);
await as('dev');
await save(P, await items(P));
ok('admin cấp quyền "Cấu hình loại issue" cho DEV thì DEV lưu được độ ưu tiên', true);
await as('admin');
await save(POLD, await items(POLD));
ok('admin cấu hình được ở mọi dự án', true);

// ---------- Hoàn tác 0025 ----------
await root();
await db.exec(fs.readFileSync(new URL('../rollback/0025_rollback.sql', import.meta.url), 'utf8'));
{
  ok('rollback 0025: bảng độ ưu tiên và hàm cấu hình biến mất', (await q(`select to_regclass('public.issue_priorities') t`))[0].t === null
    && (await q(`select count(*)::int c from pg_proc where proname in ('save_issue_priorities','seed_issue_priorities')`))[0].c === 0);
  const rows = await q(`select title, priority from issues where project_id = $1`, [POLD]);
  const map = Object.fromEntries(rows.map(r => [r.title, r.priority]));
  ok('rollback 0025: issue trở lại 4 mức chữ theo tên', map['cũ urgent'] === 'urgent' && map['cũ high'] === 'high' && map['cũ medium'] === 'medium' && map['cũ low'] === 'low', JSON.stringify(map));
  const prb = Object.fromEntries((await q(`select title, priority from issues where project_id = $1`, [P])).map(r => [r.title, r.priority]));
  ok('rollback 0025: mức tự đặt/mặc định gộp về medium, "Khẩn cấp" về urgent', prb['Khẩn'] === 'urgent' && prb['Mặc định'] === 'high' && prb['Theo mặc định mới'] === 'high', JSON.stringify(prb));
}
await as('dev');
{
  const t = await typeId(P);
  const n = (await q(`select create_issue($1,$2,$3,'',$4) r`, [P, t, 'sau rollback', 'urgent']))[0].r;
  ok('rollback 0025: create_issue kiểu cũ (priority chữ) chạy lại', n.number > 0);
  const u = (await q(`select update_issue($1,$2::jsonb,'') r`, [n.id, JSON.stringify({ priority: 'low' })]))[0].r;
  const d = await asRoot(() => q(`select old_value, new_value from issue_journal_details where journal_id=$1 and field='priority'`, [u.journalId]));
  ok('rollback 0025: update_issue kiểu cũ ghi nhật ký bằng tên mức cũ', d.length === 1 && d[0].old_value === 'Khẩn cấp' && d[0].new_value === 'Thấp', JSON.stringify(d));
}
await root();
await db.exec(fs.readFileSync(new URL('../rollback/0023_rollback.sql', import.meta.url), 'utf8'));
ok('rollback 0023 sau 0025 chạy được', (await q(`select to_regclass('public.issues') t`))[0].t === null);

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
