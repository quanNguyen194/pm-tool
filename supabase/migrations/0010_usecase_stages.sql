-- Omni Project Manager - 0010: tiến độ use case theo 5 bước chuẩn + cập nhật hàng loạt.
-- Chạy trong Supabase SQL Editor SAU 0009 và TRƯỚC khi deploy giao diện mới.
-- Bản giao diện hiện tại vẫn chạy bình thường nếu migration này đã chạy.
--
-- Mô hình tiến độ chọn theo TỪNG DỰ ÁN (projects.progress_model):
--   criteria (mặc định, như trước): tiến độ use case = % tiêu chí nghiệm thu đã tick (chỉ PM/Admin tick).
--   stages: tiến độ use case lá = tổng trọng số các bước đã hoàn thành:
--           Phân tích 10 + Thiết kế 10 + Lập trình 40 + Kiểm thử 25 + Nghiệm thu 15 = 100.
-- Quyền tick bước: Admin/PM mọi bước; BA: Phân tích, Thiết kế; DEV: Lập trình; Tester: Kiểm thử.
-- Module/nhóm và use case cha lấy tiến độ = trung bình CÓ TRỌNG SỐ độ phức tạp (5/10/15, chưa đánh giá = 10)
-- của các use case lá bên dưới. Tiến độ dự án cũng tính use case lá theo trọng số đó và không tính module/nhóm.

-- ============================================================
-- 1. MÔ HÌNH TIẾN ĐỘ CỦA DỰ ÁN
-- ============================================================

alter table public.projects
  add column progress_model text not null default 'criteria' check (progress_model in ('criteria', 'stages'));

grant insert (progress_model) on public.projects to authenticated;
grant update (progress_model) on public.projects to authenticated;

-- ============================================================
-- 2. CÁC BƯỚC ĐÃ HOÀN THÀNH CỦA USE CASE
-- ============================================================

create table public.use_case_stages (
  use_case_id uuid not null references public.use_cases (id) on delete cascade,
  stage text not null check (stage in ('analysis', 'design', 'coding', 'testing', 'acceptance')),
  done_by uuid references public.profiles (id) on delete set null,
  done_at timestamptz not null default now(),
  primary key (use_case_id, stage)
);

alter table public.use_case_stages enable row level security;
create policy stages_select on public.use_case_stages for select to authenticated
  using (public.can_view_project(public.use_case_project(use_case_id)));
-- Chỉ ghi qua hàm set_use_case_stages (kiểm tra quyền theo bước).
revoke all on public.use_case_stages from anon;
revoke insert, update, delete on public.use_case_stages from authenticated;

alter publication supabase_realtime add table public.use_case_stages;

create function public.stage_weight(s text) returns integer
language sql immutable set search_path = '' as $$
  select case s when 'analysis' then 10 when 'design' then 10 when 'coding' then 40
                when 'testing' then 25 when 'acceptance' then 15 else 0 end
$$;

create function public.complexity_weight(c text) returns integer
language sql immutable set search_path = '' as $$
  select case c when 'simple' then 5 when 'complex' then 15 else 10 end
$$;

create function public.can_tick_stage(pid uuid, s text) returns boolean
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

-- ============================================================
-- 3. TÍNH LẠI TIẾN ĐỘ
-- ============================================================

-- 3.1 Use case lá theo tiêu chí nghiệm thu (tách từ trigger ở 0001/0008).
create function public.recompute_use_case_criteria(ucid uuid) returns void
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

create or replace function public.trg_criteria_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  ucid uuid;
begin
  if current_setting('app.seeding', true) = 'on' then return null; end if;
  ucid := case when tg_op = 'DELETE' then old.use_case_id else new.use_case_id end;
  -- Dự án dùng mô hình "stages": tiêu chí chỉ để tham khảo, không quyết định tiến độ.
  if (select p.progress_model from public.projects p where p.id = public.use_case_project(ucid)) = 'stages' then
    return null;
  end if;
  perform public.recompute_use_case_criteria(ucid);
  return null;
end
$$;

-- 3.2 Use case lá theo các bước chuẩn.
create function public.recompute_use_case_stages(ucid uuid) returns void
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

