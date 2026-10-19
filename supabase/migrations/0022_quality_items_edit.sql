-- Omni Project Manager - 0022: PM thêm / sửa / xóa các tiêu chuẩn Quality Gates (kể cả tiêu chuẩn mặc định của dự án).
--
-- Trước đây "thẩm định" (đánh dấu Đạt/Chưa đạt, ghi chú) và "định nghĩa tiêu chuẩn" (thêm/sửa/xóa) dùng chung một quyền
-- (can_approve_quality: PM + Tester), và giao diện chỉ có nút thêm. Giờ tách thành hai quyền:
--   approve_quality     - thẩm định: tick Đạt/Chưa đạt, ghi chú              (mặc định: PM, Tester)
--   edit_quality_items  - định nghĩa: thêm, sửa tên/mô tả/bắt buộc, xóa    (mặc định: chỉ PM)
-- Quản trị viên luôn có cả hai. Cả hai cấu hình được ở ma trận phân quyền (0021).
-- Tiêu chuẩn mặc định được nhân bản riêng cho từng dự án nên sửa/xóa chỉ ảnh hưởng dự án đó (mẫu gốc của hệ thống giữ nguyên).
--
-- Lưu ý: Tester từng thêm được tiêu chuẩn; sau migration này họ chỉ thẩm định. Muốn giữ như cũ: Đội ngũ -> Chỉnh sửa phân quyền
-- -> bật "Thêm, sửa, xóa tiêu chuẩn Quality Gates" cho Tester.
-- Hoàn tác: supabase/rollback/0022_rollback.sql

