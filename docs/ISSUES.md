# Lỗi & Yêu cầu thay đổi (issue)

Tab **Lỗi & Yêu Cầu** quản lý bug, yêu cầu thay đổi (CR), cải tiến, câu hỏi của từng dự án. Cần migration `0023_issues.sql`.

## Dùng hằng ngày
- **Ghi nhận:** nút "Ghi nhận issue" (cần quyền ghi nhận). Chọn loại, tiêu đề, mô tả, ưu tiên, mức nghiêm trọng, hạn, môi trường, liên kết use case/nhiệm vụ; người có quyền phân công chọn thêm người xử lý.
- **Tìm kiếm:** gõ `#12` hoặc `12` để tìm theo mã; gõ chữ để tìm theo tên (không phân biệt hoa thường/dấu). Lọc theo loại, trạng thái ("Chưa đóng" mặc định), người xử lý, ưu tiên.
- **Cập nhật:** mở issue, đổi trạng thái / người xử lý, viết ghi chú rồi "Lưu cập nhật". Ai có quyền cập nhật đều đổi được sang trạng thái bất kỳ; mọi lần đổi được ghi vào nhật ký.
- **Nhật ký dạng cây:** mỗi dòng ghi người làm, thời điểm, các trường đã đổi (giá trị cũ → mới) và ghi chú. Bình luận trả lời được bình luận khác, lồng tối đa 3 cấp. Tác giả sửa được ghi chú của mình (hiện "đã sửa"); xóa nội dung ghi chú do người có quyền xóa, nhật ký vẫn ghi dấu "đã xóa".
- **Thông báo:** người xử lý và người báo nhận thông báo (chuông và Telegram nếu đã liên kết) khi được giao, đổi trạng thái hoặc có bình luận; người thao tác không tự nhận thông báo của chính mình.

## Cấu hình (Admin, PM)
Nút **Cấu hình** trong tab: thêm, đổi tên, đổi màu, sắp xếp, ẩn **loại issue** và **trạng thái**. Mục đã có issue dùng chỉ ẩn được, không xóa được. Mỗi dự án phải có đúng một trạng thái **khởi tạo** (dành cho issue mới, không thuộc nhóm "đã đóng"). Nhóm của trạng thái ("Còn mở / Đang xử lý / Đã đóng") quyết định issue có tính vào số "còn mở" hay không.

Mặc định mỗi dự án có loại: Bug, Yêu cầu thay đổi (CR), Cải tiến, Câu hỏi / Hỗ trợ; trạng thái: Mới, Đang thực hiện, Code xong, Test xong, Chờ triển khai, Sẵn sàng bàn giao, Đóng, Mở lại, Chưa hoàn thiện.

## Phân quyền (ma trận phân quyền, nhóm "Lỗi & yêu cầu")
| Quyền | Mặc định |
|---|---|
| Ghi nhận issue | PM, DEV, BA, Tester |
| Cập nhật issue (đổi trạng thái, bình luận) | PM, DEV, BA, Tester |
| Sửa nội dung issue | PM, BA (người báo sửa được issue của mình khi còn ở trạng thái khởi tạo) |
| Phân công người xử lý | PM |
| Xóa issue / ghi chú | PM |
| Cấu hình loại issue | Admin, PM |
| Cấu hình trạng thái issue | Admin, PM |

Quan sát chỉ xem. Quản trị viên luôn có mọi quyền. Không có ràng buộc "chỉ vai trò X mới được chuyển sang trạng thái Y": truy vết bằng nhật ký.

## Kỹ thuật
- Mọi thay đổi đi qua các hàm CSDL (`create_issue`, `update_issue`, `edit_issue_note`, `delete_issue_note`, `delete_issue`, `save_issue_types`, `save_issue_statuses`) kiểm quyền và ghi nhật ký trong **một giao dịch**; không ghi trực tiếp vào bảng.
- Bảng: `issue_types`, `issue_statuses`, `issues`, `issue_counters` (đánh số), `issue_journals` (cây), `issue_journal_details` (đổi trường).
