-- Hoàn tác migration 0016: send_task_reminder trở về bản gốc ở 0003 (trả void, không gửi bản sao Telegram).
-- Giao diện bản mới vẫn chạy với bản cũ (hiện thông báo chung). Không mất dữ liệu.

drop function if exists public.send_task_reminder(uuid);

create function public.send_task_reminder(p_task uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  t public.tasks;
  recipient uuid;
  recipient_name text;
  sender_name text;
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
  select name into recipient_name from public.profiles where id = recipient;
  select name into sender_name from public.profiles where id = auth.uid();
  insert into public.notifications (user_id, project_id, type, title, message, task_id)
  values (
    recipient, t.project_id, 'deadline_warning',
    'Nhắc việc gửi tới ' || coalesce(recipient_name, 'thành viên'),
    coalesce(sender_name, 'Quản trị viên') || ' đã gửi nhắc nhở deadline nhiệm vụ "' || t.title
      || '" (Hạn chót: ' || to_char(t.due_date, 'YYYY-MM-DD') || ').',
    t.id
  );
end
$$;

revoke execute on function public.send_task_reminder(uuid) from public, anon;
grant execute on function public.send_task_reminder(uuid) to authenticated;
