// Kiểm tra migration 0024: ảnh / video đính kèm issue (kho tệp riêng tư, chính sách storage.objects, đăng ký tệp, xóa tệp, dung lượng).
// Supabase Storage được giả lập bằng hai bảng storage.buckets / storage.objects (có RLS) giống cấu trúc thật.
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import crypto from 'node:crypto';

const MIG = new URL('../migrations/', import.meta.url);
const BEFORE = ['0001_schema.sql', '0002_quality_template.sql', '0003_rpc_and_seed.sql', '0004_criteria_insert_guard.sql', '0005_deadlines_and_snapshots.sql', '0007_report_schedules.sql', '0008_roles_usecase_tree_task_fields.sql', '0009_usecase_attributes.sql', '0010_usecase_stages.sql', '0011_usecase_origin.sql', '0012_task_use_cases.sql', '0013_placeholder_accounts.sql', '0014_telegram_notify.sql', '0018_fix_null_permission_checks.sql', '0020_stage_order.sql', '0021_permission_config.sql', '0022_quality_items_edit.sql', '0023_issues.sql'];

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
  -- Giả lập Supabase Storage
  create schema storage;
  create table storage.buckets (id text primary key, name text not null, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id), name text, owner uuid, owner_id text, metadata jsonb, created_at timestamptz default now());
  alter table storage.objects enable row level security;
  grant usage on schema storage to anon, authenticated;
  grant select, insert, update, delete on storage.objects to authenticated;
  grant select on storage.buckets to authenticated;
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
for (const k of ['admin', 'pm', 'ba', 'dev', 'tester', 'viewer', 'outsider', 'other']) {
  ids[k] = (await q(`insert into auth.users (email, raw_user_meta_data) values ($1, $2::jsonb) returning id`, [`${k}@t.vn`, JSON.stringify({ name: k })]))[0].id;
}
let current = null;
const as = async who => { current = who; await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${ids[who]}', false); set role authenticated;`); };
const root = async () => { current = null; await db.exec(`reset role; select set_config('request.jwt.claim.sub','',false);`); };
const asRoot = async fn => { const prev = current; await root(); try { return await fn(); } finally { if (prev) await as(prev); } };

await root();
await q(`update profiles set is_admin = true where id = $1`, [ids.admin]);
const mkProject = async code => (await q(`insert into projects (code,name,start_date,target_end_date,manager_id) values ($1,$1,current_date,current_date+30,$2) returning id`, [code, ids.pm]))[0].id;
const P = await mkProject('P'), P2 = await mkProject('P2');
for (const pid of [P, P2]) for (const r of ['ba', 'dev', 'tester', 'viewer']) if (!(pid === P2 && r === 'dev')) await q(`insert into project_members (project_id,user_id,role) values ($1,$2,$3)`, [pid, ids[r], r]);
await q(`insert into project_members (project_id,user_id,role) values ($1,$2,'dev')`, [P2, ids.other]);

const typeId = (pid, name) => asRoot(async () => (await q(`select id from issue_types where project_id=$1 and name=$2`, [pid, name]))[0].id);
const statusId = (pid, name) => asRoot(async () => (await q(`select id from issue_statuses where project_id=$1 and name=$2`, [pid, name]))[0].id);
const create = async (pid, title = 'Lỗi thử') => (await q(`select create_issue($1,$2,$3) r`, [pid, await typeId(pid, 'Bug'), title]))[0].r;
const upd = async (issue, changes = {}, notes = '') => (await q(`select update_issue($1,$2::jsonb,$3) r`, [issue, JSON.stringify(changes), notes]))[0].r;

await db.exec(fs.readFileSync(new URL('0024_issue_attachments.sql', MIG), 'utf8'));

// Tải một đối tượng lên Storage như người dùng hiện tại (ứng dụng gọi API Storage, API chèn dòng này bằng JWT người dùng)
const MB = 1024 * 1024;
const objPath = (pid, iid, ext = 'png', aid = crypto.randomUUID()) => ({ aid, path: `${pid}/${iid}/${aid}.${ext}` });
const upload = async (path, { mime = 'image/png', size = 1000, owner } = {}) =>
  q(`insert into storage.objects (bucket_id, name, owner_id, metadata) values ('issue-attachments', $1, coalesce($3, auth.uid()::text), $2::jsonb) returning name`,
    [path, JSON.stringify({ mimetype: mime, size }), owner ?? null]);
const attach = async (issue, items, journal = null, log = true) => (await q(`select add_issue_attachments($1,$2::jsonb,$3,$4) r`, [issue, JSON.stringify(items), journal, log]))[0].r;
const count = async iid => asRoot(async () => (await q(`select count(*)::int c from issue_attachments where issue_id=$1`, [iid]))[0].c);

// ---------- Cấu hình kho tệp ----------
await root();
{
  const b = (await q(`select * from storage.buckets where id = 'issue-attachments'`))[0];
  ok('bucket issue-attachments tồn tại và là riêng tư', !!b && b.public === false);
  ok('bucket giới hạn 45 MB / tệp', Number(b.file_size_limit) === 45 * MB);
  ok('bucket chỉ cho ảnh jpeg/png/gif/webp và video mp4/webm/mov; không có SVG',
    JSON.stringify([...b.allowed_mime_types].sort()) === JSON.stringify(['image/gif', 'image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime', 'video/webm'].sort())
    && !b.allowed_mime_types.some(m => m.includes('svg')), JSON.stringify(b.allowed_mime_types));
}

// ---------- Tải lên (chính sách insert) ----------
await as('dev');
const a = await create(P, 'Lỗi có ảnh');
await as('pm');
const b = await create(P, 'Lỗi của PM');
await as('other');
const c = await create(P2, 'Lỗi dự án khác');

await as('dev');
{
  const f = objPath(P, a.id);
  await upload(f.path);
  ok('người báo (đang ở trạng thái khởi tạo) tải được ảnh lên issue của mình', true);
  await throws('tên đối tượng sai định dạng bị chặn', () => upload(`${P}/${a.id}/anh.png`), 'row-level');
  await throws('đuôi .svg bị chặn', () => upload(objPath(P, a.id, 'svg').path), 'row-level');
  await throws('đuôi .html bị chặn', () => upload(objPath(P, a.id, 'html').path), 'row-level');
  await throws('đường dẫn trỏ sai dự án (issue không thuộc dự án trong đường dẫn) bị chặn', () => upload(objPath(P2, a.id).path), 'row-level');
  await throws('đường dẫn trỏ issue không tồn tại bị chặn', () => upload(objPath(P, crypto.randomUUID()).path), 'row-level');
}
await as('viewer');
await throws('Quan sát không tải lên được', () => upload(objPath(P, a.id).path), 'row-level');
await as('outsider');
await throws('người ngoài dự án không tải lên được', () => upload(objPath(P, a.id).path), 'row-level');
await as('other');
await throws('thành viên dự án khác không tải lên issue của dự án này', () => upload(objPath(P, a.id).path), 'row-level');
await as('tester');
await upload(objPath(P, b.id).path);
ok('Tester (có quyền cập nhật) tải được lên issue của người khác', true);

// ---------- Đọc (chính sách select) ----------
await as('ba');
ok('thành viên dự án thấy đối tượng', (await q(`select count(*)::int c from storage.objects where bucket_id='issue-attachments'`))[0].c === 2);
await as('outsider');
ok('người ngoài dự án không thấy đối tượng nào', (await q(`select count(*)::int c from storage.objects where bucket_id='issue-attachments'`))[0].c === 0);
await as('other');
ok('thành viên dự án khác không thấy tệp của dự án này', (await q(`select count(*)::int c from storage.objects where bucket_id='issue-attachments'`))[0].c === 0);
await as('admin');
ok('admin thấy tất cả', (await q(`select count(*)::int c from storage.objects where bucket_id='issue-attachments'`))[0].c === 2);

// ---------- Đăng ký tệp ----------
await root();
await q(`delete from storage.objects`);
await as('dev');
const f1 = objPath(P, a.id, 'png'); await upload(f1.path, { size: 2 * MB });
let r = await attach(a.id, [{ id: f1.aid, name: 'loi-man-hinh.png' }]);
{
  await root();
  const row = (await q(`select * from issue_attachments where id=$1`, [f1.aid]))[0];
  ok('đăng ký tệp: lưu tên, loại, dung lượng THẬT lấy từ Storage', row.file_name === 'loi-man-hinh.png' && row.kind === 'image' && Number(row.size_bytes) === 2 * MB && row.storage_path === f1.path && row.uploader_id === ids.dev && row.project_id === P);
  const jr = (await q(`select j.user_id, j.notes, d.field, d.new_value from issue_journals j join issue_journal_details d on d.journal_id=j.id where j.id=$1`, [r.journalId]))[0];
  ok('ghi một dòng nhật ký "attachment" kèm tên tệp', jr.user_id === ids.dev && jr.field === 'attachment' && jr.new_value === 'loi-man-hinh.png');
  ok('đăng ký gửi thông báo cho người liên quan (không tự báo cho mình)', (await q(`select count(*)::int c from notifications where issue_id=$1 and user_id=$2`, [a.id, ids.dev]))[0].c === 0);
}
await as('dev');
{
  const f = objPath(P, a.id, 'mp4'); await upload(f.path, { mime: 'video/mp4', size: 40 * MB });
  await attach(a.id, [{ id: f.aid, name: 'tai-hien.mp4' }], null, false);
  ok('video 40 MB đăng ký được; p_log=false không tạo thêm dòng nhật ký', (await count(a.id)) === 2 && (await asRoot(async () => (await q(`select count(*)::int c from issue_journals where issue_id=$1`, [a.id]))[0].c)) === 1);
}
await as('dev');
{
  const f = objPath(P, a.id); await upload(f.path, { size: 6 * MB });
  await throws('ảnh trên 5 MB bị từ chối', () => attach(a.id, [{ id: f.aid, name: 'to.png' }]), '5 MB');
  const g = objPath(P, a.id, 'mp4'); await upload(g.path, { mime: 'video/mp4', size: 46 * MB });
  await throws('video trên 45 MB bị từ chối', () => attach(a.id, [{ id: g.aid, name: 'dai.mp4' }]), '45 MB');
  const h = objPath(P, a.id, 'png'); await upload(h.path, { mime: 'image/svg+xml', size: 100 });
  await throws('loại nội dung svg (dù đuôi png) bị từ chối', () => attach(a.id, [{ id: h.aid, name: 'x.png' }]), 'không được hỗ trợ');
  const k = objPath(P, a.id, 'jpg'); await upload(k.path, { mime: 'image/png', size: 100 });
  await throws('đuôi không khớp loại nội dung bị từ chối', () => attach(a.id, [{ id: k.aid, name: 'x.jpg' }]), 'không khớp');
  const z = objPath(P, a.id); await upload(z.path, { size: 0 });
  await throws('tệp rỗng bị từ chối', () => attach(a.id, [{ id: z.aid, name: 'rong.png' }]), 'rỗng');
  await throws('đăng ký tệp chưa tải lên bị từ chối', () => attach(a.id, [{ id: crypto.randomUUID(), name: 'ma.png' }]), 'chưa được tải lên');
  await throws('mã tệp sai định dạng bị từ chối', () => attach(a.id, [{ id: 'abc', name: 'ma.png' }]), 'Mã tệp');
  await throws('danh sách rỗng bị từ chối', () => attach(a.id, []), 'Chưa có tệp');
  await throws('đăng ký lại cùng một tệp bị từ chối', () => attach(a.id, [{ id: f1.aid, name: 'lai.png' }]), 'đã được đăng ký');
}
await as('tester');
{
  // Đối tượng do người khác tải lên không đăng ký hộ được
  const f = objPath(P, a.id); await asRoot(() => upload(f.path, { owner: ids.dev }));
  await throws('không đăng ký được tệp do người khác tải lên', () => attach(a.id, [{ id: f.aid, name: 'cuaDEV.png' }]), '42501');
}
await as('viewer');
{
  const f = objPath(P, a.id);
  await asRoot(() => upload(f.path, { owner: ids.viewer }));
  await throws('Quan sát không đăng ký được tệp', () => attach(a.id, [{ id: f.aid, name: 'q.png' }]), '42501');
}
await as('outsider');
await throws('người ngoài dự án không đăng ký được', () => attach(a.id, [{ id: crypto.randomUUID(), name: 'q.png' }]), '42501');
await as('other');
await throws('người dự án khác không đăng ký được vào issue này', () => attach(a.id, [{ id: crypto.randomUUID(), name: 'q.png' }]), '42501');

// Giới hạn 10 tệp / issue
await as('pm');
{
  const items = [];
  for (let n = 0; n < 8; n++) { const f = objPath(P, b.id); await upload(f.path, { size: 1000 }); items.push({ id: f.aid, name: `a${n}.png` }); }
  await attach(b.id, items);
  ok('đăng ký 8 tệp một lần', (await count(b.id)) === 8);
  const more = [];
  for (let n = 0; n < 3; n++) { const f = objPath(P, b.id); await upload(f.path, { size: 1000 }); more.push({ id: f.aid, name: `b${n}.png` }); }
  await throws('vượt 10 tệp / issue bị từ chối (cả lô không được ghi)', () => attach(b.id, more), 'tối đa 10');
  ok('lô bị từ chối không để lại tệp nào', (await count(b.id)) === 8);
  const two = more.slice(0, 2);
  await attach(b.id, two);
  ok('đủ đúng 10 tệp thì được', (await count(b.id)) === 10);
}

// Gắn vào dòng nhật ký do update_issue tạo
await as('dev');
{
  const u = await upd(a.id, { status_id: await statusId(P, 'Đang thực hiện') }, 'Đã sửa, ảnh minh chứng');
  const f = objPath(P, a.id); await upload(f.path);
  await attach(a.id, [{ id: f.aid, name: 'minh-chung.png' }], u.journalId);
  await root();
  const row = (await q(`select journal_id from issue_attachments where id=$1`, [f.aid]))[0];
  const dj = (await q(`select count(*)::int c from issue_journal_details where journal_id=$1 and field='attachment'`, [u.journalId]))[0].c;
  ok('tệp gắn đúng dòng nhật ký của lần cập nhật; không tạo dòng nhật ký thứ hai', row.journal_id === u.journalId && dj === 1);
  await as('tester');
  const g = objPath(P, a.id); await upload(g.path);
  await throws('không gắn được vào dòng nhật ký của người khác', () => attach(a.id, [{ id: g.aid, name: 'x.png' }], u.journalId), 'nhật ký không hợp lệ');
}

// Người báo mất quyền khi issue không còn ở trạng thái khởi tạo (nếu không còn quyền cập nhật)
await as('admin');
await q(`select set_role_permissions($1, $2::jsonb)`, [P, JSON.stringify([{ role: 'tester', permission: 'issue_update', allowed: false }])]);
await as('tester');
const t1 = await create(P, 'Tester báo');
{
  const f = objPath(P, t1.id); await upload(f.path);
  await attach(t1.id, [{ id: f.aid, name: 'tester.png' }]);
  ok('người báo (chỉ có quyền ghi nhận) đính kèm được khi issue còn ở trạng thái khởi tạo', (await count(t1.id)) === 1);
}
await as('pm');
await upd(t1.id, { status_id: await statusId(P, 'Đang thực hiện') }, 'đang xử lý');
await as('tester');
{
  await throws('hết trạng thái khởi tạo thì người báo không còn tải lên được', () => upload(objPath(P, t1.id).path), 'row-level');
  const f = objPath(P, t1.id);
  await throws('...và không đăng ký thêm được', () => attach(t1.id, [{ id: f.aid, name: 'x.png' }]), '42501');
}

// ---------- Xóa tệp ----------
await as('ba');
await throws('BA (không phải người tải, không có quyền xóa) không xóa được tệp của DEV', () => q(`select delete_issue_attachment($1)`, [f1.aid]), '42501');
await as('dev');
{
  const path = (await q(`select delete_issue_attachment($1) p`, [f1.aid]))[0].p;
  ok('người tải lên xóa được tệp của mình; hàm trả về đường dẫn để xóa khỏi Storage', path === f1.path);
  await root();
  ok('bản ghi đăng ký đã mất, có dòng nhật ký "đã xóa tệp"', (await q(`select count(*)::int c from issue_attachments where id=$1`, [f1.aid]))[0].c === 0
    && (await q(`select count(*)::int c from issue_journal_details where field='attachment' and old_value='loi-man-hinh.png' and new_value is null`))[0].c === 1);
  await as('dev');
  await q(`delete from storage.objects where bucket_id='issue-attachments' and name=$1`, [path]);
  await root();
  ok('sau khi bỏ đăng ký, người tải xóa được đối tượng trong Storage', (await q(`select count(*)::int c from storage.objects where name=$1`, [path]))[0].c === 0);
}
await as('dev');
{
  const reg = (await asRoot(async () => (await q(`select storage_path p from issue_attachments where issue_id=$1 limit 1`, [a.id]))[0])).p;
  const del = await q(`delete from storage.objects where name=$1 returning name`, [reg]);
  ok('đối tượng còn đăng ký thì không xóa trực tiếp được trong Storage', del.length === 0);
}
await as('pm');
{
  const p = (await q(`select delete_issue_attachment(id) p from issue_attachments where issue_id=$1 limit 1`, [b.id]))[0].p;
  ok('PM (quyền xóa issue) xóa được tệp của người khác', !!p);
  const del = await q(`delete from storage.objects where name=$1 returning name`, [p]);
  ok('PM xóa được đối tượng Storage của tệp đã bỏ đăng ký (dù không phải người tải)', del.length === 1);
}
await as('viewer');
await throws('Quan sát không xóa được tệp', () => q(`select delete_issue_attachment(id) from issue_attachments limit 1`), '42501');

// ---------- Dung lượng ----------
await as('pm');
{
  const u = (await q(`select issue_attachment_usage($1) u`, [P]))[0].u;
  ok('thống kê dung lượng của dự án có số tệp và số byte', u.projectCount > 0 && Number(u.projectBytes) > 0 && u.capBytes === 900 * MB, JSON.stringify(u));
  ok('PM không thấy tổng dung lượng toàn hệ thống', u.totalBytes === null);
}
await as('admin');
{
  const u = (await q(`select issue_attachment_usage($1) u`, [P]))[0].u;
  ok('admin thấy tổng dung lượng toàn hệ thống', u.totalBytes !== null && Number(u.totalBytes) >= Number(u.projectBytes));
}
await as('outsider');
await throws('người ngoài không xem được thống kê', () => q(`select issue_attachment_usage($1)`, [P]), '42501');

// Giới hạn mềm tổng dung lượng
await root();
await q(`insert into issue_attachments (id, project_id, issue_id, file_name, mime_type, size_bytes, kind, storage_path)
         values (gen_random_uuid(), $1, $2, 'fake.mp4', 'video/mp4', $3, 'video', 'fake/path.mp4')`, [P, t1.id, 899 * MB]);
await as('pm');
{
  const f = objPath(P, a.id, 'mp4'); await upload(f.path, { mime: 'video/mp4', size: 10 * MB });
  await throws('vượt giới hạn mềm 900 MB toàn kho bị từ chối', () => attach(a.id, [{ id: f.aid, name: 'day.mp4' }]), '900 MB');
}
await root();
await q(`delete from issue_attachments where storage_path = 'fake/path.mp4'`);

// ---------- Xóa issue kéo theo bản ghi tệp ----------
await as('pm');
{
  const before = await count(a.id);
  await q(`select delete_issue($1)`, [a.id]);
  ok(`xóa issue xóa luôn bản ghi tệp đính kèm (trước đó có ${before})`, before > 0 && (await count(a.id)) === 0);
}

// ---------- Hoàn tác 0024 rồi 0023 ----------
await root();
await db.exec(fs.readFileSync(new URL('../rollback/0024_rollback.sql', import.meta.url), 'utf8'));
ok('rollback 0024: bảng và hàm đính kèm biến mất', (await q(`select to_regclass('public.issue_attachments') t`))[0].t === null
  && (await q(`select count(*)::int c from pg_proc where proname in ('add_issue_attachments','delete_issue_attachment','issue_attachment_usage','can_attach_issue','_att_upload_ok','_att_uuid')`))[0].c === 0);
ok('rollback 0024: chính sách storage.objects biến mất', (await q(`select count(*)::int c from pg_policies where schemaname='storage' and policyname like 'issue_att_%'`))[0].c === 0);
ok('rollback 0024: không còn dòng nhật ký "attachment"', (await q(`select count(*)::int c from issue_journal_details where field='attachment'`))[0].c === 0);
ok('rollback 0024: issue và nhật ký khác còn nguyên', (await q(`select count(*)::int c from issues`))[0].c > 0);
await db.exec(fs.readFileSync(new URL('../rollback/0023_rollback.sql', import.meta.url), 'utf8'));
ok('rollback 0023 sau 0024 chạy được', (await q(`select to_regclass('public.issues') t`))[0].t === null);

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
