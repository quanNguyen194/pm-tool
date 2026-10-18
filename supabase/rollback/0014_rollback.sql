-- Hoàn tác migration 0014 (nhắc nhở qua Telegram).
-- Giao diện bản cũ vẫn chạy bình thường khi 0014 bị gỡ (chỉ mất khả năng gửi Telegram).
-- MẤT DỮ LIỆU: các Chat ID Telegram đã lưu. Token bot trong Vault KHÔNG bị xóa (xóa tay nếu muốn:
--   delete from vault.secrets where name in ('telegram_bot_token', 'telegram_bot_username');)
-- Extension pg_net / supabase_vault được giữ nguyên.

drop trigger if exists notification_telegram on public.notifications;
drop function if exists public.trg_notification_telegram();
drop function if exists public.get_my_telegram();
drop function if exists public.set_my_telegram(text, boolean);
drop function if exists public.send_telegram_test();
drop function if exists public.telegram_test_result();
drop function if exists public.telegram_notify_user(uuid, text);
drop function if exists public.telegram_send(text, text);
drop function if exists public.telegram_secret(text);
drop table if exists public.telegram_links;

-- scan_deadlines: bản gốc ở 0005 (không có tin tóm tắt Telegram)
create or replace function public.scan_deadlines() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  n integer;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'Chỉ quản trị viên mới được chạy quét deadline thủ công' using errcode = '42501';
  end if;

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
    returning 1
  )
  select count(*) into n from ins;
  return n;
end
$$;
