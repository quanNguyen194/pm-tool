-- Hoàn tác migration 0025 (độ ưu tiên issue cấu hình được). Chạy TRƯỚC rollback 0024/0023.
-- MẤT DỮ LIỆU CẤU HÌNH: các mức độ ưu tiên tự thêm/đổi tên bị gộp về 4 mức cố định. Issue được chuyển theo tên mức
-- (Khẩn cấp -> urgent, Cao -> high, Thấp -> low); mọi mức khác (kể cả "Vừa" và tên tự đặt) -> medium.

alter table public.issues add column priority text not null default 'medium'
  check (priority in ('low', 'medium', 'high', 'urgent'));
update public.issues i set priority = case (select p.name from public.issue_priorities p where p.id = i.priority_id)
  when 'Khẩn cấp' then 'urgent' when 'Cao' then 'high' when 'Thấp' then 'low' else 'medium' end;
update public.issue_journal_details set old_value = 'Trung bình' where field = 'priority' and old_value = 'Vừa';
update public.issue_journal_details set new_value = 'Trung bình' where field = 'priority' and new_value = 'Vừa';

drop function if exists public.save_issue_priorities(uuid, jsonb, uuid[]);
drop function if exists public.create_issue(uuid, uuid, text, text, uuid, text, text, uuid, date, uuid, uuid);

alter table public.issues drop column priority_id;

create or replace function public._issue_value_label(p_field text, p_value text) returns text
language plpgsql stable security definer set search_path = '' as $$
declare out text;
begin
  if p_value is null or p_value = '' then return null; end if;
  case p_field
    when 'status' then select name into out from public.issue_statuses where id = p_value::uuid;
    when 'type' then select name into out from public.issue_types where id = p_value::uuid;
    when 'assignee' then select name into out from public.profiles where id = p_value::uuid;
    when 'use_case' then select code || ' ' || title into out from public.use_cases where id = p_value::uuid;
    when 'task' then select code || ' ' || title into out from public.tasks where id = p_value::uuid;
    when 'priority' then out := case p_value when 'low' then 'Thấp' when 'medium' then 'Trung bình' when 'high' then 'Cao' when 'urgent' then 'Khẩn cấp' else p_value end;
    when 'severity' then out := case p_value when 'minor' then 'Nhẹ' when 'major' then 'Nghiêm trọng' when 'critical' then 'Rất nghiêm trọng' when 'blocker' then 'Chặn tiến độ' else p_value end;
    else out := p_value;
  end case;
  return coalesce(out, p_value);
end
$$;


