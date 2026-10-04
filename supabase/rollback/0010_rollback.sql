-- Hoàn tác migration 0010 (tiến độ use case theo 5 bước chuẩn).
-- Chạy SAU khi đã đưa giao diện về bản không dùng các bước (hoặc chấp nhận giao diện cũ bỏ qua chúng).
-- Mất dữ liệu: bảng use_case_stages (các bước đã tick) và cột projects.progress_model.
-- Sau khi chạy, tiến độ use case tính lại theo tiêu chí nghiệm thu: use case không có tiêu chí sẽ về 0%.

drop trigger if exists stage_changed on public.use_case_stages;
drop trigger if exists project_model_changed on public.projects;
drop function if exists public.set_use_case_stages(uuid[], text, boolean);
drop function if exists public.trg_stage_changed();
drop function if exists public.trg_project_model_changed();
drop function if exists public.recompute_use_case_stages(uuid);
drop table if exists public.use_case_stages;
alter table public.projects drop column if exists progress_model;

-- Trigger tiêu chí nghiệm thu như trước 0010 (luôn quyết định tiến độ use case lá).
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

-- Tổng hợp cha: trung bình các con trực tiếp (như 0008).
create or replace function public.rollup_use_case(ucid uuid) returns void
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

create or replace function public.trg_use_case_rollup() returns trigger
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

drop function if exists public.recompute_use_case_criteria(uuid);
drop function if exists public.rollup_ancestors(uuid);
drop function if exists public.can_tick_stage(uuid, text);
drop function if exists public.stage_weight(text);
drop function if exists public.complexity_weight(text);

-- Tiến độ dự án như 0008 (use case lá, trung bình thường), nhưng vẫn không tính module/nhóm (kind) của 0009.
create or replace function public.recompute_project_progress(pid uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  t_n integer; t_pct numeric; u_n integer; u_pct numeric; pct integer;
begin
  select count(*), coalesce(avg(progress_percent), 0)
    into t_n, t_pct from public.tasks where project_id = pid;
  select count(*), coalesce(avg(progress_percent), 0)
    into u_n, u_pct from public.use_cases u
   where u.project_id = pid and u.kind <> 'group'
     and not exists (select 1 from public.use_cases c where c.parent_id = u.id);
  if t_n = 0 and u_n = 0 then return; end if;
  pct := round(case when u_n > 0 then t_pct * 0.6 + u_pct * 0.4 else t_pct end);
  update public.projects set progress_percent = pct
   where id = pid and progress_percent is distinct from pct;
  perform public.snapshot_project(pid);
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
