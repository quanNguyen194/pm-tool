-- Omni Project Manager - 0002: 5 giai đoạn + checklist chất lượng mẫu (nhân bản cho mỗi dự án mới).

insert into public.quality_phase_defs (key, name, short_name, description, sort) values
  ('phase_1', 'Giai đoạn 1: Khởi tạo & Lập Kế Hoạch', 'Khởi tạo & Kế hoạch',
   'Xác định mục tiêu kinh doanh, điều lệ dự án, phạm vi công việc WBS và ma trận phân công RACI.', 1),
  ('phase_2', 'Giai đoạn 2: Phân Tích Yêu Cầu & Thiết Kế Kiến Trúc', 'Phân tích & Thiết kế',
   'Đặc tả yêu cầu phần mềm BRD/SRS, thiết kế kiến trúc hệ thống, ERD CSDL và giao diện UI/UX.', 2),
  ('phase_3', 'Giai đoạn 3: Phát Triển Sprint & Kiểm Soát Mã Nguồn', 'Phát triển Sprint',
   'Tuân thủ Coding Standards, quy trình Code Review, tỷ lệ bao phủ Unit Test và CI/CD Pipeline.', 3),
  ('phase_4', 'Giai đoạn 4: Kiểm Thử QA/QC & Đảm Bảo Chất Lượng', 'Kiểm thử QA/QC',
   'Kiểm thử chức năng 100%, kiểm thử hiệu năng chịu tải, quét lỗ hổng bảo mật và xử lý Bug.', 4),
  ('phase_5', 'Giai đoạn 5: Kiểm Thử Nghiệm Thu UAT & Triển Khai Phát Hành', 'UAT & Release',
   'Biên bản nghiệm thu UAT, kịch bản triển khai Go-live, kế hoạch khôi phục Rollback và giám sát.', 5);

insert into public.quality_template_items (phase_key, sort, title, description, is_mandatory) values
  ('phase_1', 1, 'Tài liệu Điều lệ Dự án (Project Charter) đã được phê duyệt',
   'Có chữ ký đầy đủ của Ban Giám đốc và Đại diện Nghiệp vụ (PO).', true),
  ('phase_1', 2, 'Cơ cấu phân rã công việc (WBS) & Dự toán ngân sách',
   'Phân rã chi tiết các gói công việc đến cấp độ công việc tuần và kế hoạch giải ngân.', true),
  ('phase_1', 3, 'Kế hoạch Quản lý Rủi ro & Ma trận RACI',
   'Xác định các kịch bản rủi ro bảo mật, chậm tiến độ và đầu mối xử lý.', true),

  ('phase_2', 1, 'Đặc tả Yêu cầu Nghiệp vụ (BRD/SRS) và Danh mục Use Case hoàn tất 100%',
   'Tất cả các ca sử dụng cốt lõi đã có tiêu chí chấp nhận Acceptance Criteria rõ ràng.', true),
  ('phase_2', 2, 'Thiết kế Kiến trúc Microservices & Mô hình CSDL (ERD/Schema)',
   'Đảm bảo tuân thủ tính chịu lỗi High Availability và mã hóa CSDL.', true),
  ('phase_2', 3, 'Bộ thiết kế giao diện UI/UX Prototype được PO ký duyệt',
   'Kiểm tra chuẩn Accessibility WCAG 2.1 AA và luồng trải nghiệm người dùng.', true),
  ('phase_2', 4, 'Kế hoạch tuân thủ An toàn Thông tin & Tiêu chuẩn PCI-DSS',
   'Quy hoạch vùng mạng DMZ, cơ chế lưu trữ mật mã và chứng thư số HSM.', true),

  ('phase_3', 1, 'Tỷ lệ bao phủ kiểm thử tự động (Unit Test Coverage) đạt tối thiểu >= 80%',
   'Áp dụng cho toàn bộ các module xử lý tiền tệ, giao dịch và tính toán số dư.', true),
  ('phase_3', 2, 'Quy trình Code Review bắt buộc (Tối thiểu 1 Senior Dev + 1 Tech Lead duyệt PR)',
   'Không được phép merge trực tiếp vào nhánh `main` hoặc `staging`.', true),
  ('phase_3', 3, 'Pipeline CI/CD tự động quét mã nguồn (SonarQube & Static Analysis)',
   'Không có lỗi Security Hotspot hoặc Critical Code Smells.', true),
  ('phase_3', 4, 'Tài liệu API Swagger / OpenAPI được sinh tự động và cập nhật',
   'Mọi API endpoint phải có tài liệu request/response mẫu và mã lỗi chi tiết.', false),

  ('phase_4', 1, 'Hoàn thành 100% kịch bản Kiểm thử Chức năng (Functional Test Matrix)',
   'Tất cả các ca kiểm thử chính và biên đều được thực thi và có log kết quả.', true),
  ('phase_4', 2, 'Không còn lỗi nghiêm trọng tồn đọng (Zero Blocker / Critical Bugs)',
   'Mọi lỗi cấp độ nghiêm trọng phải được giải quyết triệt để trước khi chuyển UAT.', true),
  ('phase_4', 3, 'Kiểm thử tải và hiệu năng (Performance & Stress Test) đạt tiêu chuẩn SLA',
   'Thời gian phản hồi P95 <= 800ms khi chịu tải 5,000 giao dịch/giây.', true),
  ('phase_4', 4, 'Báo cáo Kiểm toán An ninh Mạng & Thử nghiệm Xâm nhập (Pentest Report)',
   'Được cấp chứng nhận bảo mật không có lỗ hổng High hoặc Critical.', true),

  ('phase_5', 1, 'Biên bản Nghiệm thu Người dùng (UAT Sign-off) được ký nhận chính thức',
   'Người đại diện nghiệp vụ và khách hàng xác nhận hệ thống đáp ứng đúng yêu cầu.', true),
  ('phase_5', 2, 'Kịch bản Triển khai Chi tiết (Deployment Plan) & Kế hoạch Khôi phục (Rollback)',
   'Chi tiết từng bước triển khai giờ vàng (off-peak hours) và phương án dự phòng khi có sự cố.', true),
  ('phase_5', 3, 'Bộ Tài liệu Hướng Dẫn Sử Dụng & Vận Hành Hệ Thống (Operations Manual)',
   'Tài liệu bàn giao cho đội IT Support, quản trị viên hạ tầng và trung tâm chăm sóc khách hàng.', false),
  ('phase_5', 4, 'Hệ thống Giám sát Real-time & Cảnh báo Sự cố (APM & Alerting 24/7)',
   'Thiết lập Dashboard Grafana/Prometheus cảnh báo qua Telegram/SMS khi lỗi vượt ngưỡng.', true);
