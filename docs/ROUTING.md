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
| Địa chỉ gốc `/` | tự chuyển tới tổng quan dự án gần nhất |

## Cách hoạt động
- Địa chỉ là nguồn sự thật của tab, dự án và mục đang mở: nút Back/Forward của trình duyệt dùng được, tải lại trang (F5) giữ nguyên chỗ đang xem, menu và danh sách dự án là liên kết thật (chuột giữa, Ctrl+click mở tab mới).
- Nút **Sao chép liên kết** (biểu tượng sợi xích) có ở hộp chi tiết nhiệm vụ, hộp chi tiết issue và phần chi tiết của use case.
- **Chưa đăng nhập:** thấy trang đăng nhập; đăng nhập xong vẫn ở đúng địa chỉ đó. Đăng ký mới thì email xác nhận đưa quay lại đúng địa chỉ **nếu** địa chỉ nằm trong danh sách Redirect URLs của Supabase (Authentication > URL Configuration; thêm `https://<tên miền>/**`), không thì quay về trang chủ.
- **Không phải thành viên / dự án không tồn tại:** cùng một thông báo "Không tìm thấy nội dung này", không tiết lộ dự án có tồn tại hay không. Mã nhiệm vụ / issue / use case không có trong dự án: thông báo rồi về danh sách.
- Mã dự án không phân biệt hoa thường; cũng nhận id dự án làm đường dự phòng.
- **Đổi mã dự án:** địa chỉ mới dùng mã mới (id dự án trong CSDL không đổi). Link cũ chứa mã cũ sẽ không mở được trừ khi dùng id.
- Mở một mục ngay trong tab đang xem thì giữ nguyên tham số `?view=`.

## Kỹ thuật
- `src/router/paths.ts`: phân tích và dựng đường dẫn (thuần, có test `scripts/router.test.mjs`); `src/router/Router.tsx`: bộ định tuyến nhỏ dựa trên History API (`RouterProvider`, `useRouter`, `Link`).
- `AppContext` suy ra `activeTab`, dự án và mục đang mở từ địa chỉ; cung cấp `hrefFor`, `copyLink`, `closeItem`, `openTask/openIssue/openUseCase`.
- Cloudflare trả `index.html` cho mọi đường dẫn (`not_found_handling: single-page-application`), nên không cần cấu hình thêm khi thêm đường dẫn.
