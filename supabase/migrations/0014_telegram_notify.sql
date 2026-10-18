-- Omni Project Manager - 0014: gửi nhắc nhở qua bot Telegram.
--
-- Cách hoạt động:
--   * Mỗi người tự lưu "Chat ID" Telegram của mình (menu tài khoản -> Nhắc nhở Telegram). Bảng telegram_links chỉ truy cập qua RPC.
--   * Mọi dòng thông báo mới (bấm "Gửi nhắc nhở", quét deadline tự động hằng sáng, yêu cầu hợp nhất tài khoản...) được
--     trigger đẩy sang Telegram cho đúng người nhận, qua pg_net (gọi bất đồng bộ, không làm chậm/ làm hỏng thao tác gốc).
--   * Quét deadline tự động gom thành MỘT tin tóm tắt cho mỗi người (tránh bị Telegram giới hạn tốc độ).
--   * Token bot nằm trong Supabase Vault (secret 'telegram_bot_token'), KHÔNG nằm trong code/bảng thường.
--     Thiết lập một lần (chạy trong SQL Editor, thay giá trị thật):
--       select vault.create_secret('<TOKEN_TỪ_BOTFATHER>', 'telegram_bot_token');
--       select vault.create_secret('<tên_bot_không_có_@>', 'telegram_bot_username');   -- tùy chọn, để giao diện hiện link mở bot
--
-- Chạy trước khi deploy giao diện mới. Hoàn tác: supabase/rollback/0014_rollback.sql

-- Bật pg_net / vault nếu chưa có (trên Supabase thường đã bật sẵn). Lỗi thì bỏ qua để migration vẫn chạy.
do $$
begin
  create extension if not exists pg_net with schema extensions;
exception when others then
  raise notice 'Không bật được pg_net: %', sqlerrm;
end
$$;
do $$
begin
  create extension if not exists supabase_vault;
exception when others then
  raise notice 'Không bật được supabase_vault: %', sqlerrm;
end
$$;

-- ============================================================
-- 1. LIÊN KẾT TELEGRAM CỦA TỪNG NGƯỜI
-- ============================================================

create table public.telegram_links (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  chat_id text not null check (chat_id ~ '^-?[0-9]{5,20}$'),
  enabled boolean not null default true,
  last_test_request bigint,
  updated_at timestamptz not null default now()
);
alter table public.telegram_links enable row level security;
-- Không có policy và thu hết quyền: chỉ các hàm SECURITY DEFINER bên dưới đọc/ghi được (chat id không lộ cho thành viên khác).
revoke all on public.telegram_links from anon, authenticated;

-- ============================================================
-- 2. HÀM NỘI BỘ
-- ============================================================

create function public.telegram_secret(p_name text) returns text
language plpgsql security definer set search_path = '' as $$
declare v text;
begin
  select decrypted_secret into v from vault.decrypted_secrets where name = p_name limit 1;
  return v;
exception when others then
  return null; -- vault chưa bật
end
$$;

