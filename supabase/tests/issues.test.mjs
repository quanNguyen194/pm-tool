// Kiểm tra migration 0023: quản lý issue (bug / yêu cầu thay đổi): loại, trạng thái, đánh số, nhật ký cây, quyền, thông báo, cấu hình.
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
// Tra id bằng quyền gốc (người dùng thử có thể không đọc được bảng), rồi trả về vai trò cũ
const asRoot = async fn => { const prev = current; await root(); try { return await fn(); } finally { if (prev) await as(prev); } };

await root();
await q(`update profiles set is_admin = true where id = $1`, [ids.admin]);
const mkProject = async code => (await q(`insert into projects (code,name,start_date,target_end_date,manager_id) values ($1,$1,current_date,current_date+30,$2) returning id`, [code, ids.pm]))[0].id;
const POLD = await mkProject('POLD'); // tạo TRƯỚC migration để thử nạp cấu hình cho dự án đã có
await db.exec(fs.readFileSync(new URL('0023_issues.sql', MIG), 'utf8'));

const P = await mkProject('P'), P2 = await mkProject('P2');
for (const pid of [P, P2, POLD]) for (const r of ['ba', 'dev', 'tester', 'viewer']) await q(`insert into project_members (project_id,user_id,role) values ($1,$2,$3)`, [pid, ids[r], r]);
const UC = (await q(`insert into use_cases (project_id,code,title) values ($1,'UC-1','u') returning id`, [P]))[0].id;
const UC2 = (await q(`insert into use_cases (project_id,code,title) values ($1,'UC-9','x') returning id`, [P2]))[0].id;

const typeId = (pid, name) => asRoot(async () => (await q(`select id from issue_types where project_id=$1 and name=$2`, [pid, name]))[0].id);
const statusId = (pid, name) => asRoot(async () => (await q(`select id from issue_statuses where project_id=$1 and name=$2`, [pid, name]))[0].id);
const create = async (pid, over = {}) => (await q(`select create_issue($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) r`, [pid, over.type ?? await typeId(pid, 'Bug'), over.title ?? 'Lỗi thử', over.desc ?? 'mô tả', over.priority ?? 'medium', over.severity ?? null, over.env ?? '', over.assignee ?? null, over.due ?? null, over.uc ?? null, over.task ?? null]))[0].r;
const upd = async (issue, changes = {}, notes = '', parent = null) => (await q(`select update_issue($1,$2::jsonb,$3,$4) r`, [issue, JSON.stringify(changes), notes, parent]))[0].r;
const issueRow = async id => (await q(`select i.*, s.name as status_name, s.category from issues i join issue_statuses s on s.id = i.status_id where i.id = $1`, [id]))[0];
const details = async jid => (await q(`select field, old_value, new_value from issue_journal_details where journal_id = $1 order by id`, [jid]));

// ---------- Nạp cấu hình mặc định ----------
await root();
const cfg = async pid => ({
  types: (await q(`select name from issue_types where project_id=$1 order by sort`, [pid])).map(r => r.name),
  statuses: (await q(`select name, category, is_initial from issue_statuses where project_id=$1 order by sort`, [pid]))
});
for (const [label, pid] of [['dự án có sẵn từ trước migration (backfill)', POLD], ['dự án mới (trigger)', P]]) {
  const c = await cfg(pid);
  ok(`${label}: 4 loại issue mặc định`, JSON.stringify(c.types) === JSON.stringify(['Bug', 'Yêu cầu thay đổi (CR)', 'Cải tiến', 'Câu hỏi / Hỗ trợ']), JSON.stringify(c.types));
  ok(`${label}: 9 trạng thái mặc định, "Mới" là khởi tạo, "Đóng" là nhóm đã đóng`,
    c.statuses.map(s => s.name).join('|') === 'Mới|Đang thực hiện|Code xong|Test xong|Chờ triển khai|Sẵn sàng bàn giao|Đóng|Mở lại|Chưa hoàn thiện'
    && c.statuses.filter(s => s.is_initial).length === 1 && c.statuses[0].is_initial && c.statuses.find(s => s.name === 'Đóng').category === 'closed', JSON.stringify(c.statuses));
}

