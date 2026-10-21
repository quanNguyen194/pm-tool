# Lỗi & Yêu cầu thay đổi (issue)

Tab **Lỗi & Yêu Cầu** quản lý bug, yêu cầu thay đổi (CR), cải tiến, câu hỏi của từng dự án. Cần migration `0023_issues.sql`.

## Dùng hằng ngày
- **Ghi nhận:** nút "Ghi nhận issue" (cần quyền ghi nhận). Chọn loại, tiêu đề, mô tả, ưu tiên, mức nghiêm trọng, hạn, môi trường, liên kết use case/nhiệm vụ; người có quyền phân công chọn thêm người xử lý.
- **Tìm kiếm:** gõ `#12` hoặc `12` để tìm theo mã; gõ chữ để tìm theo tên (không phân biệt hoa thường/dấu). Lọc theo loại, trạng thái ("Chưa đóng" mặc định), người xử lý, ưu tiên.
- **Cập nhật:** mở issue, đổi trạng thái / người xử lý, viết ghi chú rồi "Lưu cập nhật". Ai có quyền cập nhật đều đổi được sang trạng thái bất kỳ; mọi lần đổi được ghi vào nhật ký.
- **Nhật ký dạng cây:** mỗi dòng ghi người làm, thời điểm, các trường đã đổi (giá trị cũ → mới) và ghi chú. Bình luận trả lời được bình luận khác, lồng tối đa 3 cấp. Tác giả sửa được ghi chú của mình (hiện "đã sửa"); xóa nội dung ghi chú do người có quyền xóa, nhật ký vẫn ghi dấu "đã xóa".
- **Thông báo:** người xử lý và người báo nhận thông báo (chuông và Telegram nếu đã liên kết) khi được giao, đổi trạng thái hoặc có bình luận; người thao tác không tự nhận thông báo của chính mình.

## Ảnh / video đính kèm
Cần migration `0024_issue_attachments.sql` (chưa chạy thì phần này tự ẩn).
- **Thêm tệp:** ở form ghi nhận issue, hoặc ở khung "Cập nhật" của issue: nút **Chọn ảnh / video**, **kéo thả**, hoặc **dán ảnh chụp màn hình bằng Ctrl+V**. Tệp tải lên cùng lúc khi bấm lưu và gắn vào dòng nhật ký của lần cập nhật đó.
- **Giới hạn:** tối đa **10 tệp / issue**; ảnh JPG/PNG/GIF/WebP tối đa **5 MB** (ảnh lớn hơn 1920 px hoặc nặng hơn 1,5 MB được tự thu nhỏ và nén sang WebP, GIF giữ nguyên); video MP4/WebM/MOV tối đa **45 MB**. **Không nhận SVG** và mọi loại tệp khác.
- **Xem:** bấm ảnh để phóng to (phím ← → chuyển tệp, Esc đóng), bấm video để phát. Tệp nằm trong kho **riêng tư**: không có link công khai, ứng dụng xin link xem có hạn 1 giờ cho từng người dùng, và chỉ thành viên dự án mới xin được.
- **Ai được làm gì:** thêm tệp = người có quyền "Cập nhật issue", hoặc người báo khi issue còn ở trạng thái khởi tạo; xóa tệp = người tải lên hoặc người có quyền "Xóa issue". Mỗi lần thêm / xóa ghi một dòng nhật ký.
- **Dung lượng:** gói Supabase miễn phí có 1 GB cho cả kho tệp. Ứng dụng chặn thêm tệp khi tổng đạt **900 MB**; mục "Dự án này dùng ..." hiển thị dung lượng của dự án, Admin còn thấy thanh dung lượng toàn hệ thống. Xóa issue hoặc tệp sẽ xóa luôn tệp thật; xóa nguyên một dự án thì tệp thật của nó còn lại trong Storage (dọn bằng Dashboard > Storage nếu cần).

## Cấu hình (Admin, PM)
Nút **Cấu hình** trong tab: thêm, đổi tên, đổi màu, sắp xếp, ẩn **loại issue** và **trạng thái**. Mục đã có issue dùng chỉ ẩn được, không xóa được. Mỗi dự án phải có đúng một trạng thái **khởi tạo** (dành cho issue mới, không thuộc nhóm "đã đóng"). Nhóm của trạng thái ("Còn mở / Đang xử lý / Đã đóng") quyết định issue có tính vào số "còn mở" hay không.

**Độ ưu tiên** cũng cấu hình được (tab "Độ ưu tiên" của hộp Cấu hình, cần migration `0025`): thêm, đổi tên, đổi màu, sắp xếp (trên cùng là cao nhất), ẩn; mục đã có issue dùng chỉ ẩn được. Có đúng một mức **mặc định** gán cho issue mới khi người ghi nhận không chọn. Mặc định mỗi dự án: Khẩn cấp, Cao, Vừa (mặc định), Thấp. Quyền cấu hình độ ưu tiên dùng chung với "Cấu hình loại issue".

Mặc định mỗi dự án có loại: Bug, Yêu cầu thay đổi (CR), Cải tiến, Câu hỏi / Hỗ trợ; trạng thái: Mới, Đang thực hiện, Code xong, Test xong, Chờ triển khai, Sẵn sàng bàn giao, Đóng, Mở lại, Chưa hoàn thiện.

## Phân quyền (ma trận phân quyền, nhóm "Lỗi & yêu cầu")
| Quyền | Mặc định |
|---|---|
| Ghi nhận issue | PM, DEV, BA, Tester |
| Cập nhật issue (đổi trạng thái, bình luận) | PM, DEV, BA, Tester |
| Sửa nội dung issue | PM, BA (người báo sửa được issue của mình khi còn ở trạng thái khởi tạo) |
| Phân công người xử lý | PM |
| Xóa issue / ghi chú | PM |
| Cấu hình loại và độ ưu tiên issue | Admin, PM |
| Cấu hình trạng thái issue | Admin, PM |

Quan sát chỉ xem. Quản trị viên luôn có mọi quyền. Không có ràng buộc "chỉ vai trò X mới được chuyển sang trạng thái Y": truy vết bằng nhật ký.

## Kỹ thuật
- Mọi thay đổi đi qua các hàm CSDL (`create_issue`, `update_issue`, `edit_issue_note`, `delete_issue_note`, `delete_issue`, `save_issue_types`, `save_issue_statuses`) kiểm quyền và ghi nhật ký trong **một giao dịch**; không ghi trực tiếp vào bảng.
- Bảng: `issue_types`, `issue_statuses`, `issues`, `issue_counters` (đánh số), `issue_journals` (cây), `issue_journal_details` (đổi trường), `issue_attachments` (tệp đính kèm; tệp thật ở bucket `issue-attachments`, đường dẫn `<dự án>/<issue>/<mã tệp>.<đuôi>`).
- Tệp tải thẳng lên Storage (chính sách kiểm quyền theo issue, giới hạn số đối tượng), rồi gọi `add_issue_attachments` để đăng ký: hàm kiểm lại loại / dung lượng THẬT của đối tượng, số tệp và dung lượng toàn kho. Xóa tệp qua `delete_issue_attachment`, sau đó ứng dụng xóa đối tượng trong Storage.