create function public.create_issue(
  p_project uuid, p_type uuid, p_title text, p_description text default '', p_priority text default 'medium',
  p_severity text default null, p_environment text default '', p_assignee uuid default null, p_due date default null,
  p_use_case uuid default null, p_task uuid default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid(); v_status uuid; v_num integer; v_id uuid; v_issue public.issues; v_name text;
begin
  if me is null or not coalesce(public.can_create_issue(p_project), false) then
    raise exception 'Bạn không có quyền ghi nhận lỗi/yêu cầu cho dự án này' using errcode = '42501';
  end if;
  if btrim(coalesce(p_title, '')) = '' then raise exception 'Tiêu đề không được trống' using errcode = '22023'; end if;
  if not exists (select 1 from public.issue_types t where t.id = p_type and t.project_id = p_project and t.is_active) then
    raise exception 'Loại issue không hợp lệ hoặc đã bị ẩn' using errcode = '22023';
  end if;
  select id into v_status from public.issue_statuses where project_id = p_project and is_initial and is_active;
  if v_status is null then raise exception 'Dự án chưa có trạng thái khởi tạo' using errcode = '22023'; end if;
  if p_assignee is not null then
    if not coalesce(public.can_assign_issue(p_project), false) then
      raise exception 'Bạn không có quyền phân công người xử lý' using errcode = '42501';
    end if;
    if not exists (select 1 from public.project_members m where m.project_id = p_project and m.user_id = p_assignee) then
      raise exception 'Người xử lý phải là thành viên của dự án' using errcode = '22023';
    end if;
  end if;
  if p_use_case is not null and not exists (select 1 from public.use_cases u where u.id = p_use_case and u.project_id = p_project) then
    raise exception 'Use case không thuộc dự án' using errcode = '22023';
  end if;
  if p_task is not null and not exists (select 1 from public.tasks t where t.id = p_task and t.project_id = p_project) then
    raise exception 'Nhiệm vụ không thuộc dự án' using errcode = '22023';
  end if;

  insert into public.issue_counters (project_id, last_number) values (p_project, 1)
  on conflict (project_id) do update set last_number = public.issue_counters.last_number + 1
  returning last_number into v_num;

  insert into public.issues (project_id, number, type_id, status_id, title, description, priority, severity, environment,
                             reporter_id, assignee_id, due_date, use_case_id, task_id)
  values (p_project, v_num, p_type, v_status, btrim(p_title), coalesce(p_description, ''), coalesce(p_priority, 'medium'),
          nullif(p_severity, ''), coalesce(p_environment, ''), me, p_assignee, p_due, p_use_case, p_task)
  returning * into v_issue;

  if p_assignee is not null then
    select name into v_name from public.profiles where id = me;
    perform public._issue_notify(v_issue, array[p_assignee], 'Issue #' || v_num || ': bạn được giao xử lý',
      coalesce(v_name, 'Ai đó') || ' giao cho bạn: ' || v_issue.title);
  end if;
  return jsonb_build_object('id', v_issue.id, 'number', v_num);
end
$$;


create or replace function public.update_issue(p_issue uuid, p_changes jsonb default '{}'::jsonb, p_notes text default '', p_parent uuid default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  i public.issues;
  n public.issues;
  ch jsonb := coalesce(p_changes, '{}'::jsonb);
  notes text := btrim(coalesce(p_notes, ''));
  can_upd boolean; can_edit boolean; can_asg boolean; own boolean;
  k text; v jsonb; txt text;
  d_field text[] := '{}'; d_old text[] := '{}'; d_new text[] := '{}';
  jid uuid; idx integer; actor_name text; summary text; cat_new text; cat_old text;
  status_changed boolean := false; assignee_changed boolean := false;
begin
  select * into i from public.issues where id = p_issue for update;
  if not found then raise exception 'Không tìm thấy issue' using errcode = 'P0002'; end if;
  if me is null or not coalesce(public.can_view_project(i.project_id), false) then
    raise exception 'Bạn không có quyền với issue này' using errcode = '42501';
  end if;
  can_upd := coalesce(public.can_update_issue(i.project_id), false);
  can_edit := coalesce(public.can_edit_issue(i.project_id), false);
  can_asg := coalesce(public.can_assign_issue(i.project_id), false);
  own := i.reporter_id = me and exists (select 1 from public.issue_statuses s where s.id = i.status_id and s.is_initial);

  if p_parent is not null and ch <> '{}'::jsonb then
    raise exception 'Trả lời một bình luận chỉ được ghi chú, không đổi trường' using errcode = '22023';
  end if;
  if (notes <> '' or p_parent is not null) and not can_upd then
    raise exception 'Bạn không có quyền cập nhật/bình luận issue' using errcode = '42501';
  end if;
  if p_parent is not null and not exists (select 1 from public.issue_journals j where j.id = p_parent and j.issue_id = p_issue and j.deleted_at is null) then
    raise exception 'Không tìm thấy bình luận để trả lời' using errcode = '22023';
  end if;
  if p_parent is not null and notes = '' then
    raise exception 'Nội dung trả lời không được trống' using errcode = '22023';
  end if;
  if char_length(notes) > 20000 then raise exception 'Ghi chú quá dài' using errcode = '22023'; end if;

  n := i;
  for k, v in select key, value from jsonb_each(ch) loop
    if k not in ('status_id', 'assignee_id', 'type_id', 'priority', 'severity', 'title', 'description', 'environment', 'due_date', 'use_case_id', 'task_id') then
      raise exception 'Trường không được phép đổi: %', k using errcode = '22023';
    end if;
    if k = 'status_id' then
      if not can_upd then raise exception 'Bạn không có quyền đổi trạng thái' using errcode = '42501'; end if;
      if jsonb_typeof(v) = 'null' or not exists (select 1 from public.issue_statuses s where s.id = (v #>> '{}')::uuid and s.project_id = i.project_id and (s.is_active or s.id = i.status_id)) then
        raise exception 'Trạng thái không hợp lệ' using errcode = '22023';
      end if;
      n.status_id := (v #>> '{}')::uuid;
    elsif k = 'assignee_id' then
      if not can_asg then raise exception 'Bạn không có quyền phân công người xử lý' using errcode = '42501'; end if;
      if jsonb_typeof(v) = 'null' then n.assignee_id := null;
      else
        if not exists (select 1 from public.project_members m where m.project_id = i.project_id and m.user_id = (v #>> '{}')::uuid) then
          raise exception 'Người xử lý phải là thành viên của dự án' using errcode = '22023';
        end if;
        n.assignee_id := (v #>> '{}')::uuid;
      end if;
    else
      if not (can_edit or own) then raise exception 'Bạn không có quyền sửa nội dung issue' using errcode = '42501'; end if;
      if k = 'type_id' then
        if jsonb_typeof(v) = 'null' or not exists (select 1 from public.issue_types t where t.id = (v #>> '{}')::uuid and t.project_id = i.project_id and (t.is_active or t.id = i.type_id)) then
          raise exception 'Loại issue không hợp lệ' using errcode = '22023';
        end if;
        n.type_id := (v #>> '{}')::uuid;
      elsif k = 'priority' then
        if jsonb_typeof(v) = 'null' or (v #>> '{}') not in ('low', 'medium', 'high', 'urgent') then raise exception 'Độ ưu tiên không hợp lệ' using errcode = '22023'; end if;
        n.priority := v #>> '{}';
      elsif k = 'severity' then
        if jsonb_typeof(v) = 'null' or (v #>> '{}') = '' then n.severity := null;
        elsif (v #>> '{}') not in ('minor', 'major', 'critical', 'blocker') then raise exception 'Mức nghiêm trọng không hợp lệ' using errcode = '22023';
        else n.severity := v #>> '{}'; end if;
      elsif k = 'title' then
        txt := btrim(coalesce(v #>> '{}', ''));
        if txt = '' or char_length(txt) > 200 then raise exception 'Tiêu đề phải từ 1 đến 200 ký tự' using errcode = '22023'; end if;
        n.title := txt;
      elsif k = 'description' then
        txt := coalesce(v #>> '{}', '');
        if char_length(txt) > 20000 then raise exception 'Mô tả quá dài' using errcode = '22023'; end if;
        n.description := txt;
      elsif k = 'environment' then
        txt := coalesce(v #>> '{}', '');
        if char_length(txt) > 200 then raise exception 'Môi trường tối đa 200 ký tự' using errcode = '22023'; end if;
        n.environment := txt;
      elsif k = 'due_date' then
        n.due_date := case when jsonb_typeof(v) = 'null' or (v #>> '{}') = '' then null else (v #>> '{}')::date end;
      elsif k = 'use_case_id' then
        if jsonb_typeof(v) = 'null' then n.use_case_id := null;
        else
          if not exists (select 1 from public.use_cases u where u.id = (v #>> '{}')::uuid and u.project_id = i.project_id) then
            raise exception 'Use case không thuộc dự án' using errcode = '22023';
          end if;
          n.use_case_id := (v #>> '{}')::uuid;
        end if;
      elsif k = 'task_id' then
        if jsonb_typeof(v) = 'null' then n.task_id := null;
        else
          if not exists (select 1 from public.tasks t where t.id = (v #>> '{}')::uuid and t.project_id = i.project_id) then
            raise exception 'Nhiệm vụ không thuộc dự án' using errcode = '22023';
          end if;
          n.task_id := (v #>> '{}')::uuid;
        end if;
      end if;
    end if;
  end loop;

  -- Ghi lại các trường thật sự thay đổi (giá trị cũ -> mới dạng chữ dễ đọc)
  if n.status_id is distinct from i.status_id then
    d_field := array_append(d_field, 'status'); d_old := d_old || coalesce(public._issue_value_label('status', i.status_id::text), '—'); d_new := d_new || coalesce(public._issue_value_label('status', n.status_id::text), '—'); status_changed := true;
  end if;
  if n.assignee_id is distinct from i.assignee_id then
    d_field := array_append(d_field, 'assignee'); d_old := d_old || coalesce(public._issue_value_label('assignee', i.assignee_id::text), '—'); d_new := d_new || coalesce(public._issue_value_label('assignee', n.assignee_id::text), '—'); assignee_changed := true;
  end if;
  if n.type_id is distinct from i.type_id then
    d_field := array_append(d_field, 'type'); d_old := d_old || coalesce(public._issue_value_label('type', i.type_id::text), '—'); d_new := d_new || coalesce(public._issue_value_label('type', n.type_id::text), '—');
  end if;
  if n.priority is distinct from i.priority then
    d_field := array_append(d_field, 'priority'); d_old := d_old || public._issue_value_label('priority', i.priority); d_new := d_new || public._issue_value_label('priority', n.priority);
  end if;
  if n.severity is distinct from i.severity then
    d_field := array_append(d_field, 'severity'); d_old := d_old || coalesce(public._issue_value_label('severity', i.severity), '—'); d_new := d_new || coalesce(public._issue_value_label('severity', n.severity), '—');
  end if;
  if n.title is distinct from i.title then d_field := array_append(d_field, 'title'); d_old := d_old || i.title; d_new := d_new || n.title; end if;
  if n.description is distinct from i.description then d_field := array_append(d_field, 'description'); d_old := d_old || i.description; d_new := d_new || n.description; end if;
  if n.environment is distinct from i.environment then d_field := array_append(d_field, 'environment'); d_old := d_old || coalesce(nullif(i.environment, ''), '—'); d_new := d_new || coalesce(nullif(n.environment, ''), '—'); end if;
  if n.due_date is distinct from i.due_date then d_field := array_append(d_field, 'due_date'); d_old := d_old || coalesce(to_char(i.due_date, 'YYYY-MM-DD'), '—'); d_new := d_new || coalesce(to_char(n.due_date, 'YYYY-MM-DD'), '—'); end if;
  if n.use_case_id is distinct from i.use_case_id then
    d_field := array_append(d_field, 'use_case'); d_old := d_old || coalesce(public._issue_value_label('use_case', i.use_case_id::text), '—'); d_new := d_new || coalesce(public._issue_value_label('use_case', n.use_case_id::text), '—');
  end if;
  if n.task_id is distinct from i.task_id then
    d_field := array_append(d_field, 'task'); d_old := d_old || coalesce(public._issue_value_label('task', i.task_id::text), '—'); d_new := d_new || coalesce(public._issue_value_label('task', n.task_id::text), '—');
  end if;

  if cardinality(d_field) = 0 and notes = '' then
    raise exception 'Không có thay đổi nào để lưu' using errcode = '22023';
  end if;

  if cardinality(d_field) > 0 then
    select category into cat_old from public.issue_statuses where id = i.status_id;
    select category into cat_new from public.issue_statuses where id = n.status_id;
    update public.issues set
      type_id = n.type_id, status_id = n.status_id, title = n.title, description = n.description, priority = n.priority,
      severity = n.severity, environment = n.environment, assignee_id = n.assignee_id, due_date = n.due_date,
      use_case_id = n.use_case_id, task_id = n.task_id, updated_at = now(),
      closed_at = case when cat_new = 'closed' and cat_old is distinct from 'closed' then now()
                       when cat_new is distinct from 'closed' then null else i.closed_at end
     where id = p_issue;
  else
    update public.issues set updated_at = now() where id = p_issue;
  end if;

  insert into public.issue_journals (issue_id, parent_id, user_id, notes) values (p_issue, p_parent, me, notes) returning id into jid;
  for idx in 1 .. cardinality(d_field) loop
    insert into public.issue_journal_details (journal_id, field, old_value, new_value) values (jid, d_field[idx], d_old[idx], d_new[idx]);
  end loop;

  -- Thông báo cho người xử lý và người báo (không báo cho chính người thao tác)
  select name into actor_name from public.profiles where id = me;
  summary := case
    when status_changed then 'trạng thái → ' || d_new[array_position(d_field, 'status')]
    when assignee_changed then 'giao cho ' || d_new[array_position(d_field, 'assignee')]
    when cardinality(d_field) > 0 then 'cập nhật thông tin'
    else 'bình luận mới' end;
  perform public._issue_notify(n, array[n.assignee_id, n.reporter_id, case when assignee_changed then i.assignee_id end],
    'Issue #' || n.number || ': ' || summary,
    coalesce(actor_name, 'Ai đó') || ' — ' || n.title || case when notes <> '' then E'\n"' || left(notes, 200) || '"' else '' end);

  return jsonb_build_object('journalId', jid, 'changed', cardinality(d_field));
end
$$;


create or replace function public.trg_project_issue_config() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.seed_issue_config(new.id);
  return null;
end
$$;

drop function if exists public.seed_issue_priorities(uuid);
drop table if exists public.issue_priorities;

revoke execute on function public.create_issue(uuid, uuid, text, text, text, text, text, uuid, date, uuid, uuid), public.update_issue(uuid, jsonb, text, uuid),
  public._issue_value_label(text, text), public.trg_project_issue_config() from public, anon;
revoke execute on function public._issue_value_label(text, text), public.trg_project_issue_config() from authenticated;
grant execute on function public.create_issue(uuid, uuid, text, text, text, text, text, uuid, date, uuid, uuid), public.update_issue(uuid, jsonb, text, uuid) to authenticated;
