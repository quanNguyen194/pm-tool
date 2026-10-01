-- Omni Project Manager - 0001: bảng, hàm phân quyền, trigger, RLS.
-- Chạy trong Supabase SQL Editor theo thứ tự 0001 -> 0002 -> 0003.

-- ============================================================
-- 1. BẢNG
-- ============================================================

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  email text,
  department text not null default '',
  avatar_color text not null default 'bg-indigo-600',
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index profiles_email_lower_idx on public.profiles (lower(email));

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text not null default '',
  status text not null default 'planning'
    check (status in ('planning', 'in_progress', 'review', 'completed', 'on_hold')),
  priority text not null default 'medium'
    check (priority in ('low', 'medium', 'high', 'urgent')),
  manager_id uuid references public.profiles (id) on delete set null,
  start_date date not null,
  target_end_date date not null,
  budget bigint not null default 0,
  progress_percent integer not null default 0 check (progress_percent between 0 and 100),
  current_phase text not null default 'phase_1'
    check (current_phase in ('phase_1', 'phase_2', 'phase_3', 'phase_4', 'phase_5')),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

-- Vai trò theo từng dự án. Quản trị viên toàn hệ thống nằm ở profiles.is_admin.
create table public.project_members (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('pm', 'developer', 'qa', 'viewer')),
  added_at timestamptz not null default now(),
  primary key (project_id, user_id)
);
create index project_members_user_idx on public.project_members (user_id);

create table public.use_cases (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  code text not null,
  title text not null,
  actor text not null default '',
  description text not null default '',
  priority text not null default 'medium'
    check (priority in ('low', 'medium', 'high', 'urgent')),
  status text not null default 'draft'
    check (status in ('draft', 'in_review', 'approved', 'developing', 'tested', 'completed')),
  progress_percent integer not null default 0 check (progress_percent between 0 and 100),
  main_flow text[] not null default '{}',
  alternate_flow text[] not null default '{}',
  assigned_to uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, code)
);

create table public.acceptance_criteria (
  id uuid primary key default gen_random_uuid(),
  use_case_id uuid not null references public.use_cases (id) on delete cascade,
  description text not null,
  completed boolean not null default false,
  sort integer not null default 0,
  created_at timestamptz not null default now()
);
create index acceptance_criteria_uc_idx on public.acceptance_criteria (use_case_id);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  code text not null,
  title text not null,
  description text,
  status text not null default 'todo'
    check (status in ('todo', 'in_progress', 'review', 'done')),
  priority text not null default 'medium'
    check (priority in ('low', 'medium', 'high', 'urgent')),
  assignee_id uuid references public.profiles (id) on delete set null,
  phase text not null default '',
  estimated_hours numeric(8, 1) not null default 0,
  actual_hours numeric(8, 1) not null default 0,
  start_date date not null,
  due_date date not null,
  tags text[] not null default '{}',
  use_case_id uuid references public.use_cases (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (project_id, code)
);
create index tasks_project_idx on public.tasks (project_id);
create index tasks_due_idx on public.tasks (due_date) where status <> 'done';

-- Định nghĩa 5 giai đoạn + mẫu checklist dùng để nhân bản cho dự án mới.
create table public.quality_phase_defs (
  key text primary key check (key in ('phase_1', 'phase_2', 'phase_3', 'phase_4', 'phase_5')),
  name text not null,
  short_name text not null,
  description text not null,
  sort integer not null
);

create table public.quality_template_items (
  id uuid primary key default gen_random_uuid(),
  phase_key text not null references public.quality_phase_defs (key),
  sort integer not null,
  title text not null,
  description text not null default '',
  is_mandatory boolean not null default true
);

create table public.quality_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  phase_key text not null references public.quality_phase_defs (key),
  sort integer not null default 1000,
  title text not null,
  description text not null default '',
  is_mandatory boolean not null default true,
  is_passed boolean not null default false,
  checked_by text,
  checked_at date,
  notes text,
  created_at timestamptz not null default now()
);
create index quality_items_project_idx on public.quality_items (project_id);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  project_id uuid references public.projects (id) on delete cascade,
  type text not null check (type in ('overdue', 'deadline_warning', 'quality_alert', 'system')),
  title text not null,
  message text not null,
  task_id uuid references public.tasks (id) on delete cascade,
  use_case_id uuid references public.use_cases (id) on delete cascade,
  is_read boolean not null default false,
  -- Khóa chống trùng cho thông báo tự động (mỗi task + loại + người nhận chỉ một lần).
  dedupe_key text,
  created_at timestamptz not null default now()
);
create unique index notifications_dedupe_idx on public.notifications (dedupe_key) where dedupe_key is not null;
create index notifications_user_idx on public.notifications (user_id, is_read, created_at desc);

