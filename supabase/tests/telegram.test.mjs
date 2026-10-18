// Kiểm tra migration 0014: nhắc nhở qua Telegram (pg_net và vault được giả lập bằng bảng ghi lại lời gọi).
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';

const MIG = new URL('../migrations/', import.meta.url);
const FILES = ['0001_schema.sql', '0002_quality_template.sql', '0003_rpc_and_seed.sql', '0004_criteria_insert_guard.sql', '0005_deadlines_and_snapshots.sql', '0007_report_schedules.sql', '0008_roles_usecase_tree_task_fields.sql', '0009_usecase_attributes.sql', '0010_usecase_stages.sql', '0011_usecase_origin.sql', '0012_task_use_cases.sql', '0013_placeholder_accounts.sql', '0014_telegram_notify.sql', '0015_telegram_timeout.sql', '0016_reminder_feedback.sql', '0017_daily_digest.sql'];

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

  -- Giả lập pg_net: ghi lại lời gọi thay vì gửi HTTP
  create schema net;
  create table net.calls (id bigserial primary key, url text, body jsonb, timeout_ms int);
  create table net._http_response (id bigint primary key, status_code int, content text, timed_out boolean, error_msg text);
  create table net.settings (fail boolean not null default false);
  insert into net.settings values (false);
  create function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000)
  returns bigint language plpgsql as $$
  declare rid bigint;
  begin
    if (select fail from net.settings) then raise exception 'pg_net hỏng giả lập'; end if;
    insert into net.calls (url, body, timeout_ms) values (url, body, timeout_milliseconds) returning id into rid;
    return rid;
  end $$;
  -- Giả lập vault
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
const addUser = async (key, name) => {
  ids[key] = (await q(`insert into auth.users (email, raw_user_meta_data) values ($1, $2::jsonb) returning id`, [`${key}@t.vn`, JSON.stringify({ name })]))[0].id;
};
await addUser('admin', 'Admin User');
await addUser('pm', 'PM User');
await addUser('dev', 'Dev User');
await addUser('other', 'Other User');

const as = async who => {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${who ? ids[who] : ''}', false);`);
  await db.exec(`set role ${who ? 'authenticated' : 'anon'};`);
};
const root = async () => { await db.exec(`reset role; select set_config('request.jwt.claim.sub','',false);`); };
const calls = async () => { await db.exec(`reset role`); return (await q(`select id, url, body, timeout_ms from net.calls order by id`)); };
const clearCalls = async () => { await root(); await db.exec(`delete from net.calls`); };

await root();
await q(`update profiles set is_admin = true where id = $1`, [ids.admin]);
const P = (await q(`insert into projects (code,name,start_date,target_end_date,manager_id) values ('TG','Dự án TG',current_date-10,current_date+30,$1) returning id`, [ids.pm]))[0].id;
await q(`insert into project_members (project_id,user_id,role) values ($1,$2,'dev')`, [P, ids.dev]);
const T1 = (await q(`insert into tasks (project_id,code,title,start_date,due_date,assignee_id) values ($1,'TG-1','Việc quá hạn',current_date-9,(now() at time zone 'Asia/Ho_Chi_Minh')::date-3,$2) returning id`, [P, ids.dev]))[0].id;
const T2 = (await q(`insert into tasks (project_id,code,title,start_date,due_date,assignee_id) values ($1,'TG-2','Việc sắp đến hạn',current_date-2,(now() at time zone 'Asia/Ho_Chi_Minh')::date+1,$2) returning id`, [P, ids.dev]))[0].id;

// ---------- Chưa cấu hình bot ----------
await as('pm');
ok('khi chưa có bot: gửi nhắc nhở không lỗi', (await q(`select send_task_reminder($1)`, [T1])).length === 1);
ok('chưa cấu hình thì không gọi Telegram', (await calls()).length === 0);
await as('dev');
let st = (await q(`select get_my_telegram() s`))[0].s;
ok('giao diện biết bot chưa cấu hình', st.configured === false && st.chatId === '' && st.enabled === true, JSON.stringify(st));
await throws('gửi thử khi chưa lưu Chat ID bị chặn', () => q(`select send_telegram_test()`), 'P0002');

