// Kiểm tra migration 0026: link trong tin Telegram (thông báo + bản tóm tắt hằng ngày), địa chỉ gốc, mã cũ của dự án, hoàn tác.
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';

const MIG = new URL('../migrations/', import.meta.url);
const FILES = ['0001_schema.sql', '0002_quality_template.sql', '0003_rpc_and_seed.sql', '0004_criteria_insert_guard.sql', '0005_deadlines_and_snapshots.sql', '0007_report_schedules.sql', '0008_roles_usecase_tree_task_fields.sql', '0009_usecase_attributes.sql', '0010_usecase_stages.sql', '0011_usecase_origin.sql', '0012_task_use_cases.sql', '0013_placeholder_accounts.sql', '0014_telegram_notify.sql', '0015_telegram_timeout.sql', '0016_reminder_feedback.sql', '0017_daily_digest.sql', '0018_fix_null_permission_checks.sql', '0020_stage_order.sql', '0021_permission_config.sql', '0022_quality_items_edit.sql', '0023_issues.sql'];

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
  create schema net;
  create table net.calls (id bigserial primary key, url text, body jsonb, timeout_ms int);
  create table net._http_response (id bigint primary key, status_code int, content text, timed_out boolean, error_msg text);
  create function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000)
  returns bigint language plpgsql as $$
  declare rid bigint;
  begin
    insert into net.calls (url, body, timeout_ms) values (url, body, timeout_milliseconds) returning id into rid;
    return rid;
  end $$;
  create schema vault;
  create table vault.decrypted_secrets (name text, decrypted_secret text);
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
for (const k of ['admin', 'pm', 'dev', 'dev2', 'outsider']) {
  ids[k] = (await q(`insert into auth.users (email, raw_user_meta_data) values ($1, $2::jsonb) returning id`, [`${k}@t.vn`, JSON.stringify({ name: k })]))[0].id;
}
const as = async who => { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${who ? ids[who] : ''}', false); set role ${who ? 'authenticated' : 'anon'};`); };
const root = async () => { await db.exec(`reset role; select set_config('request.jwt.claim.sub','',false);`); };
const calls = async () => { await root(); return q(`select body from net.calls order by id`); };
const clearCalls = async () => { await root(); await db.exec(`delete from net.calls`); };
const texts = async () => (await calls()).map(c => c.body.text);

await root();
await q(`update profiles set is_admin = true where id = $1`, [ids.admin]);
await q(`insert into vault.decrypted_secrets values ('telegram_bot_token','TOK')`);
const today = `(now() at time zone 'Asia/Ho_Chi_Minh')::date`;
const P = (await q(`insert into projects (code,name,start_date,target_end_date,manager_id) values ('TG','Dự án TG',current_date-10,current_date+30,$1) returning id`, [ids.pm]))[0].id;
const T1 = (await q(`insert into tasks (project_id,code,title,start_date,due_date,assignee_id) values ($1,'TG-1','Việc quá hạn',current_date-9,${today}-3,$2) returning id`, [P, ids.dev]))[0].id;
for (const [pid, u, r] of [[P, ids.dev, 'dev'], [P, ids.dev2, 'dev']]) await q(`insert into project_members (project_id,user_id,role) values ($1,$2,$3)`, [pid, u, r]);
await q(`insert into telegram_links (user_id, chat_id) values ($1,'111111'), ($2,'222222')`, [ids.dev, ids.dev2]);

// ---------- Trước 0026: tin không có link ----------
await clearCalls();
await q(`insert into notifications (user_id,project_id,type,title,message,task_id) values ($1,$2,'overdue','Quá hạn: TG-1','Việc quá hạn!',$3)`, [ids.dev, P, T1]);
ok('trước 0026: tin Telegram chưa có dòng link', (await texts()).length === 1 && !(await texts())[0].includes('🔗'));

await db.exec(fs.readFileSync(new URL('0026_telegram_links.sql', MIG), 'utf8'));

// ---------- Địa chỉ gốc và dựng link ----------
await root();
ok('có sẵn địa chỉ gốc mặc định', (await q(`select value from app_settings where key='base_url'`))[0].value === 'https://pm-tool.quan-ntm194.workers.dev');
const link = async (pid, kind, code) => { await root(); return (await q(`select app_link($1,$2,$3) l`, [pid, kind, code ?? null]))[0].l; };
const B = 'https://pm-tool.quan-ntm194.workers.dev';
ok('link dự án', (await link(P, 'project')) === `${B}/p/TG`);
ok('link nhiệm vụ theo mã', (await link(P, 'tasks', 'TG-1')) === `${B}/p/TG/tasks/TG-1`);
ok('link danh sách nhiệm vụ (không mã)', (await link(P, 'tasks')) === `${B}/p/TG/tasks`);
ok('link issue theo số, use case, quality', (await link(P, 'issues', '12')) === `${B}/p/TG/issues/12` && (await link(P, 'usecases', 'UC-1')) === `${B}/p/TG/usecases/UC-1` && (await link(P, 'quality', 'x')) === `${B}/p/TG/quality`);
ok('loại lạ trả null; dự án không có trả null', (await link(P, 'khac')) === null && (await link('00000000-0000-0000-0000-000000000001', 'project')) === null);
{
  const P3 = (await q(`insert into projects (code,name,start_date,target_end_date,manager_id) values ('Dự án/1 ĐÂ','x',current_date,current_date+5,$1) returning id`, [ids.pm]))[0].id;
  ok('mã có ký tự đặc biệt được mã hóa phần trăm (UTF-8)', (await link(P3, 'tasks', 'A B/1')) === `${B}/p/D%E1%BB%B1%20%C3%A1n%2F1%20%C4%90%C3%82/tasks/A%20B%2F1`, await link(P3, 'tasks', 'A B/1'));
  await q(`delete from projects where id=$1`, [P3]);
}
await as('dev');
await throws('DEV không đổi được địa chỉ gốc', () => q(`select set_app_base_url('https://x.vn')`), '42501');
await throws('người dùng không đọc trực tiếp app_settings', () => q(`select * from app_settings`), 'permission denied');
await as('admin');
await throws('địa chỉ gốc sai định dạng bị từ chối', () => q(`select set_app_base_url('pm-tool.vn/abc')`), '22023');
await throws('địa chỉ gốc có đường dẫn bị từ chối', () => q(`select set_app_base_url('https://pm.vn/app')`), '22023');
await q(`select set_app_base_url('https://pm.example.vn/')`);
ok('admin đổi địa chỉ gốc (bỏ dấu / cuối)', (await link(P, 'project')) === 'https://pm.example.vn/p/TG');
await root();
await q(`select set_app_base_url('${B}')`);
ok('chạy SQL Editor (không có người dùng) đổi được địa chỉ gốc', (await link(P, 'project')) === `${B}/p/TG`);

// ---------- Tin Telegram theo thông báo có link ----------
await clearCalls();
await q(`insert into notifications (user_id,project_id,type,title,message,task_id) values ($1,$2,'overdue','Quá hạn: TG-1','Việc quá hạn!',$3)`, [ids.dev, P, T1]);
let t = await texts();
ok('thông báo nhiệm vụ: tin có dòng 🔗 tới đúng nhiệm vụ', t.length === 1 && t[0].endsWith(`\n🔗 ${B}/p/TG/tasks/TG-1`) && t[0].includes('Dự án: TG'), JSON.stringify(t));
await clearCalls();
{
  const ty = (await q(`select id from issue_types where project_id=$1 limit 1`, [P]))[0].id;
  const st = (await q(`select id from issue_statuses where project_id=$1 and is_initial`, [P]))[0].id;
  const iss = (await q(`insert into issues (project_id, number, type_id, status_id, title, priority) values ($1, 7, $2, $3, 'Lỗi thử', 'medium') returning id`, [P, ty, st]))[0].id;
  await q(`insert into notifications (user_id,project_id,type,title,message,issue_id) values ($1,$2,'issue','Issue #7','x',$3)`, [ids.dev, P, iss]);
  t = await texts();
  ok('thông báo issue: link tới /issues/<số>', t.length === 1 && t[0].endsWith(`🔗 ${B}/p/TG/issues/7`), JSON.stringify(t));
}
await clearCalls();
await q(`insert into notifications (user_id,project_id,type,title,message) values ($1,$2,'quality_alert','Cảnh báo chất lượng','x')`, [ids.dev, P]);
t = await texts();
ok('cảnh báo chất lượng: link tới /quality', t.length === 1 && t[0].endsWith(`🔗 ${B}/p/TG/quality`), JSON.stringify(t));
await clearCalls();
await q(`insert into notifications (user_id,type,title,message) values ($1,'system','Hệ thống','không thuộc dự án nào')`, [ids.dev]);
t = await texts();
ok('thông báo không thuộc dự án: không có link', t.length === 1 && !t[0].includes('🔗'), JSON.stringify(t));
await clearCalls();
await q(`delete from app_settings where key='base_url'`);
await q(`insert into notifications (user_id,project_id,type,title,message,task_id) values ($1,$2,'overdue','Quá hạn','x',$3)`, [ids.dev, P, T1]);
t = await texts();
ok('chưa có địa chỉ gốc: tin vẫn gửi, không có link', t.length === 1 && !t[0].includes('🔗'), JSON.stringify(t));
await q(`select set_app_base_url('${B}')`);

// ---------- Bản tóm tắt hằng ngày ----------
await root();
await db.exec(`delete from notifications; delete from telegram_digest_log`);
const T2 = (await q(`insert into tasks (project_id,code,title,start_date,due_date,assignee_id) values ($1,'TG-2','Việc sắp đến hạn',current_date-2,${today}+1,$2) returning id`, [P, ids.dev]))[0].id;
await clearCalls();
await q(`select scan_deadlines()`);
t = await texts();
{
  const dev = t.find(x => x.includes('TG-1'));
  ok('bản tóm tắt: mỗi việc kèm link riêng', !!dev && dev.includes(`TG-1 — Việc quá hạn`) && dev.includes(`🔗 ${B}/p/TG/tasks/TG-1`) && dev.includes(`🔗 ${B}/p/TG/tasks/TG-2`), JSON.stringify(dev));
  ok('bản tóm tắt: thứ tự việc giữ nguyên (quá hạn trước)', dev.indexOf('TG-1') < dev.indexOf('TG-2'));
}
// Danh sách quá dài: bỏ link từng việc, kèm link danh sách nhiệm vụ của dự án
await root();
await db.exec(`delete from notifications; delete from telegram_digest_log`);
for (let n = 0; n < 40; n++) {
  await q(`insert into tasks (project_id,code,title,start_date,due_date,assignee_id) values ($1,$2,$3,current_date-9,${today}-2,$4)`, [P, `LONG-${n}`, 'Một nhiệm vụ có tiêu đề rất dài để làm tin nhắn vượt giới hạn độ dài của Telegram ' + n, ids.dev2]);
}
await clearCalls();
await q(`select scan_deadlines()`);
t = await texts();
{
  const m = t.find(x => x.includes('LONG-0'));
  ok('danh sách quá dài: không còn link từng việc', !!m && !m.includes('/tasks/LONG-0'), m?.slice(0, 120));
  ok('danh sách quá dài: kèm link danh sách nhiệm vụ của dự án', m.includes(`🔗 Danh sách nhiệm vụ:\n${B}/p/TG/tasks`), m.slice(-200));
  ok('tin vẫn nằm trong giới hạn Telegram', m.length <= 4000, String(m.length));
}

// ---------- Mã cũ của dự án ----------
await root();
const resolve = async code => (await q(`select resolve_project_code($1) c`, [code]))[0].c;
await q(`update projects set code = 'TG2' where id = $1`, [P]);
ok('đổi mã dự án: mã cũ được nhớ', (await q(`select alias from project_code_aliases where project_id=$1`, [P])).map(r => r.alias).join() === 'tg');
await as('dev');
ok('thành viên: mã cũ (kể cả khác hoa thường) trỏ tới mã mới', (await resolve('TG')) === 'TG2' && (await resolve('tg')) === 'TG2');
ok('mã không có trong bí danh trả null', (await resolve('KHONG_CO')) === null && (await resolve('TG2')) === null);
await as('outsider');
ok('người ngoài dự án không dò được dự án qua mã cũ', (await resolve('TG')) === null);
await as('admin');
ok('admin xem được mọi dự án nên resolve được', (await resolve('TG')) === 'TG2');
await throws('người dùng không đọc trực tiếp bảng mã cũ', async () => { await as('dev'); await q(`select * from project_code_aliases`); }, 'permission denied');
await root();
await q(`update projects set code = 'TG3' where id = $1`, [P]);
ok('đổi mã lần nữa: giữ cả hai mã cũ', (await q(`select alias from project_code_aliases where project_id=$1 order by alias`, [P])).map(r => r.alias).join() === 'tg,tg2');
await q(`update projects set code = 'TG' where id = $1`, [P]);
ok('đổi về mã cũ: mã đó không còn là bí danh', (await q(`select alias from project_code_aliases where project_id=$1 order by alias`, [P])).map(r => r.alias).join() === 'tg2,tg3');
{
  const Q = (await q(`insert into projects (code,name,start_date,target_end_date,manager_id) values ('TG2','Dự án khác',current_date,current_date+5,$1) returning id`, [ids.pm]))[0].id;
  ok('dự án mới dùng lại một mã cũ: bí danh bị gỡ, mã hiện tại thắng', (await q(`select count(*)::int c from project_code_aliases where alias='tg2'`))[0].c === 0);
  await q(`update projects set code='TGQ' where id=$1`, [Q]);
  ok('mã cũ của dự án khác được ghi nhận cho dự án đó', (await q(`select project_id from project_code_aliases where alias='tg2'`))[0].project_id === Q);
}
await q(`delete from projects where id=$1`, [P]);
ok('xóa dự án xóa luôn bí danh của nó', (await q(`select count(*)::int c from project_code_aliases where alias in ('tg','tg3')`))[0].c === 0);

// ---------- Hoàn tác 0026 ----------
await root();
await db.exec(fs.readFileSync(new URL('../rollback/0026_rollback.sql', import.meta.url), 'utf8'));
ok('rollback 0026: bảng và hàm biến mất', (await q(`select to_regclass('public.app_settings') a, to_regclass('public.project_code_aliases') b`))[0].a === null
  && (await q(`select count(*)::int c from pg_proc where proname in ('app_link','_url_seg','set_app_base_url','resolve_project_code','trg_project_code_alias')`))[0].c === 0);
const P2 = (await q(`insert into projects (code,name,start_date,target_end_date,manager_id) values ('RB','Dự án RB',current_date-10,current_date+30,$1) returning id`, [ids.pm]))[0].id;
await q(`insert into project_members (project_id,user_id,role) values ($1,$2,'dev')`, [P2, ids.dev]);
const T9 = (await q(`insert into tasks (project_id,code,title,start_date,due_date,assignee_id) values ($1,'RB-1','Việc RB',current_date-9,${today}-3,$2) returning id`, [P2, ids.dev]))[0].id;
await clearCalls();
await q(`insert into notifications (user_id,project_id,type,title,message,task_id) values ($1,$2,'overdue','Quá hạn','x',$3)`, [ids.dev, P2, T9]);
t = await texts();
ok('rollback 0026: tin Telegram trở lại không có link', t.length === 1 && !t[0].includes('🔗') && t[0].includes('Dự án: RB'), JSON.stringify(t));
await db.exec(`delete from notifications; delete from telegram_digest_log`);
await clearCalls();
await q(`select scan_deadlines()`);
t = await texts();
ok('rollback 0026: bản tóm tắt chạy lại như 0017 (không link)', t.length >= 1 && t.every(x => !x.includes('🔗')) && t.some(x => x.includes('RB-1')), JSON.stringify(t));

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
