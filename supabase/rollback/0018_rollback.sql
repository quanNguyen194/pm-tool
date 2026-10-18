-- Hoàn tác migration 0018: trả các hàm can_* về bản cũ có thể trả NULL.
-- CẢNH BÁO: bản cũ có lỗ hổng phân quyền (người đã đăng nhập nhưng không thuộc dự án vượt được kiểm tra của các hàm RPC
-- như add_project_member). CHỈ chạy nếu thật sự cần và đã đóng đăng ký tài khoản mới; không khuyến khích.

create or replace function public.can_view_project(pid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_admin() or public.project_role(pid) is not null
$$;

create or replace function public.can_manage_project(pid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_admin() or public.project_role(pid) = 'pm'
$$;

create or replace function public.can_write_tasks(pid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_admin() or public.project_role(pid) in ('pm', 'dev', 'ba', 'tester')
$$;

create or replace function public.can_write_usecases(pid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_admin() or public.project_role(pid) in ('pm', 'dev', 'ba')
$$;

create or replace function public.can_approve_quality(pid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_admin() or public.project_role(pid) in ('pm', 'tester')
$$;