// ---------- Liên kết ----------
await throws('Chat ID không phải số bị từ chối', () => q(`select set_my_telegram('abc')`), '22023');
await throws('Chat ID quá ngắn bị từ chối', () => q(`select set_my_telegram('12')`), '22023');
await q(`select set_my_telegram('  123456789 ')`);
st = (await q(`select get_my_telegram() s`))[0].s;
ok('lưu Chat ID (đã cắt khoảng trắng)', st.chatId === '123456789' && st.enabled === true, JSON.stringify(st));
await throws('chưa có bot thì gửi thử bị chặn', () => q(`select send_telegram_test()`), 'P0002');
await q(`select set_my_telegram('-1001234567890', false)`);
ok('chấp nhận Chat ID nhóm (số âm) và tắt nhận', (await q(`select get_my_telegram() s`))[0].s.enabled === false);
await throws('người dùng không đọc trực tiếp bảng telegram_links', () => q(`select * from telegram_links`), 'permission denied');
await as('other');
ok('người khác không thấy Chat ID của dev', (await q(`select get_my_telegram() s`))[0].s.chatId === '');
await as(null);
await throws('khách chưa đăng nhập không gọi được RPC', () => q(`select get_my_telegram()`), 'permission denied');

// ---------- Cấu hình bot rồi gửi nhắc nhở thủ công ----------
await root();
await q(`insert into vault.decrypted_secrets values ('telegram_bot_token','TOKEN123'), ('telegram_bot_username','omni_pm_bot')`);
await as('dev');
st = (await q(`select get_my_telegram() s`))[0].s;
ok('configured + tên bot hiện ra, không lộ token', st.configured === true && st.botUsername === 'omni_pm_bot' && !JSON.stringify(st).includes('TOKEN123'), JSON.stringify(st));
await q(`select set_my_telegram('123456789', true)`);
await as('pm');
await clearCalls();
await as('pm');
await q(`select send_task_reminder($1)`, [T1]);
let c = await calls();
ok('nhắc nhở thủ công -> 1 tin Telegram đúng người, đúng bot', c.length === 1 && c[0].url === 'https://api.telegram.org/botTOKEN123/sendMessage' && c[0].body.chat_id === '123456789', JSON.stringify(c));
ok('chờ Telegram tới 20 giây (không dùng mặc định 5 giây của pg_net)', c[0].timeout_ms === 20000, String(c[0].timeout_ms));
ok('nội dung có tiêu đề nhiệm vụ và mã dự án', c[0].body.text.includes('Việc quá hạn') && c[0].body.text.includes('Dự án: TG'), c[0]?.body?.text);
await root();
await clearCalls();
await as('dev');
await q(`select set_my_telegram('123456789', false)`);
await as('pm');
await q(`select send_task_reminder($1)`, [T1]);
ok('tắt nhận thì không gửi', (await calls()).length === 0);
await as('dev');
await q(`select set_my_telegram('123456789', true)`);

// ---------- Thông báo của người không liên kết ----------
await root();
await q(`insert into notifications (user_id,type,title,message) values ($1,'system','x','y')`, [ids.other]);
ok('người chưa liên kết thì không gửi', (await calls()).length === 0);

// ---------- Hỏng pg_net không làm hỏng thao tác gốc ----------
await q(`update net.settings set fail = true`);
const before = (await q(`select count(*)::int c from notifications`))[0].c;
await q(`insert into notifications (user_id,type,title,message) values ($1,'system','x','y')`, [ids.dev]);
ok('pg_net lỗi vẫn ghi được thông báo', (await q(`select count(*)::int c from notifications`))[0].c === before + 1);
await q(`update net.settings set fail = false`);
await clearCalls();

