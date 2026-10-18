-- Omni Project Manager - 0016: nút "Gửi nhắc nhở" báo rõ kết quả giao tin và gửi bản sao cho người bấm.
--
-- Trước đây nhắc việc chỉ đi tới người phụ trách; nếu họ chưa liên kết Telegram thì người bấm không nhận được gì và
-- không biết vì sao. Giờ:
--   * Hàm trả về {recipientName, telegram: sent | not_linked | disabled | placeholder | no_bot, copy: bool}.
--   * Người bấm (khác người nhận) đã liên kết Telegram thì nhận thêm một tin "bản sao" kèm trạng thái giao tin.
-- Hoàn tác: supabase/rollback/0016_rollback.sql

drop function public.send_task_reminder(uuid);

create function public.send_task_reminder(p_task uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  t public.tasks;
  recipient uuid;
  recipient_name text;
  recipient_placeholder boolean;
  sender_name text;
  link_enabled boolean;
  bot_ok boolean := coalesce(public.telegram_secret('telegram_bot_token'), '') <> '';
  status text;
  copy_sent boolean := false;
  note text;
begin
  select * into t from public.tasks where id = p_task;
  if not found then
    raise exception 'Không tìm thấy nhiệm vụ' using errcode = 'P0002';
  end if;
  if not public.can_manage_project(t.project_id) then
    raise exception 'Chỉ quản trị viên hoặc PM mới được gửi nhắc việc' using errcode = '42501';
  end if;
  recipient := coalesce(t.assignee_id, (select manager_id from public.projects where id = t.project_id));
  if recipient is null then
    raise exception 'Nhiệm vụ chưa có người phụ trách' using errcode = 'P0002';
  end if;
  select name, is_placeholder into recipient_name, recipient_placeholder from public.profiles where id = recipient;
  select name into sender_name from public.profiles where id = auth.uid();

  -- Trạng thái giao tin Telegram cho người nhận (tính trước khi chèn thông báo, vì trigger sẽ gửi ngay)
  select enabled into link_enabled from public.telegram_links where user_id = recipient;
  status := case
    when coalesce(recipient_placeholder, false) then 'placeholder'
    when not bot_ok then 'no_bot'
    when link_enabled is null then 'not_linked'
    when not link_enabled then 'disabled'
    else 'sent'
  end;

  insert into public.notifications (user_id, project_id, type, title, message, task_id)
  values (
    recipient, t.project_id, 'deadline_warning',
    'Nhắc việc gửi tới ' || coalesce(recipient_name, 'thành viên'),
    coalesce(sender_name, 'Quản trị viên') || ' đã gửi nhắc nhở deadline nhiệm vụ "' || t.title
      || '" (Hạn chót: ' || to_char(t.due_date, 'YYYY-MM-DD') || ').',
    t.id
  );

  -- Bản sao cho người bấm (nếu họ khác người nhận và đã liên kết Telegram)
  if auth.uid() is not null and auth.uid() <> recipient then
    note := case status
      when 'sent' then 'Tin Telegram đã gửi tới người nhận.'
      when 'not_linked' then coalesce(recipient_name, 'Người nhận') || ' chưa liên kết Telegram nên chưa nhận được tin này (vẫn thấy thông báo trong web).'
      when 'disabled' then coalesce(recipient_name, 'Người nhận') || ' đã tắt nhận Telegram (vẫn thấy thông báo trong web).'
      when 'placeholder' then coalesce(recipient_name, 'Người nhận') || ' là tài khoản chưa đăng ký nên không có Telegram (vẫn thấy thông báo trong web).'
      else 'Bot Telegram chưa được cấu hình.'
    end;
    copy_sent := public.telegram_notify_user(
      auth.uid(),
      '📨 Bạn đã nhắc ' || coalesce(recipient_name, 'thành viên') || ' [' || t.code || '] ' || t.title
        || E'\nHạn chót: ' || to_char(t.due_date, 'YYYY-MM-DD') || E'\n' || note
    ) is not null;
  end if;

  return jsonb_build_object('recipientName', coalesce(recipient_name, 'thành viên'), 'telegram', status, 'copy', copy_sent);
end
$$;

revoke execute on function public.send_task_reminder(uuid) from public, anon;
grant execute on function public.send_task_reminder(uuid) to authenticated;
