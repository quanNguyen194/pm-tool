-- Hoàn tác migration 0020: bỏ các hàm tuần tự/đặt mức/báo cáo quyền; set_use_case_stages trở về bản ở 0013
-- (trả số nguyên, không tự tick bước trước, không cascade bỏ bước sau). Không mất dữ liệu: các bước đã tick giữ nguyên.
-- Giao diện bản mới chịu được cả hai kiểu trả về của set_use_case_stages nhưng cần set_use_case_level cho thao tác "đặt mức".

drop function if exists public.set_use_case_level(uuid[], integer, uuid);
drop function if exists public.member_access_report(uuid, uuid);
drop function if exists public.my_access_report(uuid);
drop function if exists public._project_counts(uuid);
drop function if exists public.set_use_case_stages(uuid[], text, boolean, uuid);
drop function if exists public._stage_batch(uuid[], text, text, boolean, integer, uuid);
drop function if exists public._apply_stage_target(uuid, text[], text[], uuid);
drop function if exists public.stage_index(text);

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

revoke execute on function public.set_use_case_stages(uuid[], text, boolean, uuid) from public, anon;
grant execute on function public.set_use_case_stages(uuid[], text, boolean, uuid) to authenticated;
