-- Omni Project Manager - 0013: gợi ý tài khoản, tài khoản ảo (chưa đăng ký) + hợp nhất khi đăng ký, admin chọn người thực hiện.
-- Chạy trong Supabase SQL Editor SAU 0012 và TRƯỚC khi deploy giao diện mới.
-- Bản giao diện hiện tại vẫn chạy bình thường nếu migration này đã chạy (chỉ thêm cột/bảng/hàm).
--
-- 1. TÀI KHOẢN ẢO: bản ghi profiles không gắn với tài khoản đăng nhập (is_placeholder = true), chỉ admin tạo.
--    Tên do admin đặt, không được trùng tên tài khoản đã đăng ký (so khớp không phân biệt hoa/thường, gộp khoảng trắng).
-- 2. HỢP NHẤT: khi có tài khoản thật đăng ký (hoặc đổi tên) trùng tên một tài khoản ảo, hệ thống tạo YÊU CẦU HỢP NHẤT
--    và gửi thông báo cho mọi admin. Chỉ khi admin duyệt thì mọi dữ liệu của tài khoản ảo (thành viên dự án, nhiệm vụ,
--    người phối hợp, bước đã tick...) được chuyển sang tài khoản thật và tài khoản ảo bị xóa. Từ chối thì giữ nguyên cả hai.
-- 3. NGƯỜI THỰC HIỆN: admin được chọn thành viên khác làm người thực hiện khi tick bước use case hoặc duyệt tiêu chuẩn
--    chất lượng (hàm set_use_case_stages / set_quality_item có tham số p_actor). Vai trò khác không dùng được.

-- ============================================================
-- 1. PROFILES: cho phép bản ghi không có tài khoản đăng nhập
-- ============================================================

create function public.norm_name(t text) returns text
language sql immutable set search_path = '' as $$
  select lower(regexp_replace(btrim(coalesce(t, '')), '\s+', ' ', 'g'))
$$;

alter table public.profiles add column is_placeholder boolean not null default false;

do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'public.profiles'::regclass and contype = 'f' and confrelid = 'auth.users'::regclass
  loop
    execute format('alter table public.profiles drop constraint %I', c);
  end loop;
end
$$;

-- Thay cho ON DELETE CASCADE cũ: xóa tài khoản đăng nhập thì xóa profile tương ứng.
create function public.handle_user_deleted() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.profiles where id = old.id and not is_placeholder;
  return old;
end
$$;
create trigger on_auth_user_deleted after delete on auth.users
  for each row execute function public.handle_user_deleted();

create unique index profiles_placeholder_name_idx on public.profiles (public.norm_name(name)) where is_placeholder;

-- Tên tài khoản ảo không được trùng tên tài khoản đã đăng ký.
create function public.guard_placeholder_name() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.is_placeholder and exists (
    select 1 from public.profiles p
     where not p.is_placeholder and public.norm_name(p.name) = public.norm_name(new.name)
  ) then
    raise exception 'Tên "%" đã trùng với một tài khoản đã đăng ký', new.name using errcode = '23505';
  end if;
  return new;
end
$$;
create trigger guard_placeholder_name before insert or update of name on public.profiles
  for each row when (new.is_placeholder) execute function public.guard_placeholder_name();

-- ============================================================
-- 2. YÊU CẦU HỢP NHẤT
-- ============================================================

