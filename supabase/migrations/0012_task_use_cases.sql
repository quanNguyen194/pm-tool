-- Omni Project Manager - 0012: một nhiệm vụ liên kết được nhiều use case.
-- Chạy trong Supabase SQL Editor SAU 0011 và TRƯỚC khi deploy giao diện mới.
-- Bản giao diện cũ vẫn chạy bình thường: cột tasks.use_case_id được giữ lại, luôn đồng bộ với use case liên kết đầu tiên.
--
-- Bảng task_use_cases là nguồn dữ liệu chính của liên kết; use case bị xóa thì liên kết tự mất, nhiệm vụ giữ nguyên.

create table public.task_use_cases (
  task_id uuid not null references public.tasks (id) on delete cascade,
  use_case_id uuid not null references public.use_cases (id) on delete cascade,
  primary key (task_id, use_case_id)
);
create index task_use_cases_uc_idx on public.task_use_cases (use_case_id);

-- Nhiệm vụ chỉ được liên kết use case của CÙNG dự án.
create function public.trg_task_use_case_project() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if public.task_project(new.task_id) is distinct from public.use_case_project(new.use_case_id) then
    raise exception 'Use case phải thuộc cùng dự án với nhiệm vụ' using errcode = '22023';
  end if;
  return new;
end
$$;
create trigger task_use_case_project before insert on public.task_use_cases
  for each row execute function public.trg_task_use_case_project();

alter table public.task_use_cases enable row level security;
create policy tuc_select on public.task_use_cases for select to authenticated
  using (public.can_view_project(public.task_project(task_id)));
create policy tuc_insert on public.task_use_cases for insert to authenticated
  with check (public.can_write_tasks(public.task_project(task_id)));
create policy tuc_delete on public.task_use_cases for delete to authenticated
  using (public.can_write_tasks(public.task_project(task_id)));
revoke all on public.task_use_cases from anon;
revoke update on public.task_use_cases from authenticated;

-- Dữ liệu cũ: mỗi nhiệm vụ đang gắn một use case thì tạo liên kết tương ứng.
insert into public.task_use_cases (task_id, use_case_id)
select t.id, t.use_case_id from public.tasks t
 where t.use_case_id is not null
on conflict do nothing;

-- Bản giao diện cũ chỉ ghi tasks.use_case_id: tự tạo liên kết trong bảng mới để hai bên luôn khớp.
create function public.trg_task_use_case_mirror() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.use_case_id is not null then
    insert into public.task_use_cases (task_id, use_case_id) values (new.id, new.use_case_id)
    on conflict do nothing;
  end if;
  return null;
end
$$;
create trigger task_use_case_mirror after insert or update of use_case_id on public.tasks
  for each row execute function public.trg_task_use_case_mirror();

revoke execute on function public.trg_task_use_case_project(), public.trg_task_use_case_mirror()
  from public, anon, authenticated;

alter publication supabase_realtime add table public.task_use_cases;
