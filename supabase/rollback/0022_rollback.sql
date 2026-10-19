-- Hoàn tác migration 0022: tiêu chuẩn Quality Gates trở về dùng chung quyền "thẩm định" (PM + Tester) cho cả thêm/sửa/xóa.
-- Không mất dữ liệu tiêu chuẩn; các cấu hình "edit_quality_items" đã lưu trong role_permissions bị xóa.

delete from public.role_permissions where permission = 'edit_quality_items';
delete from public.role_permission_log where permission = 'edit_quality_items';

drop trigger if exists quality_items_count_snapshot on public.quality_items;
drop trigger if exists quality_item_guard on public.quality_items;
drop function if exists public.trg_quality_items_count_changed();
drop function if exists public.trg_quality_item_guard();

drop policy if exists qitems_insert on public.quality_items;
drop policy if exists qitems_update on public.quality_items;
drop policy if exists qitems_delete on public.quality_items;
create policy qitems_insert on public.quality_items for insert to authenticated
  with check (public.can_approve_quality(project_id));
create policy qitems_update on public.quality_items for update to authenticated
  using (public.can_approve_quality(project_id)) with check (public.can_approve_quality(project_id));
create policy qitems_delete on public.quality_items for delete to authenticated
  using (public.can_approve_quality(project_id));

create or replace function public.perm_default(r text, p text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(case p
    when 'manage_project'    then r in ('pm')
    when 'write_tasks'       then r in ('pm', 'dev', 'ba', 'tester')
    when 'write_usecases'    then r in ('pm', 'dev', 'ba')
    when 'approve_quality'   then r in ('pm', 'tester')
    when 'stage_analysis'    then r in ('pm', 'ba')
    when 'stage_design'      then r in ('pm', 'ba')
    when 'stage_coding'      then r in ('pm', 'dev')
    when 'stage_testing'     then r in ('pm', 'tester')
    when 'stage_acceptance'  then r in ('pm')
  end, false)
$$;

create or replace function public.is_configurable_permission(p text) returns boolean
language sql immutable set search_path = '' as $$
  select p in ('manage_project', 'write_tasks', 'write_usecases', 'approve_quality',
               'stage_analysis', 'stage_design', 'stage_coding', 'stage_testing', 'stage_acceptance')
$$;

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
  foreach p in array array['manage_project', 'write_tasks', 'write_usecases', 'approve_quality',
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
    'stages', jsonb_build_object(
      'analysis', coalesce(adm or public.role_has_perm(pid, r, 'stage_analysis'), false),
      'design', coalesce(adm or public.role_has_perm(pid, r, 'stage_design'), false),
      'coding', coalesce(adm or public.role_has_perm(pid, r, 'stage_coding'), false),
      'testing', coalesce(adm or public.role_has_perm(pid, r, 'stage_testing'), false),
      'acceptance', coalesce(adm or public.role_has_perm(pid, r, 'stage_acceptance'), false))
  );
end
$$;

drop function if exists public.can_edit_quality_items(uuid);
