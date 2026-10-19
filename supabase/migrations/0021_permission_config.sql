-- Omni Project Manager - 0021: quản trị viên cấu hình ma trận phân quyền (vai trò x quyền), mặc định toàn hệ thống hoặc riêng từng dự án.
--
-- Trước đây quyền của từng vai trò được viết cứng trong các hàm can_*. Giờ các hàm đó tra bảng role_permissions:
--   ưu tiên 1: ghi đè riêng của dự án; ưu tiên 2: ghi đè toàn hệ thống; ưu tiên 3: mặc định có sẵn (bằng đúng ma trận cũ).
-- Không có dòng nào trong bảng thì mọi thứ hoạt động y như trước.
--
-- Quy tắc an toàn:
--   * Chỉ quản trị viên hệ thống (profiles.is_admin) được đổi cấu hình; quản trị viên luôn có đủ mọi quyền (không lưu trong bảng).
--   * Chỉ cấu hình được 9 quyền có kiểm tra thật ở CSDL: manage_project, write_tasks, write_usecases, approve_quality và 5 bước use case.
--     Các quyền còn lại (xem dự án, tạo dự án, chọn người thực hiện...) là cố định.
--   * Mọi thay đổi được ghi nhật ký (role_permission_log).
-- Hoàn tác: supabase/rollback/0021_rollback.sql (trả về ma trận cố định như trước)

-- ------------------------------------------------------------
-- 1. Mặc định có sẵn
-- ------------------------------------------------------------
create function public.perm_default(r text, p text) returns boolean
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

create function public.is_configurable_permission(p text) returns boolean
language sql immutable set search_path = '' as $$
  select p in ('manage_project', 'write_tasks', 'write_usecases', 'approve_quality',
               'stage_analysis', 'stage_design', 'stage_coding', 'stage_testing', 'stage_acceptance')
$$;

-- ------------------------------------------------------------
-- 2. Bảng cấu hình + nhật ký
-- ------------------------------------------------------------
create table public.role_permissions (
  id bigserial primary key, -- cần khóa chính để realtime phát được sự kiện xóa
  project_id uuid references public.projects (id) on delete cascade, -- null = mặc định toàn hệ thống
  role text not null check (role in ('pm', 'dev', 'ba', 'tester', 'viewer')),
  permission text not null check (public.is_configurable_permission(permission)),
  allowed boolean not null,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);
create unique index role_permissions_global_uq on public.role_permissions (role, permission) where project_id is null;
create unique index role_permissions_project_uq on public.role_permissions (project_id, role, permission) where project_id is not null;

alter table public.role_permissions enable row level security;
-- Thành viên xem được cấu hình của dự án mình; cấu hình toàn hệ thống ai đăng nhập cũng đọc được (không nhạy cảm). Ghi chỉ qua RPC.
create policy role_permissions_select on public.role_permissions for select to authenticated
  using (project_id is null or public.can_view_project(project_id));
revoke all on public.role_permissions from anon;
revoke insert, update, delete on public.role_permissions from authenticated;
alter publication supabase_realtime add table public.role_permissions;

create table public.role_permission_log (
  id bigserial primary key,
  project_id uuid references public.projects (id) on delete cascade,
  role text not null,
  permission text not null,
  old_allowed boolean not null,
  new_allowed boolean not null,
  changed_by uuid references public.profiles (id) on delete set null,
  changed_at timestamptz not null default now()
);
create index role_permission_log_idx on public.role_permission_log (project_id, changed_at desc);
alter table public.role_permission_log enable row level security;
revoke all on public.role_permission_log from anon, authenticated;

