-- Hoàn tác migration 0029 (ghép thủ công tài khoản). Các lần ghép đã làm KHÔNG được hoàn nguyên (dữ liệu đã chuyển sang tài khoản thật).
-- Cơ chế ghép tự động khi trùng tên (migration 0013) vẫn hoạt động.
drop function if exists public.admin_merge_accounts(uuid, uuid);
drop function if exists public.admin_merge_preview(uuid);
