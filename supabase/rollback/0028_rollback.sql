-- Hoàn tác migration 0028 (quản lý tài khoản). Mất: nhật ký thao tác tài khoản. Các tài khoản đã tạo/sửa/xóa KHÔNG bị ảnh hưởng.
-- Hàm Edge Function admin-accounts cần được gỡ riêng trong Dashboard (Edge Functions) nếu không dùng nữa.
drop function if exists public.admin_account_log(integer);
drop function if exists public.admin_list_accounts();
drop table if exists public.account_audit_log;
