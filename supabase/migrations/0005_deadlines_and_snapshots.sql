-- Omni Project Manager - 0005: nhắc deadline tự động + lịch sử tiến độ (cho biểu đồ).
-- Lịch chạy tự động (pg_cron) nằm ở 0006_schedule_cron.sql.

-- ============================================================
-- 1. LỊCH SỬ TIẾN ĐỘ
-- ============================================================

create table public.progress_snapshots (
  project_id uuid not null references public.projects (id) on delete cascade,
  snap_date date not null,
  progress_percent integer not null check (progress_percent between 0 and 100),
  tasks_total integer not null default 0,
  tasks_done integer not null default 0,
  quality_total integer not null default 0,
  quality_passed integer not null default 0,
  primary key (project_id, snap_date)
);

alter table public.progress_snapshots enable row level security;
create policy snapshots_select on public.progress_snapshots for select to authenticated
  using (public.can_view_project(project_id));
-- Chỉ trigger / hàm server được ghi.
revoke all on public.progress_snapshots from anon;
revoke insert, update, delete on public.progress_snapshots from authenticated;

-- Ghi (hoặc cập nhật) ảnh chụp của ngày hôm nay (giờ Việt Nam) cho một dự án.
create function public.snapshot_project(pid uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  t_n integer; t_done integer; q_n integer; q_pass integer; prog integer;
begin
  select progress_percent into prog from public.projects where id = pid;
  if prog is null then return; end if;
  select count(*), count(*) filter (where status = 'done') into t_n, t_done
    from public.tasks where project_id = pid;
  select count(*), count(*) filter (where is_passed) into q_n, q_pass
    from public.quality_items where project_id = pid;
  insert into public.progress_snapshots (project_id, snap_date, progress_percent, tasks_total, tasks_done, quality_total, quality_passed)
  values (pid, today, prog, t_n, t_done, q_n, q_pass)
  on conflict (project_id, snap_date) do update
    set progress_percent = excluded.progress_percent,
        tasks_total = excluded.tasks_total,
        tasks_done = excluded.tasks_done,
        quality_total = excluded.quality_total,
        quality_passed = excluded.quality_passed;
end
$$;

-- Tính lại tiến độ rồi ghi ảnh chụp (thay thế bản ở 0001).
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

-- Tick/bỏ tick checklist chất lượng cũng cập nhật ảnh chụp trong ngày.
create function public.trg_quality_snapshot() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.snapshot_project(new.project_id);
  return null;
end
$$;
create trigger quality_snapshot after update of is_passed on public.quality_items
  for each row execute function public.trg_quality_snapshot();

-- Chốt ảnh chụp mỗi ngày cho mọi dự án (cron gọi cuối ngày để ngày không có thay đổi vẫn có điểm).
create function public.snapshot_all_projects() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  r record; n integer := 0;
begin
  for r in select id from public.projects loop
    perform public.snapshot_project(r.id);
    n := n + 1;
  end loop;
  return n;
end
$$;

-- Dữ liệu minh họa: dựng đường cong tiến độ từ ngày bắt đầu đến hôm nay cho 3 dự án demo.
-- Chỉ bổ sung các ngày chưa có ảnh chụp thật. Chạy: select public.backfill_demo_progress();
create function public.backfill_demo_progress() returns text
language plpgsql security definer set search_path = '' as $$
declare
  today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  r record; d date; span integer; t numeric; e numeric; n integer := 0;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'Chỉ quản trị viên mới được dựng dữ liệu minh họa' using errcode = '42501';
  end if;
  for r in
    select p.id, p.start_date, p.progress_percent as prog,
           (select count(*) from public.tasks where project_id = p.id) as t_n,
           (select count(*) from public.tasks where project_id = p.id and status = 'done') as t_done,
           (select count(*) from public.quality_items where project_id = p.id) as q_n,
           (select count(*) from public.quality_items where project_id = p.id and is_passed) as q_pass
      from public.projects p
     where p.code in ('OMNI-BANK', 'E-SHOP-B2B', 'TELE-HEALTH')
  loop
    span := greatest(today - r.start_date, 1);
    for d in select generate_series(greatest(r.start_date, today - 120), today - 1, interval '1 day')::date loop
      t := (d - r.start_date)::numeric / span;
      e := t * t * (3 - 2 * t); -- smoothstep: khởi động chậm, tăng tốc, chậm lại
      insert into public.progress_snapshots (project_id, snap_date, progress_percent, tasks_total, tasks_done, quality_total, quality_passed)
      values (r.id, d, round(r.prog * e), r.t_n, round(r.t_done * e), r.q_n, round(r.q_pass * e))
      on conflict (project_id, snap_date) do nothing;
      n := n + 1;
    end loop;
  end loop;
  return 'Đã dựng ' || n || ' điểm dữ liệu minh họa.';
end
$$;

-- ============================================================
-- 2. NHẮC DEADLINE TỰ ĐỘNG
-- ============================================================

-- Quét task chưa xong: quá hạn hoặc còn <= 2 ngày. Gửi cho người phụ trách + PM của dự án.
-- Mỗi (loại, task, người nhận) chỉ một thông báo (dedupe_key). Trả về số thông báo mới.
create function public.scan_deadlines() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  n integer;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'Chỉ quản trị viên mới được chạy quét deadline thủ công' using errcode = '42501';
  end if;

  with candidates as (
    select t.id as task_id, t.project_id, t.code, t.title, t.due_date,
           (t.due_date - today) as diff, r.uid
      from public.tasks t
      join public.projects p on p.id = t.project_id
      cross join lateral (
        select distinct u as uid from unnest(array[t.assignee_id, p.manager_id]) as u where u is not null
      ) r
     where t.status <> 'done' and (t.due_date - today) <= 2
  ), ins as (
    insert into public.notifications (user_id, project_id, type, title, message, task_id, dedupe_key)
    select uid, project_id,
           case when diff < 0 then 'overdue' else 'deadline_warning' end,
           case when diff < 0 then 'Cảnh Báo Quá Hạn: ' || code else 'Nhắc Nhở Deadline: ' || code end,
           case when diff < 0
                  then 'Nhiệm vụ "' || title || '" đã quá hạn chót (' || to_char(due_date, 'YYYY-MM-DD') || ') ' || abs(diff)::text || ' ngày!'
                when diff = 0
                  then 'Nhiệm vụ "' || title || '" sẽ đến hạn trong ngày hôm nay!'
                else 'Nhiệm vụ "' || title || '" sẽ đến hạn trong ' || diff::text || ' ngày tới (' || to_char(due_date, 'YYYY-MM-DD') || ')!'
           end,
           task_id,
           (case when diff < 0 then 'overdue' else 'deadline_warning' end) || ':' || task_id::text || ':' || uid::text
      from candidates
    on conflict (dedupe_key) where dedupe_key is not null do nothing
    returning 1
  )
  select count(*) into n from ins;
  return n;
end
$$;

-- ============================================================
-- 3. QUYỀN HÀM + REALTIME
-- ============================================================

revoke execute on function
  public.snapshot_project(uuid), public.trg_quality_snapshot(), public.snapshot_all_projects(),
  public.backfill_demo_progress(), public.scan_deadlines()
  from public, anon;
revoke execute on function public.snapshot_project(uuid), public.trg_quality_snapshot(), public.snapshot_all_projects()
  from authenticated;
-- scan_deadlines + backfill tự kiểm tra quyền admin bên trong.
grant execute on function public.scan_deadlines(), public.backfill_demo_progress() to authenticated;

alter publication supabase_realtime add table public.progress_snapshots;
