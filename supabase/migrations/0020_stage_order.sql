-- Omni Project Manager - 0020: 5 bước use case phải làm TUẦN TỰ + đặt "mức tiến độ" hàng loạt + báo cáo quyền truy cập.
--
-- 1. Thứ tự bước (Phân tích -> Thiết kế -> Lập trình -> Kiểm thử -> Nghiệm thu):
--    * Đánh dấu một bước thì các bước TRƯỚC nó tự được đánh dấu theo (nếu người thao tác có quyền tick các bước đó;
--      nếu không, use case đó bị bỏ qua và được báo lại, VD DEV tick "Lập trình" khi BA chưa xong "Phân tích").
--    * Bỏ đánh dấu một bước thì các bước SAU nó cũng bị bỏ (không thể có bước sau xong mà bước trước chưa xong);
--      nếu người thao tác không có quyền bỏ các bước sau đó thì use case bị bỏ qua và được báo lại.
-- 2. set_use_case_level(): chuyển cả nhóm use case về một mức tiến độ (0 = chưa bắt đầu ... 5 = xong nghiệm thu),
--    vừa đánh dấu vừa bỏ đánh dấu cho đúng thứ tự. Dùng cho thao tác hàng loạt ở màn Use case.
-- 3. my_access_report() / member_access_report(): cho giao diện hiển thị quyền thực tế của một người trong dự án
--    (dùng chính các hàm can_* mà chính sách RLS đang dùng) để dễ chẩn đoán "vì sao tôi không thấy/không sửa được".
--
-- set_use_case_stages đổi kiểu trả về từ số nguyên sang JSON {changed, unchanged, blocked, blockedCodes}.
-- Hoàn tác: supabase/rollback/0020_rollback.sql

create function public.stage_index(s text) returns integer
language sql immutable set search_path = '' as $$
  select case s when 'analysis' then 1 when 'design' then 2 when 'coding' then 3 when 'testing' then 4 when 'acceptance' then 5 end
$$;

