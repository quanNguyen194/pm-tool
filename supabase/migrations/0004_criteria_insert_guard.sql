-- Omni Project Manager - 0004: chặn lách quyền tick tiêu chí nghiệm thu khi INSERT.
-- Trigger guard_criteria_toggle (0001) chỉ chặn UPDATE; developer vẫn có thể tạo tiêu chí với completed = true.
-- Từ giờ chỉ admin/PM mới tạo được tiêu chí đã hoàn thành, người khác bị ép về false.

create function public.guard_criteria_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.completed
     and auth.uid() is not null
     and not public.can_manage_project(public.use_case_project(new.use_case_id)) then
    new.completed := false;
  end if;
  return new;
end
$$;

create trigger guard_criteria_insert before insert on public.acceptance_criteria
  for each row execute function public.guard_criteria_insert();

revoke execute on function public.guard_criteria_insert() from public, anon, authenticated;