-- ------------------------------------------------------------
-- 3. Tra quyền hiệu lực + viết lại các hàm can_*
-- ------------------------------------------------------------
create function public.role_has_perm(pid uuid, r text, p text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case when r is null then false else coalesce(
    (select rp.allowed from public.role_permissions rp where rp.project_id = pid and rp.role = r and rp.permission = p),
    (select rp.allowed from public.role_permissions rp where rp.project_id is null and rp.role = r and rp.permission = p),
    public.perm_default(r, p)) end
$$;

create or replace function public.can_manage_project(pid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.is_admin() or public.role_has_perm(pid, public.project_role(pid), 'manage_project'), false)
$$;

create or replace function public.can_write_tasks(pid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.is_admin() or public.role_has_perm(pid, public.project_role(pid), 'write_tasks'), false)
$$;

create or replace function public.can_write_usecases(pid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.is_admin() or public.role_has_perm(pid, public.project_role(pid), 'write_usecases'), false)
$$;

create or replace function public.can_approve_quality(pid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.is_admin() or public.role_has_perm(pid, public.project_role(pid), 'approve_quality'), false)
$$;

create or replace function public.can_tick_stage(pid uuid, s text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.is_admin() or public.role_has_perm(pid, public.project_role(pid), 'stage_' || s), false)
$$;

-- Báo cáo quyền của một thành viên khác (0020): dùng cùng cấu hình hiệu lực.
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

-- ------------------------------------------------------------
-- 4. RPC
-- ------------------------------------------------------------

-- Ma trận hiệu lực kèm nguồn: { "<quyền>": { "<vai trò>": { allowed, source: default|global|project } } }.
-- pid null = ma trận toàn hệ thống (mặc định + ghi đè toàn hệ thống). Mọi thành viên đọc được ma trận dự án của mình.
create function public.get_permission_matrix(pid uuid default null) returns jsonb
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

-- Lưu một loạt thay đổi (nguyên khối). p_project null = toàn hệ thống. p_changes: [{role, permission, allowed}].
-- Giá trị trùng với giá trị "kế thừa" (mặc định, hoặc toàn hệ thống khi sửa theo dự án) thì xóa ghi đè thay vì lưu.
create function public.set_role_permissions(p_project uuid, p_changes jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c record; inherited boolean; current_eff boolean; n_changed integer := 0;
begin
  if auth.uid() is null or not coalesce(public.is_admin(), false) then
    raise exception 'Chỉ quản trị viên hệ thống mới được cấu hình phân quyền' using errcode = '42501';
  end if;
  if p_project is not null and not exists (select 1 from public.projects where id = p_project) then
    raise exception 'Không tìm thấy dự án' using errcode = 'P0002';
  end if;
  if p_changes is null or jsonb_typeof(p_changes) <> 'array' or jsonb_array_length(p_changes) = 0 then
    raise exception 'Không có thay đổi nào' using errcode = '22023';
  end if;
  if jsonb_array_length(p_changes) > 100 then
    raise exception 'Mỗi lần chỉ lưu tối đa 100 thay đổi' using errcode = '22023';
  end if;

  for c in select * from jsonb_to_recordset(p_changes) as x(role text, permission text, allowed boolean) loop
    if c.role is null or c.role not in ('pm', 'dev', 'ba', 'tester', 'viewer') then
      raise exception 'Vai trò không cấu hình được: %', coalesce(c.role, '(trống)') using errcode = '22023';
    end if;
    if c.permission is null or not public.is_configurable_permission(c.permission) then
      raise exception 'Quyền không cấu hình được: %', coalesce(c.permission, '(trống)') using errcode = '22023';
    end if;
    if c.allowed is null then
      raise exception 'Thiếu giá trị cho %/%', c.role, c.permission using errcode = '22023';
    end if;

    -- giá trị hiện hành (hiệu lực) ở phạm vi đang sửa
    current_eff := coalesce(
      (select rp.allowed from public.role_permissions rp where rp.project_id is not distinct from p_project and rp.role = c.role and rp.permission = c.permission),
      case when p_project is not null then (select rp.allowed from public.role_permissions rp where rp.project_id is null and rp.role = c.role and rp.permission = c.permission) end,
      public.perm_default(c.role, c.permission));
    -- giá trị kế thừa nếu không có ghi đè ở phạm vi này
    inherited := coalesce(
      case when p_project is not null then (select rp.allowed from public.role_permissions rp where rp.project_id is null and rp.role = c.role and rp.permission = c.permission) end,
      public.perm_default(c.role, c.permission));

    delete from public.role_permissions rp where rp.project_id is not distinct from p_project and rp.role = c.role and rp.permission = c.permission;
    if c.allowed <> inherited then
      insert into public.role_permissions (project_id, role, permission, allowed, updated_by)
      values (p_project, c.role, c.permission, c.allowed, auth.uid());
    end if;
    if c.allowed <> current_eff then
      insert into public.role_permission_log (project_id, role, permission, old_allowed, new_allowed, changed_by)
      values (p_project, c.role, c.permission, current_eff, c.allowed, auth.uid());
      n_changed := n_changed + 1;
    end if;
  end loop;
  return jsonb_build_object('changed', n_changed);
end
$$;

-- Xóa mọi ghi đè của phạm vi (dự án hoặc toàn hệ thống) -> quay về mặc định/kế thừa.
create function public.reset_role_permissions(p_project uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare n integer; r record;
begin
  if auth.uid() is null or not coalesce(public.is_admin(), false) then
    raise exception 'Chỉ quản trị viên hệ thống mới được cấu hình phân quyền' using errcode = '42501';
  end if;
  for r in select * from public.role_permissions rp where rp.project_id is not distinct from p_project loop
    insert into public.role_permission_log (project_id, role, permission, old_allowed, new_allowed, changed_by)
    values (p_project, r.role, r.permission, r.allowed,
            coalesce(case when p_project is not null then (select g.allowed from public.role_permissions g where g.project_id is null and g.role = r.role and g.permission = r.permission) end,
                     public.perm_default(r.role, r.permission)),
            auth.uid());
  end loop;
  delete from public.role_permissions rp where rp.project_id is not distinct from p_project;
  get diagnostics n = row_count;
  return jsonb_build_object('removed', n);
end
$$;

-- Nhật ký thay đổi (quản trị viên): phạm vi dự án hoặc toàn hệ thống (null).
create function public.get_permission_log(p_project uuid default null, p_limit integer default 50) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not coalesce(public.is_admin(), false) then
    raise exception 'Chỉ quản trị viên hệ thống mới xem được nhật ký phân quyền' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'role', l.role, 'permission', l.permission, 'from', l.old_allowed, 'to', l.new_allowed,
             'by', coalesce(p.name, 'đã xóa'), 'at', l.changed_at))
    from (select * from public.role_permission_log where project_id is not distinct from p_project order by id desc limit least(greatest(p_limit, 1), 200)) l
    left join public.profiles p on p.id = l.changed_by), '[]'::jsonb);
end
$$;

revoke execute on function
  public.perm_default(text, text), public.is_configurable_permission(text), public.role_has_perm(uuid, text, text),
  public.get_permission_matrix(uuid), public.set_role_permissions(uuid, jsonb), public.reset_role_permissions(uuid),
  public.get_permission_log(uuid, integer)
  from public, anon;
-- role_has_perm / perm_default / is_configurable_permission được các hàm can_* và ràng buộc bảng gọi nên phải chạy được với quyền người dùng.
grant execute on function public.perm_default(text, text), public.is_configurable_permission(text), public.role_has_perm(uuid, text, text) to authenticated;
grant execute on function
  public.get_permission_matrix(uuid), public.set_role_permissions(uuid, jsonb), public.reset_role_permissions(uuid),
  public.get_permission_log(uuid, integer)
  to authenticated;
