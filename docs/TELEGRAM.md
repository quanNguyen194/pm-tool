# Nhắc nhở qua Telegram

Hệ thống gửi nhắc nhở về Telegram của từng người qua **một bot dùng chung**. Không cần server riêng: database gọi thẳng
`api.telegram.org` (qua `pg_net`), token bot nằm trong **Supabase Vault**.

## Khi nào có tin Telegram

- Bấm **Gửi nhắc nhở** ở một nhiệm vụ → gửi tới người phụ trách (PM nếu chưa giao).
- Quét deadline tự động 8:00 sáng giờ Việt Nam (và nút **Quét deadline ngay** của admin) → mỗi người nhận **một tin tóm
  tắt** liệt kê việc quá hạn / sắp đến hạn của mình (mỗi việc chỉ báo một lần mỗi loại, giống chuông trong web).
- Các thông báo khác của hệ thống (ví dụ yêu cầu hợp nhất tài khoản gửi admin) cũng được chuyển sang Telegram.

Người nào chưa liên kết (hoặc đã tắt nhận) thì chỉ nhận thông báo trong web như trước.

## Thiết lập một lần (quản trị viên)

1. Trên Telegram mở **@BotFather** → `/newbot` → đặt tên và username (kết thúc bằng `bot`). BotFather trả về **token**
   dạng `123456789:AAH...`. **Giữ bí mật token này**, đừng dán vào chat hay commit vào git.
2. Chạy migration `supabase/migrations/0014_telegram_notify.sql` trong Supabase SQL Editor.
3. Lưu token vào Vault (SQL Editor, thay giá trị thật):

   ```sql
   select vault.create_secret('<TOKEN_TỪ_BOTFATHER>', 'telegram_bot_token');
   select vault.create_secret('<username_bot_không_có_@>', 'telegram_bot_username');  -- tùy chọn: để giao diện hiện link mở bot
   ```

   Đổi token về sau: `select vault.update_secret(id, '<token mới>') from vault.secrets where name = 'telegram_bot_token';`
   (hoặc sửa trong Dashboard → Project Settings → Vault).
4. Nếu `pg_net` hoặc `supabase_vault` chưa bật: Dashboard → Database → Extensions, bật hai extension đó rồi chạy lại phần
   `create extension` đầu file migration.

## Mỗi người liên kết Telegram của mình

Menu tài khoản (góc phải) → **Nhắc nhở qua Telegram**:

1. Mở bot và bấm **Start** (bắt buộc: bot không được phép nhắn cho người chưa từng bắt đầu).
2. Nhắn cho **@userinfobot** để lấy `Id` (Chat ID).
3. Dán Chat ID vào ô, bấm **Lưu & gửi thử**. Thành công sẽ thấy tin "Đã kết nối Telegram" trong Telegram.

Chat ID của nhóm (số âm, VD `-100123...`) cũng dùng được nếu bot đã được thêm vào nhóm.

## Xử lý sự cố

| Thông báo khi gửi thử | Nguyên nhân / cách xử lý |
|---|---|
| `Bot Telegram chưa được cấu hình` | Chưa lưu `telegram_bot_token` vào Vault (bước 3). |
| `Bad Request: chat not found` | Chưa bấm Start với bot, hoặc sai Chat ID. |
| `Forbidden: bot was blocked by the user` | Bạn đã chặn bot; bỏ chặn rồi thử lại. |
| `Unauthorized` | Token sai/đã bị thu hồi: tạo lại token ở BotFather rồi cập nhật Vault. |
| Gửi thử "chưa nhận được phản hồi" | `pg_net` gửi bất đồng bộ; thử lại sau ít giây. Xem `select * from net._http_response order by id desc limit 5;`. |

Gửi tin lỗi không bao giờ làm hỏng thao tác gốc (nhắc việc, quét deadline vẫn ghi thông báo trong web).