-- Gửi một tin tới chat; trả về id yêu cầu của pg_net (null nếu bot chưa cấu hình).
create function public.telegram_send(p_chat text, p_text text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare token text := public.telegram_secret('telegram_bot_token');
begin
  if token is null or token = '' then return null; end if;
  return net.http_post(
    url := 'https://api.telegram.org/bot' || token || '/sendMessage',
    body := jsonb_build_object('chat_id', p_chat, 'text', left(p_text, 4000), 'disable_web_page_preview', true),
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
end
$$;

-- Gửi cho một người dùng nếu họ đã liên kết và bật nhận. Không bao giờ làm lỗi thao tác gọi nó.
create function public.telegram_notify_user(p_user uuid, p_text text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare c text;
begin
  select chat_id into c from public.telegram_links where user_id = p_user and enabled;
  if c is null then return null; end if;
  return public.telegram_send(c, p_text);
exception when others then
  raise warning 'Gửi Telegram thất bại: %', sqlerrm;
  return null;
end
$$;

-- Mỗi thông báo mới -> Telegram (trừ khi đang gom tin tóm tắt trong scan_deadlines).
create function public.trg_notification_telegram() returns trigger
language plpgsql security definer set search_path = '' as $$
declare proj text; icon text;
begin
  if coalesce(current_setting('app.tg_digest', true), '') = '1' then return null; end if;
  select code into proj from public.projects where id = new.project_id;
  icon := case new.type when 'overdue' then '🚨' when 'deadline_warning' then '⏰' when 'quality_alert' then '⚠️' else 'ℹ️' end;
  perform public.telegram_notify_user(
    new.user_id,
    icon || ' ' || new.title || E'\n' || new.message || case when proj is null then '' else E'\nDự án: ' || proj end
  );
  return null;
end
$$;
create trigger notification_telegram after insert on public.notifications
  for each row execute function public.trg_notification_telegram();

-- ============================================================
-- 3. QUÉT DEADLINE: thay bản ở 0005, thêm tin tóm tắt Telegram cho mỗi người nhận
-- ============================================================

create or replace function public.scan_deadlines() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  res jsonb;
  n integer;
  rec record;
  lines text;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'Chỉ quản trị viên mới được chạy quét deadline thủ công' using errcode = '42501';
  end if;

  -- Tạm tắt gửi từng tin; bên dưới gửi một tin tóm tắt mỗi người.
  perform set_config('app.tg_digest', '1', true);

  with candidates as (
    select t.id as task_id, t.project_id, t.code, t.title, t.due_date,
           (t.due_date - today) as diff, r.uid
      from public.tasks t
      join public.projects p on p.id = t.project_id
      cross join lateral (
        select distinct u as uid from unnest(array[t.assignee_id, p.manager_id]) as u where u is not null
      ) r
     where t.status <> 'done' and (t.due_date - today) <= 2
  ), ins as (
    insert into public.notifications (user_id, project_id, type, title, message, task_id, dedupe_key)
    select uid, project_id,
           case when diff < 0 then 'overdue' else 'deadline_warning' end,
           case when diff < 0 then 'Cảnh Báo Quá Hạn: ' || code else 'Nhắc Nhở Deadline: ' || code end,
           case when diff < 0
                  then 'Nhiệm vụ "' || title || '" đã quá hạn chót (' || to_char(due_date, 'YYYY-MM-DD') || ') ' || abs(diff)::text || ' ngày!'
                when diff = 0
                  then 'Nhiệm vụ "' || title || '" sẽ đến hạn trong ngày hôm nay!'
                else 'Nhiệm vụ "' || title || '" sẽ đến hạn trong ' || diff::text || ' ngày tới (' || to_char(due_date, 'YYYY-MM-DD') || ')!'
           end,
           task_id,
           (case when diff < 0 then 'overdue' else 'deadline_warning' end) || ':' || task_id::text || ':' || uid::text
      from candidates
    on conflict (dedupe_key) where dedupe_key is not null do nothing
    returning user_id, task_id, type
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'u', i.user_id,
           'over', i.type = 'overdue',
           'line', case when i.type = 'overdue' then '🚨 ' else '⏰ ' end || t.code || ' — ' || t.title
                   || ' (hạn ' || to_char(t.due_date, 'DD/MM') ||
                   case when t.due_date < today then ', trễ ' || (today - t.due_date)::text || ' ngày' else '' end || ')'
         )), '[]'::jsonb)
    into res
    from ins i join public.tasks t on t.id = i.task_id;

  n := jsonb_array_length(res);

  for rec in
    select (e ->> 'u')::uuid as uid,
           count(*) filter (where (e ->> 'over')::boolean) as over_n,
           count(*) filter (where not (e ->> 'over')::boolean) as warn_n,
           string_agg(e ->> 'line', E'\n' order by not (e ->> 'over')::boolean, e ->> 'line') as ls
      from jsonb_array_elements(res) e
     group by 1
  loop
    lines := rec.ls;
    if length(lines) > 3400 then lines := left(lines, 3400) || E'\n…'; end if;
    perform public.telegram_notify_user(
      rec.uid,
      '📋 Nhắc deadline: ' || rec.over_n || ' quá hạn, ' || rec.warn_n || E' sắp đến hạn\n' || lines
    );
  end loop;

  perform set_config('app.tg_digest', '', true);
  return n;
end
$$;

-- ============================================================
-- 4. RPC CHO GIAO DIỆN (mỗi người chỉ thấy/sửa liên kết của mình)
-- ============================================================

create function public.get_my_telegram() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare l public.telegram_links;
begin
  if auth.uid() is null then raise exception 'Chưa đăng nhập' using errcode = '42501'; end if;
  select * into l from public.telegram_links where user_id = auth.uid();
  return jsonb_build_object(
    'chatId', coalesce(l.chat_id, ''),
    'enabled', coalesce(l.enabled, true),
    'configured', coalesce(public.telegram_secret('telegram_bot_token'), '') <> '',
    'botUsername', nullif(public.telegram_secret('telegram_bot_username'), '')
  );
end
$$;

-- Chat ID rỗng = gỡ liên kết.
create function public.set_my_telegram(p_chat_id text, p_enabled boolean default true) returns void
language plpgsql security definer set search_path = '' as $$
declare c text := btrim(coalesce(p_chat_id, ''));
begin
  if auth.uid() is null then raise exception 'Chưa đăng nhập' using errcode = '42501'; end if;
  if c = '' then
    delete from public.telegram_links where user_id = auth.uid();
    return;
  end if;
  if c !~ '^-?[0-9]{5,20}$' then
    raise exception 'Chat ID phải là một dãy số (VD: 123456789)' using errcode = '22023';
  end if;
  insert into public.telegram_links (user_id, chat_id, enabled)
  values (auth.uid(), c, coalesce(p_enabled, true))
  on conflict (user_id) do update
    set chat_id = excluded.chat_id, enabled = excluded.enabled, updated_at = now();
end
$$;

-- Gửi tin thử tới chính mình. Trả về id yêu cầu để hỏi kết quả bằng telegram_test_result().
create function public.send_telegram_test() returns bigint
language plpgsql security definer set search_path = '' as $$
declare l public.telegram_links; rid bigint; nm text;
begin
  if auth.uid() is null then raise exception 'Chưa đăng nhập' using errcode = '42501'; end if;
  select * into l from public.telegram_links where user_id = auth.uid();
  if not found then raise exception 'Hãy lưu Chat ID trước' using errcode = 'P0002'; end if;
  if coalesce(public.telegram_secret('telegram_bot_token'), '') = '' then
    raise exception 'Bot Telegram chưa được cấu hình trên hệ thống (quản trị viên cần lưu token vào Vault)' using errcode = 'P0002';
  end if;
  select name into nm from public.profiles where id = auth.uid();
  rid := public.telegram_send(l.chat_id, '✅ Omni Project Manager: đã kết nối Telegram cho ' || coalesce(nm, 'bạn') || '. Nhắc nhở deadline sẽ gửi về đây.');
  update public.telegram_links set last_test_request = rid where user_id = auth.uid();
  return rid;
end
$$;

-- Kết quả lần gửi thử gần nhất: {status: 'none'|'pending'|'done', ok, description}.
create function public.telegram_test_result() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare rid bigint; resp record; descr text;
begin
  if auth.uid() is null then raise exception 'Chưa đăng nhập' using errcode = '42501'; end if;
  select last_test_request into rid from public.telegram_links where user_id = auth.uid();
  if rid is null then return jsonb_build_object('status', 'none'); end if;
  select status_code, content, timed_out, error_msg into resp from net._http_response where id = rid;
  if not found then return jsonb_build_object('status', 'pending'); end if;
  begin
    descr := (resp.content::jsonb) ->> 'description';
  exception when others then
    descr := null;
  end;
  return jsonb_build_object(
    'status', 'done',
    'ok', coalesce(resp.status_code = 200, false),
    'description', coalesce(descr, resp.error_msg, case when resp.timed_out then 'Hết thời gian chờ Telegram' else null end)
  );
end
$$;

-- ============================================================
-- 5. QUYỀN HÀM
-- ============================================================

revoke execute on function
  public.telegram_secret(text), public.telegram_send(text, text), public.telegram_notify_user(uuid, text),
  public.trg_notification_telegram(),
  public.get_my_telegram(), public.set_my_telegram(text, boolean), public.send_telegram_test(), public.telegram_test_result()
  from public, anon;
revoke execute on function
  public.telegram_secret(text), public.telegram_send(text, text), public.telegram_notify_user(uuid, text),
  public.trg_notification_telegram()
  from authenticated;
grant execute on function
  public.get_my_telegram(), public.set_my_telegram(text, boolean), public.send_telegram_test(), public.telegram_test_result()
  to authenticated;