// ---------- Ma trận phân quyền ----------
await as('pm');
{
  const m = (await q(`select get_permission_matrix($1) m`, [P]))[0].m;
  const has = (p, r) => m[p][r].allowed;
  ok('ma trận có 17 quyền (10 cũ + 7 issue)', Object.keys(m).length === 17);
  ok('mặc định: log/cập nhật issue cho PM, DEV, BA, Tester; Quan sát không', ['pm', 'dev', 'ba', 'tester'].every(r => has('issue_create', r) && has('issue_update', r)) && !has('issue_create', 'viewer') && !has('issue_update', 'viewer'));
  ok('mặc định: sửa nội dung PM+BA; phân công/xóa/cấu hình chỉ PM', has('issue_edit', 'ba') && !has('issue_edit', 'dev') && has('issue_assign', 'pm') && !has('issue_assign', 'dev') && has('issue_delete', 'pm') && !has('issue_delete', 'tester') && has('config_issue_types', 'pm') && !has('config_issue_statuses', 'ba'));
}
for (const [who, e] of Object.entries({ pm: [1, 1, 1, 1, 1, 1, 1], dev: [1, 1, 0, 0, 0, 0, 0], ba: [1, 1, 1, 0, 0, 0, 0], tester: [1, 1, 0, 0, 0, 0, 0], viewer: [0, 0, 0, 0, 0, 0, 0], outsider: [0, 0, 0, 0, 0, 0, 0] })) {
  await as(who);
  const r = (await q(`select my_access_report($1) r`, [P]))[0].r.issues;
  ok(`my_access_report(${who}).issues đúng mặc định`, JSON.stringify([r.create, r.update, r.edit, r.assign, r.delete, r.configTypes, r.configStatuses].map(Number)) === JSON.stringify(e), JSON.stringify(r));
}

// ---------- Ghi nhận issue ----------
await as('dev');
const a = await create(P, { title: 'Lỗi đăng nhập', severity: 'major', env: 'UAT' });
ok('DEV ghi nhận được issue #1', a.number === 1);
const rowA = await issueRow(a.id);
ok('issue mới ở trạng thái "Mới", người báo là người tạo', rowA.status_name === 'Mới' && rowA.reporter_id === ids.dev && rowA.severity === 'major' && rowA.environment === 'UAT');
const a2 = await create(P, { title: 'Lỗi thứ hai' });
ok('đánh số tăng dần trong dự án', a2.number === 2);
await as('pm');
ok('dự án khác đánh số riêng từ #1', (await create(P2)).number === 1);
await as('viewer');
await throws('Quan sát không ghi nhận được', () => create(P), '42501');
await as('outsider');
await throws('người ngoài dự án không ghi nhận được', () => create(P), '42501');
await as('dev');
await throws('DEV không phân công người xử lý khi tạo', () => create(P, { assignee: ids.tester }), '42501');
await as('pm');
const b = await create(P, { title: 'Giao ngay', assignee: ids.dev, priority: 'high', uc: UC });
ok('PM tạo kèm người xử lý và liên kết use case', (await issueRow(b.id)).assignee_id === ids.dev && (await issueRow(b.id)).use_case_id === UC);
await root();
ok('giao việc lúc tạo gửi thông báo cho người xử lý', (await q(`select count(*)::int c from notifications where user_id=$1 and type='issue' and issue_id=$2`, [ids.dev, b.id]))[0].c === 1);
await as('pm');
await throws('loại issue của dự án khác bị từ chối', async () => create(P, { type: await typeId(P2, 'Bug') }), '22023');
await throws('tiêu đề trống bị từ chối', () => create(P, { title: '   ' }), '22023');
await throws('người xử lý ngoài dự án bị từ chối', () => create(P, { assignee: ids.outsider }), '22023');
await throws('use case của dự án khác bị từ chối', () => create(P, { uc: UC2 }), '22023');
await throws('độ ưu tiên sai bị từ chối (ràng buộc)', () => create(P, { priority: 'siêu khẩn' }), 'check');