-- ------------------------------------------------------------
-- 1. Quyền mới trong cấu hình phân quyền
-- ------------------------------------------------------------
create or replace function public.perm_default(r text, p text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(case p
    when 'manage_project'     then r in ('pm')
    when 'write_tasks'        then r in ('pm', 'dev', 'ba', 'tester')
    when 'write_usecases'     then r in ('pm', 'dev', 'ba')
    when 'approve_quality'    then r in ('pm', 'tester')
    when 'edit_quality_items' then r in ('pm')
    when 'stage_analysis'     then r in ('pm', 'ba')
    when 'stage_design'       then r in ('pm', 'ba')
    when 'stage_coding'       then r in ('pm', 'dev')
    when 'stage_testing'      then r in ('pm', 'tester')
    when 'stage_acceptance'   then r in ('pm')
  end, false)
$$;

create or replace function public.is_configurable_permission(p text) returns boolean
language sql immutable set search_path = '' as $$
  select p in ('manage_project', 'write_tasks', 'write_usecases', 'approve_quality', 'edit_quality_items',
               'stage_analysis', 'stage_design', 'stage_coding', 'stage_testing', 'stage_acceptance')
$$;

create function public.can_edit_quality_items(pid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.is_admin() or public.role_has_perm(pid, public.project_role(pid), 'edit_quality_items'), false)
$$;

-- Ma trận hiệu lực: thêm quyền mới vào danh sách (bản của 0021 chỉ liệt kê 9 quyền).
create or replace function public.get_permission_matrix(pid uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  out jsonb := '{}'::jsonb;
  p text; r text; g boolean; pr boolean; eff boolean; src text; row_ jsonb;
begin
  if pid is not null and not coalesce(public.can_view_project(pid), false) then
    raise exception 'Bạn không có quyền xem cấu hình phân quyền của dự án này' using errcode = '42501';
  end if;
  if pid is null and auth.uid() is null then
    raise exception 'Chưa đăng nhập' using errcode = '42501';
  end if;
  foreach p in array array['manage_project', 'write_tasks', 'write_usecases', 'approve_quality', 'edit_quality_items',
                           'stage_analysis', 'stage_design', 'stage_coding', 'stage_testing', 'stage_acceptance'] loop
    row_ := '{}'::jsonb;
    foreach r in array array['pm', 'dev', 'ba', 'tester', 'viewer'] loop
      select rp.allowed into g from public.role_permissions rp where rp.project_id is null and rp.role = r and rp.permission = p;
      pr := null;
      if pid is not null then
        select rp.allowed into pr from public.role_permissions rp where rp.project_id = pid and rp.role = r and rp.permission = p;
      end if;
      eff := coalesce(pr, g, public.perm_default(r, p));
      src := case when pr is not null then 'project' when g is not null then 'global' else 'default' end;
      row_ := row_ || jsonb_build_object(r, jsonb_build_object('allowed', eff, 'source', src));
    end loop;
    out := out || jsonb_build_object(p, row_);
  end loop;
  return out;
end
$$;

-- Báo cáo quyền (0020/0021): thêm editQualityItems.
create or replace function public.my_access_report(pid uuid) returns jsonb
language plpgsql stable set search_path = '' as $$
begin
  return jsonb_build_object(
    'role', public.project_role(pid),
    'isAdmin', coalesce(public.is_admin(), false),
    'view', coalesce(public.can_view_project(pid), false),
    'manage', coalesce(public.can_manage_project(pid), false),
    'writeTasks', coalesce(public.can_write_tasks(pid), false),
    'writeUseCases', coalesce(public.can_write_usecases(pid), false),
    'approveQuality', coalesce(public.can_approve_quality(pid), false),
    'editQualityItems', coalesce(public.can_edit_quality_items(pid), false),
    'stages', jsonb_build_object(
      'analysis', coalesce(public.can_tick_stage(pid, 'analysis'), false),
      'design', coalesce(public.can_tick_stage(pid, 'design'), false),
      'coding', coalesce(public.can_tick_stage(pid, 'coding'), false),
      'testing', coalesce(public.can_tick_stage(pid, 'testing'), false),
      'acceptance', coalesce(public.can_tick_stage(pid, 'acceptance'), false)),
    'visible', jsonb_build_object(
      'useCases', (select count(*) from public.use_cases where project_id = pid),
      'tasks', (select count(*) from public.tasks where project_id = pid),
      'members', (select count(*) from public.project_members where project_id = pid)),
    'total', public._project_counts(pid)
  );
end
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
    'manage', coalesce(adm or public.role_has_perm(pid, r, 'manage_project'), false),
    'writeTasks', coalesce(adm or public.role_has_perm(pid, r, 'write_tasks'), false),
    'writeUseCases', coalesce(adm or public.role_has_perm(pid, r, 'write_usecases'), false),
    'approveQuality', coalesce(adm or public.role_has_perm(pid, r, 'approve_quality'), false),
    'editQualityItems', coalesce(adm or public.role_has_perm(pid, r, 'edit_quality_items'), false),
    'stages', jsonb_build_object(
      'analysis', coalesce(adm or public.role_has_perm(pid, r, 'stage_analysis'), false),
      'design', coalesce(adm or public.role_has_perm(pid, r, 'stage_design'), false),
      'coding', coalesce(adm or public.role_has_perm(pid, r, 'stage_coding'), false),
      'testing', coalesce(adm or public.role_has_perm(pid, r, 'stage_testing'), false),
      'acceptance', coalesce(adm or public.role_has_perm(pid, r, 'stage_acceptance'), false))
  );
end
$$;

-- ------------------------------------------------------------
-- 2. Chính sách: thêm / sửa nội dung / xóa theo quyền định nghĩa; thẩm định theo quyền thẩm định
-- ------------------------------------------------------------
drop policy qitems_insert on public.quality_items;
drop policy qitems_update on public.quality_items;
drop policy qitems_delete on public.quality_items;
create policy qitems_insert on public.quality_items for insert to authenticated
  with check (public.can_edit_quality_items(project_id));
-- Cho phép cập nhật nếu có MỘT trong hai quyền; trigger bên dưới chặn đổi sai cột theo từng quyền.
create policy qitems_update on public.quality_items for update to authenticated
  using (public.can_approve_quality(project_id) or public.can_edit_quality_items(project_id))
  with check (public.can_approve_quality(project_id) or public.can_edit_quality_items(project_id));
create policy qitems_delete on public.quality_items for delete to authenticated
  using (public.can_edit_quality_items(project_id));
grant delete on public.quality_items to authenticated;

create function public.trg_quality_item_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if current_setting('app.seeding', true) = 'on' then return new; end if;
  if new.project_id is distinct from old.project_id or new.phase_key is distinct from old.phase_key then
    raise exception 'Không được chuyển tiêu chuẩn sang dự án hoặc giai đoạn khác' using errcode = '42501';
  end if;
  if (new.title is distinct from old.title or new.description is distinct from old.description
      or new.is_mandatory is distinct from old.is_mandatory)
     and not coalesce(public.can_edit_quality_items(old.project_id), false) then
    raise exception 'Bạn không có quyền sửa nội dung tiêu chuẩn chất lượng' using errcode = '42501';
  end if;
  if (new.is_passed is distinct from old.is_passed or new.notes is distinct from old.notes)
     and not coalesce(public.can_approve_quality(old.project_id), false) then
    raise exception 'Bạn không có quyền thẩm định tiêu chuẩn chất lượng' using errcode = '42501';
  end if;
  return new;
end
$$;
create trigger quality_item_guard before update on public.quality_items
  for each row execute function public.trg_quality_item_guard();

-- Thêm/xóa tiêu chuẩn cũng làm số liệu "đạt/tổng" trong ảnh chụp tiến độ trong ngày thay đổi.
create function public.trg_quality_items_count_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.snapshot_project(coalesce(new.project_id, old.project_id));
  return null;
end
$$;
create trigger quality_items_count_snapshot after insert or delete on public.quality_items
  for each row execute function public.trg_quality_items_count_changed();

revoke execute on function public.trg_quality_item_guard(), public.trg_quality_items_count_changed() from public, anon, authenticated;
revoke execute on function public.can_edit_quality_items(uuid) from public, anon;
grant execute on function public.can_edit_quality_items(uuid) to authenticated;
