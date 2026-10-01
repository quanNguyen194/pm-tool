-- Omni Project Manager - 0007: báo cáo định kỳ tự động (lưu trong hệ thống) + hàm ping giữ project không bị tạm dừng.
-- Chưa gửi email: bản tóm tắt được lưu ở report_runs, sau này chỉ cần thêm bước gửi (Edge Function + Resend).

-- ============================================================
-- 1. BẢNG
-- ============================================================

create table public.report_schedules (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  frequency text not null check (frequency in ('weekly', 'monthly')),
  enabled boolean not null default true,
  last_run_on date,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (project_id, frequency)
);

create table public.report_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  frequency text not null check (frequency in ('weekly', 'monthly', 'sprint')),
  period_start date not null,
  period_end date not null,
  summary jsonb not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (project_id, frequency, period_end)
);
create index report_runs_project_idx on public.report_runs (project_id, created_at desc);

alter table public.report_schedules enable row level security;
alter table public.report_runs enable row level security;

create policy schedules_select on public.report_schedules for select to authenticated
  using (public.can_view_project(project_id));
create policy schedules_insert on public.report_schedules for insert to authenticated
  with check (public.can_manage_project(project_id));
create policy schedules_update on public.report_schedules for update to authenticated
  using (public.can_manage_project(project_id)) with check (public.can_manage_project(project_id));
create policy schedules_delete on public.report_schedules for delete to authenticated
  using (public.can_manage_project(project_id));

create policy runs_select on public.report_runs for select to authenticated
  using (public.can_view_project(project_id));
create policy runs_delete on public.report_runs for delete to authenticated
  using (public.can_manage_project(project_id));

revoke all on public.report_schedules, public.report_runs from anon;
revoke insert, update on public.report_schedules from authenticated;
grant insert (project_id, frequency, enabled) on public.report_schedules to authenticated;
grant update (enabled) on public.report_schedules to authenticated;
revoke insert, update on public.report_runs from authenticated;

-- ============================================================
-- 2. HÀM
-- ============================================================

-- Dựng bản tóm tắt JSON của một dự án cho kỳ [p_start, p_end]. Chỉ gọi nội bộ.
create function public.build_report_summary(pid uuid, p_start date, p_end date) returns jsonb
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

-- Lưu (hoặc ghi đè) một bản báo cáo. Chỉ gọi nội bộ.
create function public.store_report(pid uuid, freq text, p_start date, p_end date, uid uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  rid uuid;
begin
  insert into public.report_runs (project_id, frequency, period_start, period_end, summary, created_by)
  values (pid, freq, p_start, p_end, public.build_report_summary(pid, p_start, p_end), uid)
  on conflict (project_id, frequency, period_end) do update
    set period_start = excluded.period_start, summary = excluded.summary,
        created_by = excluded.created_by, created_at = now()
  returning id into rid;
  return rid;
end
$$;

-- PM/admin tạo báo cáo ngay: tuần = 7 ngày gần nhất, tháng = 30 ngày, sprint = 14 ngày.
create function public.generate_report_now(p_project uuid, p_frequency text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  days integer;
begin
  if not public.can_manage_project(p_project) then
    raise exception 'Chỉ quản trị viên hoặc PM mới được tạo báo cáo' using errcode = '42501';
  end if;
  days := case p_frequency when 'weekly' then 6 when 'monthly' then 29 when 'sprint' then 13 else null end;
  if days is null then
    raise exception 'Loại báo cáo không hợp lệ: %', p_frequency using errcode = '22023';
  end if;
  return public.store_report(p_project, p_frequency, today - days, today, auth.uid());
end
$$;

-- Cron gọi mỗi sáng: sáng thứ Hai tạo báo cáo tuần (7 ngày trước), ngày 1 hằng tháng tạo báo cáo tháng trước.
-- p_today chỉ để kiểm thử. Trả về số báo cáo mới tạo.
create function public.generate_due_reports(p_today date default null) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  today date := coalesce(p_today, (now() at time zone 'Asia/Ho_Chi_Minh')::date);
  s record; n integer := 0;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'Chỉ quản trị viên mới được chạy tạo báo cáo định kỳ' using errcode = '42501';
  end if;
  for s in select * from public.report_schedules where enabled and last_run_on is distinct from today loop
    if s.frequency = 'weekly' and extract(isodow from today) = 1 then
      perform public.store_report(s.project_id, 'weekly', today - 7, today - 1, null);
    elsif s.frequency = 'monthly' and extract(day from today) = 1 then
      perform public.store_report(
        s.project_id, 'monthly',
        (date_trunc('month', today) - interval '1 month')::date, today - 1, null);
    else
      continue;
    end if;
    update public.report_schedules set last_run_on = today where id = s.id;
    n := n + 1;
  end loop;
  return n;
end
$$;

-- Gọi từ GitHub Action hằng tuần để project Supabase gói free không bị tạm dừng vì không hoạt động.
create function public.ping() returns timestamptz
language sql stable set search_path = '' as $$ select now() $$;

-- ============================================================
-- 3. QUYỀN HÀM, REALTIME, LỊCH CRON
-- ============================================================

revoke execute on function
  public.build_report_summary(uuid, date, date), public.store_report(uuid, text, date, date, uuid),
  public.generate_report_now(uuid, text), public.generate_due_reports(date), public.ping()
  from public, anon, authenticated;
grant execute on function public.generate_report_now(uuid, text), public.generate_due_reports(date) to authenticated;
grant execute on function public.ping() to anon, authenticated;

alter publication supabase_realtime add table public.report_schedules, public.report_runs;

-- 08:10 sáng giờ VN. Bỏ qua nếu chưa bật pg_cron (chạy 0006 rồi chạy lại đoạn này).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'omni-generate-reports';
    perform cron.schedule('omni-generate-reports', '10 1 * * *', 'select public.generate_due_reports()');
  else
    raise notice 'pg_cron chưa được bật: chưa đặt lịch omni-generate-reports. Chạy 0006 rồi chạy lại 0007.';
  end if;
end
$$;
