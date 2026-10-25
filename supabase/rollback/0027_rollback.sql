-- Hoàn tác migration 0027 (dự án Công khai / Riêng tư). Mất: chế độ truy cập của từng dự án (mọi dự án về Riêng tư).
-- Người chưa đăng nhập không còn xem được dự án nào. Giao diện bản mới khi thiếu cột visibility vẫn đọc được dự án (coi như Riêng tư).

drop function if exists public.get_public_project(text);
drop function if exists public.set_project_visibility(uuid, text);
alter table public.projects drop column if exists visibility;
