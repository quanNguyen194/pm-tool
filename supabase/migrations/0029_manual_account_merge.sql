-- ============================================================
-- 0029 — Ghép thủ công tài khoản chưa đăng ký với tài khoản thật
--
-- Trước đây chỉ ghép được khi tài khoản thật đăng ký TRÙNG TÊN với tài khoản chưa đăng ký (hệ thống tự tạo yêu cầu cho admin duyệt).
-- Giờ admin chọn trực tiếp: tài khoản chưa đăng ký nào ghép vào tài khoản thật nào, bất kể tên có trùng hay không.
-- Việc chuyển dữ liệu dùng lại approve_account_merge của migration 0013 (thành viên dự án, nhiệm vụ đã phân công, người phối hợp,
-- bước đã tick, quản lý dự án, mọi khóa ngoại tới hồ sơ), nên các nhiệm vụ đã giao cho tài khoản chưa đăng ký tự chuyển sang tài khoản thật.
-- Hoàn tác: supabase/rollback/0029_rollback.sql
-- ============================================================

-- Xem trước điều gì sẽ được chuyển (cho hộp xác nhận)
create function public.admin_merge_preview(p_placeholder uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not coalesce(public.is_admin(), false) then
    raise exception 'Chỉ quản trị viên mới được ghép tài khoản' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = p_placeholder and is_placeholder) then
    raise exception 'Không tìm thấy tài khoản chưa đăng ký' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'projects', (select count(*)::int from public.project_members where user_id = p_placeholder),
    'tasksAssigned', (select count(*)::int from public.tasks where assignee_id = p_placeholder),
    'tasksCollaborating', (select count(*)::int from public.task_collaborators where user_id = p_placeholder),
    'projectsManaged', (select count(*)::int from public.projects where manager_id = p_placeholder));
end
$$;

-- Ghép tài khoản chưa đăng ký vào tài khoản thật (admin chọn). Trả về số liệu đã chuyển.
create function public.admin_merge_accounts(p_placeholder uuid, p_user uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  req uuid; summary jsonb; real_name text;
begin
  if auth.uid() is null or not coalesce(public.is_admin(), false) then
    raise exception 'Chỉ quản trị viên mới được ghép tài khoản' using errcode = '42501';
  end if;
  if p_placeholder is null or p_user is null or p_placeholder = p_user then
    raise exception 'Hãy chọn hai tài khoản khác nhau' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_placeholder and is_placeholder) then
    raise exception 'Tài khoản nguồn phải là tài khoản chưa đăng ký' using errcode = '22023';
  end if;
  select name into real_name from public.profiles where id = p_user and not is_placeholder;
  if real_name is null then
    raise exception 'Tài khoản đích phải là tài khoản đã đăng ký' using errcode = '22023';
  end if;

  summary := public.admin_merge_preview(p_placeholder);

  -- Dùng lại yêu cầu đang chờ (nếu có), không thì tạo mới; sau đó duyệt ngay bằng hàm của migration 0013.
  select id into req from public.account_merge_requests
   where placeholder_id = p_placeholder and user_id = p_user and status = 'pending';
  if req is null then
    insert into public.account_merge_requests (placeholder_id, user_id) values (p_placeholder, p_user) returning id into req;
  end if;
  perform public.approve_account_merge(req);
  return summary || jsonb_build_object('userName', real_name);
end
$$;

revoke execute on function public.admin_merge_preview(uuid), public.admin_merge_accounts(uuid, uuid) from public, anon;
grant execute on function public.admin_merge_preview(uuid), public.admin_merge_accounts(uuid, uuid) to authenticated;
