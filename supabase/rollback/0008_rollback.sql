-- Hoàn tác migration 0008 (vai trò mới, use case phân cấp, nhiệm vụ mở rộng).
-- Chạy trong Supabase SQL Editor khi cần quay về bản giao diện trước 0008 (tag stable-2026-10-02-ui hoặc commit trước 0008).
--
-- LƯU Ý:
--  * Vai trò được gộp lại: dev, ba -> developer; tester -> qa (BA mất quyền riêng). viewer giữ nguyên.
--  * Cột/bảng mới (parent_id, department, progress_percent, task_collaborators, ...) được GIỮ LẠI để không mất dữ liệu;
--    bản giao diện cũ bỏ qua chúng. Muốn xóa hẳn, xem phần cuối (chỉ làm khi chắc chắn).
--  * Use case con vẫn nằm trong bảng (hiển thị phẳng ở bản cũ); tiến độ dự án trở lại công thức tính theo trạng thái nhiệm vụ.

-- 1. Gỡ trigger mới
drop trigger if exists task_sync on public.tasks;
drop trigger if exists use_case_tree on public.use_cases;
drop trigger if exists use_case_rollup on public.use_cases;
drop trigger if exists collaborator_member on public.task_collaborators;

-- 2. Vai trò cũ
alter table public.project_members drop constraint if exists project_members_role_check;
update public.project_members set role = 'developer' where role in ('dev', 'ba');
update public.project_members set role = 'qa' where role = 'tester';
alter table public.project_members
  add constraint project_members_role_check check (role in ('pm', 'developer', 'qa', 'viewer'));

create or replace function public.can_write_tasks(pid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_admin() or public.project_role(pid) in ('pm', 'developer')
$$;

create or replace function public.can_approve_quality(pid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_admin() or public.project_role(pid) in ('pm', 'qa')
$$;

drop policy if exists use_cases_insert on public.use_cases;
drop policy if exists use_cases_update on public.use_cases;
drop policy if exists use_cases_delete on public.use_cases;
create policy use_cases_insert on public.use_cases for insert to authenticated
  with check (public.can_write_tasks(project_id));
create policy use_cases_update on public.use_cases for update to authenticated
  using (public.can_write_tasks(project_id)) with check (public.can_write_tasks(project_id));
create policy use_cases_delete on public.use_cases for delete to authenticated
  using (public.can_write_tasks(project_id));

drop policy if exists criteria_insert on public.acceptance_criteria;
drop policy if exists criteria_update on public.acceptance_criteria;
drop policy if exists criteria_delete on public.acceptance_criteria;
create policy criteria_insert on public.acceptance_criteria for insert to authenticated
  with check (public.can_write_tasks(public.use_case_project(use_case_id)));
create policy criteria_update on public.acceptance_criteria for update to authenticated
  using (public.can_write_tasks(public.use_case_project(use_case_id)))
  with check (public.can_write_tasks(public.use_case_project(use_case_id)));
create policy criteria_delete on public.acceptance_criteria for delete to authenticated
  using (public.can_write_tasks(public.use_case_project(use_case_id)));

create or replace function public.add_project_member(p_project uuid, p_email text, p_role text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid;
begin
  if not public.can_manage_project(p_project) then
    raise exception 'Bạn không có quyền quản lý thành viên của dự án này' using errcode = '42501';
  end if;
  if p_role not in ('pm', 'developer', 'qa', 'viewer') then
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

-- 3. Tiêu chí nghiệm thu luôn tự tính tiến độ use case (như trước 0008)
create or replace function public.trg_criteria_changed() returns trigger
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

-- 4. Công thức tiến độ dự án cũ (theo trạng thái nhiệm vụ, mọi use case)
create or replace function public.recompute_project_progress(pid uuid) returns void
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
  perform public.snapshot_project(pid);
end
$$;

-- 5. Báo cáo: đếm mọi use case như cũ
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
    from public.use_cases where project_id = pid;
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

-- 6. (TÙY CHỌN, MẤT DỮ LIỆU) Xóa hẳn cột/bảng mới. Bỏ dấu -- ở đầu dòng nếu chắc chắn không cần dữ liệu đó.
-- drop table if exists public.task_collaborators;
-- alter table public.tasks
--   drop column department, drop column progress_percent, drop column actual_end_date, drop column assessment,
--   drop column deliverable_description, drop column notes, drop column estimated_effort, drop column actual_effort;
-- alter table public.use_cases drop column parent_id;

-- Tính lại tiến độ mọi dự án theo công thức cũ
do $$
declare r record;
begin
  for r in select id from public.projects loop
    perform public.recompute_project_progress(r.id);
  end loop;
end
$$;