create function public.trg_stage_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.recompute_use_case_stages(case when tg_op = 'DELETE' then old.use_case_id else new.use_case_id end);
  return null;
end
$$;
create trigger stage_changed after insert or delete on public.use_case_stages
  for each row execute function public.trg_stage_changed();

-- 3.3 Đổi mô hình của dự án thì tính lại mọi use case lá.
create function public.trg_project_model_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r record;
begin
  for r in
    select u.id from public.use_cases u
     where u.project_id = new.id and u.kind <> 'group'
       and not exists (select 1 from public.use_cases c where c.parent_id = u.id)
  loop
    if new.progress_model = 'stages' then
      perform public.recompute_use_case_stages(r.id);
    else
      perform public.recompute_use_case_criteria(r.id);
    end if;
  end loop;
  perform public.recompute_project_progress(new.id);
  return null;
end
$$;
create trigger project_model_changed after update of progress_model on public.projects
  for each row when (old.progress_model is distinct from new.progress_model)
  execute function public.trg_project_model_changed();

-- 3.4 Use case cha / module / nhóm: trung bình có trọng số của các use case LÁ bên dưới.
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

-- Tính lại cả chuỗi tổ tiên (trọng số khiến một lá đổi có thể làm đổi cả cấp trên dù cấp giữa không đổi).
create function public.rollup_ancestors(start uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  cur uuid := start; guard integer := 0;
begin
  while cur is not null and guard < 5 loop
    perform public.rollup_use_case(cur);
    select parent_id into cur from public.use_cases where id = cur;
    guard := guard + 1;
  end loop;
end
$$;

create or replace function public.trg_use_case_rollup() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.parent_id is not null then perform public.rollup_ancestors(old.parent_id); end if;
    return null;
  end if;
  if new.parent_id is not null then perform public.rollup_ancestors(new.parent_id); end if;
  if tg_op = 'UPDATE' and old.parent_id is not null and old.parent_id is distinct from new.parent_id then
    perform public.rollup_ancestors(old.parent_id);
  end if;
  return null;
end
$$;

-- Tiến độ dự án = 60% trung bình tiến độ nhiệm vụ + 40% trung bình có trọng số của use case lá (không tính module/nhóm).
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

-- ============================================================
-- 4. HÀM CẬP NHẬT BƯỚC (MỘT HOẶC NHIỀU USE CASE)
-- ============================================================

-- Đánh dấu (p_done = true) hoặc bỏ đánh dấu một bước cho nhiều use case cùng lúc.
-- Kiểm tra quyền theo bước; chỉ áp dụng cho use case lá của dự án dùng mô hình "stages".
-- Trả về số use case thực sự thay đổi.
create function public.set_use_case_stages(p_use_cases uuid[], p_stage text, p_done boolean)
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

revoke execute on function
  public.stage_weight(text), public.complexity_weight(text), public.can_tick_stage(uuid, text),
  public.set_use_case_stages(uuid[], text, boolean)
  from public, anon;
grant execute on function
  public.stage_weight(text), public.complexity_weight(text), public.can_tick_stage(uuid, text),
  public.set_use_case_stages(uuid[], text, boolean)
  to authenticated;
revoke execute on function
  public.recompute_use_case_criteria(uuid), public.recompute_use_case_stages(uuid), public.trg_stage_changed(),
  public.trg_project_model_changed(), public.rollup_ancestors(uuid)
  from public, anon, authenticated;

-- ============================================================
-- 5. DỰ ÁN QTVT DÙNG MÔ HÌNH "STAGES" + TÍNH LẠI
-- ============================================================

update public.projects set progress_model = 'stages' where code = 'GPDN_DNMB_EVNNPC_QTVT_251004';

-- Tính lại module/nhóm theo công thức có trọng số, rồi tiến độ dự án.
do $$
declare r record;
begin
  for r in select id from public.use_cases u
            where u.parent_id is not null
              and not exists (select 1 from public.use_cases c where c.parent_id = u.id) loop
    perform public.rollup_ancestors((select parent_id from public.use_cases where id = r.id));
  end loop;
  for r in select id from public.projects loop
    perform public.recompute_project_progress(r.id);
  end loop;
end
$$;
