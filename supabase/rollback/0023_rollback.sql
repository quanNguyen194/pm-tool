-- Hoàn tác migration 0023 (quản lý issue). MẤT DỮ LIỆU: toàn bộ issue, nhật ký, loại và trạng thái issue; cấu hình phân quyền
-- của các quyền issue; thông báo loại "issue". (Tệp đính kèm ở migration 0024 phải hoàn tác TRƯỚC.)

delete from public.role_permissions where permission in ('issue_create','issue_update','issue_edit','issue_assign','issue_delete','config_issue_types','config_issue_statuses');
delete from public.role_permission_log where permission in ('issue_create','issue_update','issue_edit','issue_assign','issue_delete','config_issue_types','config_issue_statuses');
delete from public.notifications where type = 'issue';

drop trigger if exists project_issue_config on public.projects;
drop function if exists public.trg_project_issue_config();
drop function if exists public.seed_issue_config(uuid);

drop function if exists public.save_issue_statuses(uuid, jsonb, uuid[]);
drop function if exists public.save_issue_types(uuid, jsonb, uuid[]);
drop function if exists public.delete_issue(uuid);
drop function if exists public.delete_issue_note(uuid);
drop function if exists public.edit_issue_note(uuid, text);
drop function if exists public.update_issue(uuid, jsonb, text, uuid);
drop function if exists public.create_issue(uuid, uuid, text, text, text, text, text, uuid, date, uuid, uuid);
drop function if exists public._issue_value_label(text, text);

alter table public.notifications drop column if exists issue_id;
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('overdue', 'deadline_warning', 'quality_alert', 'system'));
drop function if exists public._issue_notify(public.issues, uuid[], text, text);

drop table if exists public.issue_journal_details;
drop table if exists public.issue_journals;
drop function if exists public.trg_issue_journal_tree();
drop table if exists public.issues;
drop table if exists public.issue_counters;
drop table if exists public.issue_statuses;
drop table if exists public.issue_types;

-- Trả các hàm phân quyền về bản của migration 0022
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

create or replace function public.trg_notification_telegram() returns trigger
language plpgsql security definer set search_path = '' as $$
declare proj text; icon text;
begin
  if coalesce(current_setting('app.tg_digest', true), '') = '1' then return null; end if;
  select code into proj from public.projects where id = new.project_id;
  icon := case new.type when 'overdue' then '🚨' when 'deadline_warning' then '⏰' when 'quality_alert' then '⚠️' else 'ℹ️' end;
  perform public.telegram_notify_user(
    new.user_id,
    icon || ' ' || new.title || E'\n' || new.message || case when proj is null then '' else E'\nDự án: ' || proj end
  );
  return null;
end
$$;

drop function if exists public.can_config_issue_statuses(uuid);
drop function if exists public.can_config_issue_types(uuid);
drop function if exists public.can_delete_issue(uuid);
drop function if exists public.can_assign_issue(uuid);
drop function if exists public.can_edit_issue(uuid);
drop function if exists public.can_update_issue(uuid);
drop function if exists public.can_create_issue(uuid);
drop function if exists public.configurable_permissions();