// ---------- Nút "Gửi nhắc nhở": kết quả giao tin + bản sao cho người bấm ----------
await root();
await q(`insert into project_members (project_id,user_id,role) values ($1,$2,'dev')`, [P, ids.other]);
const PH = (await q(`insert into profiles (id,name,is_placeholder) values (gen_random_uuid(),'Người Chưa Đăng Ký',true) returning id`))[0].id;
await q(`insert into project_members (project_id,user_id,role) values ($1,$2,'dev')`, [P, PH]);
const T3 = (await q(`insert into tasks (project_id,code,title,start_date,due_date,assignee_id) values ($1,'TG-3','Việc của người chưa liên kết',current_date,current_date+20,$2) returning id`, [P, ids.other]))[0].id;
const T4 = (await q(`insert into tasks (project_id,code,title,start_date,due_date,assignee_id) values ($1,'TG-4','Việc của tài khoản ảo',current_date,current_date+20,$2) returning id`, [P, PH]))[0].id;
await as('admin');
await q(`select set_my_telegram('777000111')`);
await clearCalls();
await as('admin');
let rem = (await q(`select send_task_reminder($1) r`, [T3]))[0].r;
c = await calls();
ok('người nhận chưa liên kết: trạng thái not_linked, người bấm nhận bản sao', rem.telegram === 'not_linked' && rem.copy === true && rem.recipientName === 'Other User', JSON.stringify(rem));
ok('bản sao gửi đúng cho người bấm và nói rõ người nhận chưa liên kết', c.length === 1 && c[0].body.chat_id === '777000111' && c[0].body.text.includes('Other User') && c[0].body.text.includes('chưa liên kết'), JSON.stringify(c));
await clearCalls();
await as('admin');
rem = (await q(`select send_task_reminder($1) r`, [T1]))[0].r;
c = await calls();
ok('người nhận đã liên kết: sent, nhận 1 tin + người bấm nhận bản sao', rem.telegram === 'sent' && rem.copy === true && c.length === 2 && c.some(x => x.body.chat_id === '123456789') && c.some(x => x.body.chat_id === '777000111'), JSON.stringify(rem) + JSON.stringify(c.map(x => x.body.chat_id)));
await clearCalls();
await as('admin');
rem = (await q(`select send_task_reminder($1) r`, [T4]))[0].r;
ok('người nhận là tài khoản ảo: placeholder', rem.telegram === 'placeholder' && rem.copy === true, JSON.stringify(rem));
await clearCalls();
await as('dev');
await q(`select set_my_telegram('123456789', false)`);
await as('admin');
rem = (await q(`select send_task_reminder($1) r`, [T1]))[0].r;
ok('người nhận tắt nhận: disabled', rem.telegram === 'disabled', JSON.stringify(rem));
await as('dev');
await q(`select set_my_telegram('123456789', true)`);
await clearCalls();
await as('pm');
await q(`select set_my_telegram('555000111')`);
await clearCalls();
await as('pm');
const tPm = (await q(`select send_task_reminder($1) r`, [T3]))[0].r;
ok('PM bấm cũng nhận bản sao', tPm.copy === true, JSON.stringify(tPm));
await root();
await q(`update tasks set assignee_id = $1 where id = $2`, [ids.pm, T3]);
await clearCalls();
await as('pm');
rem = (await q(`select send_task_reminder($1) r`, [T3]))[0].r;
c = await calls();
ok('tự nhắc chính mình: 1 tin duy nhất, không bản sao', rem.telegram === 'sent' && rem.copy === false && c.length === 1, JSON.stringify(rem) + c.length);
await as('dev');
await throws('thành viên thường không gửi được nhắc nhở', () => q(`select send_task_reminder($1)`, [T1]), '42501');
await root();
await q(`delete from telegram_links where user_id = $1`, [ids.pm]);
await q(`update tasks set assignee_id = $1 where id = $2`, [ids.other, T3]);
await q(`delete from vault.decrypted_secrets`);
await clearCalls();
await as('admin');
rem = (await q(`select send_task_reminder($1) r`, [T3]))[0].r;
ok('chưa cấu hình bot: no_bot, không gọi Telegram, không lỗi', rem.telegram === 'no_bot' && (await calls()).length === 0, JSON.stringify(rem));
await root();
await q(`insert into vault.decrypted_secrets values ('telegram_bot_token','TOKEN123'), ('telegram_bot_username','omni_pm_bot')`);
await clearCalls();