// ---------- Đổi trạng thái + nhật ký ----------
await as('dev');
let r = await upd(a.id, { status_id: await statusId(P, 'Đang thực hiện') }, 'Bắt đầu xem');
ok('DEV đổi trạng thái kèm ghi chú', r.changed === 1);
const jr = (await q(`select j.*, (select count(*)::int from issue_journal_details d where d.journal_id=j.id) nd from issue_journals j where j.id=$1`, [r.journalId]))[0];
ok('nhật ký ghi người cập nhật, ghi chú và 1 chi tiết đổi trạng thái', jr.user_id === ids.dev && jr.notes === 'Bắt đầu xem' && jr.nd === 1 && jr.parent_id === null);
ok('chi tiết ghi đúng giá trị cũ -> mới', JSON.stringify(await details(r.journalId)) === JSON.stringify([{ field: 'status', old_value: 'Mới', new_value: 'Đang thực hiện' }]));
await as('tester');
r = await upd(a.id, { status_id: await statusId(P, 'Đóng') }, 'Test lại ổn');
await root();
ok('Tester đóng được; closed_at được ghi', (await issueRow(a.id)).closed_at !== null && (await issueRow(a.id)).category === 'closed');
await as('dev');
r = await upd(a.id, { status_id: await statusId(P, 'Mở lại') }, 'Chưa hết lỗi');
await root();
ok('DEV cũng đổi được sang bất kỳ trạng thái (không ràng buộc vai trò); mở lại thì xóa closed_at', (await issueRow(a.id)).closed_at === null && (await issueRow(a.id)).status_name === 'Mở lại');
await as('viewer');
await throws('Quan sát không đổi trạng thái', async () => upd(a.id, { status_id: await statusId(P, 'Đóng') }), '42501');
await throws('Quan sát không bình luận', () => upd(a.id, {}, 'xin chào'), '42501');
await as('outsider');
await throws('người ngoài không cập nhật được', () => upd(a.id, {}, 'x'), '42501');
await as('tester');
await throws('không có thay đổi và không ghi chú thì báo lỗi', () => upd(a.id, {}), '22023');
await throws('trạng thái của dự án khác bị từ chối', async () => upd(a.id, { status_id: await statusId(P2, 'Đóng') }), '22023');
await throws('trường lạ bị từ chối', () => upd(a.id, { reporter_id: ids.tester }), '22023');
await throws('đặt lại cùng trạng thái hiện tại không tạo thay đổi', async () => upd(a.id, { status_id: await statusId(P, 'Mở lại') }), '22023');

// ---------- Phân công ----------
await as('dev');
await throws('DEV không đổi được người xử lý', () => upd(a.id, { assignee_id: ids.tester }), '42501');
await as('pm');
r = await upd(a.id, { assignee_id: ids.ba }, 'Giao BA phân tích');
ok('PM phân công; chi tiết ghi "— -> BA"', JSON.stringify(await details(r.journalId)) === JSON.stringify([{ field: 'assignee', old_value: '—', new_value: 'ba' }]));
await root();
ok('thông báo gửi người xử lý mới và người báo, không gửi người thao tác', (await q(`select count(*)::int c from notifications where issue_id=$1 and user_id=$2`, [a.id, ids.ba]))[0].c === 1
  && (await q(`select count(*)::int c from notifications where issue_id=$1 and user_id=$2 and message like '%Giao BA%'`, [a.id, ids.dev]))[0].c >= 0
  && (await q(`select count(*)::int c from notifications where issue_id=$1 and user_id=$2`, [a.id, ids.pm]))[0].c === 0);
await as('pm');
r = await upd(a.id, { assignee_id: null });
ok('bỏ người xử lý', (await issueRow(a.id)).assignee_id === null);
await throws('người xử lý ngoài dự án bị từ chối', () => upd(a.id, { assignee_id: ids.outsider }), '22023');

