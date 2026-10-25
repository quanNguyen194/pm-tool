-- ============================================================
-- 0027 — Dự án Công khai / Riêng tư
--
-- * projects.visibility: 'private' (mặc định: chỉ thành viên) hoặc 'public' (ai biết địa chỉ cũng xem được, chỉ đọc, với tư cách Khách).
-- * get_public_project(mã dự án): hàm DUY NHẤT dành cho người chưa đăng nhập. Chỉ trả dữ liệu khi dự án đang Công khai, và chỉ một
--   bản đã lọc: không có ngân sách, không có email, không có tệp đính kèm, không có thông báo, cấu hình hay báo cáo định kỳ.
--   Người ẩn danh không đọc trực tiếp được bảng nào.
-- * set_project_visibility: đổi Công khai / Riêng tư; chỉ người có quyền "Quản lý dự án" (PM, Admin) mới đổi được.
-- Hoàn tác: supabase/rollback/0027_rollback.sql
-- ============================================================

alter table public.projects add column visibility text not null default 'private' check (visibility in ('private', 'public'));

create function public.set_project_visibility(p_project uuid, p_visibility text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_visibility is null or p_visibility not in ('private', 'public') then
    raise exception 'Chế độ truy cập không hợp lệ' using errcode = '22023';
  end if;
  if auth.uid() is null or not coalesce(public.can_manage_project(p_project), false) then
    raise exception 'Bạn không có quyền đổi chế độ truy cập của dự án này' using errcode = '42501';
  end if;
  update public.projects set visibility = p_visibility where id = p_project;
  if not found then raise exception 'Không tìm thấy dự án' using errcode = 'P0002'; end if;
end
$$;

-- Dữ liệu công khai của một dự án (dạng các dòng bảng, để giao diện dùng lại đúng các hàm chuyển đổi của chế độ thường).
create function public.get_public_project(p_code text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  p public.projects;
  c text := lower(btrim(coalesce(p_code, '')));
begin
  if c = '' then return null; end if;
  select * into p from public.projects where lower(code) = c limit 1;
  if p.id is null then
    select pr.* into p from public.project_code_aliases a join public.projects pr on pr.id = a.project_id where a.alias = c limit 1;
  end if;
  if p.id is null and c ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select * into p from public.projects where id = c::uuid;
  end if;
  if p.id is null or p.visibility <> 'public' then return null; end if;

  return jsonb_build_object(
    'code', p.code,
    'project', to_jsonb(p) - 'budget' - 'created_by',
    'members', coalesce((select jsonb_agg(to_jsonb(m)) from public.project_members m where m.project_id = p.id), '[]'::jsonb),
    'profiles', coalesce((
      select jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name, 'email', '', 'department', f.department,
                                          'avatar_color', f.avatar_color, 'is_admin', false, 'is_placeholder', f.is_placeholder))
        from public.profiles f
       where f.id in (
         select user_id from public.project_members where project_id = p.id
         union select p.manager_id
         union select assignee_id from public.tasks where project_id = p.id
         union select tc.user_id from public.task_collaborators tc join public.tasks t on t.id = tc.task_id where t.project_id = p.id
         union select reporter_id from public.issues where project_id = p.id
         union select assignee_id from public.issues where project_id = p.id
         union select j.user_id from public.issue_journals j join public.issues i on i.id = j.issue_id where i.project_id = p.id
         union select s.done_by from public.use_case_stages s join public.use_cases u on u.id = s.use_case_id where u.project_id = p.id
       )), '[]'::jsonb),
    'tasks', coalesce((select jsonb_agg(to_jsonb(t)) from public.tasks t where t.project_id = p.id), '[]'::jsonb),
    'task_collaborators', coalesce((select jsonb_agg(to_jsonb(tc)) from public.task_collaborators tc join public.tasks t on t.id = tc.task_id where t.project_id = p.id), '[]'::jsonb),
    'task_use_cases', coalesce((select jsonb_agg(to_jsonb(tu)) from public.task_use_cases tu join public.tasks t on t.id = tu.task_id where t.project_id = p.id), '[]'::jsonb),
    'use_cases', coalesce((select jsonb_agg(to_jsonb(u)) from public.use_cases u where u.project_id = p.id), '[]'::jsonb),
    'acceptance_criteria', coalesce((select jsonb_agg(to_jsonb(a)) from public.acceptance_criteria a join public.use_cases u on u.id = a.use_case_id where u.project_id = p.id), '[]'::jsonb),
    'use_case_stages', coalesce((select jsonb_agg(to_jsonb(s)) from public.use_case_stages s join public.use_cases u on u.id = s.use_case_id where u.project_id = p.id), '[]'::jsonb),
    'quality_phase_defs', coalesce((select jsonb_agg(to_jsonb(d)) from public.quality_phase_defs d), '[]'::jsonb),
    'quality_items', coalesce((select jsonb_agg(to_jsonb(q)) from public.quality_items q where q.project_id = p.id), '[]'::jsonb),
    'progress_snapshots', coalesce((select jsonb_agg(to_jsonb(s) order by s.snap_date) from public.progress_snapshots s where s.project_id = p.id), '[]'::jsonb),
    'issue_types', coalesce((select jsonb_agg(to_jsonb(x)) from public.issue_types x where x.project_id = p.id), '[]'::jsonb),
    'issue_statuses', coalesce((select jsonb_agg(to_jsonb(x)) from public.issue_statuses x where x.project_id = p.id), '[]'::jsonb),
    'issue_priorities', coalesce((select jsonb_agg(to_jsonb(x)) from public.issue_priorities x where x.project_id = p.id), '[]'::jsonb),
    'issues', coalesce((select jsonb_agg(to_jsonb(i)) from public.issues i where i.project_id = p.id), '[]'::jsonb),
    'issue_journals', coalesce((select jsonb_agg(to_jsonb(j) order by j.created_at, j.id) from public.issue_journals j join public.issues i on i.id = j.issue_id where i.project_id = p.id), '[]'::jsonb),
    'issue_journal_details', coalesce((select jsonb_agg(to_jsonb(d) order by d.id) from public.issue_journal_details d join public.issue_journals j on j.id = d.journal_id join public.issues i on i.id = j.issue_id where i.project_id = p.id), '[]'::jsonb)
  );
end
$$;

revoke execute on function public.set_project_visibility(uuid, text), public.get_public_project(text) from public, anon;
grant execute on function public.set_project_visibility(uuid, text) to authenticated;
grant execute on function public.get_public_project(text) to anon, authenticated;
