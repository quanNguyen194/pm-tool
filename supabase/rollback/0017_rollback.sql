-- Hoàn tác migration 0017: scan_deadlines trở về bản ở 0014 (tin Telegram chỉ gồm việc MỚI phát sinh thông báo,
-- không nhắc lặp lại). Chuông trong web không đổi. MẤT DỮ LIỆU: bảng nhật ký bản tóm tắt telegram_digest_log.

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
drop table if exists public.telegram_digest_log;