// ---------- Quét deadline: một tin tóm tắt mỗi người ----------
await as('pm');
await throws('PM không chạy quét thủ công (chỉ admin)', () => q(`select scan_deadlines()`), '42501');
await as('dev');
await q(`select set_my_telegram('123456789', true)`);
await root();
await q(`insert into telegram_links (user_id, chat_id) values ($1, '555000111')`, [ids.pm]);
await db.exec(`delete from notifications`);
await as('admin');
const created = (await q(`select scan_deadlines() n`))[0].n;
c = await calls();
ok('quét tạo 4 thông báo (2 việc x 2 người)', created === 4, String(created));
ok('mỗi người liên kết nhận đúng 1 tin tóm tắt', c.length === 2 && new Set(c.map(x => x.body.chat_id)).size === 2, JSON.stringify(c.map(x => x.body.chat_id)));
const devMsg = c.find(x => x.body.chat_id === '123456789').body.text;
ok('tin tóm tắt đếm 1 quá hạn, 1 sắp đến hạn và liệt kê cả hai việc', devMsg.includes('1 quá hạn, 1 sắp đến hạn') && devMsg.includes('TG-1') && devMsg.includes('TG-2') && devMsg.includes('trễ 3 ngày'), devMsg);
ok('việc quá hạn xếp trước việc sắp đến hạn', devMsg.indexOf('TG-1') < devMsg.indexOf('TG-2'), devMsg);
await clearCalls();
await as('admin');
ok('quét lần hai không tạo thêm (chống trùng)', (await q(`select scan_deadlines() n`))[0].n === 0 && (await calls()).length === 0);
await root();
await q(`insert into notifications (user_id,type,title,message) values ($1,'system','sau quét','ok')`, [ids.dev]);
ok('sau khi quét, thông báo thường lại gửi từng tin (cờ gom tin đã tắt)', (await calls()).length === 1);

// ---------- Nhắc lặp lại hằng ngày (0017) ----------
await clearCalls();
await root();
await db.exec(`update telegram_digest_log set day = day - 1`); // giả lập sang ngày hôm sau
await as('admin');
let again = (await q(`select scan_deadlines() n`))[0].n;
c = await calls();
ok('hôm sau: không có thông báo web mới nhưng vẫn nhắc lại qua Telegram', again === 0 && c.length === 2, `n=${again} calls=${c.length}`);
const m1 = c.find(x => x.body.chat_id === '123456789').body.text;
ok('tin nhắc lại liệt kê cả việc quá hạn lẫn sắp đến hạn, kèm số ngày', m1.includes('Nhắc deadline hôm nay') && m1.includes('TG-1') && m1.includes('trễ 3 ngày') && m1.includes('TG-2') && m1.includes('còn 1 ngày'), m1);
await clearCalls();
await as('admin');
await q(`select scan_deadlines()`);
ok('cùng ngày bấm quét lại không gửi trùng', (await calls()).length === 0);
// việc đã xong thì không còn được nhắc
await root();
await q(`update tasks set status = 'done' where id = $1`, [T1]);
await db.exec(`update telegram_digest_log set day = day - 1`);
await clearCalls();
await as('admin');
await q(`select scan_deadlines()`);
c = await calls();
const m2 = c.find(x => x.body.chat_id === '123456789')?.body.text ?? '';
ok('việc đã hoàn thành không còn trong tin nhắc', m2.includes('0 quá hạn, 1 sắp đến hạn') && !m2.includes('TG-1') && m2.includes('TG-2'), m2);
// việc mới lọt vào diện cần lưu ý sau bản tóm tắt buổi sáng -> tin cập nhật trong ngày
await root();
await q(`update tasks set status = 'todo' where id = $1`, [T1]);
await q(`insert into tasks (project_id,code,title,start_date,due_date,assignee_id) values ($1,'TG-5','Việc mới hết hạn hôm nay',current_date,(now() at time zone 'Asia/Ho_Chi_Minh')::date,$2)`, [P, ids.dev]);
await clearCalls();
await as('admin');
await q(`select scan_deadlines()`);
c = await calls();
const m3 = c.find(x => x.body.chat_id === '123456789')?.body.text ?? '';
ok('có việc mới sau bản sáng -> tin "Cập nhật" đầy đủ, ghi rõ hết hạn hôm nay', m3.includes('Cập nhật nhắc deadline') && m3.includes('TG-5') && m3.includes('hết hạn hôm nay') && m3.includes('TG-1'), m3);
// dọn nhật ký cũ
await root();
await q(`insert into telegram_digest_log (user_id, day) values ($1, current_date - 40)`, [ids.other]);
await as('admin');
await q(`select scan_deadlines()`);
await root();
ok('nhật ký tóm tắt quá 30 ngày bị dọn', (await q(`select count(*)::int c from telegram_digest_log where day < current_date - 30`))[0].c === 0);
await q(`delete from tasks where code = 'TG-5'`);

