-- Hoàn tác migration 0024 (ảnh / video đính kèm issue). MẤT DỮ LIỆU: thông tin các tệp đính kèm.
-- Chạy file này TRƯỚC rollback 0023.
--
-- LƯU Ý: SQL không xóa được tệp thật trong Storage (Supabase chặn xóa trực tiếp bảng storage.*).
-- Sau khi chạy file này, vào Dashboard > Storage > bucket "issue-attachments": Empty bucket rồi Delete bucket
-- (hoặc để nguyên: tệp không còn ai truy cập được qua ứng dụng nhưng vẫn chiếm dung lượng).

drop policy if exists issue_att_select on storage.objects;
drop policy if exists issue_att_insert on storage.objects;
drop policy if exists issue_att_delete on storage.objects;

drop function if exists public.issue_attachment_usage(uuid);
drop function if exists public.delete_issue_attachment(uuid);
drop function if exists public.add_issue_attachments(uuid, jsonb, uuid, boolean);
drop function if exists public._att_upload_ok(text);
drop function if exists public.can_attach_issue(uuid);
drop function if exists public._att_uuid(text);

delete from public.issue_journal_details where field = 'attachment';
drop table if exists public.issue_attachments;

-- Bucket: chỉ gỡ khi đã rỗng (nếu còn tệp, Supabase sẽ từ chối; hãy xóa bằng Dashboard)
do $$
begin
  if not exists (select 1 from storage.objects where bucket_id = 'issue-attachments') then
    delete from storage.buckets where id = 'issue-attachments';
  end if;
exception when others then
  raise notice 'Hãy xóa bucket issue-attachments bằng Dashboard > Storage (%).', sqlerrm;
end
$$;
