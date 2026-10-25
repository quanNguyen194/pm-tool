-- ============================================================
-- 0028 — Quản lý tài khoản (màn hình "Tài khoản" của quản trị viên)
--
-- * account_audit_log: nhật ký tạo / sửa / đặt lại mật khẩu / xóa tài khoản (không ghi mật khẩu). Chỉ Edge Function admin-accounts
--   (khóa service_role) ghi; người dùng không đọc trực tiếp được, chỉ admin đọc qua admin_account_log.
-- * admin_list_accounts(): danh sách mọi tài khoản (tên, email, loại, số dự án, ngày tạo, đăng nhập gần nhất, đã xác nhận email); chỉ admin.
-- Việc tạo / đặt lại mật khẩu / xóa / đổi email chạy trong Edge Function supabase/functions/admin-accounts (xem docs/ACCOUNTS.md).
-- Hoàn tác: supabase/rollback/0028_rollback.sql
-- ============================================================

create table public.account_audit_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  actor_id uuid references public.profiles (id) on delete set null,
  actor_name text not null default '',
  action text not null check (action in ('create', 'reset_password', 'delete', 'update')),
  target_id uuid,
  target_label text not null default '',
  detail text
);
create index account_audit_log_at_idx on public.account_audit_log (at desc);
alter table public.account_audit_log enable row level security;
revoke all on public.account_audit_log from anon, authenticated;
revoke all on sequence public.account_audit_log_id_seq from anon, authenticated;

create function public.admin_list_accounts() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not coalesce(public.is_admin(), false) then
    raise exception 'Chỉ quản trị viên mới xem được danh sách tài khoản' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', p.id,
             'name', p.name,
             'email', p.email,
             'department', p.department,
             'isAdmin', p.is_admin,
             'isPlaceholder', p.is_placeholder,
             'createdAt', p.created_at,
             'lastSignInAt', u.last_sign_in_at,
             'emailConfirmed', u.email_confirmed_at is not null,
             'projectCount', (select count(*)::int from public.project_members m where m.user_id = p.id))
           order by p.is_placeholder, lower(p.name))
      from public.profiles p
      left join auth.users u on u.id = p.id), '[]'::jsonb);
end
$$;

create function public.admin_account_log(p_limit integer default 30) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not coalesce(public.is_admin(), false) then
    raise exception 'Chỉ quản trị viên mới xem được nhật ký tài khoản' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', l.id, 'at', l.at, 'actorName', l.actor_name, 'action', l.action,
                                        'targetLabel', l.target_label, 'detail', l.detail) order by l.at desc, l.id desc)
      from (select * from public.account_audit_log order by at desc, id desc limit greatest(1, least(coalesce(p_limit, 30), 200))) l), '[]'::jsonb);
end
$$;

revoke execute on function public.admin_list_accounts(), public.admin_account_log(integer) from public, anon;
grant execute on function public.admin_list_accounts(), public.admin_account_log(integer) to authenticated;
