-- ============================================================
-- 0026 — Liên kết trong tin Telegram + mã cũ của dự án
--
-- * app_settings('base_url'): địa chỉ gốc của web (mặc định https://pm-tool.quan-ntm194.workers.dev). Đổi bằng:
--     select public.set_app_base_url('https://ten-mien-moi');
-- * app_link(dự án, loại, mã): dựng địa chỉ đầy đủ theo mã dễ đọc (khớp src/router/paths.ts); trả null nếu chưa có địa chỉ gốc.
-- * Mọi tin Telegram theo thông báo có thêm dòng "🔗 <link>" (nhiệm vụ -> /tasks/<mã>, issue -> /issues/<số>, cảnh báo chất lượng
--   -> /quality); bản tóm tắt hằng ngày có link từng việc (danh sách quá dài thì chỉ kèm link danh sách nhiệm vụ của dự án).
-- * project_code_aliases: khi đổi mã dự án, mã cũ được nhớ để link cũ tự chuyển sang mã mới (resolve_project_code).
-- Hoàn tác: supabase/rollback/0026_rollback.sql
-- ============================================================

-- ------------------------------------------------------------
-- 1. Cài đặt ứng dụng
-- ------------------------------------------------------------
create table public.app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;
revoke all on public.app_settings from anon, authenticated;
insert into public.app_settings (key, value) values ('base_url', 'https://pm-tool.quan-ntm194.workers.dev') on conflict do nothing;

create function public.set_app_base_url(p_url text) returns void
language plpgsql security definer set search_path = '' as $$
declare u text := rtrim(btrim(coalesce(p_url, '')), '/');
begin
  if auth.uid() is not null and not coalesce(public.is_admin(), false) then
    raise exception 'Chỉ quản trị viên mới đổi được địa chỉ gốc' using errcode = '42501';
  end if;
  if u !~ '^https?://[A-Za-z0-9.-]+(:[0-9]{1,5})?$' then
    raise exception 'Địa chỉ gốc phải có dạng https://ten-mien (không kèm đường dẫn)' using errcode = '22023';
  end if;
  insert into public.app_settings (key, value) values ('base_url', u)
  on conflict (key) do update set value = excluded.value, updated_at = now();
end
$$;

-- ------------------------------------------------------------
-- 2. Dựng địa chỉ
-- ------------------------------------------------------------
-- Mã hóa phần trăm một đoạn đường dẫn (UTF-8), giữ nguyên chữ, số và . _ ~ -
create function public._url_seg(s text) returns text
language sql immutable set search_path = '' as $$
  select coalesce(string_agg(
    case when t.ch ~ '^[A-Za-z0-9._~-]$' then t.ch
         else (select string_agg('%' || upper(lpad(to_hex(get_byte(c.b, g)), 2, '0')), '' order by g)
                 from generate_series(0, length(c.b) - 1) as g)
    end, '' order by t.ord), '')
  from regexp_split_to_table(coalesce(s, ''), '') with ordinality as t(ch, ord)
  cross join lateral (select convert_to(t.ch, 'UTF8') as b) as c
$$;

create function public.app_link(p_project uuid, p_kind text default 'project', p_code text default null) returns text
language plpgsql stable security definer set search_path = '' as $$
declare base text; pc text; tail text;
begin
  select value into base from public.app_settings where key = 'base_url';
  select code into pc from public.projects where id = p_project;
  if base is null or pc is null then return null; end if;
  tail := case p_kind
            when 'project' then ''
            when 'tasks' then '/tasks'
            when 'issues' then '/issues'
            when 'usecases' then '/usecases'
            when 'quality' then '/quality'
            when 'reports' then '/reports'
            when 'team' then '/team'
            else null end;
  if tail is null then return null; end if;
  return rtrim(base, '/') || '/p/' || public._url_seg(pc) || tail
         || case when p_code is not null and p_code <> '' and p_kind in ('tasks', 'issues', 'usecases') then '/' || public._url_seg(p_code) else '' end;
end
$$;

-- ------------------------------------------------------------
-- 3. Tin Telegram theo thông báo có link
-- ------------------------------------------------------------
create or replace function public.trg_notification_telegram() returns trigger
language plpgsql security definer set search_path = '' as $$
declare proj text; icon text; link text; item text;
begin
  if coalesce(current_setting('app.tg_digest', true), '') = '1' then return null; end if;
  select code into proj from public.projects where id = new.project_id;
  icon := case new.type when 'overdue' then '🚨' when 'deadline_warning' then '⏰' when 'quality_alert' then '⚠️' when 'issue' then '🐞' else 'ℹ️' end;
  if new.project_id is not null then
    if new.task_id is not null then
      select code into item from public.tasks where id = new.task_id;
      link := public.app_link(new.project_id, 'tasks', item);
    elsif new.issue_id is not null then
      select number::text into item from public.issues where id = new.issue_id;
      link := public.app_link(new.project_id, 'issues', item);
    elsif new.type = 'quality_alert' then
      link := public.app_link(new.project_id, 'quality');
    end if;
  end if;
  perform public.telegram_notify_user(
    new.user_id,
    icon || ' ' || new.title || E'\n' || new.message || case when proj is null then '' else E'\nDự án: ' || proj end
    || case when link is null then '' else E'\n🔗 ' || link end
  );
  return null;
end
$$;

-- ------------------------------------------------------------
-- 4. Bản tóm tắt hằng ngày có link
-- ------------------------------------------------------------
create or replace function public.scan_deadlines() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  n integer;
  new_users uuid[];
  rec record;
  lines text;
  head text;
  already boolean;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'Chỉ quản trị viên mới được chạy quét deadline thủ công' using errcode = '42501';
  end if;

  -- Tạm tắt gửi từng tin; bên dưới gửi một tin tóm tắt mỗi người.
  perform set_config('app.tg_digest', '1', true);

  -- 1. Thông báo trong web (mỗi việc/loại/người một lần)
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
    returning user_id
  )
  select count(*), coalesce(array_agg(distinct user_id), '{}') into n, new_users from ins;

  -- 2. Telegram: mỗi người một tin liệt kê MỌI việc còn trong diện cần lưu ý
  for rec in
    select r.uid,
           count(*) filter (where t.due_date < today) as over_n,
           count(*) filter (where t.due_date >= today) as warn_n,
           string_agg(
             case when t.due_date < today then '🚨 ' else '⏰ ' end || t.code || ' — ' || t.title
               || ' (hạn ' || to_char(t.due_date, 'DD/MM') ||
               case when t.due_date < today then ', trễ ' || (today - t.due_date)::text || ' ngày'
                    when t.due_date = today then ', hết hạn hôm nay'
                    else ', còn ' || (t.due_date - today)::text || ' ngày' end || ')',
             E'\n' order by t.due_date, t.code
           ) as ls,
           string_agg(
             case when t.due_date < today then '🚨 ' else '⏰ ' end || t.code || ' — ' || t.title
               || ' (hạn ' || to_char(t.due_date, 'DD/MM') ||
               case when t.due_date < today then ', trễ ' || (today - t.due_date)::text || ' ngày'
                    when t.due_date = today then ', hết hạn hôm nay'
                    else ', còn ' || (t.due_date - today)::text || ' ngày' end || ')' || coalesce(E'\n   🔗 ' || public.app_link(t.project_id, 'tasks', t.code), ''),
             E'\n' order by t.due_date, t.code
           ) as ls_l,
           string_agg(distinct public.app_link(t.project_id, 'tasks'), E'\n') as pl
      from public.tasks t
      join public.projects p on p.id = t.project_id
      cross join lateral (
        select distinct u as uid from unnest(array[t.assignee_id, p.manager_id]) as u where u is not null
      ) r
     where t.status <> 'done' and (t.due_date - today) <= 2
     group by r.uid
  loop
    select exists (select 1 from public.telegram_digest_log where user_id = rec.uid and day = today) into already;
    if already and not (rec.uid = any (new_users)) then
      continue; -- hôm nay đã gửi và không có việc mới
    end if;
    head := case when already then '📋 Cập nhật nhắc deadline: ' else '📋 Nhắc deadline hôm nay: ' end;
    -- Kèm link từng việc nếu vừa độ dài tin Telegram; quá dài thì bỏ link từng việc, chỉ để link danh sách nhiệm vụ của dự án
    if length(rec.ls_l) <= 3400 then
      lines := rec.ls_l;
    else
      lines := rec.ls;
      if length(lines) > 3000 then lines := left(lines, 3000) || E'\n…'; end if;
      if rec.pl is not null then lines := lines || E'\n🔗 Danh sách nhiệm vụ:\n' || left(rec.pl, 380); end if;
    end if;
    perform public.telegram_notify_user(
      rec.uid,
      head || rec.over_n || ' quá hạn, ' || rec.warn_n || E' sắp đến hạn\n' || lines
    );
    insert into public.telegram_digest_log (user_id, day) values (rec.uid, today) on conflict do nothing;
  end loop;

  delete from public.telegram_digest_log where day < today - 30;

  perform set_config('app.tg_digest', '', true);
  return n;
