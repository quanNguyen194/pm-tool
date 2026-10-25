# Địa chỉ (URL) của từng màn hình và mục

Mỗi màn hình và mục có địa chỉ riêng, theo mã dễ đọc. Gửi địa chỉ cho thành viên khác là họ vào thẳng đúng nơi (sau khi đăng nhập).

| Nội dung | Địa chỉ |
|---|---|
| Tổng quan dự án | `/p/<mã dự án>` |
| Nhiệm vụ | `/p/<mã dự án>/tasks` (thêm `?view=gantt` hoặc `?view=table`; mặc định Kanban) |
| Một nhiệm vụ | `/p/<mã dự án>/tasks/<mã nhiệm vụ>` |
| Use case / một use case | `/p/<mã dự án>/usecases` và `/p/<mã dự án>/usecases/<mã use case>` (tự mở nhánh cha, cuộn tới và nháy sáng) |
| Lỗi & Yêu cầu / một issue | `/p/<mã dự án>/issues` (thêm `?view=board` cho Kanban) và `/p/<mã dự án>/issues/<số>` |
| Quality Gates, Báo cáo, Đội ngũ | `/p/<mã dự án>/quality`, `/reports`, `/team` |
| Danh sách dự án | `/projects` |
| Quản lý tài khoản (chỉ admin) | `/accounts` |
| Địa chỉ gốc `/` | tự chuyển tới tổng quan dự án gần nhất |
| Đăng nhập | `/login?next=<địa chỉ>` (đăng nhập xong quay lại `next`; chỉ nhận đường dẫn nội bộ) |

## Cách hoạt động
- Địa chỉ là nguồn sự thật của tab, dự án và mục đang mở: nút Back/Forward của trình duyệt dùng được, tải lại trang (F5) giữ nguyên chỗ đang xem, menu và danh sách dự án là liên kết thật (chuột giữa, Ctrl+click mở tab mới).
- Nút **Sao chép liên kết** (biểu tượng sợi xích) có ở hộp chi tiết nhiệm vụ, hộp chi tiết issue và phần chi tiết của use case.
- **Chưa đăng nhập:** thấy trang đăng nhập; đăng nhập xong vẫn ở đúng địa chỉ đó. Đăng ký mới thì email xác nhận đưa quay lại đúng địa chỉ **nếu** địa chỉ nằm trong danh sách Redirect URLs của Supabase (Authentication > URL Configuration; thêm `https://<tên miền>/**`), không thì quay về trang chủ.
- **Không phải thành viên / dự án không tồn tại:** cùng một thông báo "Không tìm thấy nội dung này", không tiết lộ dự án có tồn tại hay không. Mã nhiệm vụ / issue / use case không có trong dự án: thông báo rồi về danh sách.
- Mã dự án không phân biệt hoa thường; cũng nhận id dự án làm đường dự phòng.
- **Đổi mã dự án:** địa chỉ mới dùng mã mới (id dự án trong CSDL không đổi). Link cũ chứa mã cũ sẽ không mở được trừ khi dùng id.
- Mở một mục ngay trong tab đang xem thì giữ nguyên tham số `?view=`.

