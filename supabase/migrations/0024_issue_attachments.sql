-- ============================================================
-- 0024 — Ảnh / video đính kèm cho issue (Supabase Storage)
--
-- * Kho tệp RIÊNG TƯ `issue-attachments` (không có link công khai). Xem tệp qua signed URL có hạn,
--   chỉ thành viên dự án mới lấy được (chính sách trên storage.objects).
-- * Đường dẫn tệp: <project_id>/<issue_id>/<attachment_id>.<đuôi>. Người dùng tải thẳng lên Storage
--   (chính sách insert kiểm quyền theo issue), rồi gọi add_issue_attachments để "đăng ký" tệp:
--   hàm kiểm lại loại tệp / dung lượng THẬT của đối tượng trong Storage, giới hạn số tệp và tổng dung lượng.
-- * Mỗi lần thêm / xóa tệp ghi một dòng nhật ký (kiểu Redmine) trong cùng giao dịch.
-- * Hoàn tác: supabase/rollback/0024_rollback.sql (phải chạy TRƯỚC rollback 0023).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Kho tệp riêng tư: ảnh (jpeg/png/gif/webp, KHÔNG svg) và video (mp4/webm/mov), tối đa 45 MB / tệp
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('issue-attachments', 'issue-attachments', false, 47185920,
        array['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ------------------------------------------------------------
-- 2. Bảng thông tin tệp
-- ------------------------------------------------------------
create table public.issue_attachments (
  id uuid primary key,
  project_id uuid not null references public.projects (id) on delete cascade,
  issue_id uuid not null references public.issues (id) on delete cascade,
  journal_id uuid references public.issue_journals (id) on delete set null,
  uploader_id uuid references public.profiles (id) on delete set null,
  file_name text not null check (char_length(file_name) between 1 and 200),
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  kind text not null check (kind in ('image', 'video')),
  storage_path text not null unique,
  created_at timestamptz not null default now()
);
create index issue_attachments_issue_idx on public.issue_attachments (issue_id, created_at);

alter table public.issue_attachments enable row level security;
create policy issue_attachments_select on public.issue_attachments for select to authenticated
  using (coalesce(public.can_view_project(project_id), false));
revoke all on public.issue_attachments from anon;
revoke insert, update, delete on public.issue_attachments from authenticated;
alter publication supabase_realtime add table public.issue_attachments;

-- ------------------------------------------------------------
-- 3. Hàm hỗ trợ
-- ------------------------------------------------------------
create function public._att_uuid(s text) returns uuid
language sql immutable set search_path = '' as $$
  select case when s ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then s::uuid end
$$;

-- Người dùng có được thêm tệp vào issue không: người có quyền cập nhật, hoặc người báo (có quyền ghi nhận)
-- khi issue còn ở trạng thái khởi tạo (giống quy tắc sửa nội dung issue của chính mình).
create function public.can_attach_issue(p_issue uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select coalesce(public.can_update_issue(i.project_id), false)
        or (i.reporter_id = auth.uid()
            and coalesce(public.can_create_issue(i.project_id), false)
            and exists (select 1 from public.issue_statuses s where s.id = i.status_id and s.is_initial))
      from public.issues i where i.id = p_issue
  ), false)
$$;

-- Tên đối tượng hợp lệ để tải lên: <project>/<issue>/<attachment>.<đuôi>, issue thuộc đúng dự án,
-- người tải có quyền thêm tệp, và thư mục issue chưa có quá nhiều đối tượng (chặn rác tải lên không đăng ký).
create function public._att_upload_ok(p_name text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare pid uuid; iid uuid;
begin
  if p_name !~* '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|jpeg|png|gif|webp|mp4|webm|mov)$' then return false; end if;
  pid := public._att_uuid(split_part(p_name, '/', 1));
  iid := public._att_uuid(split_part(p_name, '/', 2));
  if pid is null or iid is null or public._att_uuid(split_part(split_part(p_name, '/', 3), '.', 1)) is null then return false; end if;
  if not exists (select 1 from public.issues i where i.id = iid and i.project_id = pid) then return false; end if;
  if not coalesce(public.can_attach_issue(iid), false) then return false; end if;
  return (select count(*) from storage.objects o
           where o.bucket_id = 'issue-attachments' and o.name like pid::text || '/' || iid::text || '/%') < 40;
end
$$;

-- ------------------------------------------------------------
-- 4. Chính sách trên storage.objects (RLS của bảng này do Supabase bật sẵn)
-- ------------------------------------------------------------
create policy issue_att_select on storage.objects for select to authenticated
  using (bucket_id = 'issue-attachments'
         and coalesce(public.can_view_project(public._att_uuid(split_part(name, '/', 1))), false));

create policy issue_att_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'issue-attachments' and public._att_upload_ok(name));

-- Chỉ xóa được đối tượng KHÔNG còn bản ghi đăng ký (xóa tệp phải đi qua delete_issue_attachment trước),
-- và phải là người tải lên hoặc người có quyền xóa issue.
create policy issue_att_delete on storage.objects for delete to authenticated
  using (bucket_id = 'issue-attachments'
         and not exists (select 1 from public.issue_attachments a where a.storage_path = name)
         and (owner_id = auth.uid()::text
              or coalesce(public.can_delete_issue(public._att_uuid(split_part(name, '/', 1))), false)));

-- ------------------------------------------------------------
-- 5. Đăng ký tệp đã tải lên
-- p_items: [{id, name}] (id = uuid đã dùng làm tên đối tượng, name = tên tệp hiển thị)
-- p_journal: gắn vào dòng nhật ký vừa tạo bởi update_issue (của chính mình); null + p_log = tạo dòng nhật ký riêng.
-- ------------------------------------------------------------
create function public.add_issue_attachments(p_issue uuid, p_items jsonb, p_journal uuid default null, p_log boolean default true)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  i public.issues;
  it jsonb; aid uuid; fname text; obj record; ext text; kind text; mime text; sz bigint; path text;
  jid uuid := p_journal; n integer := 0; existing integer; used bigint; added bigint := 0; names text[] := '{}';
  actor_name text;
begin
  select * into i from public.issues where id = p_issue for update;
  if not found then raise exception 'Không tìm thấy issue' using errcode = 'P0002'; end if;
  if me is null or not coalesce(public.can_attach_issue(p_issue), false) then
    raise exception 'Bạn không có quyền đính kèm tệp cho issue này' using errcode = '42501';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Chưa có tệp nào để đính kèm' using errcode = '22023';
  end if;
  select count(*) into existing from public.issue_attachments where issue_id = p_issue;
  if existing + jsonb_array_length(p_items) > 10 then
    raise exception 'Mỗi issue đính kèm tối đa 10 tệp (hiện có %)', existing using errcode = '22023';
  end if;
  if p_journal is not null and not exists (
       select 1 from public.issue_journals j where j.id = p_journal and j.issue_id = p_issue and j.user_id = me and j.deleted_at is null) then
    raise exception 'Dòng nhật ký không hợp lệ' using errcode = '22023';
  end if;
  select coalesce(sum(size_bytes), 0) into used from public.issue_attachments;

  for it in select * from jsonb_array_elements(p_items) loop
    aid := public._att_uuid(it ->> 'id');
    if aid is null then raise exception 'Mã tệp không hợp lệ' using errcode = '22023'; end if;
    fname := left(btrim(regexp_replace(coalesce(it ->> 'name', ''), '[\\/[:cntrl:]]', '_', 'g')), 200);
    if fname = '' then raise exception 'Tên tệp không được trống' using errcode = '22023'; end if;

    select o.name, o.owner_id, o.metadata into obj from storage.objects o
     where o.bucket_id = 'issue-attachments' and o.name like i.project_id::text || '/' || p_issue::text || '/' || aid::text || '.%';
    if not found then raise exception 'Tệp "%" chưa được tải lên', fname using errcode = '22023'; end if;
    if obj.owner_id is distinct from me::text then
      raise exception 'Tệp "%" không phải do bạn tải lên', fname using errcode = '42501';
    end if;
    path := obj.name;
    mime := obj.metadata ->> 'mimetype';
    sz := coalesce((obj.metadata ->> 'size')::bigint, 0);
    ext := lower(substring(path from '\.([a-z0-9]+)$'));
    kind := case when mime in ('image/jpeg', 'image/png', 'image/gif', 'image/webp') then 'image'
                 when mime in ('video/mp4', 'video/webm', 'video/quicktime') then 'video' end;
    if kind is null then raise exception 'Loại tệp "%" không được hỗ trợ (chỉ ảnh jpeg/png/gif/webp và video mp4/webm/mov)', fname using errcode = '22023'; end if;
    if not ((mime = 'image/jpeg' and ext in ('jpg', 'jpeg')) or (mime = 'image/png' and ext = 'png') or (mime = 'image/gif' and ext = 'gif')
         or (mime = 'image/webp' and ext = 'webp') or (mime = 'video/mp4' and ext = 'mp4') or (mime = 'video/webm' and ext = 'webm')
         or (mime = 'video/quicktime' and ext = 'mov')) then
      raise exception 'Đuôi tệp "%" không khớp loại nội dung', fname using errcode = '22023';
    end if;
    if sz <= 0 then raise exception 'Tệp "%" rỗng', fname using errcode = '22023'; end if;
    if kind = 'image' and sz > 5242880 then raise exception 'Ảnh "%" vượt quá 5 MB', fname using errcode = '22023'; end if;
    if kind = 'video' and sz > 47185920 then raise exception 'Video "%" vượt quá 45 MB', fname using errcode = '22023'; end if;
    if used + added + sz > 943718400 then
      raise exception 'Kho tệp gần đầy (giới hạn mềm 900 MB trên gói miễn phí). Hãy xóa bớt tệp cũ.' using errcode = '22023';
    end if;
    if exists (select 1 from public.issue_attachments a where a.id = aid or a.storage_path = path) then
      raise exception 'Tệp "%" đã được đăng ký', fname using errcode = '22023';
    end if;
    added := added + sz;
    names := array_append(names, fname);
    n := n + 1;

    if jid is null and p_log then
      insert into public.issue_journals (issue_id, user_id, notes) values (p_issue, me, '') returning id into jid;
    end if;
    insert into public.issue_attachments (id, project_id, issue_id, journal_id, uploader_id, file_name, mime_type, size_bytes, kind, storage_path)
    values (aid, i.project_id, p_issue, jid, me, fname, mime, sz, kind, path);
    if jid is not null then
      insert into public.issue_journal_details (journal_id, field, old_value, new_value) values (jid, 'attachment', null, fname);
    end if;
  end loop;

  update public.issues set updated_at = now() where id = p_issue;

  if p_journal is null and p_log then
    select name into actor_name from public.profiles where id = me;
    perform public._issue_notify(i, array[i.assignee_id, i.reporter_id],
      'Issue #' || i.number || ': đính kèm ' || n || ' tệp',
      coalesce(actor_name, 'Ai đó') || ' — ' || i.title);
  end if;
  return jsonb_build_object('journalId', jid, 'count', n);
end
$$;

-- ------------------------------------------------------------
-- 6. Xóa tệp: người tải lên (còn quyền cập nhật) hoặc người có quyền xóa issue.
-- Trả về đường dẫn để phía ứng dụng xóa đối tượng khỏi Storage (SQL không xóa được tệp thật).
-- ------------------------------------------------------------
create function public.delete_issue_attachment(p_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); a public.issue_attachments; jid uuid;
begin
  select * into a from public.issue_attachments where id = p_id;
  if not found then raise exception 'Không tìm thấy tệp đính kèm' using errcode = 'P0002'; end if;
  if me is null or not (
       coalesce(public.can_delete_issue(a.project_id), false)
       or (a.uploader_id = me and coalesce(public.can_update_issue(a.project_id), false))
       or (a.uploader_id = me and public.can_attach_issue(a.issue_id))) then
    raise exception 'Bạn không có quyền xóa tệp này' using errcode = '42501';
  end if;
  delete from public.issue_attachments where id = p_id;
  insert into public.issue_journals (issue_id, user_id, notes) values (a.issue_id, me, '') returning id into jid;
  insert into public.issue_journal_details (journal_id, field, old_value, new_value) values (jid, 'attachment', a.file_name, null);
  update public.issues set updated_at = now() where id = a.issue_id;
  return a.storage_path;
end
$$;

-- ------------------------------------------------------------
-- 7. Dung lượng đã dùng (admin thấy cả hệ thống)
-- ------------------------------------------------------------
create function public.issue_attachment_usage(p_project uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not coalesce(public.can_view_project(p_project), false) then
    raise exception 'Bạn không có quyền xem dự án này' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'projectBytes', (select coalesce(sum(size_bytes), 0) from public.issue_attachments where project_id = p_project),
    'projectCount', (select count(*) from public.issue_attachments where project_id = p_project),
    'totalBytes', case when coalesce(public.is_admin(), false) then (select coalesce(sum(size_bytes), 0) from public.issue_attachments) end,
    'capBytes', 943718400);
end
$$;

-- ------------------------------------------------------------
-- 8. Quyền gọi hàm
-- ------------------------------------------------------------
revoke all on function public._att_uuid(text), public._att_upload_ok(text), public.can_attach_issue(uuid),
  public.add_issue_attachments(uuid, jsonb, uuid, boolean), public.delete_issue_attachment(uuid),
  public.issue_attachment_usage(uuid) from public, anon;
grant execute on function public._att_uuid(text), public._att_upload_ok(text), public.can_attach_issue(uuid),
  public.add_issue_attachments(uuid, jsonb, uuid, boolean), public.delete_issue_attachment(uuid),
  public.issue_attachment_usage(uuid) to authenticated;
