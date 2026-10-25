# Quản lý tài khoản (màn hình "Tài khoản")

Chỉ **quản trị viên hệ thống** thấy tab **Tài Khoản** (`/accounts`). Gồm:
- **Danh sách:** tên, email, loại (Quản trị viên / Thành viên / Chưa đăng ký), số dự án tham gia, ngày tạo, đăng nhập gần nhất, email đã xác nhận hay chưa. Tìm theo tên hoặc email, lọc theo loại.
- **Tạo tài khoản:** họ tên, email, mật khẩu (có nút tạo ngẫu nhiên), tùy chọn quản trị viên. Dùng được ngay, không cần xác nhận email. Nếu họ tên trùng một người đã được thêm sẵn (chưa đăng ký) thì hệ thống tạo yêu cầu hợp nhất để admin duyệt (xem mục Đội ngũ).
- **Sửa:** họ tên, email đăng nhập (đổi xong dùng email mới ngay), bật/tắt quyền quản trị viên.
- **Đặt lại mật khẩu:** nhập mật khẩu mới hoặc tạo ngẫu nhiên. **Không có email nào được gửi.** Mật khẩu chỉ hiện đúng một lần (kèm nút sao chép) để chuyển cho người dùng. Các phiên đăng nhập đang mở của họ có thể còn hiệu lực đến khi hết hạn.
- **Xóa:** người đó mất quyền đăng nhập, rời mọi dự án, nhiệm vụ họ phụ trách thành "chưa giao"; dữ liệu họ đã nhập vẫn giữ. Tài khoản "Chưa đăng ký" cũng xóa ở đây.
- **Nhật ký thao tác:** ai tạo / sửa / đặt lại mật khẩu / xóa tài khoản nào, lúc nào (không ghi mật khẩu).

## Chốt chặn
- Mọi thao tác kiểm quyền admin **ở máy chủ** (Edge Function), ẩn nút ở giao diện không phải bảo vệ duy nhất.
- Không tự xóa chính mình; không tự đổi quyền quản trị của chính mình; không xóa hay bỏ quyền của quản trị viên cuối cùng.
- Email chuẩn hóa chữ thường và không được trùng; mật khẩu 8 đến 72 byte.
- Mật khẩu không được lưu hay ghi vào nhật ký ở bất kỳ đâu.

## Triển khai (làm một lần)
Việc tạo tài khoản, đặt lại mật khẩu, xóa và đổi email là thao tác **quản trị xác thực** của Supabase: cần khóa `service_role`, trình duyệt không được giữ. Supabase tự cấp khóa này cho Edge Function nên **không phải đưa khóa cho ai**.

1. Chạy `supabase/migrations/0028_account_admin.sql` trong SQL Editor (bảng nhật ký và hai hàm đọc).
2. Supabase Dashboard > **Edge Functions** > **Deploy a new function** > **Via Editor**.
3. Đặt tên **`admin-accounts`** (đúng như vậy), xóa mã mẫu, dán toàn bộ nội dung `supabase/functions/admin-accounts/index.ts`.
4. Tắt tùy chọn **Verify JWT** (hoặc "Enforce JWT verification") rồi bấm **Deploy**. Lý do: hàm tự xác thực người gọi bằng `auth.getUser` và chỉ nhận quản trị viên; kiểm tra JWT ở cổng của Supabase không tương thích với khóa API kiểu mới nên có thể trả "Invalid JWT" cho cả người hợp lệ.
5. Mở tab Tài Khoản trên web và thử "Tạo tài khoản". Nếu thấy "Chưa triển khai hàm admin-accounts" thì kiểm tra lại tên hàm.

Cập nhật mã hàm sau này: dán lại nội dung file rồi Deploy lại.

## Kỹ thuật
- `supabase/functions/admin-accounts/index.ts`: logic `handle()` thuần (không phụ thuộc Deno) + phần chạy trên Deno. Kiểm thử logic bằng dữ liệu giả: `npx -y node@22 --experimental-strip-types scripts/accounts.test.mjs`.
- `0028_account_admin.sql`: bảng `account_audit_log` (chỉ Edge Function ghi, bằng khóa service_role), `admin_list_accounts()` và `admin_account_log()` (chỉ admin đọc).
- Giao diện: `src/components/accounts/AccountsView.tsx`; gọi `supabase.functions.invoke('admin-accounts')`.