create table public.account_merge_requests (
  id uuid primary key default gen_random_uuid(),
  placeholder_id uuid not null references public.profiles (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.profiles (id) on delete set null
);
create unique index account_merge_pending_idx on public.account_merge_requests (placeholder_id, user_id)
  where status = 'pending';

alter table public.account_merge_requests enable row level security;
create policy merge_select on public.account_merge_requests for select to authenticated
  using (public.is_admin());
revoke all on public.account_merge_requests from anon;
revoke insert, update, delete on public.account_merge_requests from authenticated;

alter publication supabase_realtime add table public.account_merge_requests;

-- Tài khoản thật mới (hoặc đổi tên) trùng tên một tài khoản ảo: tạo yêu cầu + thông báo cho admin.
create function public.trg_profile_match_placeholder() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  ph record; adm record; created integer; projects integer;
begin
  if new.is_placeholder then return null; end if;
  if tg_op = 'UPDATE' and old.name is not distinct from new.name then return null; end if;
  for ph in
    select p.id, p.name from public.profiles p
     where p.is_placeholder and public.norm_name(p.name) = public.norm_name(new.name)
  loop
    with ins as (
      insert into public.account_merge_requests (placeholder_id, user_id) values (ph.id, new.id)
      on conflict (placeholder_id, user_id) where status = 'pending' do nothing
      returning 1
    )
    select count(*) into created from ins;
    if created > 0 then
      select count(*) into projects from public.project_members where user_id = ph.id;
      for adm in select id from public.profiles where is_admin and not is_placeholder loop
        insert into public.notifications (user_id, type, title, message, dedupe_key)
        values (
          adm.id, 'system', 'Yêu cầu hợp nhất tài khoản',
          'Tài khoản mới "' || new.name || '"' || coalesce(' (' || new.email || ')', '')
            || ' trùng tên với tài khoản ảo "' || ph.name || '" đang tham gia ' || projects
            || ' dự án. Vào Đội ngũ để duyệt hợp nhất hoặc từ chối.',
          'merge:' || ph.id::text || ':' || new.id::text || ':' || adm.id::text
        )
        on conflict (dedupe_key) where dedupe_key is not null do nothing;
      end loop;
    end if;
  end loop;
  return null;
end
$$;
create trigger profile_match_placeholder after insert or update of name on public.profiles
  for each row when (not new.is_placeholder) execute function public.trg_profile_match_placeholder();

-- ============================================================
-- 3. HÀM: GỢI Ý, THÊM THÀNH VIÊN, TÀI KHOẢN ẢO, HỢP NHẤT
-- ============================================================

-- Gợi ý tài khoản chưa thuộc dự án theo tên/email (người quản lý dự án gọi khi gõ trong ô thêm thành viên).
create function public.suggest_accounts(p_project uuid, p_query text default '')
returns table (id uuid, name text, email text, avatar_color text, is_placeholder boolean)
language plpgsql stable security definer set search_path = '' as $$
declare
  q text := lower(btrim(coalesce(p_query, '')));
begin
  if not public.can_manage_project(p_project) then
    raise exception 'Bạn không có quyền quản lý thành viên của dự án này' using errcode = '42501';
  end if;
  return query
    select p.id, p.name, p.email, p.avatar_color, p.is_placeholder
      from public.profiles p
     where not exists (select 1 from public.project_members m where m.project_id = p_project and m.user_id = p.id)
       and (q = '' or strpos(lower(p.name), q) > 0 or strpos(lower(coalesce(p.email, '')), q) > 0)
     order by p.is_placeholder, p.name
     limit 8;
end
$$;

create function public.add_project_member_by_id(p_project uuid, p_user uuid, p_role text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.can_manage_project(p_project) then
    raise exception 'Bạn không có quyền quản lý thành viên của dự án này' using errcode = '42501';
  end if;
  if p_role not in ('pm', 'dev', 'ba', 'tester', 'viewer') then
    raise exception 'Vai trò không hợp lệ: %', p_role using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_user) then
    raise exception 'Không tìm thấy tài khoản' using errcode = 'P0002';
  end if;
  insert into public.project_members (project_id, user_id, role) values (p_project, p_user, p_role)
  on conflict (project_id, user_id) do update set role = excluded.role;
end
$$;

-- Admin thêm một người chưa đăng ký vào dự án (tạo tài khoản ảo, hoặc dùng lại tài khoản ảo cùng tên).
create function public.create_placeholder_member(p_project uuid, p_name text, p_role text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  nm text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  pid uuid; reg record;
  colors text[] := array['bg-indigo-600', 'bg-emerald-700', 'bg-blue-600', 'bg-amber-700', 'bg-zinc-700'];
begin
  if not public.is_admin() then
    raise exception 'Chỉ quản trị viên mới được thêm tài khoản chưa đăng ký' using errcode = '42501';
  end if;
  if char_length(nm) < 2 or char_length(nm) > 80 then
    raise exception 'Tên phải từ 2 đến 80 ký tự' using errcode = '22023';
  end if;
  if p_role not in ('pm', 'dev', 'ba', 'tester', 'viewer') then
    raise exception 'Vai trò không hợp lệ: %', p_role using errcode = '22023';
  end if;
  select p.name, p.email into reg from public.profiles p
   where not p.is_placeholder and public.norm_name(p.name) = public.norm_name(nm) limit 1;
  if found then
    raise exception 'Tên "%" đã trùng với tài khoản đã đăng ký%. Hãy chọn tài khoản đó trong danh sách gợi ý.',
      nm, coalesce(' (' || reg.email || ')', '') using errcode = '23505';
  end if;
  select id into pid from public.profiles where is_placeholder and public.norm_name(name) = public.norm_name(nm);
  if pid is null then
    pid := gen_random_uuid();
    insert into public.profiles (id, name, email, avatar_color, is_placeholder)
    values (pid, nm, null, colors[1 + abs(hashtext(pid::text)) % array_length(colors, 1)], true);
  end if;
  insert into public.project_members (project_id, user_id, role) values (p_project, pid, p_role)
  on conflict (project_id, user_id) do update set role = excluded.role;
  return pid;
end
$$;

create function public.delete_placeholder(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Chỉ quản trị viên mới được xóa tài khoản ảo' using errcode = '42501';
  end if;
  delete from public.profiles where id = p_user and is_placeholder;
  if not found then
    raise exception 'Không tìm thấy tài khoản ảo' using errcode = 'P0002';
  end if;
end
$$;

-- Duyệt hợp nhất: chuyển mọi dữ liệu của tài khoản ảo sang tài khoản thật rồi xóa tài khoản ảo.
create function public.approve_account_merge(p_request uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r public.account_merge_requests; fk record; ph_name text; real_name text;
begin
  if not public.is_admin() then
    raise exception 'Chỉ quản trị viên mới được duyệt hợp nhất' using errcode = '42501';
  end if;
  select * into r from public.account_merge_requests where id = p_request for update;
  if not found or r.status <> 'pending' then
    raise exception 'Yêu cầu không tồn tại hoặc đã được xử lý' using errcode = 'P0002';
  end if;
  select name into ph_name from public.profiles where id = r.placeholder_id and is_placeholder;
  select name into real_name from public.profiles where id = r.user_id and not is_placeholder;
  if ph_name is null or real_name is null then
    raise exception 'Tài khoản trong yêu cầu không còn hợp lệ' using errcode = 'P0002';
  end if;

  -- Thành viên dự án: nếu tài khoản thật đã ở trong dự án thì giữ vai trò của họ.
  delete from public.project_members m
   where m.user_id = r.placeholder_id
     and exists (select 1 from public.project_members x where x.project_id = m.project_id and x.user_id = r.user_id);
  update public.project_members set user_id = r.user_id where user_id = r.placeholder_id;

  -- Người phối hợp: bỏ trùng rồi chuyển.
  delete from public.task_collaborators c
   where c.user_id = r.placeholder_id
     and exists (select 1 from public.task_collaborators x where x.task_id = c.task_id and x.user_id = r.user_id);
  update public.task_collaborators set user_id = r.user_id where user_id = r.placeholder_id;

  -- Mọi khóa ngoại còn lại tới profiles (người phụ trách, quản lý dự án, người tick bước, người tạo...).
  for fk in
    select c.conrelid::regclass::text as tbl, a.attname as col
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
     where c.contype = 'f' and c.confrelid = 'public.profiles'::regclass
       and c.conrelid::regclass::text not in ('public.project_members', 'public.task_collaborators',
                                               'public.profiles', 'public.account_merge_requests')
  loop
    execute format('update %s set %I = $1 where %I = $2', fk.tbl, fk.col, fk.col) using r.user_id, r.placeholder_id;
  end loop;

  update public.account_merge_requests
     set status = 'approved', decided_at = now(), decided_by = auth.uid()
   where id = p_request;
  -- Yêu cầu khác của cùng tài khoản ảo sẽ mất theo khi xóa (ON DELETE CASCADE).
  delete from public.profiles where id = r.placeholder_id and is_placeholder;

  insert into public.notifications (user_id, type, title, message)
  values (r.user_id, 'system', 'Tài khoản đã được hợp nhất',
          'Quản trị viên đã hợp nhất tài khoản ảo "' || ph_name || '" vào tài khoản của bạn: các dự án, nhiệm vụ và dữ liệu cũ đã được chuyển sang.');
end
$$;

create function public.reject_account_merge(p_request uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Chỉ quản trị viên mới được từ chối hợp nhất' using errcode = '42501';
  end if;
  update public.account_merge_requests
     set status = 'rejected', decided_at = now(), decided_by = auth.uid()
   where id = p_request and status = 'pending';
  if not found then
    raise exception 'Yêu cầu không tồn tại hoặc đã được xử lý' using errcode = 'P0002';
  end if;
end
$$;

-- ============================================================
-- 4. ADMIN CHỌN NGƯỜI THỰC HIỆN
-- ============================================================

-- Kiểm tra người thực hiện thay thế: chỉ admin được chọn người khác, và người đó phải thuộc dự án.
create function public.resolve_actor(pid uuid, p_actor uuid) returns uuid
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_actor is null or p_actor = auth.uid() then
    return auth.uid();
  end if;
  if not public.is_admin() then
    raise exception 'Chỉ quản trị viên mới được chọn người thực hiện khác' using errcode = '42501';
  end if;
  if not exists (select 1 from public.project_members m where m.project_id = pid and m.user_id = p_actor) then
    raise exception 'Người thực hiện phải là thành viên của dự án' using errcode = '22023';
  end if;
  return p_actor;
end
$$;

-- Bản mới của set_use_case_stages có thêm p_actor (gỡ bản 3 tham số để PostgREST không bị nhập nhằng).
drop function public.set_use_case_stages(uuid[], text, boolean);
create function public.set_use_case_stages(p_use_cases uuid[], p_stage text, p_done boolean, p_actor uuid default null)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  uc_id uuid; uc public.use_cases; model text; changed integer := 0; hit integer; actor uuid;
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
    actor := public.resolve_actor(uc.project_id, p_actor);
    select progress_model into model from public.projects where id = uc.project_id;
    if model <> 'stages' or uc.kind = 'group' or uc.status = 'cancelled'
       or exists (select 1 from public.use_cases c where c.parent_id = uc.id) then
      continue;
    end if;
    if p_done then
      insert into public.use_case_stages (use_case_id, stage, done_by)
      values (uc.id, p_stage, actor)
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

-- Trigger duyệt chất lượng: người duyệt là người thực hiện do admin chọn (app.actor) nếu có.
create or replace function public.trg_quality_checked() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  who text; actor uuid; actor_role text;
begin
  if current_setting('app.seeding', true) = 'on' then return new; end if;
  if new.is_passed and not old.is_passed then
    actor := coalesce(nullif(current_setting('app.actor', true), '')::uuid, auth.uid());
    select m.role into actor_role from public.project_members m where m.project_id = new.project_id and m.user_id = actor;
    select p.name || ' (' ||
           upper(case when p.is_admin then 'admin' else coalesce(actor_role, 'member') end) || ')'
      into who from public.profiles p where p.id = actor;
    new.checked_by := who;
    new.checked_at := current_date;
  elsif not new.is_passed and old.is_passed then
    new.checked_by := null;
    new.checked_at := null;
  end if;
  return new;
end
$$;

-- Duyệt / bỏ duyệt một tiêu chuẩn chất lượng, có thể ghi nhận người thực hiện khác (chỉ admin).
create function public.set_quality_item(p_item uuid, p_passed boolean, p_notes text default null, p_actor uuid default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  pid uuid; actor uuid;
begin
  select project_id into pid from public.quality_items where id = p_item;
  if pid is null then
    raise exception 'Không tìm thấy tiêu chuẩn' using errcode = 'P0002';
  end if;
  if not public.can_approve_quality(pid) then
    raise exception 'Bạn không có quyền thẩm định tiêu chuẩn chất lượng' using errcode = '42501';
  end if;
  actor := public.resolve_actor(pid, p_actor);
  perform set_config('app.actor', coalesce(actor::text, ''), true);
  update public.quality_items
     set is_passed = p_passed, notes = coalesce(p_notes, notes)
   where id = p_item;
  perform set_config('app.actor', '', true);
end
$$;

-- ============================================================
-- 5. QUYỀN HÀM
-- ============================================================

revoke execute on function
  public.norm_name(text), public.suggest_accounts(uuid, text), public.add_project_member_by_id(uuid, uuid, text),
  public.create_placeholder_member(uuid, text, text), public.delete_placeholder(uuid),
  public.approve_account_merge(uuid), public.reject_account_merge(uuid), public.resolve_actor(uuid, uuid),
  public.set_use_case_stages(uuid[], text, boolean, uuid), public.set_quality_item(uuid, boolean, text, uuid)
  from public, anon;
grant execute on function
  public.norm_name(text), public.suggest_accounts(uuid, text), public.add_project_member_by_id(uuid, uuid, text),
  public.create_placeholder_member(uuid, text, text), public.delete_placeholder(uuid),
  public.approve_account_merge(uuid), public.reject_account_merge(uuid),
  public.set_use_case_stages(uuid[], text, boolean, uuid), public.set_quality_item(uuid, boolean, text, uuid)
  to authenticated;
revoke execute on function
  public.handle_user_deleted(), public.guard_placeholder_name(), public.trg_profile_match_placeholder(),
  public.resolve_actor(uuid, uuid)
  from public, anon, authenticated;