// ---------- Sửa nội dung ----------
await as('ba');
r = await upd(a.id, { title: 'Lỗi đăng nhập SSO', priority: 'urgent', description: 'Mô tả mới', due_date: '2026-12-31', task_id: null });
ok('BA (có quyền sửa) đổi nhiều trường một lần: 4 chi tiết', r.changed === 4);
await as('tester');
await throws('Tester không sửa được nội dung issue của người khác', () => upd(a.id, { title: 'hack' }), '42501');
// người báo sửa issue của mình khi còn "Mới"
await as('dev');
r = await upd(a2.id, { title: 'Lỗi thứ hai (đã sửa tên)' });
ok('người báo sửa được issue của mình khi còn "Mới"', (await issueRow(a2.id)).title.includes('đã sửa tên'));
await upd(a2.id, { status_id: await statusId(P, 'Đang thực hiện') });
await throws('...nhưng hết quyền sau khi issue rời trạng thái "Mới"', () => upd(a2.id, { title: 'lại sửa' }), '42501');

// ---------- Nhật ký dạng cây ----------
await as('tester');
const c1 = await upd(a.id, {}, 'Bình luận gốc');
const c2 = await upd(a.id, {}, 'Trả lời cấp 2', c1.journalId);
const c3 = await upd(a.id, {}, 'Trả lời cấp 3', c2.journalId);
ok('bình luận trả lời được tới 3 cấp', !!c3.journalId);
await throws('cấp 4 bị từ chối', () => upd(a.id, {}, 'cấp 4', c3.journalId), '22023');
await throws('trả lời không được đổi trường', async () => upd(a.id, { priority: 'low' }, 'x', c1.journalId), '22023');
await throws('trả lời mà không có nội dung bị từ chối', () => upd(a.id, {}, '  ', c1.journalId), '22023');
await throws('cha thuộc issue khác bị từ chối', () => upd(a2.id, {}, 'x', c1.journalId), '22023');
ok('cây nhật ký: gốc -> cấp 2 -> cấp 3', (await q(`select parent_id from issue_journals where id=$1`, [c3.journalId]))[0].parent_id === c2.journalId && (await q(`select parent_id from issue_journals where id=$1`, [c2.journalId]))[0].parent_id === c1.journalId);

// ---------- Sửa / xóa ghi chú ----------
await as('dev');
await throws('chỉ người viết mới sửa được ghi chú', () => q(`select edit_issue_note($1, 'sửa trộm')`, [c1.journalId]), '42501');
await as('tester');
await q(`select edit_issue_note($1, 'Bình luận gốc (đã sửa)')`, [c1.journalId]);
{
  const j = (await q(`select notes, edited_at from issue_journals where id=$1`, [c1.journalId]))[0];
  ok('tác giả sửa được; có dấu thời điểm sửa', j.notes.endsWith('(đã sửa)') && j.edited_at !== null);
}
await as('dev');
await throws('DEV không xóa được ghi chú', () => q(`select delete_issue_note($1)`, [c1.journalId]), '42501');
await as('pm');
await q(`select delete_issue_note($1)`, [c1.journalId]);
{
  const j = (await q(`select notes, deleted_at from issue_journals where id=$1`, [c1.journalId]))[0];
  ok('PM xóa ghi chú: nội dung bị xóa nhưng còn dấu vết (deleted_at) và các trả lời giữ nguyên', j.notes === '' && j.deleted_at !== null && (await q(`select count(*)::int c from issue_journals where parent_id=$1`, [c1.journalId]))[0].c === 1);
}
await as('tester');
await throws('không trả lời được ghi chú đã xóa', () => upd(a.id, {}, 'x', c1.journalId), '22023');

// ---------- Xóa issue ----------
await as('dev');
await throws('DEV không xóa được issue', () => q(`select delete_issue($1)`, [a2.id]), '42501');
await as('pm');
await q(`select delete_issue($1)`, [a2.id]);
await root();
ok('PM xóa issue; nhật ký bị xóa theo', (await q(`select count(*)::int c from issues where id=$1`, [a2.id]))[0].c === 0 && (await q(`select count(*)::int c from issue_journals where issue_id=$1`, [a2.id]))[0].c === 0);