// ---------- Gửi thử + kết quả ----------
await clearCalls();
await as('dev');
const rid = (await q(`select send_telegram_test() r`))[0].r;
ok('gửi thử trả về id yêu cầu và gọi Telegram', rid != null && (await calls()).length === 1);
ok('chưa có phản hồi -> pending', (await q(`select telegram_test_result() r`))[0].r.status === 'pending');
await root();
await q(`insert into net._http_response values ($1, 400, '{"ok":false,"description":"Bad Request: chat not found"}', false, null)`, [rid]);
await as('dev');
let res = (await q(`select telegram_test_result() r`))[0].r;
ok('Telegram trả lỗi -> done, ok=false, kèm mô tả', res.status === 'done' && res.ok === false && res.description === 'Bad Request: chat not found', JSON.stringify(res));
await root();
await q(`update net._http_response set status_code = 200, content = '{"ok":true}'`);
await as('dev');
res = (await q(`select telegram_test_result() r`))[0].r;
ok('Telegram trả 200 -> ok=true', res.status === 'done' && res.ok === true, JSON.stringify(res));
await as('other');
ok('người khác không thấy kết quả thử của dev', (await q(`select telegram_test_result() r`))[0].r.status === 'none');

// ---------- Gỡ liên kết + xóa tài khoản ----------
await as('dev');
await q(`select set_my_telegram('')`);
ok('Chat ID rỗng = gỡ liên kết', (await q(`select get_my_telegram() s`))[0].s.chatId === '');
await root();
await q(`delete from auth.users where id = $1`, [ids.pm]);
ok('xóa tài khoản thì liên kết Telegram mất theo', (await q(`select count(*)::int c from telegram_links where user_id = $1`, [ids.pm]))[0].c === 0);

// ---------- Hàm nội bộ không gọi được từ ngoài ----------
await as('dev');
await throws('người dùng không gọi được telegram_send', () => q(`select telegram_send('123456789','x')`), 'permission denied');
await throws('người dùng không đọc được token', () => q(`select telegram_secret('telegram_bot_token')`), 'permission denied');

// ---------- Hoàn tác 0014 ----------
await root();
await db.exec(fs.readFileSync(new URL('../rollback/0017_rollback.sql', import.meta.url), 'utf8'));
ok('rollback 0017: bỏ bảng nhật ký tóm tắt', (await q(`select to_regclass('public.telegram_digest_log') t`))[0].t === null);
await db.exec(fs.readFileSync(new URL('../rollback/0016_rollback.sql', import.meta.url), 'utf8'));
ok('rollback 0016: send_task_reminder trả void như cũ', (await q(`select prorettype::regtype::text t from pg_proc where proname = 'send_task_reminder'`))[0].t === 'void');
await db.exec(fs.readFileSync(new URL('../rollback/0014_rollback.sql', import.meta.url), 'utf8'));
await clearCalls();
ok('rollback: không còn bảng/trigger Telegram', (await q(`select count(*)::int c from pg_trigger where tgname = 'notification_telegram'`))[0].c === 0
  && (await q(`select to_regclass('public.telegram_links') t`))[0].t === null);
await q(`insert into notifications (user_id,type,title,message) values ($1,'system','sau rollback','ok')`, [ids.dev]);
ok('rollback: thông báo mới không còn gọi Telegram', (await calls()).length === 0);
await db.exec(`delete from notifications`);
await as('admin');
ok('rollback: scan_deadlines bản cũ vẫn chạy và tạo thông báo', (await q(`select scan_deadlines() n`))[0].n === 2);

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
