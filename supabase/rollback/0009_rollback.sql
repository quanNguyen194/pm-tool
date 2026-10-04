-- Hoàn tác migration 0009 (thuộc tính mở rộng của use case).
-- Nếu đã nhập danh sách use case bằng supabase/imports/qtvt_usecases_import.sql thì chạy
-- supabase/imports/qtvt_usecases_rollback.sql TRƯỚC (xóa các use case đã nhập), rồi mới chạy file này.
-- Cột bị xóa: kind, tags, complexity, transactions, necessity (mất dữ liệu trong các cột này).

drop index if exists public.use_cases_tags_idx;
alter table public.use_cases
  drop column if exists kind,
  drop column if exists tags,
  drop column if exists complexity,
  drop column if exists transactions,
  drop column if exists necessity;
