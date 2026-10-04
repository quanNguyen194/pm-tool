-- Hoàn tác migration 0011 (nguồn gốc use case + trạng thái "Không thực hiện").
-- Use case đang ở trạng thái "Không thực hiện" được chuyển về "Bản thảo" (vì trạng thái này sẽ không còn hợp lệ);
-- các cột origin, change_note, agreed_when bị xóa (mất dữ liệu nguồn gốc/lý do).
-- Nếu đã nhập use case "không thực hiện" từ Excel (KTH-xxx), nên xóa trước bằng supabase/imports/qtvt_usecases_origin_rollback.sql.

update public.use_cases set status = 'draft' where status = 'cancelled';
alter table public.use_cases drop constraint use_cases_status_check;
alter table public.use_cases add constraint use_cases_status_check
  check (status in ('draft', 'in_review', 'approved', 'developing', 'tested', 'completed'));
alter table public.use_cases drop column origin, drop column change_note, drop column agreed_when;

drop trigger use_case_rollup on public.use_cases;
create trigger use_case_rollup after insert or update of progress_percent, parent_id or delete on public.use_cases
  for each row execute function public.trg_use_case_rollup();

-- Các hàm trở về bản của 0010
create or replace function public.recompute_use_case_criteria(ucid uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  n_done integer; n_all integer; pct integer;
begin
  if exists (select 1 from public.use_cases where parent_id = ucid) then return; end if;
  select count(*) filter (where completed), count(*) into n_done, n_all
    from public.acceptance_criteria where use_case_id = ucid;
  pct := case when n_all = 0 then 0 else round(100.0 * n_done / n_all) end;
  update public.use_cases
     set progress_percent = pct,
         status = case when pct = 100 then 'completed'
                       when pct >= 50 and status = 'draft' then 'developing'
                       else status end
   where id = ucid;
end
$$;

create or replace function public.recompute_use_case_stages(ucid uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uc public.use_cases; model text; pct integer; coding boolean; new_status text;
begin
  select * into uc from public.use_cases where id = ucid;
  if not found or uc.kind = 'group' then return; end if;
  select progress_model into model from public.projects where id = uc.project_id;
  if model <> 'stages' or exists (select 1 from public.use_cases where parent_id = ucid) then return; end if;

  select coalesce(sum(public.stage_weight(stage)), 0), coalesce(bool_or(stage = 'coding'), false)
    into pct, coding from public.use_case_stages where use_case_id = ucid;
  pct := least(100, pct);
  new_status := case when pct = 100 then 'completed'
                     when uc.status = 'completed' then 'developing'
                     when coding and uc.status in ('draft', 'in_review', 'approved') then 'developing'
                     else uc.status end;
  update public.use_cases set progress_percent = pct, status = new_status
   where id = ucid and (progress_percent is distinct from pct or status is distinct from new_status);
end
$$;

create or replace function public.rollup_use_case(ucid uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  n integer; pct integer; cur_status text; new_status text;
begin
  with recursive d as (
    select id from public.use_cases where parent_id = ucid
    union all
    select c.id from public.use_cases c join d on c.parent_id = d.id
  ), leaves as (
    select u.progress_percent, public.complexity_weight(u.complexity) as w
      from public.use_cases u join d on d.id = u.id
     where u.kind <> 'group' and not exists (select 1 from public.use_cases c where c.parent_id = u.id)
  )
  select count(*), coalesce(round(sum(progress_percent * w)::numeric / nullif(sum(w), 0)), 0)::integer
    into n, pct from leaves;
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

create or replace function public.recompute_project_progress(pid uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  t_n integer; t_pct numeric; u_n integer; u_pct numeric; pct integer;
begin
  select count(*), coalesce(avg(progress_percent), 0)
    into t_n, t_pct from public.tasks where project_id = pid;
  select count(*), coalesce(sum(l.progress_percent * l.w)::numeric / nullif(sum(l.w), 0), 0)
    into u_n, u_pct
    from (select u.progress_percent, public.complexity_weight(u.complexity) as w
            from public.use_cases u
           where u.project_id = pid and u.kind <> 'group'
             and not exists (select 1 from public.use_cases c where c.parent_id = u.id)) l;
  if t_n = 0 and u_n = 0 then return; end if;
  pct := round(case when u_n > 0 then t_pct * 0.6 + u_pct * 0.4 else t_pct end);
  update public.projects set progress_percent = pct
   where id = pid and progress_percent is distinct from pct;
  perform public.snapshot_project(pid);
end
$$;

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
   where u.project_id = pid and u.kind <> 'group'
     and not exists (select 1 from public.use_cases c where c.parent_id = u.id);
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

create or replace function public.set_use_case_stages(p_use_cases uuid[], p_stage text, p_done boolean)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  uc_id uuid; uc public.use_cases; model text; changed integer := 0; hit integer;
begin
  if p_stage not in ('analysis', 'design', 'coding', 'testing', 'acceptance') then
    raise exception 'Bước không hợp lệ: %', p_stage using errcode = '22023';
  end if;
  if coalesce(array_length(p_use_cases, 1), 0) > 500 then
    raise exception 'Mỗi lần chỉ cập nhật tối đa 500 use case' using errcode = '22023';
  end if;
  foreach uc_id in array coalesce(p_use_cases, '{}') loop
    select * into uc from public.use_cases u where u.id = uc_id;
    if not found then continue; end if;
    if not public.can_tick_stage(uc.project_id, p_stage) then
      raise exception 'Bạn không có quyền cập nhật bước này' using errcode = '42501';
    end if;
    select progress_model into model from public.projects where id = uc.project_id;
    if model <> 'stages' or uc.kind = 'group'
       or exists (select 1 from public.use_cases c where c.parent_id = uc.id) then
      continue;
    end if;
    if p_done then
      insert into public.use_case_stages (use_case_id, stage, done_by)
      values (uc.id, p_stage, auth.uid())
      on conflict (use_case_id, stage) do nothing;
    else
      delete from public.use_case_stages where use_case_id = uc.id and stage = p_stage;
    end if;
    get diagnostics hit = row_count;
    changed := changed + hit;
  end loop;
  return changed;
end
$$;

do $$
declare r record;
begin
  for r in select id from public.projects loop
    perform public.recompute_project_progress(r.id);
  end loop;
end
$$;