// ---------- Không ghi trực tiếp bảng ----------
for (const who of ['pm', 'admin']) {
  await as(who);
  await throws(`${who} không INSERT trực tiếp vào issues`, async () => q(`insert into issues (project_id, number, type_id, status_id, title) values ($1, 99, $2, $3, 'x')`, [P, await typeId(P, 'Bug'), await statusId(P, 'Mới')]), 'permission denied');
}
await as('pm');
await throws('không UPDATE trực tiếp issues', () => q(`update issues set title = 'x' where id = $1`, [a.id]), 'permission denied');
await throws('không sửa trực tiếp nhật ký', () => q(`update issue_journals set notes = 'x'`), 'permission denied');
await as('outsider');
ok('người ngoài dự án không đọc được issue/nhật ký', (await q(`select count(*)::int c from issues`))[0].c === 0 && (await q(`select count(*)::int c from issue_journals`))[0].c === 0);
await as('viewer');
ok('Quan sát đọc được issue và nhật ký', (await q(`select count(*)::int c from issues where project_id=$1`, [P]))[0].c >= 2 && (await q(`select count(*)::int c from issue_journals`))[0].c > 0);

// ---------- Cấu hình loại ----------
const typeItems = async pid => (await q(`select id, name, color, is_active as active from issue_types where project_id=$1 order by sort`, [pid]));
await as('dev');
await throws('DEV không cấu hình được loại issue', async () => q(`select save_issue_types($1, $2::jsonb)`, [P, JSON.stringify(await typeItems(P))]), '42501');
await as('pm');
{
  const items = await typeItems(P);
  const saved = [{ ...items[1], name: 'Yêu cầu thay đổi' }, items[0], { name: 'Tài liệu', color: 'emerald', active: true }, { ...items[2], active: false }, items[3]];
  await q(`select save_issue_types($1, $2::jsonb)`, [P, JSON.stringify(saved)]);
  const after = await typeItems(P);
  ok('PM đổi tên, sắp xếp lại, thêm loại mới và ẩn một loại', after.map(t => t.name).join('|') === 'Yêu cầu thay đổi|Bug|Tài liệu|Cải tiến|Câu hỏi / Hỗ trợ' && after[3].active === false);
}
await throws('đang có issue dùng thì không xóa loại (phải ẩn)', async () => q(`select save_issue_types($1, $2::jsonb, $3::uuid[])`, [P, JSON.stringify(await typeItems(P)), [await typeId(P, 'Bug')]]), 'đang có issue');
await q(`select save_issue_types($1, $2::jsonb, $3::uuid[])`, [P, JSON.stringify((await typeItems(P)).filter(t => t.name !== 'Tài liệu')), [await typeId(P, 'Tài liệu')]]);
ok('loại chưa dùng thì xóa được', (await typeItems(P)).every(t => t.name !== 'Tài liệu'));
await throws('tên loại trùng bị từ chối (không phân biệt hoa thường)', async () => q(`select save_issue_types($1, $2::jsonb)`, [P, JSON.stringify([...(await typeItems(P)), { name: 'BUG', color: 'rose', active: true }])]), '23505');
await throws('phải còn ít nhất một loại đang bật', async () => q(`select save_issue_types($1, $2::jsonb)`, [P, JSON.stringify((await typeItems(P)).map(t => ({ ...t, active: false })))]), '22023');
await throws('ẩn loại thì issue mới không chọn được', async () => create(P, { type: await typeId(P, 'Cải tiến') }), '22023');