-- Áp dụng việc thêm/bỏ các bước cho MỘT use case: tất cả hoặc không gì (nếu thiếu quyền ở bất kỳ bước nào thì 'blocked').
create function public._apply_stage_target(p_uc uuid, p_add text[], p_remove text[], p_actor uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  pid uuid; s text;
  v_add text[] := coalesce(p_add, '{}');
  v_rem text[] := coalesce(p_remove, '{}');
begin
  if cardinality(v_add) = 0 and cardinality(v_rem) = 0 then return 'unchanged'; end if;
  select project_id into pid from public.use_cases where id = p_uc;
  foreach s in array v_add || v_rem loop
    if not coalesce(public.can_tick_stage(pid, s), false) then return 'blocked'; end if;
  end loop;
  if cardinality(v_add) > 0 then
    insert into public.use_case_stages (use_case_id, stage, done_by)
    select p_uc, x, p_actor from unnest(v_add) x
    on conflict (use_case_id, stage) do nothing;
  end if;
  if cardinality(v_rem) > 0 then
    delete from public.use_case_stages where use_case_id = p_uc and stage = any (v_rem);
  end if;
  return 'changed';
end
$$;

-- Lõi dùng chung: tính danh sách bước cần thêm/bỏ rồi áp dụng cho từng use case lá của dự án dùng mô hình 5 bước.
create function public._stage_batch(p_use_cases uuid[], p_mode text, p_stage text, p_done boolean, p_level integer, p_actor uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  all_stages constant text[] := array['analysis', 'design', 'coding', 'testing', 'acceptance'];
  uc_id uuid; uc public.use_cases; model text; actor uuid; done_s text[]; add_s text[]; rem_s text[]; res text;
  idx integer := public.stage_index(p_stage);
  n_changed integer := 0; n_unchanged integer := 0; n_blocked integer := 0; codes text[] := '{}';
begin
  foreach uc_id in array coalesce(p_use_cases, '{}') loop
    select * into uc from public.use_cases u where u.id = uc_id;
    if not found then continue; end if;
    if p_mode = 'stage' and not coalesce(public.can_tick_stage(uc.project_id, p_stage), false) then
      raise exception 'Bạn không có quyền cập nhật bước này' using errcode = '42501';
    end if;
    actor := public.resolve_actor(uc.project_id, p_actor);
    select progress_model into model from public.projects where id = uc.project_id;
    if model <> 'stages' or uc.kind = 'group' or uc.status = 'cancelled'
       or exists (select 1 from public.use_cases c where c.parent_id = uc.id) then
      continue;
    end if;
    select coalesce(array_agg(stage), '{}') into done_s from public.use_case_stages where use_case_id = uc.id;

    if p_mode = 'level' then
      add_s := array(select s from unnest(all_stages) with ordinality t(s, i) where i <= p_level and not (s = any (done_s)));
      rem_s := array(select s from unnest(all_stages) with ordinality t(s, i) where i > p_level and s = any (done_s));
    elsif p_done then
      add_s := array(select s from unnest(all_stages) with ordinality t(s, i) where i <= idx and not (s = any (done_s)));
      rem_s := '{}';
    else
      add_s := '{}';
      rem_s := array(select s from unnest(all_stages) with ordinality t(s, i) where i >= idx and s = any (done_s));
    end if;

    res := public._apply_stage_target(uc.id, add_s, rem_s, actor);
    if res = 'changed' then n_changed := n_changed + 1;
    elsif res = 'blocked' then
      n_blocked := n_blocked + 1;
      if cardinality(codes) < 5 then codes := codes || uc.code; end if;
    else n_unchanged := n_unchanged + 1;
    end if;
  end loop;
  return jsonb_build_object('changed', n_changed, 'unchanged', n_unchanged, 'blocked', n_blocked, 'blockedCodes', to_jsonb(codes));
end
$$;

drop function public.set_use_case_stages(uuid[], text, boolean, uuid);
create function public.set_use_case_stages(p_use_cases uuid[], p_stage text, p_done boolean, p_actor uuid default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if p_stage not in ('analysis', 'design', 'coding', 'testing', 'acceptance') then
    raise exception 'Bước không hợp lệ: %', p_stage using errcode = '22023';
  end if;
  if coalesce(array_length(p_use_cases, 1), 0) > 500 then
    raise exception 'Mỗi lần chỉ cập nhật tối đa 500 use case' using errcode = '22023';
  end if;
  return public._stage_batch(p_use_cases, 'stage', p_stage, coalesce(p_done, true), null, p_actor);
end
$$;

-- Chuyển use case về một mức: 0 = chưa bắt đầu, 1 = xong Phân tích, ... 5 = xong cả Nghiệm thu.
create function public.set_use_case_level(p_use_cases uuid[], p_level integer, p_actor uuid default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if p_level is null or p_level < 0 or p_level > 5 then
    raise exception 'Mức tiến độ không hợp lệ: %', p_level using errcode = '22023';
  end if;
  if coalesce(array_length(p_use_cases, 1), 0) > 500 then
    raise exception 'Mỗi lần chỉ cập nhật tối đa 500 use case' using errcode = '22023';
  end if;
  return public._stage_batch(p_use_cases, 'level', null, null, p_level, p_actor);
end
$$;

-- ------------------------------------------------------------
-- Báo cáo quyền
-- ------------------------------------------------------------

-- Quyền THỰC TẾ của người đang đăng nhập trong dự án: gọi đúng các hàm can_* mà RLS dùng, và đếm số dòng họ đọc được
-- (qua RLS, vì hàm chạy với quyền người gọi) so với tổng số dòng thật. Lệch nhau = có vấn đề phân quyền cần xem.
create function public.my_access_report(pid uuid) returns jsonb
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

-- Tổng số dòng thật (bỏ qua RLS) của dự án; chỉ trả cho người được phép xem dự án.
create function public._project_counts(pid uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when coalesce(public.can_view_project(pid), false) then jsonb_build_object(
    'useCases', (select count(*) from public.use_cases where project_id = pid),
    'tasks', (select count(*) from public.tasks where project_id = pid),
    'members', (select count(*) from public.project_members where project_id = pid)) end
$$;

-- Quyền của một thành viên khác (admin/PM xem để biết người đó làm được gì). Cùng quy tắc với các hàm can_*.
create function public.member_access_report(pid uuid, uid uuid) returns jsonb
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
    'manage', coalesce(adm or r = 'pm', false),
    'writeTasks', coalesce(adm or r in ('pm', 'dev', 'ba', 'tester'), false),
    'writeUseCases', coalesce(adm or r in ('pm', 'dev', 'ba'), false),
    'approveQuality', coalesce(adm or r in ('pm', 'tester'), false),
    'stages', jsonb_build_object(
      'analysis', coalesce(adm or r in ('pm', 'ba'), false),
      'design', coalesce(adm or r in ('pm', 'ba'), false),
      'coding', coalesce(adm or r in ('pm', 'dev'), false),
      'testing', coalesce(adm or r in ('pm', 'tester'), false),
      'acceptance', coalesce(adm or r = 'pm', false))
  );
end
$$;

revoke execute on function
  public.stage_index(text), public._apply_stage_target(uuid, text[], text[], uuid),
  public._stage_batch(uuid[], text, text, boolean, integer, uuid), public._project_counts(uuid),
  public.set_use_case_stages(uuid[], text, boolean, uuid), public.set_use_case_level(uuid[], integer, uuid),
  public.my_access_report(uuid), public.member_access_report(uuid, uuid)
  from public, anon;
revoke execute on function public._apply_stage_target(uuid, text[], text[], uuid),
  public._stage_batch(uuid[], text, text, boolean, integer, uuid) from authenticated;
grant execute on function public._project_counts(uuid) to authenticated;
grant execute on function
  public.set_use_case_stages(uuid[], text, boolean, uuid), public.set_use_case_level(uuid[], integer, uuid),
  public.my_access_report(uuid), public.member_access_report(uuid, uuid)
  to authenticated;
