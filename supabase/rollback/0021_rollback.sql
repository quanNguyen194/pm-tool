-- Hoàn tác migration 0021: các hàm can_* trở về ma trận CỐ ĐỊNH như ở 0018/0010 (bỏ cấu hình phân quyền).
-- MẤT DỮ LIỆU: mọi cấu hình phân quyền đã lưu và nhật ký thay đổi. Dữ liệu dự án không bị ảnh hưởng.
-- Các hàm can_* phải được trả về TRƯỚC khi xóa bảng/hàm cấu hình mà chúng đang gọi.

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

create or replace function public.can_tick_stage(pid uuid, s text) returns boolean
language sql stable security definer set search_path = '' as $$
  -- coalesce: người ngoài dự án có project_role = null, nếu không biểu thức ra NULL chứ không phải false.
  select coalesce(
    public.is_admin()
      or public.project_role(pid) = 'pm'
      or (public.project_role(pid) = 'ba' and s in ('analysis', 'design'))
      or (public.project_role(pid) = 'dev' and s = 'coding')
      or (public.project_role(pid) = 'tester' and s = 'testing'),
    false)
$$;

create or replace function public.member_access_report(pid uuid, uid uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r text; adm boolean;
begin
  if not coalesce(public.can_manage_project(pid), false) then
    raise exception 'Chỉ quản trị viên hoặc PM mới xem được quyền của thành viên' using errcode = '42501';
  end if;
  select coalesce(p.is_admin, false) into adm from public.profiles p where p.id = uid;
  adm := coalesce(adm, false);
  select m.role into r from public.project_members m where m.project_id = pid and m.user_id = uid;
  return jsonb_build_object(
    'role', r,
    'isAdmin', adm,
    'view', coalesce(adm or r is not null, false),
    'manage', coalesce(adm or r = 'pm', false),
    'writeTasks', coalesce(adm or r in ('pm', 'dev', 'ba', 'tester'), false),
    'writeUseCases', coalesce(adm or r in ('pm', 'dev', 'ba'), false),
    'approveQuality', coalesce(adm or r in ('pm', 'tester'), false),
    'stages', jsonb_build_object(
      'analysis', coalesce(adm or r in ('pm', 'ba'), false),
      'design', coalesce(adm or r in ('pm', 'ba'), false),
      'coding', coalesce(adm or r in ('pm', 'dev'), false),
      'testing', coalesce(adm or r in ('pm', 'tester'), false),
      'acceptance', coalesce(adm or r = 'pm', false))
  );
end
$$;

drop function if exists public.get_permission_log(uuid, integer);
drop function if exists public.reset_role_permissions(uuid);
drop function if exists public.set_role_permissions(uuid, jsonb);
drop function if exists public.get_permission_matrix(uuid);
drop table if exists public.role_permission_log;
drop table if exists public.role_permissions;
drop function if exists public.role_has_perm(uuid, text, text);
drop function if exists public.is_configurable_permission(text);
drop function if exists public.perm_default(text, text);