-- ============================================================
-- 2. HÀM PHÂN QUYỀN (security definer để tránh đệ quy RLS)
-- ============================================================

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false)
$$;

create function public.project_role(pid uuid) returns text
language sql stable security definer set search_path = '' as $$
  select m.role from public.project_members m where m.project_id = pid and m.user_id = auth.uid()
$$;

create function public.can_view_project(pid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_admin() or public.project_role(pid) is not null
$$;

-- pm: quản lý dự án, thành viên, duyệt use case. developer: tạo/sửa task + use case.
create function public.can_manage_project(pid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_admin() or public.project_role(pid) = 'pm'
$$;

create function public.can_write_tasks(pid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_admin() or public.project_role(pid) in ('pm', 'developer')
$$;

create function public.can_approve_quality(pid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_admin() or public.project_role(pid) in ('pm', 'qa')
$$;

create function public.use_case_project(ucid uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select u.project_id from public.use_cases u where u.id = ucid
$$;

create function public.shares_project_with(uid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.project_members a
    join public.project_members b on b.project_id = a.project_id
    where a.user_id = auth.uid() and b.user_id = uid
  )
$$;

-- ============================================================
-- 3. TRIGGER
-- ============================================================

-- 3.1 Tạo profile khi có user mới. Người đăng ký đầu tiên là quản trị viên.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  colors text[] := array['bg-indigo-600', 'bg-emerald-600', 'bg-blue-600', 'bg-amber-600', 'bg-slate-600'];
begin
  insert into public.profiles (id, name, email, avatar_color, is_admin)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Người dùng'
    ),
    new.email,
    colors[1 + abs(hashtext(new.id::text)) % array_length(colors, 1)],
    not exists (select 1 from public.profiles where is_admin)
  );
  return new;
end
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- 3.2 Chặn tự nâng quyền quản trị (SQL Editor không có auth.uid() nên vẫn cấp được).
create function public.guard_profile_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.is_admin is distinct from old.is_admin
     and auth.uid() is not null and not public.is_admin() then
    raise exception 'Chỉ quản trị viên mới được thay đổi quyền quản trị' using errcode = '42501';
  end if;
  return new;
end
$$;
create trigger guard_profile_update before update on public.profiles
  for each row execute function public.guard_profile_update();

-- 3.3 updated_at cho use case.
create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end
$$;
create trigger use_cases_touch before update on public.use_cases
  for each row execute function public.touch_updated_at();

-- 3.4 Tiến độ dự án = 60% task + 40% use case (chuyển từ AppContext.tsx sang DB).
create function public.recompute_project_progress(pid uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  t_n integer; t_pct numeric; u_n integer; u_pct numeric; pct integer;
begin
  select count(*),
         coalesce(avg(case status when 'done' then 1.0 when 'review' then 0.7 when 'in_progress' then 0.4 else 0 end), 0) * 100
    into t_n, t_pct from public.tasks where project_id = pid;
  select count(*), coalesce(avg(progress_percent), 0)
    into u_n, u_pct from public.use_cases where project_id = pid;
  if t_n = 0 and u_n = 0 then return; end if;
  pct := round(case when u_n > 0 then t_pct * 0.6 + u_pct * 0.4 else t_pct end);
  update public.projects set progress_percent = pct
   where id = pid and progress_percent is distinct from pct;
end
$$;

create function public.trg_recompute_progress() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    perform public.recompute_project_progress(old.project_id);
  elsif tg_op = 'INSERT' then
    perform public.recompute_project_progress(new.project_id);
  else
    perform public.recompute_project_progress(new.project_id);
    if old.project_id <> new.project_id then
      perform public.recompute_project_progress(old.project_id);
    end if;
  end if;
  return null;
end
$$;
create trigger tasks_progress after insert or update or delete on public.tasks
  for each row execute function public.trg_recompute_progress();
create trigger use_cases_progress after insert or update or delete on public.use_cases
  for each row execute function public.trg_recompute_progress();

-- 3.5 Tiêu chí nghiệm thu -> tiến độ + trạng thái use case.
create function public.trg_criteria_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  ucid uuid; n_done integer; n_all integer; pct integer;
begin
  if current_setting('app.seeding', true) = 'on' then return null; end if;
  ucid := case when tg_op = 'DELETE' then old.use_case_id else new.use_case_id end;
  select count(*) filter (where completed), count(*) into n_done, n_all
    from public.acceptance_criteria where use_case_id = ucid;
  pct := case when n_all = 0 then 0 else round(100.0 * n_done / n_all) end;
  update public.use_cases
     set progress_percent = pct,
         status = case when pct = 100 then 'completed'
                       when pct >= 50 and status = 'draft' then 'developing'
                       else status end
   where id = ucid;
  return null;
end
$$;
create trigger criteria_changed after insert or update or delete on public.acceptance_criteria
  for each row execute function public.trg_criteria_changed();

-- Chỉ admin/pm được tick hoàn thành tiêu chí nghiệm thu (đúng như UI hiện tại).
create function public.guard_criteria_toggle() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.completed is distinct from old.completed
     and auth.uid() is not null
     and not public.can_manage_project(public.use_case_project(old.use_case_id)) then
    raise exception 'Chỉ quản trị viên hoặc PM mới được xác nhận tiêu chí nghiệm thu' using errcode = '42501';
  end if;
  return new;
end
$$;
create trigger guard_criteria_toggle before update on public.acceptance_criteria
  for each row execute function public.guard_criteria_toggle();

-- 3.6 Checklist chất lượng: server tự ghi người duyệt + ngày duyệt.
create function public.trg_quality_checked() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  who text;
begin
  if current_setting('app.seeding', true) = 'on' then return new; end if;
  if new.is_passed and not old.is_passed then
    select p.name || ' (' ||
           upper(case when p.is_admin then 'admin'
                      else coalesce(public.project_role(new.project_id), 'member') end) || ')'
      into who from public.profiles p where p.id = auth.uid();
    new.checked_by := who;
    new.checked_at := current_date;
  elsif not new.is_passed and old.is_passed then
    new.checked_by := null;
    new.checked_at := null;
  end if;
  return new;
end
$$;
create trigger quality_checked before update of is_passed on public.quality_items
  for each row execute function public.trg_quality_checked();

-- 3.7 Dự án mới: gán PM làm thành viên + nhân bản checklist chất lượng mẫu.
create function public.trg_project_created() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.project_members (project_id, user_id, role)
  select new.id, u, 'pm'
    from (select distinct u from unnest(array[new.manager_id, new.created_by]) as u where u is not null) s
  on conflict (project_id, user_id) do nothing;

  insert into public.quality_items (project_id, phase_key, sort, title, description, is_mandatory)
  select new.id, t.phase_key, t.sort, t.title, t.description, t.is_mandatory
    from public.quality_template_items t;
  return new;
end
$$;
create trigger project_created after insert on public.projects
  for each row execute function public.trg_project_created();

create function public.trg_project_manager_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.manager_id is not null and new.manager_id is distinct from old.manager_id then
    insert into public.project_members (project_id, user_id, role)
    values (new.id, new.manager_id, 'pm')
    on conflict (project_id, user_id) do update set role = 'pm';
  end if;
  return new;
end
$$;
create trigger project_manager_changed after update of manager_id on public.projects
  for each row execute function public.trg_project_manager_changed();

-- ============================================================
-- 4. QUYỀN TRUY CẬP BẢNG (RLS)
-- ============================================================

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.use_cases enable row level security;
alter table public.acceptance_criteria enable row level security;
alter table public.tasks enable row level security;
alter table public.quality_phase_defs enable row level security;
alter table public.quality_template_items enable row level security;
alter table public.quality_items enable row level security;
alter table public.notifications enable row level security;

-- profiles
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin() or public.shares_project_with(id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- projects: chỉ admin tạo; thành viên xem; pm/admin sửa + xóa
create policy projects_select on public.projects for select to authenticated
  using (public.can_view_project(id));
create policy projects_insert on public.projects for insert to authenticated
  with check (public.is_admin());
create policy projects_update on public.projects for update to authenticated
  using (public.can_manage_project(id)) with check (public.can_manage_project(id));
create policy projects_delete on public.projects for delete to authenticated
  using (public.can_manage_project(id));

-- project_members
create policy members_select on public.project_members for select to authenticated
  using (public.can_view_project(project_id));
create policy members_insert on public.project_members for insert to authenticated
  with check (public.can_manage_project(project_id));
create policy members_update on public.project_members for update to authenticated
  using (public.can_manage_project(project_id)) with check (public.can_manage_project(project_id));
create policy members_delete on public.project_members for delete to authenticated
  using (public.can_manage_project(project_id));

-- tasks
create policy tasks_select on public.tasks for select to authenticated
  using (public.can_view_project(project_id));
create policy tasks_insert on public.tasks for insert to authenticated
  with check (public.can_write_tasks(project_id));
create policy tasks_update on public.tasks for update to authenticated
  using (public.can_write_tasks(project_id)) with check (public.can_write_tasks(project_id));
create policy tasks_delete on public.tasks for delete to authenticated
  using (public.can_write_tasks(project_id));

-- use_cases
create policy use_cases_select on public.use_cases for select to authenticated
  using (public.can_view_project(project_id));
create policy use_cases_insert on public.use_cases for insert to authenticated
  with check (public.can_write_tasks(project_id));
create policy use_cases_update on public.use_cases for update to authenticated
  using (public.can_write_tasks(project_id)) with check (public.can_write_tasks(project_id));
create policy use_cases_delete on public.use_cases for delete to authenticated
  using (public.can_write_tasks(project_id));

-- acceptance_criteria
create policy criteria_select on public.acceptance_criteria for select to authenticated
  using (public.can_view_project(public.use_case_project(use_case_id)));
create policy criteria_insert on public.acceptance_criteria for insert to authenticated
  with check (public.can_write_tasks(public.use_case_project(use_case_id)));
create policy criteria_update on public.acceptance_criteria for update to authenticated
  using (public.can_write_tasks(public.use_case_project(use_case_id)))
  with check (public.can_write_tasks(public.use_case_project(use_case_id)));
create policy criteria_delete on public.acceptance_criteria for delete to authenticated
  using (public.can_write_tasks(public.use_case_project(use_case_id)));

-- quality: định nghĩa + mẫu chỉ admin sửa; checklist dự án do pm/qa/admin duyệt
create policy qdefs_select on public.quality_phase_defs for select to authenticated using (true);
create policy qdefs_admin on public.quality_phase_defs for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy qtemplate_select on public.quality_template_items for select to authenticated using (true);
create policy qtemplate_admin on public.quality_template_items for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy qitems_select on public.quality_items for select to authenticated
  using (public.can_view_project(project_id));
create policy qitems_insert on public.quality_items for insert to authenticated
  with check (public.can_approve_quality(project_id));
create policy qitems_update on public.quality_items for update to authenticated
  using (public.can_approve_quality(project_id)) with check (public.can_approve_quality(project_id));
create policy qitems_delete on public.quality_items for delete to authenticated
  using (public.can_approve_quality(project_id));

-- notifications: mỗi người chỉ thấy/đánh dấu đọc thông báo của mình
create policy notifications_select on public.notifications for select to authenticated
  using (user_id = auth.uid());
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_delete on public.notifications for delete to authenticated
  using (user_id = auth.uid());

-- ============================================================
-- 5. QUYỀN CỘT / HÀM (không cho client ghi các cột do server tính)
-- ============================================================

revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;

-- Hàm trigger không cần gọi trực tiếp từ client.
revoke execute on function
  public.handle_new_user(), public.guard_profile_update(), public.touch_updated_at(),
  public.recompute_project_progress(uuid), public.trg_recompute_progress(),
  public.trg_criteria_changed(), public.guard_criteria_toggle(), public.trg_quality_checked(),
  public.trg_project_created(), public.trg_project_manager_changed()
  from authenticated;

revoke update on public.profiles from authenticated;
grant update (name, department, avatar_color, is_admin) on public.profiles to authenticated;

revoke insert, update on public.projects from authenticated;
grant insert (code, name, description, status, priority, manager_id, start_date, target_end_date, budget, current_phase)
  on public.projects to authenticated;
grant update (code, name, description, status, priority, manager_id, start_date, target_end_date, budget, current_phase)
  on public.projects to authenticated;

revoke insert, update on public.use_cases from authenticated;
grant insert (project_id, code, title, actor, description, priority, status, main_flow, alternate_flow, assigned_to)
  on public.use_cases to authenticated;
grant update (code, title, actor, description, priority, status, main_flow, alternate_flow, assigned_to)
  on public.use_cases to authenticated;

revoke insert, update on public.quality_items from authenticated;
grant insert (project_id, phase_key, title, description, is_mandatory, notes)
  on public.quality_items to authenticated;
grant update (is_passed, notes, title, description, is_mandatory) on public.quality_items to authenticated;

revoke update on public.notifications from authenticated;
grant update (is_read) on public.notifications to authenticated;
revoke insert on public.notifications from authenticated;

-- ============================================================
-- 6. REALTIME
-- ============================================================

alter publication supabase_realtime add table
  public.projects, public.project_members, public.tasks, public.use_cases,
  public.acceptance_criteria, public.quality_items, public.notifications;