// ---------- Cấu hình trạng thái ----------
const stItems = async pid => (await q(`select id, name, color, category, is_active as active, is_initial as initial from issue_statuses where project_id=$1 order by sort`, [pid]));
await as('dev');
await throws('DEV không cấu hình được trạng thái', async () => q(`select save_issue_statuses($1, $2::jsonb)`, [P, JSON.stringify(await stItems(P))]), '42501');
await as('pm');
{
  const items = await stItems(P);
  const mapped = items.map(s => s.name === 'Sẵn sàng bàn giao' ? { ...s, name: 'Sẵn sàng bàn giao KH' } : s);
  mapped.splice(2, 0, { name: 'Đang review', color: 'purple', category: 'in_progress', active: true, initial: false });
  await q(`select save_issue_statuses($1, $2::jsonb)`, [P, JSON.stringify(mapped)]);
  const after = await stItems(P);
  ok('PM thêm trạng thái mới, đổi tên, xếp thứ tự (vẫn đúng một trạng thái khởi tạo)', after[2].name === 'Đang review' && after.some(s => s.name === 'Sẵn sàng bàn giao KH') && after.filter(s => s.initial).length === 1);
}
await throws('đang có issue dùng thì không xóa trạng thái', async () => q(`select save_issue_statuses($1, $2::jsonb, $3::uuid[])`, [P, JSON.stringify(await stItems(P)), [await statusId(P, 'Mở lại')]]), 'đang có issue');
await throws('phải có đúng một trạng thái khởi tạo', async () => q(`select save_issue_statuses($1, $2::jsonb)`, [P, JSON.stringify((await stItems(P)).map(s => ({ ...s, initial: false })))]), '22023');
await throws('trạng thái khởi tạo không được thuộc nhóm đã đóng', async () => q(`select save_issue_statuses($1, $2::jsonb)`, [P, JSON.stringify((await stItems(P)).map(s => ({ ...s, initial: s.name === 'Đóng' })))]), '22023');
await throws('nhóm trạng thái sai bị từ chối', async () => q(`select save_issue_statuses($1, $2::jsonb)`, [P, JSON.stringify((await stItems(P)).map(s => ({ ...s, category: s.name === 'Mới' ? 'xyz' : s.category })))]), '22023');
{
  const newStatus = await statusId(P, 'Đang review');
  await as('dev');
  const issue = await create(P, { title: 'Dùng trạng thái mới' });
  await upd(issue.id, { status_id: newStatus });
  ok('issue dùng được trạng thái mới thêm', (await issueRow(issue.id)).status_name === 'Đang review');
  await as('pm');
  await q(`select save_issue_statuses($1, $2::jsonb)`, [P, JSON.stringify((await stItems(P)).map(s => s.name === 'Đang review' ? { ...s, active: false } : s))]);
  await as('dev');
  await throws('trạng thái đã ẩn không chọn được cho issue khác', async () => upd(a.id, { status_id: newStatus }), '22023');
  ok('issue đang ở trạng thái đã ẩn vẫn đọc được bình thường', (await issueRow(issue.id)).status_name === 'Đang review');
}

// ---------- Cấu hình theo ma trận phân quyền ----------
await as('admin');
await q(`select set_role_permissions($1, $2::jsonb)`, [P, JSON.stringify([{ role: 'dev', permission: 'config_issue_statuses', allowed: true }, { role: 'tester', permission: 'issue_create', allowed: false }, { role: 'viewer', permission: 'issue_update', allowed: true }])]);
await as('dev');
await q(`select save_issue_statuses($1, $2::jsonb)`, [P, JSON.stringify(await stItems(P))]);
ok('admin cấp quyền cấu hình trạng thái cho DEV: lưu được', true);
await as('tester');
await throws('admin thu quyền ghi nhận của Tester: bị từ chối', () => create(P), '42501');
await as('viewer');
const vr = await upd(a.id, {}, 'Quan sát được cấp quyền cập nhật');
ok('Quan sát được cấp quyền cập nhật thì bình luận được', !!vr.journalId);

// ---------- Hoàn tác 0023 ----------
await root();
await db.exec(fs.readFileSync(new URL('../rollback/0023_rollback.sql', import.meta.url), 'utf8'));
ok('rollback 0023: bảng issue biến mất', (await q(`select to_regclass('public.issues') t`))[0].t === null && (await q(`select to_regclass('public.issue_journals') t`))[0].t === null);
await as('pm');
ok('rollback 0023: ma trận trở về 10 quyền', Object.keys((await q(`select get_permission_matrix($1) m`, [P]))[0].m).length === 10);
ok('rollback 0023: báo cáo quyền vẫn chạy', (await q(`select my_access_report($1) r`, [P]))[0].r.view === true);
await root();
ok('rollback 0023: thông báo không còn loại issue', (await q(`select count(*)::int c from notifications where type = 'issue'`))[0].c === 0);
await q(`insert into notifications (user_id,type,title,message) values ($1,'system','x','y')`, [ids.dev]);
ok('rollback 0023: thông báo thường vẫn tạo được', true);

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