end
$$;

-- ------------------------------------------------------------
-- 5. Mã cũ của dự án (link cũ vẫn mở được sau khi đổi mã)
-- ------------------------------------------------------------
create table public.project_code_aliases (
  alias text primary key,
  project_id uuid not null references public.projects (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.project_code_aliases enable row level security;
revoke all on public.project_code_aliases from anon, authenticated;

create function public.trg_project_code_alias() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and lower(old.code) <> lower(new.code) then
    insert into public.project_code_aliases (alias, project_id) values (lower(old.code), new.id)
    on conflict (alias) do update set project_id = excluded.project_id, created_at = now();
  end if;
  -- Mã hiện tại của dự án luôn được ưu tiên: bỏ bí danh trùng với nó
  delete from public.project_code_aliases where alias = lower(new.code);
  return null;
end
$$;
create trigger project_code_alias after insert or update of code on public.projects
  for each row execute function public.trg_project_code_alias();

-- Mã hiện tại ứng với một mã cũ (chỉ trả về nếu người gọi xem được dự án đó; không thì null, không tiết lộ dự án có tồn tại)
create function public.resolve_project_code(p_code text) returns text
language sql stable security definer set search_path = '' as $$
  select p.code
    from public.project_code_aliases a
    join public.projects p on p.id = a.project_id
   where a.alias = lower(coalesce(p_code, '')) and coalesce(public.can_view_project(p.id), false)
$$;

-- ------------------------------------------------------------
-- 6. Quyền hàm
-- ------------------------------------------------------------
revoke execute on function
  public.set_app_base_url(text), public._url_seg(text), public.app_link(uuid, text, text), public.trg_project_code_alias(),
  public.resolve_project_code(text), public.trg_notification_telegram()
  from public, anon;
revoke execute on function public._url_seg(text), public.app_link(uuid, text, text), public.trg_project_code_alias(), public.trg_notification_telegram() from authenticated;
grant execute on function public.resolve_project_code(text), public.set_app_base_url(text) to authenticated;
