-- Omni Project Manager - 0008: vai trò mới, use case phân cấp (tối đa 3 cấp), đối tượng nhiệm vụ mở rộng.
-- Chạy trong Supabase SQL Editor SAU 0007 và TRƯỚC khi deploy bản giao diện mới.
-- Bản giao diện cũ vẫn chạy bình thường nếu migration này đã chạy (chỉ thêm cột/bảng; vai trò 'developer'/'qa'
-- được đổi tên thành 'dev'/'tester' nên chỉ nên để khoảng trống ngắn giữa migration và deploy).

-- ============================================================
-- 1. VAI TRÒ: pm | dev | ba | tester | viewer (viewer = "Quan sát", chỉ đọc)
-- ============================================================

do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'public.project_members'::regclass and contype = 'c'
       and pg_get_constraintdef(oid) like '%role%'
  loop
    execute format('alter table public.project_members drop constraint %I', c);
  end loop;
end
$$;

update public.project_members set role = 'dev' where role = 'developer';
update public.project_members set role = 'tester' where role = 'qa';
alter table public.project_members
  add constraint project_members_role_check check (role in ('pm', 'dev', 'ba', 'tester', 'viewer'));

-- pm, dev, ba, tester: tạo/sửa nhiệm vụ.
create or replace function public.can_write_tasks(pid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_admin() or public.project_role(pid) in ('pm', 'dev', 'ba', 'tester')
$$;

-- pm, dev, ba: tạo/sửa use case và tiêu chí nghiệm thu (tester chỉ xem; việc tick nghiệm thu vẫn do pm/admin).
create function public.can_write_usecases(pid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_admin() or public.project_role(pid) in ('pm', 'dev', 'ba')
$$;

-- pm, tester: duyệt checklist chất lượng.
create or replace function public.can_approve_quality(pid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_admin() or public.project_role(pid) in ('pm', 'tester')
$$;

revoke execute on function public.can_write_usecases(uuid) from public, anon;
grant execute on function public.can_write_usecases(uuid) to authenticated;

drop policy use_cases_insert on public.use_cases;
drop policy use_cases_update on public.use_cases;
drop policy use_cases_delete on public.use_cases;
create policy use_cases_insert on public.use_cases for insert to authenticated
  with check (public.can_write_usecases(project_id));
create policy use_cases_update on public.use_cases for update to authenticated
  using (public.can_write_usecases(project_id)) with check (public.can_write_usecases(project_id));
create policy use_cases_delete on public.use_cases for delete to authenticated
  using (public.can_write_usecases(project_id));

drop policy criteria_insert on public.acceptance_criteria;
drop policy criteria_update on public.acceptance_criteria;
drop policy criteria_delete on public.acceptance_criteria;
create policy criteria_insert on public.acceptance_criteria for insert to authenticated
  with check (public.can_write_usecases(public.use_case_project(use_case_id)));
create policy criteria_update on public.acceptance_criteria for update to authenticated
  using (public.can_write_usecases(public.use_case_project(use_case_id)))
  with check (public.can_write_usecases(public.use_case_project(use_case_id)));
create policy criteria_delete on public.acceptance_criteria for delete to authenticated
  using (public.can_write_usecases(public.use_case_project(use_case_id)));

create or replace function public.add_project_member(p_project uuid, p_email text, p_role text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid;
begin
  if not public.can_manage_project(p_project) then
    raise exception 'Bạn không có quyền quản lý thành viên của dự án này' using errcode = '42501';
  end if;
  if p_role not in ('pm', 'dev', 'ba', 'tester', 'viewer') then
    raise exception 'Vai trò không hợp lệ: %', p_role using errcode = '22023';
  end if;
  select id into uid from public.profiles where lower(email) = lower(trim(p_email));
  if uid is null then
    raise exception 'Chưa có tài khoản với email này. Hãy yêu cầu họ đăng ký trước.' using errcode = 'P0002';
  end if;
  insert into public.project_members (project_id, user_id, role)
  values (p_project, uid, p_role)
  on conflict (project_id, user_id) do update set role = excluded.role;
end
$$;

-- ============================================================
-- 2. USE CASE PHÂN CẤP (tối đa 3 cấp)
-- ============================================================

alter table public.use_cases
  add column parent_id uuid references public.use_cases (id) on delete cascade;
create index use_cases_parent_idx on public.use_cases (parent_id);

-- Cha phải cùng dự án, không tạo vòng lặp, tổng độ sâu (kể cả cây con đang có) <= 3.
create function public.trg_use_case_tree() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  parent_project uuid; parent_depth integer; sub_height integer; is_cycle boolean;
begin
  if new.parent_id is null then return new; end if;
  if tg_op = 'UPDATE' and new.parent_id is not distinct from old.parent_id then return new; end if;
  if new.parent_id = new.id then
    raise exception 'Use case không thể là cha của chính nó' using errcode = '22023';
  end if;
  select project_id into parent_project from public.use_cases where id = new.parent_id;
  if parent_project is null or parent_project <> new.project_id then
    raise exception 'Use case cha phải thuộc cùng dự án' using errcode = '22023';
  end if;

  with recursive up as (
    select id, parent_id, 1 as d from public.use_cases where id = new.parent_id
    union all
    select u.id, u.parent_id, up.d + 1 from public.use_cases u join up on u.id = up.parent_id
  )
  select max(d), bool_or(id = new.id) into parent_depth, is_cycle from up;
  if is_cycle then
    raise exception 'Không thể chuyển use case vào chính nhánh con của nó' using errcode = '22023';
  end if;

  with recursive down as (
    select id, 1 as d from public.use_cases where parent_id = new.id
    union all
    select c.id, down.d + 1 from public.use_cases c join down on c.parent_id = down.id
  )
  select coalesce(max(d), 0) into sub_height from down;

  if parent_depth + 1 + sub_height > 3 then
    raise exception 'Use case chỉ được phân tối đa 3 cấp' using errcode = '22023';
  end if;
  return new;
end
$$;
create trigger use_case_tree before insert or update of parent_id on public.use_cases
  for each row execute function public.trg_use_case_tree();

-- Use case cha: tiến độ = trung bình các use case con; hoàn thành khi tất cả con hoàn thành.
create function public.rollup_use_case(ucid uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  n integer; pct integer; cur_status text; new_status text;
begin
  select count(*), coalesce(round(avg(progress_percent)), 0)::integer into n, pct
    from public.use_cases where parent_id = ucid;
  if n = 0 then return; end if;
  select status into cur_status from public.use_cases where id = ucid;
  if cur_status is null then return; end if;
  new_status := case when pct = 100 then 'completed'
                     when cur_status = 'completed' then 'developing'
                     else cur_status end;
  update public.use_cases set progress_percent = pct, status = new_status
   where id = ucid and (progress_percent is distinct from pct or status is distinct from new_status);
end
$$;

create function public.trg_use_case_rollup() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.parent_id is not null then perform public.rollup_use_case(old.parent_id); end if;
    return null;
  end if;
  if new.parent_id is not null then perform public.rollup_use_case(new.parent_id); end if;
  if tg_op = 'UPDATE' and old.parent_id is not null and old.parent_id is distinct from new.parent_id then
    perform public.rollup_use_case(old.parent_id);
  end if;
  return null;
end
$$;
create trigger use_case_rollup after insert or update of progress_percent, parent_id or delete on public.use_cases
  for each row execute function public.trg_use_case_rollup();

-- Tiêu chí nghiệm thu chỉ tự tính tiến độ cho use case lá (use case cha lấy từ các con).
create or replace function public.trg_criteria_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  ucid uuid; n_done integer; n_all integer; pct integer;
begin
  if current_setting('app.seeding', true) = 'on' then return null; end if;
  ucid := case when tg_op = 'DELETE' then old.use_case_id else new.use_case_id end;
  if exists (select 1 from public.use_cases where parent_id = ucid) then return null; end if;
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

grant insert (parent_id) on public.use_cases to authenticated;
grant update (parent_id) on public.use_cases to authenticated;

-- ============================================================
-- 3. NHIỆM VỤ: THÊM TRƯỜNG
--    assignee_id = Người chủ trì; task_collaborators = Người phối hợp.
--    Nỗ lực tính theo ngày công (man-day); cột *_hours cũ giữ lại nhưng không dùng nữa.
-- ============================================================

alter table public.tasks
  add column department text check (department in ('pm', 'ba', 'dev', 'tester')),
  add column progress_percent integer not null default 0 check (progress_percent between 0 and 100),
  add column actual_end_date date,
  add column assessment text check (assessment in ('ahead', 'on_track', 'at_risk', 'delayed')),
  add column deliverable_description text not null default '',
  add column notes text not null default '',
  add column estimated_effort numeric(8, 1) not null default 0 check (estimated_effort >= 0),
  add column actual_effort numeric(8, 1) not null default 0 check (actual_effort >= 0);

update public.tasks
   set progress_percent = case status when 'done' then 100 when 'review' then 70 when 'in_progress' then 40 else 0 end,
       estimated_effort = round(estimated_hours / 8, 1),
       actual_effort = round(actual_hours / 8, 1);

-- Đồng bộ trạng thái "Hoàn thành" với tiến độ 100% và ngày hoàn thành thực tế.
create function public.trg_task_sync() returns trigger
language plpgsql set search_path = '' as $$
declare
  today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'done' and new.progress_percent = 0 then
      new.progress_percent := case new.status when 'review' then 70 when 'in_progress' then 40 else 0 end;
    end if;
  elsif new.status is distinct from old.status and old.status = 'done' and new.progress_percent = 100 then
    new.progress_percent := 90;
  end if;

  if new.status = 'done' then
    new.progress_percent := 100;
    new.actual_end_date := coalesce(new.actual_end_date, today);
  else
    new.actual_end_date := null;
  end if;
  return new;
end
$$;
create trigger task_sync before insert or update on public.tasks
  for each row execute function public.trg_task_sync();

create function public.task_project(tid uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select t.project_id from public.tasks t where t.id = tid
$$;
revoke execute on function public.task_project(uuid) from public, anon;
grant execute on function public.task_project(uuid) to authenticated;

create table public.task_collaborators (
  task_id uuid not null references public.tasks (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  primary key (task_id, user_id)
);
create index task_collaborators_user_idx on public.task_collaborators (user_id);

-- Người phối hợp phải là thành viên của dự án (hoặc quản trị viên).
create function public.trg_collaborator_member() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  pid uuid := public.task_project(new.task_id);
begin
  if not exists (select 1 from public.project_members m where m.project_id = pid and m.user_id = new.user_id)
     and not exists (select 1 from public.profiles p where p.id = new.user_id and p.is_admin) then
    raise exception 'Người phối hợp phải là thành viên của dự án' using errcode = '22023';
  end if;
  return new;
end
$$;
create trigger collaborator_member before insert on public.task_collaborators
  for each row execute function public.trg_collaborator_member();

alter table public.task_collaborators enable row level security;
create policy collab_select on public.task_collaborators for select to authenticated
  using (public.can_view_project(public.task_project(task_id)));
create policy collab_insert on public.task_collaborators for insert to authenticated
  with check (public.can_write_tasks(public.task_project(task_id)));
create policy collab_delete on public.task_collaborators for delete to authenticated
  using (public.can_write_tasks(public.task_project(task_id)));
revoke all on public.task_collaborators from anon;
revoke update on public.task_collaborators from authenticated;

alter publication supabase_realtime add table public.task_collaborators;

-- ============================================================
-- 4. TIẾN ĐỘ DỰ ÁN + BÁO CÁO
-- ============================================================

-- Tiến độ dự án = 60% trung bình tiến độ (%) của nhiệm vụ + 40% trung bình use case LÁ (use case cha chỉ tổng hợp).
create or replace function public.recompute_project_progress(pid uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  t_n integer; t_pct numeric; u_n integer; u_pct numeric; pct integer;
begin
  select count(*), coalesce(avg(progress_percent), 0)
    into t_n, t_pct from public.tasks where project_id = pid;
  select count(*), coalesce(avg(progress_percent), 0)
    into u_n, u_pct from public.use_cases u
   where u.project_id = pid and not exists (select 1 from public.use_cases c where c.parent_id = u.id);
  if t_n = 0 and u_n = 0 then return; end if;
  pct := round(case when u_n > 0 then t_pct * 0.6 + u_pct * 0.4 else t_pct end);
  update public.projects set progress_percent = pct
   where id = pid and progress_percent is distinct from pct;
  perform public.snapshot_project(pid);
end
$$;

-- Thay đổi tiến độ (%) của nhiệm vụ cũng phải cập nhật tiến độ dự án (trigger cũ đã có, nên không cần thêm).

create or replace function public.build_report_summary(pid uuid, p_start date, p_end date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  p public.projects;
  t_total integer; t_done integer; t_prog integer; t_review integer; t_todo integer; t_over integer;
  u_total integer; u_done integer; q_total integer; q_pass integer;
  prog_start integer; prog_end integer; done_start integer; done_end integer;
  attention jsonb;
begin
  select * into p from public.projects where id = pid;
  if not found then return null; end if;

  select count(*), count(*) filter (where status = 'done'), count(*) filter (where status = 'in_progress'),
         count(*) filter (where status = 'review'), count(*) filter (where status = 'todo'),
         count(*) filter (where status <> 'done' and due_date < today)
    into t_total, t_done, t_prog, t_review, t_todo, t_over
    from public.tasks where project_id = pid;
  select count(*), count(*) filter (where status in ('completed', 'tested')) into u_total, u_done
    from public.use_cases u
   where u.project_id = pid and not exists (select 1 from public.use_cases c where c.parent_id = u.id);
  select count(*), count(*) filter (where is_passed) into q_total, q_pass
    from public.quality_items where project_id = pid;

  select progress_percent, tasks_done into prog_start, done_start from public.progress_snapshots
    where project_id = pid and snap_date <= p_start order by snap_date desc limit 1;
  select progress_percent, tasks_done into prog_end, done_end from public.progress_snapshots
    where project_id = pid and snap_date <= p_end order by snap_date desc limit 1;
  prog_end := coalesce(prog_end, p.progress_percent);
  done_end := coalesce(done_end, t_done);

  select coalesce(jsonb_agg(jsonb_build_object('code', code, 'title', title, 'dueDate', due_date, 'status', status)
                            order by due_date), '[]'::jsonb)
    into attention
    from (select code, title, due_date, status from public.tasks
           where project_id = pid and status <> 'done' and due_date <= today + 7
           order by due_date limit 10) a;

  return jsonb_build_object(
    'project', jsonb_build_object('code', p.code, 'name', p.name, 'phase', p.current_phase),
    'progress', jsonb_build_object('start', prog_start, 'end', prog_end,
                                   'delta', case when prog_start is null then null else prog_end - prog_start end),
    'tasks', jsonb_build_object('total', t_total, 'done', t_done, 'inProgress', t_prog, 'review', t_review,
                                'todo', t_todo, 'overdue', t_over,
                                'doneInPeriod', case when done_start is null then null else greatest(done_end - done_start, 0) end),
    'useCases', jsonb_build_object('total', u_total, 'completed', u_done),
    'quality', jsonb_build_object('total', q_total, 'passed', q_pass),
    'attention', attention
  );
end
$$;

-- Hàm trigger không cần gọi trực tiếp từ client.
revoke execute on function
  public.trg_use_case_tree(), public.rollup_use_case(uuid), public.trg_use_case_rollup(),
  public.trg_task_sync(), public.trg_collaborator_member()
  from public, anon, authenticated;

-- Tính lại tiến độ mọi dự án theo công thức mới.
do $$
declare r record;
begin
  for r in select id from public.projects loop
    perform public.recompute_project_progress(r.id);
  end loop;
end
$$;
