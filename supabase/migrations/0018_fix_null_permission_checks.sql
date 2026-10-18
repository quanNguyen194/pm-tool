-- Omni Project Manager - 0018: SỬA LỖ HỔNG PHÂN QUYỀN - hàm kiểm tra quyền trả NULL (thay vì false) cho người ngoài dự án.
--
-- Lỗi: can_manage_project(pid) = is_admin() OR project_role(pid) = 'pm'. Với người đã đăng nhập nhưng KHÔNG thuộc dự án,
-- project_role() là NULL nên biểu thức ra NULL. Các hàm RPC kiểm tra bằng "if not can_manage_project(...) then raise"
-- thì "not NULL" cũng là NULL -> điều kiện không đúng -> KHÔNG báo lỗi -> người ngoài dự án vượt qua kiểm tra
-- (VD gọi add_project_member để tự thêm mình làm PM của dự án bất kỳ, gửi nhắc việc, tạo báo cáo...).
-- Chính sách RLS không bị ảnh hưởng vì NULL vẫn bị từ chối, nhưng các hàm RPC thì bị.
--
-- Sửa tận gốc: mọi hàm can_* luôn trả true/false (coalesce). Chạy NGAY, không cần đổi giao diện.
-- (can_tick_stage đã được sửa từ 0010; is_admin() vốn đã coalesce.)

create or replace function public.can_view_project(pid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.is_admin() or public.project_role(pid) is not null, false)
$$;

create or replace function public.can_manage_project(pid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.is_admin() or public.project_role(pid) = 'pm', false)
$$;

create or replace function public.can_write_tasks(pid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.is_admin() or public.project_role(pid) in ('pm', 'dev', 'ba', 'tester'), false)
$$;

create or replace function public.can_write_usecases(pid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.is_admin() or public.project_role(pid) in ('pm', 'dev', 'ba'), false)
$$;

create or replace function public.can_approve_quality(pid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.is_admin() or public.project_role(pid) in ('pm', 'tester'), false)
$$;
