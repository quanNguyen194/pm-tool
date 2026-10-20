-- Omni Project Manager - 0023: quản lý Bug / Yêu cầu thay đổi (issue) của dự án - nền tảng CSDL (bước 1).
--
--  * issue_types / issue_statuses : loại và trạng thái, riêng từng dự án (nhân bản từ mặc định khi tạo dự án), Admin/PM cấu hình.
--  * issues                        : mỗi dự án đánh số riêng (#1, #2...).
--  * issue_journals + _details     : nhật ký hoạt động kiểu Redmine, dạng cây (bình luận trả lời bình luận, tối đa 3 cấp);
--                                    mỗi lần đổi trạng thái/người xử lý/trường nào đều ghi giá trị cũ -> mới.
--  * Mọi thay đổi đi qua hàm (create_issue, update_issue...) kiểm quyền và ghi nhật ký trong MỘT giao dịch; không ghi trực tiếp bảng.
--  * Quyền mới trong ma trận phân quyền (0021): issue_create, issue_update, issue_edit, issue_assign, issue_delete,
--    config_issue_types, config_issue_statuses. Đổi trạng thái KHÔNG bị ràng buộc theo vai trò (đã có nhật ký truy vết).
--  * Thông báo: giao việc / đổi trạng thái / bình luận gửi cho người xử lý và người báo (kèm Telegram nếu đã liên kết).
-- Tệp ảnh/video đính kèm ở migration 0024. Hoàn tác: supabase/rollback/0023_rollback.sql

-- ------------------------------------------------------------
-- 1. Ma trận phân quyền: danh sách quyền cấu hình được ở MỘT chỗ + 7 quyền mới
-- ------------------------------------------------------------
create or replace function public.configurable_permissions() returns text[]
language sql immutable set search_path = '' as $$
  select array['manage_project', 'write_tasks', 'write_usecases', 'approve_quality', 'edit_quality_items',
               'stage_analysis', 'stage_design', 'stage_coding', 'stage_testing', 'stage_acceptance',
               'issue_create', 'issue_update', 'issue_edit', 'issue_assign', 'issue_delete',
               'config_issue_types', 'config_issue_statuses']
$$;

create or replace function public.is_configurable_permission(p text) returns boolean
language sql immutable set search_path = '' as $$
  select p = any (public.configurable_permissions())
$$;

create or replace function public.perm_default(r text, p text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(case p
    when 'manage_project'       then r in ('pm')
    when 'write_tasks'          then r in ('pm', 'dev', 'ba', 'tester')
    when 'write_usecases'       then r in ('pm', 'dev', 'ba')
    when 'approve_quality'      then r in ('pm', 'tester')
    when 'edit_quality_items'   then r in ('pm')
    when 'stage_analysis'       then r in ('pm', 'ba')
    when 'stage_design'         then r in ('pm', 'ba')
    when 'stage_coding'         then r in ('pm', 'dev')
    when 'stage_testing'        then r in ('pm', 'tester')
    when 'stage_acceptance'     then r in ('pm')
    when 'issue_create'         then r in ('pm', 'dev', 'ba', 'tester')
    when 'issue_update'         then r in ('pm', 'dev', 'ba', 'tester')
    when 'issue_edit'           then r in ('pm', 'ba')
    when 'issue_assign'         then r in ('pm')
    when 'issue_delete'         then r in ('pm')
    when 'config_issue_types'   then r in ('pm')
    when 'config_issue_statuses' then r in ('pm')
  end, false)
$$;

-- Ma trận hiệu lực: dùng danh sách chung thay vì liệt kê lại (bản của 0021/0022 liệt kê cứng).
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
  foreach p in array public.configurable_permissions() loop
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

create function public.can_create_issue(pid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.is_admin() or public.role_has_perm(pid, public.project_role(pid), 'issue_create'), false) $$;
create function public.can_update_issue(pid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.is_admin() or public.role_has_perm(pid, public.project_role(pid), 'issue_update'), false) $$;
create function public.can_edit_issue(pid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.is_admin() or public.role_has_perm(pid, public.project_role(pid), 'issue_edit'), false) $$;
create function public.can_assign_issue(pid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.is_admin() or public.role_has_perm(pid, public.project_role(pid), 'issue_assign'), false) $$;
create function public.can_delete_issue(pid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.is_admin() or public.role_has_perm(pid, public.project_role(pid), 'issue_delete'), false) $$;
create function public.can_config_issue_types(pid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.is_admin() or public.role_has_perm(pid, public.project_role(pid), 'config_issue_types'), false) $$;
create function public.can_config_issue_statuses(pid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.is_admin() or public.role_has_perm(pid, public.project_role(pid), 'config_issue_statuses'), false) $$;

-- Báo cáo quyền (0020/0022): thêm nhóm quyền issue.
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
    'issues', jsonb_build_object(
      'create', coalesce(public.can_create_issue(pid), false),
      'update', coalesce(public.can_update_issue(pid), false),
      'edit', coalesce(public.can_edit_issue(pid), false),
      'assign', coalesce(public.can_assign_issue(pid), false),
      'delete', coalesce(public.can_delete_issue(pid), false),
      'configTypes', coalesce(public.can_config_issue_types(pid), false),
      'configStatuses', coalesce(public.can_config_issue_statuses(pid), false)),
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
    'issues', jsonb_build_object(
      'create', coalesce(adm or public.role_has_perm(pid, r, 'issue_create'), false),
      'update', coalesce(adm or public.role_has_perm(pid, r, 'issue_update'), false),
      'edit', coalesce(adm or public.role_has_perm(pid, r, 'issue_edit'), false),
      'assign', coalesce(adm or public.role_has_perm(pid, r, 'issue_assign'), false),
      'delete', coalesce(adm or public.role_has_perm(pid, r, 'issue_delete'), false),
      'configTypes', coalesce(adm or public.role_has_perm(pid, r, 'config_issue_types'), false),
      'configStatuses', coalesce(adm or public.role_has_perm(pid, r, 'config_issue_statuses'), false)),
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
-- 2. Bảng
-- ------------------------------------------------------------
create table public.issue_types (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  color text not null default 'indigo' check (color in ('indigo', 'emerald', 'blue', 'amber', 'rose', 'purple', 'slate')),
  sort integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index issue_types_name_uq on public.issue_types (project_id, lower(btrim(name)));

create table public.issue_statuses (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  color text not null default 'indigo' check (color in ('indigo', 'emerald', 'blue', 'amber', 'rose', 'purple', 'slate')),
  -- open: còn mở; in_progress: đang xử lý; closed: đã đóng (không tính vào "còn mở")
  category text not null default 'open' check (category in ('open', 'in_progress', 'closed')),
  sort integer not null default 0,
  is_active boolean not null default true,
  is_initial boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index issue_statuses_name_uq on public.issue_statuses (project_id, lower(btrim(name)));
create unique index issue_statuses_initial_uq on public.issue_statuses (project_id) where is_initial;

create table public.issue_counters (
  project_id uuid primary key references public.projects (id) on delete cascade,
  last_number integer not null default 0
);

create table public.issues (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  number integer not null,
  type_id uuid not null references public.issue_types (id) on delete restrict,
  status_id uuid not null references public.issue_statuses (id) on delete restrict,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  description text not null default '',
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  severity text check (severity in ('minor', 'major', 'critical', 'blocker')),
  environment text not null default '' check (char_length(environment) <= 200),
  reporter_id uuid references public.profiles (id) on delete set null,
  assignee_id uuid references public.profiles (id) on delete set null,
  due_date date,
  use_case_id uuid references public.use_cases (id) on delete set null,
  task_id uuid references public.tasks (id) on delete set null,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, number)
);
create index issues_project_status_idx on public.issues (project_id, status_id);
create index issues_assignee_idx on public.issues (assignee_id) where assignee_id is not null;

create table public.issue_journals (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.issues (id) on delete cascade,
  parent_id uuid references public.issue_journals (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete set null,
  notes text not null default '',
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz
);
create index issue_journals_issue_idx on public.issue_journals (issue_id, created_at);

create table public.issue_journal_details (
  id bigserial primary key,
  journal_id uuid not null references public.issue_journals (id) on delete cascade,
  field text not null,
  old_value text,
  new_value text
);
create index issue_journal_details_journal_idx on public.issue_journal_details (journal_id);

-- Cây nhật ký tối đa 3 cấp và cha phải cùng issue
create function public.trg_issue_journal_tree() returns trigger
language plpgsql security definer set search_path = '' as $$
declare depth integer := 1; cur uuid := new.parent_id; pissue uuid;
begin
  if new.parent_id is null then return new; end if;
  select issue_id into pissue from public.issue_journals where id = new.parent_id;
  if pissue is distinct from new.issue_id then
    raise exception 'Bình luận cha không thuộc issue này' using errcode = '22023';
  end if;
  while cur is not null loop
    depth := depth + 1;
    select parent_id into cur from public.issue_journals where id = cur;
    if depth > 6 then exit; end if;
  end loop;
  if depth > 3 then
    raise exception 'Nhật ký chỉ trả lời được tối đa 3 cấp' using errcode = '22023';
  end if;
  return new;
end
$$;
create trigger issue_journal_tree before insert on public.issue_journals
  for each row execute function public.trg_issue_journal_tree();

-- RLS: thành viên xem được; mọi thay đổi qua hàm bên dưới
alter table public.issue_types enable row level security;
alter table public.issue_statuses enable row level security;
alter table public.issue_counters enable row level security;
alter table public.issues enable row level security;
alter table public.issue_journals enable row level security;
alter table public.issue_journal_details enable row level security;

create policy issue_types_select on public.issue_types for select to authenticated using (public.can_view_project(project_id));
create policy issue_statuses_select on public.issue_statuses for select to authenticated using (public.can_view_project(project_id));
create policy issues_select on public.issues for select to authenticated using (public.can_view_project(project_id));
create policy issue_journals_select on public.issue_journals for select to authenticated
  using (public.can_view_project((select i.project_id from public.issues i where i.id = issue_id)));
create policy issue_journal_details_select on public.issue_journal_details for select to authenticated
  using (public.can_view_project((select i.project_id from public.issues i join public.issue_journals j on j.issue_id = i.id where j.id = journal_id)));

revoke all on public.issue_types, public.issue_statuses, public.issue_counters, public.issues,
  public.issue_journals, public.issue_journal_details from anon;
revoke insert, update, delete on public.issue_types, public.issue_statuses, public.issues,
  public.issue_journals, public.issue_journal_details from authenticated;
revoke all on public.issue_counters from authenticated;
revoke all on sequence public.issue_journal_details_id_seq from anon, authenticated;

alter publication supabase_realtime add table public.issue_types, public.issue_statuses, public.issues,
  public.issue_journals, public.issue_journal_details;

-- ------------------------------------------------------------
-- 3. Thông báo cho issue
-- ------------------------------------------------------------
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('overdue', 'deadline_warning', 'quality_alert', 'system', 'issue'));
alter table public.notifications add column issue_id uuid references public.issues (id) on delete cascade;

create or replace function public.trg_notification_telegram() returns trigger
language plpgsql security definer set search_path = '' as $$
declare proj text; icon text;
begin
  if coalesce(current_setting('app.tg_digest', true), '') = '1' then return null; end if;
  select code into proj from public.projects where id = new.project_id;
  icon := case new.type when 'overdue' then '🚨' when 'deadline_warning' then '⏰' when 'quality_alert' then '⚠️' when 'issue' then '🐞' else 'ℹ️' end;
  perform public.telegram_notify_user(
    new.user_id,
    icon || ' ' || new.title || E'\n' || new.message || case when proj is null then '' else E'\nDự án: ' || proj end
  );
  return null;
end
$$;

-- ------------------------------------------------------------
-- 4. Cấu hình mặc định cho dự án (loại + trạng thái)
-- ------------------------------------------------------------
create function public.seed_issue_config(pid uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.issue_types where project_id = pid) then
    insert into public.issue_types (project_id, name, color, sort) values
      (pid, 'Bug', 'rose', 10),
      (pid, 'Yêu cầu thay đổi (CR)', 'amber', 20),
      (pid, 'Cải tiến', 'blue', 30),
      (pid, 'Câu hỏi / Hỗ trợ', 'purple', 40);
  end if;
  if not exists (select 1 from public.issue_statuses where project_id = pid) then
    insert into public.issue_statuses (project_id, name, color, category, sort, is_initial) values
      (pid, 'Mới', 'blue', 'open', 10, true),
      (pid, 'Đang thực hiện', 'indigo', 'in_progress', 20, false),
      (pid, 'Code xong', 'purple', 'in_progress', 30, false),
      (pid, 'Test xong', 'emerald', 'in_progress', 40, false),
      (pid, 'Chờ triển khai', 'amber', 'in_progress', 50, false),
      (pid, 'Sẵn sàng bàn giao', 'emerald', 'in_progress', 60, false),
      (pid, 'Đóng', 'slate', 'closed', 70, false),
      (pid, 'Mở lại', 'rose', 'open', 80, false),
      (pid, 'Chưa hoàn thiện', 'amber', 'open', 90, false);
  end if;
end
$$;

create function public.trg_project_issue_config() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.seed_issue_config(new.id);
  return null;
end
$$;
create trigger project_issue_config after insert on public.projects
  for each row execute function public.trg_project_issue_config();

-- Dự án đã có: nạp cấu hình mặc định
do $$
declare r record;
begin
  for r in select id from public.projects loop
    perform public.seed_issue_config(r.id);
  end loop;
end
$$;

-- ------------------------------------------------------------
-- 5. Hàm nội bộ
-- ------------------------------------------------------------
create function public._issue_notify(p_issue public.issues, p_users uuid[], p_title text, p_message text) returns void
language plpgsql security definer set search_path = '' as $$
declare u uuid;
begin
  foreach u in array coalesce(p_users, '{}') loop
    if u is not null and u is distinct from auth.uid() then
      insert into public.notifications (user_id, project_id, type, title, message, issue_id)
      values (u, p_issue.project_id, 'issue', left(p_title, 200), left(p_message, 600), p_issue.id);
    end if;
  end loop;
end
$$;

create function public._issue_value_label(p_field text, p_value text) returns text
language plpgsql stable security definer set search_path = '' as $$
declare out text;
begin
  if p_value is null or p_value = '' then return null; end if;
  case p_field
    when 'status' then select name into out from public.issue_statuses where id = p_value::uuid;
    when 'type' then select name into out from public.issue_types where id = p_value::uuid;
    when 'assignee' then select name into out from public.profiles where id = p_value::uuid;
    when 'use_case' then select code || ' ' || title into out from public.use_cases where id = p_value::uuid;
    when 'task' then select code || ' ' || title into out from public.tasks where id = p_value::uuid;
    when 'priority' then out := case p_value when 'low' then 'Thấp' when 'medium' then 'Trung bình' when 'high' then 'Cao' when 'urgent' then 'Khẩn cấp' else p_value end;
    when 'severity' then out := case p_value when 'minor' then 'Nhẹ' when 'major' then 'Nghiêm trọng' when 'critical' then 'Rất nghiêm trọng' when 'blocker' then 'Chặn tiến độ' else p_value end;
    else out := p_value;
  end case;
  return coalesce(out, p_value);
end
$$;

-- ------------------------------------------------------------
-- 6. Tạo issue
-- ------------------------------------------------------------
create function public.create_issue(
  p_project uuid, p_type uuid, p_title text, p_description text default '', p_priority text default 'medium',
  p_severity text default null, p_environment text default '', p_assignee uuid default null, p_due date default null,
  p_use_case uuid default null, p_task uuid default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid(); v_status uuid; v_num integer; v_id uuid; v_issue public.issues; v_name text;
begin
  if me is null or not coalesce(public.can_create_issue(p_project), false) then
    raise exception 'Bạn không có quyền ghi nhận lỗi/yêu cầu cho dự án này' using errcode = '42501';
  end if;
  if btrim(coalesce(p_title, '')) = '' then raise exception 'Tiêu đề không được trống' using errcode = '22023'; end if;
  if not exists (select 1 from public.issue_types t where t.id = p_type and t.project_id = p_project and t.is_active) then
    raise exception 'Loại issue không hợp lệ hoặc đã bị ẩn' using errcode = '22023';
  end if;
  select id into v_status from public.issue_statuses where project_id = p_project and is_initial and is_active;
  if v_status is null then raise exception 'Dự án chưa có trạng thái khởi tạo' using errcode = '22023'; end if;
  if p_assignee is not null then
    if not coalesce(public.can_assign_issue(p_project), false) then
      raise exception 'Bạn không có quyền phân công người xử lý' using errcode = '42501';
    end if;
    if not exists (select 1 from public.project_members m where m.project_id = p_project and m.user_id = p_assignee) then
      raise exception 'Người xử lý phải là thành viên của dự án' using errcode = '22023';
    end if;
  end if;
  if p_use_case is not null and not exists (select 1 from public.use_cases u where u.id = p_use_case and u.project_id = p_project) then
    raise exception 'Use case không thuộc dự án' using errcode = '22023';
  end if;
  if p_task is not null and not exists (select 1 from public.tasks t where t.id = p_task and t.project_id = p_project) then
    raise exception 'Nhiệm vụ không thuộc dự án' using errcode = '22023';
  end if;

  insert into public.issue_counters (project_id, last_number) values (p_project, 1)
  on conflict (project_id) do update set last_number = public.issue_counters.last_number + 1
  returning last_number into v_num;

  insert into public.issues (project_id, number, type_id, status_id, title, description, priority, severity, environment,
                             reporter_id, assignee_id, due_date, use_case_id, task_id)
  values (p_project, v_num, p_type, v_status, btrim(p_title), coalesce(p_description, ''), coalesce(p_priority, 'medium'),
          nullif(p_severity, ''), coalesce(p_environment, ''), me, p_assignee, p_due, p_use_case, p_task)
  returning * into v_issue;

  if p_assignee is not null then
    select name into v_name from public.profiles where id = me;
    perform public._issue_notify(v_issue, array[p_assignee], 'Issue #' || v_num || ': bạn được giao xử lý',
      coalesce(v_name, 'Ai đó') || ' giao cho bạn: ' || v_issue.title);
  end if;
  return jsonb_build_object('id', v_issue.id, 'number', v_num);
end
$$;

-- ------------------------------------------------------------
-- 7. Cập nhật issue + nhật ký (Redmine): đổi trường, ghi chú, trả lời bình luận
-- ------------------------------------------------------------
create function public.update_issue(p_issue uuid, p_changes jsonb default '{}'::jsonb, p_notes text default '', p_parent uuid default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  i public.issues;
  n public.issues;
  ch jsonb := coalesce(p_changes, '{}'::jsonb);
  notes text := btrim(coalesce(p_notes, ''));
  can_upd boolean; can_edit boolean; can_asg boolean; own boolean;
  k text; v jsonb; txt text;
  d_field text[] := '{}'; d_old text[] := '{}'; d_new text[] := '{}';
  jid uuid; idx integer; actor_name text; summary text; cat_new text; cat_old text;
  status_changed boolean := false; assignee_changed boolean := false;
begin
  select * into i from public.issues where id = p_issue for update;
  if not found then raise exception 'Không tìm thấy issue' using errcode = 'P0002'; end if;
  if me is null or not coalesce(public.can_view_project(i.project_id), false) then
    raise exception 'Bạn không có quyền với issue này' using errcode = '42501';
  end if;
  can_upd := coalesce(public.can_update_issue(i.project_id), false);
  can_edit := coalesce(public.can_edit_issue(i.project_id), false);
  can_asg := coalesce(public.can_assign_issue(i.project_id), false);
  own := i.reporter_id = me and exists (select 1 from public.issue_statuses s where s.id = i.status_id and s.is_initial);

  if p_parent is not null and ch <> '{}'::jsonb then
    raise exception 'Trả lời một bình luận chỉ được ghi chú, không đổi trường' using errcode = '22023';
  end if;
  if (notes <> '' or p_parent is not null) and not can_upd then
    raise exception 'Bạn không có quyền cập nhật/bình luận issue' using errcode = '42501';
  end if;
  if p_parent is not null and not exists (select 1 from public.issue_journals j where j.id = p_parent and j.issue_id = p_issue and j.deleted_at is null) then
    raise exception 'Không tìm thấy bình luận để trả lời' using errcode = '22023';
  end if;
  if p_parent is not null and notes = '' then
    raise exception 'Nội dung trả lời không được trống' using errcode = '22023';
  end if;
  if char_length(notes) > 20000 then raise exception 'Ghi chú quá dài' using errcode = '22023'; end if;

  n := i;
  for k, v in select key, value from jsonb_each(ch) loop
    if k not in ('status_id', 'assignee_id', 'type_id', 'priority', 'severity', 'title', 'description', 'environment', 'due_date', 'use_case_id', 'task_id') then
      raise exception 'Trường không được phép đổi: %', k using errcode = '22023';
    end if;
    if k = 'status_id' then
      if not can_upd then raise exception 'Bạn không có quyền đổi trạng thái' using errcode = '42501'; end if;
      if jsonb_typeof(v) = 'null' or not exists (select 1 from public.issue_statuses s where s.id = (v #>> '{}')::uuid and s.project_id = i.project_id and (s.is_active or s.id = i.status_id)) then
        raise exception 'Trạng thái không hợp lệ' using errcode = '22023';
      end if;
      n.status_id := (v #>> '{}')::uuid;
    elsif k = 'assignee_id' then
      if not can_asg then raise exception 'Bạn không có quyền phân công người xử lý' using errcode = '42501'; end if;
      if jsonb_typeof(v) = 'null' then n.assignee_id := null;
      else
        if not exists (select 1 from public.project_members m where m.project_id = i.project_id and m.user_id = (v #>> '{}')::uuid) then
          raise exception 'Người xử lý phải là thành viên của dự án' using errcode = '22023';
        end if;
        n.assignee_id := (v #>> '{}')::uuid;
      end if;
    else
      if not (can_edit or own) then raise exception 'Bạn không có quyền sửa nội dung issue' using errcode = '42501'; end if;
      if k = 'type_id' then
        if jsonb_typeof(v) = 'null' or not exists (select 1 from public.issue_types t where t.id = (v #>> '{}')::uuid and t.project_id = i.project_id and (t.is_active or t.id = i.type_id)) then
          raise exception 'Loại issue không hợp lệ' using errcode = '22023';
        end if;
        n.type_id := (v #>> '{}')::uuid;
      elsif k = 'priority' then
        if jsonb_typeof(v) = 'null' or (v #>> '{}') not in ('low', 'medium', 'high', 'urgent') then raise exception 'Độ ưu tiên không hợp lệ' using errcode = '22023'; end if;
        n.priority := v #>> '{}';
      elsif k = 'severity' then
        if jsonb_typeof(v) = 'null' or (v #>> '{}') = '' then n.severity := null;
        elsif (v #>> '{}') not in ('minor', 'major', 'critical', 'blocker') then raise exception 'Mức nghiêm trọng không hợp lệ' using errcode = '22023';
        else n.severity := v #>> '{}'; end if;
      elsif k = 'title' then
        txt := btrim(coalesce(v #>> '{}', ''));
        if txt = '' or char_length(txt) > 200 then raise exception 'Tiêu đề phải từ 1 đến 200 ký tự' using errcode = '22023'; end if;
        n.title := txt;
      elsif k = 'description' then
        txt := coalesce(v #>> '{}', '');
        if char_length(txt) > 20000 then raise exception 'Mô tả quá dài' using errcode = '22023'; end if;
        n.description := txt;
      elsif k = 'environment' then
        txt := coalesce(v #>> '{}', '');
        if char_length(txt) > 200 then raise exception 'Môi trường tối đa 200 ký tự' using errcode = '22023'; end if;
        n.environment := txt;
      elsif k = 'due_date' then
        n.due_date := case when jsonb_typeof(v) = 'null' or (v #>> '{}') = '' then null else (v #>> '{}')::date end;
      elsif k = 'use_case_id' then
        if jsonb_typeof(v) = 'null' then n.use_case_id := null;
        else
          if not exists (select 1 from public.use_cases u where u.id = (v #>> '{}')::uuid and u.project_id = i.project_id) then
            raise exception 'Use case không thuộc dự án' using errcode = '22023';
          end if;
          n.use_case_id := (v #>> '{}')::uuid;
        end if;
      elsif k = 'task_id' then
        if jsonb_typeof(v) = 'null' then n.task_id := null;
        else
          if not exists (select 1 from public.tasks t where t.id = (v #>> '{}')::uuid and t.project_id = i.project_id) then
            raise exception 'Nhiệm vụ không thuộc dự án' using errcode = '22023';
          end if;
          n.task_id := (v #>> '{}')::uuid;
        end if;
      end if;
    end if;
  end loop;

  -- Ghi lại các trường thật sự thay đổi (giá trị cũ -> mới dạng chữ dễ đọc)
  if n.status_id is distinct from i.status_id then
    d_field := array_append(d_field, 'status'); d_old := d_old || coalesce(public._issue_value_label('status', i.status_id::text), '—'); d_new := d_new || coalesce(public._issue_value_label('status', n.status_id::text), '—'); status_changed := true;
  end if;
  if n.assignee_id is distinct from i.assignee_id then
    d_field := array_append(d_field, 'assignee'); d_old := d_old || coalesce(public._issue_value_label('assignee', i.assignee_id::text), '—'); d_new := d_new || coalesce(public._issue_value_label('assignee', n.assignee_id::text), '—'); assignee_changed := true;
  end if;
  if n.type_id is distinct from i.type_id then
    d_field := array_append(d_field, 'type'); d_old := d_old || coalesce(public._issue_value_label('type', i.type_id::text), '—'); d_new := d_new || coalesce(public._issue_value_label('type', n.type_id::text), '—');
  end if;
  if n.priority is distinct from i.priority then
    d_field := array_append(d_field, 'priority'); d_old := d_old || public._issue_value_label('priority', i.priority); d_new := d_new || public._issue_value_label('priority', n.priority);
  end if;
  if n.severity is distinct from i.severity then
    d_field := array_append(d_field, 'severity'); d_old := d_old || coalesce(public._issue_value_label('severity', i.severity), '—'); d_new := d_new || coalesce(public._issue_value_label('severity', n.severity), '—');
  end if;
  if n.title is distinct from i.title then d_field := array_append(d_field, 'title'); d_old := d_old || i.title; d_new := d_new || n.title; end if;
  if n.description is distinct from i.description then d_field := array_append(d_field, 'description'); d_old := d_old || i.description; d_new := d_new || n.description; end if;
  if n.environment is distinct from i.environment then d_field := array_append(d_field, 'environment'); d_old := d_old || coalesce(nullif(i.environment, ''), '—'); d_new := d_new || coalesce(nullif(n.environment, ''), '—'); end if;
  if n.due_date is distinct from i.due_date then d_field := array_append(d_field, 'due_date'); d_old := d_old || coalesce(to_char(i.due_date, 'YYYY-MM-DD'), '—'); d_new := d_new || coalesce(to_char(n.due_date, 'YYYY-MM-DD'), '—'); end if;
  if n.use_case_id is distinct from i.use_case_id then
    d_field := array_append(d_field, 'use_case'); d_old := d_old || coalesce(public._issue_value_label('use_case', i.use_case_id::text), '—'); d_new := d_new || coalesce(public._issue_value_label('use_case', n.use_case_id::text), '—');
  end if;
  if n.task_id is distinct from i.task_id then
    d_field := array_append(d_field, 'task'); d_old := d_old || coalesce(public._issue_value_label('task', i.task_id::text), '—'); d_new := d_new || coalesce(public._issue_value_label('task', n.task_id::text), '—');
  end if;

  if cardinality(d_field) = 0 and notes = '' then
    raise exception 'Không có thay đổi nào để lưu' using errcode = '22023';
  end if;

  if cardinality(d_field) > 0 then
    select category into cat_old from public.issue_statuses where id = i.status_id;
    select category into cat_new from public.issue_statuses where id = n.status_id;
    update public.issues set
      type_id = n.type_id, status_id = n.status_id, title = n.title, description = n.description, priority = n.priority,
      severity = n.severity, environment = n.environment, assignee_id = n.assignee_id, due_date = n.due_date,
      use_case_id = n.use_case_id, task_id = n.task_id, updated_at = now(),
      closed_at = case when cat_new = 'closed' and cat_old is distinct from 'closed' then now()
                       when cat_new is distinct from 'closed' then null else i.closed_at end
     where id = p_issue;
  else
    update public.issues set updated_at = now() where id = p_issue;
  end if;

  insert into public.issue_journals (issue_id, parent_id, user_id, notes) values (p_issue, p_parent, me, notes) returning id into jid;
  for idx in 1 .. cardinality(d_field) loop
    insert into public.issue_journal_details (journal_id, field, old_value, new_value) values (jid, d_field[idx], d_old[idx], d_new[idx]);
  end loop;

  -- Thông báo cho người xử lý và người báo (không báo cho chính người thao tác)
  select name into actor_name from public.profiles where id = me;
  summary := case
    when status_changed then 'trạng thái → ' || d_new[array_position(d_field, 'status')]
    when assignee_changed then 'giao cho ' || d_new[array_position(d_field, 'assignee')]
    when cardinality(d_field) > 0 then 'cập nhật thông tin'
    else 'bình luận mới' end;
  perform public._issue_notify(n, array[n.assignee_id, n.reporter_id, case when assignee_changed then i.assignee_id end],
    'Issue #' || n.number || ': ' || summary,
    coalesce(actor_name, 'Ai đó') || ' — ' || n.title || case when notes <> '' then E'\n"' || left(notes, 200) || '"' else '' end);

  return jsonb_build_object('journalId', jid, 'changed', cardinality(d_field));
end
$$;

-- Sửa ghi chú của chính mình / xóa ghi chú (PM, Admin)
create function public.edit_issue_note(p_journal uuid, p_notes text) returns void
language plpgsql security definer set search_path = '' as $$
declare j public.issue_journals; pid uuid;
begin
  select * into j from public.issue_journals where id = p_journal;
  if not found or j.deleted_at is not null then raise exception 'Không tìm thấy ghi chú' using errcode = 'P0002'; end if;
  select project_id into pid from public.issues where id = j.issue_id;
  if auth.uid() is null or (j.user_id is distinct from auth.uid() and not coalesce(public.is_admin(), false)) then
    raise exception 'Chỉ người viết mới sửa được ghi chú của mình' using errcode = '42501';
  end if;
  if not coalesce(public.can_update_issue(pid), false) then
    raise exception 'Bạn không có quyền cập nhật issue' using errcode = '42501';
  end if;
  if btrim(coalesce(p_notes, '')) = '' or char_length(p_notes) > 20000 then
    raise exception 'Nội dung ghi chú không hợp lệ' using errcode = '22023';
  end if;
  update public.issue_journals set notes = btrim(p_notes), edited_at = now() where id = p_journal;
end
$$;

create function public.delete_issue_note(p_journal uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare j public.issue_journals; pid uuid;
begin
  select * into j from public.issue_journals where id = p_journal;
  if not found then raise exception 'Không tìm thấy ghi chú' using errcode = 'P0002'; end if;
  select project_id into pid from public.issues where id = j.issue_id;
  if auth.uid() is null or not coalesce(public.can_delete_issue(pid), false) then
    raise exception 'Bạn không có quyền xóa ghi chú' using errcode = '42501';
  end if;
  -- Giữ dấu vết: xóa nội dung, đánh dấu đã xóa (chi tiết đổi trường của dòng này, nếu có, vẫn còn)
  update public.issue_journals set notes = '', deleted_at = now() where id = p_journal;
end
$$;

create function public.delete_issue(p_issue uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare pid uuid;
begin
  select project_id into pid from public.issues where id = p_issue;
  if pid is null then raise exception 'Không tìm thấy issue' using errcode = 'P0002'; end if;
  if auth.uid() is null or not coalesce(public.can_delete_issue(pid), false) then
    raise exception 'Bạn không có quyền xóa issue' using errcode = '42501';
  end if;
  delete from public.issues where id = p_issue;
end
$$;

-- ------------------------------------------------------------
-- 8. Cấu hình loại / trạng thái (Admin, PM theo ma trận phân quyền)
-- p_items: [{id?, name, color, active, (category, initial cho trạng thái)}] theo đúng thứ tự hiển thị.
-- p_delete: id cần xóa (chỉ xóa được khi chưa có issue nào dùng; nếu đã dùng hãy ẩn).
-- ------------------------------------------------------------
create function public.save_issue_types(p_project uuid, p_items jsonb, p_delete uuid[] default '{}') returns void
language plpgsql security definer set search_path = '' as $$
declare it record; ord integer := 0; d uuid;
begin
  if auth.uid() is null or not coalesce(public.can_config_issue_types(p_project), false) then
    raise exception 'Bạn không có quyền cấu hình loại issue' using errcode = '42501';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 30 then
    raise exception 'Danh sách loại issue không hợp lệ (tối đa 30)' using errcode = '22023';
  end if;
  foreach d in array coalesce(p_delete, '{}') loop
    if not exists (select 1 from public.issue_types where id = d and project_id = p_project) then
      raise exception 'Loại issue cần xóa không thuộc dự án' using errcode = '22023';
    end if;
    if exists (select 1 from public.issues where type_id = d) then
      raise exception 'Loại issue đang có issue sử dụng: hãy ẩn thay vì xóa' using errcode = '22023';
    end if;
    delete from public.issue_types where id = d;
  end loop;
  for it in select * from jsonb_to_recordset(p_items) as x(id uuid, name text, color text, active boolean) loop
    ord := ord + 10;
    if it.id is null then
      insert into public.issue_types (project_id, name, color, sort, is_active)
      values (p_project, btrim(coalesce(it.name, '')), coalesce(it.color, 'indigo'), ord, coalesce(it.active, true));
    else
      update public.issue_types set name = btrim(coalesce(it.name, '')), color = coalesce(it.color, color), sort = ord, is_active = coalesce(it.active, true)
       where id = it.id and project_id = p_project;
      if not found then raise exception 'Loại issue không thuộc dự án' using errcode = '22023'; end if;
    end if;
  end loop;
  if not exists (select 1 from public.issue_types where project_id = p_project and is_active) then
    raise exception 'Phải còn ít nhất một loại issue đang bật' using errcode = '22023';
  end if;
exception when unique_violation then
  raise exception 'Tên loại issue bị trùng trong dự án' using errcode = '23505';
end
$$;

create function public.save_issue_statuses(p_project uuid, p_items jsonb, p_delete uuid[] default '{}') returns void
language plpgsql security definer set search_path = '' as $$
declare it record; ord integer := 0; d uuid; n_init integer;
begin
  if auth.uid() is null or not coalesce(public.can_config_issue_statuses(p_project), false) then
    raise exception 'Bạn không có quyền cấu hình trạng thái issue' using errcode = '42501';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 30 then
    raise exception 'Danh sách trạng thái không hợp lệ (tối đa 30)' using errcode = '22023';
  end if;
  foreach d in array coalesce(p_delete, '{}') loop
    if not exists (select 1 from public.issue_statuses where id = d and project_id = p_project) then
      raise exception 'Trạng thái cần xóa không thuộc dự án' using errcode = '22023';
    end if;
    if exists (select 1 from public.issues where status_id = d) then
      raise exception 'Trạng thái đang có issue sử dụng: hãy ẩn thay vì xóa' using errcode = '22023';
    end if;
    delete from public.issue_statuses where id = d;
  end loop;
  update public.issue_statuses set is_initial = false where project_id = p_project;
  for it in select * from jsonb_to_recordset(p_items) as x(id uuid, name text, color text, category text, active boolean, initial boolean) loop
    ord := ord + 10;
    if it.category is not null and it.category not in ('open', 'in_progress', 'closed') then
      raise exception 'Nhóm trạng thái không hợp lệ: %', it.category using errcode = '22023';
    end if;
    if it.id is null then
      insert into public.issue_statuses (project_id, name, color, category, sort, is_active, is_initial)
      values (p_project, btrim(coalesce(it.name, '')), coalesce(it.color, 'indigo'), coalesce(it.category, 'open'), ord, coalesce(it.active, true), coalesce(it.initial, false));
    else
      update public.issue_statuses set name = btrim(coalesce(it.name, '')), color = coalesce(it.color, color), category = coalesce(it.category, category),
             sort = ord, is_active = coalesce(it.active, true), is_initial = coalesce(it.initial, false)
       where id = it.id and project_id = p_project;
      if not found then raise exception 'Trạng thái không thuộc dự án' using errcode = '22023'; end if;
    end if;
  end loop;
  select count(*) into n_init from public.issue_statuses where project_id = p_project and is_initial and is_active;
  if n_init <> 1 then
    raise exception 'Phải có đúng một trạng thái khởi tạo (đang bật) cho issue mới' using errcode = '22023';
  end if;
  if exists (select 1 from public.issue_statuses where project_id = p_project and is_initial and category = 'closed') then
    raise exception 'Trạng thái khởi tạo không thể thuộc nhóm "đã đóng"' using errcode = '22023';
  end if;
exception when unique_violation then
  raise exception 'Tên trạng thái bị trùng trong dự án' using errcode = '23505';
end
$$;

-- ------------------------------------------------------------
-- 9. Quyền hàm
-- ------------------------------------------------------------
revoke execute on function
  public.configurable_permissions(), public.can_create_issue(uuid), public.can_update_issue(uuid), public.can_edit_issue(uuid),
  public.can_assign_issue(uuid), public.can_delete_issue(uuid), public.can_config_issue_types(uuid), public.can_config_issue_statuses(uuid),
  public.seed_issue_config(uuid), public.trg_project_issue_config(), public.trg_issue_journal_tree(),
  public._issue_notify(public.issues, uuid[], text, text), public._issue_value_label(text, text),
  public.create_issue(uuid, uuid, text, text, text, text, text, uuid, date, uuid, uuid),
  public.update_issue(uuid, jsonb, text, uuid), public.edit_issue_note(uuid, text), public.delete_issue_note(uuid),
  public.delete_issue(uuid), public.save_issue_types(uuid, jsonb, uuid[]), public.save_issue_statuses(uuid, jsonb, uuid[])
  from public, anon;
revoke execute on function
  public.seed_issue_config(uuid), public.trg_project_issue_config(), public.trg_issue_journal_tree(),
  public._issue_notify(public.issues, uuid[], text, text), public._issue_value_label(text, text)
  from authenticated;
grant execute on function
  public.configurable_permissions(), public.can_create_issue(uuid), public.can_update_issue(uuid), public.can_edit_issue(uuid),
  public.can_assign_issue(uuid), public.can_delete_issue(uuid), public.can_config_issue_types(uuid), public.can_config_issue_statuses(uuid),
  public.create_issue(uuid, uuid, text, text, text, text, text, uuid, date, uuid, uuid),
  public.update_issue(uuid, jsonb, text, uuid), public.edit_issue_note(uuid, text), public.delete_issue_note(uuid),
  public.delete_issue(uuid), public.save_issue_types(uuid, jsonb, uuid[]), public.save_issue_statuses(uuid, jsonb, uuid[])
  to authenticated;
