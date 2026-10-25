-- Hoàn tác migration 0026 (link trong tin Telegram, mã cũ của dự án). Mất: cài đặt địa chỉ gốc và bảng mã cũ của dự án.
-- Tin Telegram trở lại không kèm link. Giao diện không phụ thuộc migration này (khi thiếu, link cũ chứa mã cũ báo "không tìm thấy").

drop trigger if exists project_code_alias on public.projects;
drop function if exists public.resolve_project_code(text);
drop function if exists public.trg_project_code_alias();
drop table if exists public.project_code_aliases;

create or replace function public.trg_notification_telegram() returns trigger
language plpgsql security definer set search_path = '' as $$
declare proj text; icon text;
begin
  if coalesce(current_setting('app.tg_digest', true), '') = '1' then return null; end if;
  select code into proj from public.projects where id = new.project_id;
  icon := case new.type when 'overdue' then '🚨' when 'deadline_warning' then '⏰' when 'quality_alert' then '⚠️' when 'issue' then '🐞' else 'ℹ️' end;
  perform public.telegram_notify_user(
    new.user_id,
    icon || ' ' || new.title || E'\n' || new.message || case when proj is null then '' else E'\nDự án: ' || proj end
  );
  return null;
end
$$;

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
           ) as ls
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
    lines := rec.ls;
    if length(lines) > 3400 then lines := left(lines, 3400) || E'\n…'; end if;
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

drop function if exists public.app_link(uuid, text, text);
drop function if exists public._url_seg(text);
drop function if exists public.set_app_base_url(text);
drop table if exists public.app_settings;
