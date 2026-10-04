-- Hoàn tác migration 0013 (tài khoản ảo, gợi ý, hợp nhất, người thực hiện).
-- Phải chạy TRƯỚC khi hoàn tác các migration cũ hơn (thứ tự ngược: 0013 -> 0012 -> ...).
--
-- MẤT DỮ LIỆU: mọi tài khoản ảo (chưa đăng ký) bị xóa. Việc này kéo theo: họ rời khỏi các dự án, nhiệm vụ họ phụ trách
-- thành "chưa giao", người phối hợp/người tick bước ghi nhận cho họ bị bỏ trống (đây là điều kiện để gắn lại
-- ràng buộc profiles -> auth.users như trước). Tài khoản thật không bị ảnh hưởng. Lịch sử yêu cầu hợp nhất bị xóa.

drop trigger if exists profile_match_placeholder on public.profiles;
drop trigger if exists guard_placeholder_name on public.profiles;
drop table if exists public.account_merge_requests;

delete from public.profiles where is_placeholder;

drop function if exists public.suggest_accounts(uuid, text);
drop function if exists public.add_project_member_by_id(uuid, uuid, text);
drop function if exists public.create_placeholder_member(uuid, text, text);
drop function if exists public.delete_placeholder(uuid);
drop function if exists public.approve_account_merge(uuid);
drop function if exists public.reject_account_merge(uuid);
drop function if exists public.set_quality_item(uuid, boolean, text, uuid);
drop function if exists public.set_use_case_stages(uuid[], text, boolean, uuid);
drop function if exists public.resolve_actor(uuid, uuid);
drop function if exists public.trg_profile_match_placeholder();
drop function if exists public.guard_placeholder_name();

-- set_use_case_stages: bản 3 tham số như 0011
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
    if model <> 'stages' or uc.kind = 'group' or uc.status = 'cancelled'
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
grant execute on function public.set_use_case_stages(uuid[], text, boolean) to authenticated;
revoke execute on function public.set_use_case_stages(uuid[], text, boolean) from public, anon;

-- Trigger duyệt chất lượng như 0001 (người duyệt luôn là người đang đăng nhập)
create or replace function public.trg_quality_checked() returns trigger
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

-- Gắn lại ràng buộc: xóa tài khoản đăng nhập thì xóa profile
drop trigger if exists on_auth_user_deleted on auth.users;
drop function if exists public.handle_user_deleted();
drop index if exists public.profiles_placeholder_name_idx;
alter table public.profiles add constraint profiles_id_fkey foreign key (id) references auth.users (id) on delete cascade;
alter table public.profiles drop column is_placeholder;
drop function if exists public.norm_name(text);