## Dự án Công khai / Riêng tư
Cần migration `0027_public_projects.sql`. Mỗi dự án có chế độ truy cập:
- **Riêng tư** (mặc định, mọi dự án hiện có): chỉ thành viên xem được; người khác thấy trang đăng nhập hoặc "Không tìm thấy nội dung này". Hành vi của thành viên với từng mục vẫn theo ma trận phân quyền.
- **Công khai:** **ai biết địa chỉ cũng xem được, không cần tài khoản**, với tư cách **Khách** (vai trò Quan sát, chỉ đọc). Dùng đúng các địa chỉ `/p/<mã dự án>/...` ở trên: gửi link nhiệm vụ, issue, use case, Gantt hay tổng quan của dự án công khai cho bất kỳ ai là họ mở được. Địa chỉ không khó đoán (là mã dự án và mã mục), nên coi nội dung công khai là **công khai thật sự**, không phải "bí mật có link".
- Người đã đăng nhập nhưng chưa là thành viên mở link của dự án công khai cũng xem ở chế độ Khách (có nút "Quay lại dự án của tôi").
- **Ai đổi được chế độ truy cập:** người có quyền "Quản lý dự án" (PM của dự án, Admin). Ở tab Danh sách dự án, bấm biểu tượng khóa/quả địa cầu trên thẻ dự án, có hộp xác nhận liệt kê nội dung sẽ lộ. Nút sợi xích trên thẻ sao chép liên kết dự án.
- **Khách xem được:** tổng quan, nhiệm vụ (Kanban, Gantt, bảng), use case, issue và nhật ký bình luận, Quality Gates, biểu đồ tiến độ, tên và vai trò thành viên. **Không bao giờ lộ:** ngân sách, email, tệp đính kèm, thông báo, cấu hình Telegram, phân quyền, báo cáo định kỳ, các dự án khác. Khách không thấy tab Báo cáo, Đội ngũ, Danh sách dự án.
- Chuyển về Riêng tư thì khách mất quyền xem ngay (kể cả link cũ). Đổi mã dự án: link cũ vẫn tự chuyển sang mã mới.
- Dữ liệu khách xem tải một lần rồi tự làm mới mỗi 60 giây (không có realtime).
- **Bảo mật kỹ thuật:** người chưa đăng nhập không đọc được bảng nào; quyền của họ chỉ gồm đúng một hàm `get_public_project(mã)` trả về bản dữ liệu đã lọc của dự án đang Công khai. Trang `/p/*` có `X-Robots-Tag: noindex` và trang có thẻ `robots noindex` để công cụ tìm kiếm không lập chỉ mục.

## Link trong tin Telegram
Cần migration `0026_telegram_links.sql`.
- Mọi tin Telegram theo thông báo có thêm dòng `🔗 <link>`: nhắc quá hạn / sắp đến hạn dẫn tới nhiệm vụ (`/tasks/<mã>`), thông báo issue dẫn tới issue (`/issues/<số>`), cảnh báo chất lượng dẫn tới `/quality`. Thông báo không thuộc dự án nào thì không có link.
- **Bản tóm tắt hằng ngày** (8:00 sáng): mỗi việc kèm link riêng. Danh sách dài đến mức vượt giới hạn tin nhắn của Telegram thì bỏ link từng việc, thay bằng link danh sách nhiệm vụ của dự án.
- Người nhận bấm link: đã đăng nhập thì vào thẳng, chưa thì đăng nhập rồi vào đúng chỗ; không phải thành viên thì thấy trang "Không tìm thấy nội dung này".
- **Địa chỉ gốc** lưu ở bảng `app_settings` (khóa `base_url`, mặc định `https://pm-tool.quan-ntm194.workers.dev`). Khi đổi sang tên miền riêng, chạy trong SQL Editor (một lần, không cần phát hành lại web):
  ```sql
  select public.set_app_base_url('https://ten-mien-moi');
  ```
  Chưa có địa chỉ gốc thì tin vẫn gửi bình thường, chỉ không có dòng link.

## Đổi mã dự án
Khi đổi mã dự án, mã cũ được nhớ (bảng `project_code_aliases`): link cũ chứa mã cũ (đã gửi qua Telegram hay chat) tự chuyển sang mã mới, giữ nguyên tab và mục đang xem. Chỉ người xem được dự án mới được chuyển; người khác vẫn thấy "Không tìm thấy". Nếu một dự án khác sau này dùng lại mã cũ đó thì mã đó thuộc dự án mới.

## Kỹ thuật
- `src/router/paths.ts`: phân tích và dựng đường dẫn (thuần, có test `scripts/router.test.mjs`); `src/router/Router.tsx`: bộ định tuyến nhỏ dựa trên History API (`RouterProvider`, `useRouter`, `Link`).
- `AppContext` suy ra `activeTab`, dự án và mục đang mở từ địa chỉ; cung cấp `hrefFor`, `copyLink`, `closeItem`, `openTask/openIssue/openUseCase`.
- Cloudflare trả `index.html` cho mọi đường dẫn (`not_found_handling: single-page-application`), nên không cần cấu hình thêm khi thêm đường dẫn.
