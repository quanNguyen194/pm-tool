-- Gắn nguồn gốc use case dự án GPDN_DNMB_EVNNPC_QTVT_251004 (theo các sheet bổ sung / điều chỉnh / không thực hiện).
-- Gồm: 83 use case bổ sung, 7 use case điều chỉnh, 22 use case "Không thực hiện" (thêm mới, mã KTH-xxx).
-- Sinh tự động bởi scripts/gen-usecase-origin.py - đừng sửa tay, hãy sửa Excel rồi sinh lại.
--
-- Chạy SAU migration 0011_usecase_origin.sql và SAU qtvt_usecases_import.sql, trong Supabase SQL Editor.
-- An toàn khi chạy lại. Không đổi trạng thái/tiến độ của các use case đã có.
-- Hoàn tác: chạy qtvt_usecases_origin_rollback.sql.

do $origin$
declare
  v_project_code constant text := 'GPDN_DNMB_EVNNPC_QTVT_251004';
  v_project uuid;
  r record;
  v_parent uuid;
  n_marked integer := 0;
  n_new integer := 0;
  n_upd integer := 0;
  v_new boolean;
begin
  select id into v_project from public.projects where code = v_project_code;
  if v_project is null then
    raise exception 'Không tìm thấy dự án có mã %. Kiểm tra lại mã dự án.', v_project_code;
  end if;

  -- 1. Đánh dấu nguồn gốc cho use case đã có trong danh sách final
  for r in
    select * from jsonb_to_recordset($json$[{"code":"UC-004","origin":"added","note":"Bổ sung theo yêu cầu của Ban 10","agreed":""},
{"code":"UC-035","origin":"added","note":"Bổ sung theo yêu cầu của Ban 10","agreed":""},
{"code":"UC-036","origin":"added","note":"Bổ sung theo yêu cầu của Ban 10","agreed":""},
{"code":"UC-037","origin":"added","note":"Bổ sung theo yêu cầu của Ban 10","agreed":""},
{"code":"UC-024","origin":"added","note":"Khách hàng có nhu cầu xem danh sách hồ sơ vật tư, thiết bị","agreed":"Sau khi khảo sát nghiệp vụ vào tháng 01/2026"},
{"code":"UC-025","origin":"added","note":"Khách hàng có nhu cầu chỉnh sửa thông tin hồ sơ vật tư, thiết bị","agreed":"Sau khi khảo sát nghiệp vụ vào tháng 01/2026"},
{"code":"UC-054","origin":"added","note":"Bổ sung theo yêu cầu của Ban 10","agreed":""},
{"code":"UC-055","origin":"added","note":"Bổ sung theo yêu cầu của Ban 10","agreed":""},
{"code":"UC-056","origin":"added","note":"Bổ sung theo yêu cầu của Ban 10","agreed":""},
{"code":"UC-043","origin":"added","note":"Khách hàng có nhu cầu xem danh sách hồ sơ vật tư, thiết bị","agreed":"Sau khi khảo sát nghiệp vụ vào tháng 01/2026"},
{"code":"UC-044","origin":"added","note":"Khách hàng có nhu cầu chỉnh sửa thông tin hồ sơ vật tư, thiết bị","agreed":"Sau khi khảo sát nghiệp vụ vào tháng 01/2026"},
{"code":"UC-070","origin":"added","note":"Mở rộng phạm vị định danh vật tư thiết bị","agreed":"Đang chờ chốt phạm vi định danh"},
{"code":"UC-071","origin":"added","note":"Mở rộng phạm vị định danh vật tư thiết bị","agreed":"Đang chờ chốt phạm vi định danh"},
{"code":"UC-072","origin":"added","note":"Mở rộng phạm vị định danh vật tư thiết bị","agreed":"Đang chờ chốt phạm vi định danh"},
{"code":"UC-073","origin":"added","note":"Mở rộng phạm vị định danh vật tư thiết bị","agreed":"Đang chờ chốt phạm vi định danh"},
{"code":"UC-074","origin":"added","note":"Mở rộng phạm vị định danh vật tư thiết bị","agreed":"Đang chờ chốt phạm vi định danh"},
{"code":"UC-075","origin":"added","note":"Mở rộng phạm vị định danh vật tư thiết bị","agreed":"Đang chờ chốt phạm vi định danh"},
{"code":"UC-076","origin":"added","note":"Mở rộng phạm vị định danh vật tư thiết bị","agreed":"Đang chờ chốt phạm vi định danh"},
{"code":"UC-077","origin":"added","note":"Mở rộng phạm vị định danh vật tư thiết bị","agreed":"Đang chờ chốt phạm vi định danh"},
{"code":"UC-078","origin":"added","note":"Mở rộng phạm vị định danh vật tư thiết bị","agreed":"Đang chờ chốt phạm vi định danh"},
{"code":"UC-079","origin":"added","note":"Mở rộng phạm vị định danh vật tư thiết bị","agreed":"Đang chờ chốt phạm vi định danh"},
{"code":"UC-080","origin":"added","note":"Mở rộng phạm vị định danh vật tư thiết bị","agreed":"Đang chờ chốt phạm vi định danh"},
{"code":"UC-081","origin":"added","note":"Mở rộng phạm vị định danh vật tư thiết bị","agreed":"Đang chờ chốt phạm vi định danh"},
{"code":"UC-082","origin":"added","note":"Mở rộng phạm vị định danh vật tư thiết bị","agreed":"Đang chờ chốt phạm vi định danh"},
{"code":"UC-083","origin":"added","note":"Mở rộng phạm vị định danh vật tư thiết bị","agreed":"Đang chờ chốt phạm vi định danh"},
{"code":"UC-084","origin":"added","note":"Mở rộng phạm vị định danh vật tư thiết bị","agreed":"Đang chờ chốt phạm vi định danh"},
{"code":"UC-085","origin":"added","note":"Mở rộng phạm vị định danh vật tư thiết bị","agreed":"Đang chờ chốt phạm vi định danh"},
{"code":"UC-086","origin":"added","note":"Mở rộng phạm vị định danh vật tư thiết bị","agreed":"Đang chờ chốt phạm vi định danh"},
{"code":"UC-087","origin":"added","note":"Mở rộng phạm vị định danh vật tư thiết bị","agreed":"Đang chờ chốt phạm vi định danh"},
{"code":"UC-088","origin":"added","note":"Mở rộng phạm vị định danh vật tư thiết bị","agreed":"Đang chờ chốt phạm vi định danh"},
{"code":"UC-089","origin":"added","note":"Mở rộng phạm vị định danh vật tư thiết bị","agreed":"Đang chờ chốt phạm vi định danh"},
{"code":"UC-090","origin":"added","note":"Mở rộng phạm vị định danh vật tư thiết bị","agreed":"Đang chờ chốt phạm vi định danh"},
{"code":"UC-091","origin":"added","note":"Mở rộng phạm vị định danh vật tư thiết bị","agreed":"Đang chờ chốt phạm vi định danh"},
{"code":"UC-092","origin":"added","note":"Mở rộng phạm vị định danh vật tư thiết bị","agreed":"Đang chờ chốt phạm vi định danh"},
{"code":"UC-093","origin":"added","note":"Mở rộng phạm vị định danh vật tư thiết bị","agreed":"Đang chờ chốt phạm vi định danh"},
{"code":"UC-094","origin":"added","note":"Mở rộng phạm vị định danh vật tư thiết bị","agreed":"Đang chờ chốt phạm vi định danh"},
{"code":"UC-095","origin":"added","note":"Mở rộng phạm vị định danh vật tư thiết bị","agreed":"Đang chờ chốt phạm vi định danh"},
{"code":"UC-096","origin":"added","note":"Mở rộng phạm vị định danh vật tư thiết bị","agreed":"Đang chờ chốt phạm vi định danh"},
{"code":"UC-097","origin":"added","note":"Mở rộng phạm vị định danh vật tư thiết bị","agreed":"Đang chờ chốt phạm vi định danh"},
{"code":"UC-099","origin":"added","note":"Mở rộng phạm vị định danh vật tư thiết bị","agreed":"Đang chờ chốt phạm vi định danh"},
{"code":"UC-100","origin":"added","note":"Mở rộng phạm vị định danh vật tư thiết bị","agreed":"Đang chờ chốt phạm vi định danh"},
{"code":"UC-101","origin":"added","note":"Mở rộng phạm vị định danh vật tư thiết bị","agreed":"Đang chờ chốt phạm vi định danh"},
{"code":"UC-102","origin":"added","note":"Mở rộng phạm vị định danh vật tư thiết bị","agreed":"Đang chờ chốt phạm vi định danh"},
{"code":"UC-103","origin":"added","note":"Mở rộng phạm vị định danh vật tư thiết bị","agreed":"Đang chờ chốt phạm vi định danh"},
{"code":"UC-104","origin":"added","note":"Mở rộng phạm vị định danh vật tư thiết bị","agreed":"Đang chờ chốt phạm vi định danh"},
{"code":"UC-105","origin":"added","note":"Mở rộng phạm vị định danh vật tư thiết bị","agreed":"Đang chờ chốt phạm vi định danh"},
{"code":"UC-106","origin":"added","note":"Mở rộng phạm vị định danh vật tư thiết bị","agreed":"Đang chờ chốt phạm vi định danh"},
{"code":"UC-107","origin":"added","note":"Mở rộng phạm vị định danh vật tư thiết bị","agreed":"Đang chờ chốt phạm vi định danh"},
{"code":"UC-108","origin":"added","note":"Mở rộng phạm vị định danh vật tư thiết bị","agreed":"Đang chờ chốt phạm vi định danh"},
{"code":"UC-109","origin":"added","note":"Mở rộng phạm vị định danh vật tư thiết bị","agreed":"Đang chờ chốt phạm vi định danh"},
{"code":"UC-110","origin":"added","note":"Mở rộng phạm vị định danh vật tư thiết bị","agreed":"Đang chờ chốt phạm vi định danh"},
{"code":"UC-111","origin":"added","note":"Mở rộng phạm vị định danh vật tư thiết bị","agreed":"Đang chờ chốt phạm vi định danh"},
{"code":"UC-112","origin":"added","note":"Mở rộng phạm vị định danh vật tư thiết bị","agreed":"Đang chờ chốt phạm vi định danh"},
{"code":"UC-113","origin":"added","note":"Mở rộng phạm vị định danh vật tư thiết bị","agreed":"Đang chờ chốt phạm vi định danh"},
{"code":"UC-114","origin":"added","note":"Mở rộng phạm vị định danh vật tư thiết bị","agreed":"Đang chờ chốt phạm vi định danh"},
{"code":"UC-115","origin":"added","note":"Mở rộng phạm vị định danh vật tư thiết bị","agreed":"Đang chờ chốt phạm vi định danh"},
{"code":"UC-116","origin":"added","note":"Mở rộng phạm vị định danh vật tư thiết bị","agreed":"Đang chờ chốt phạm vi định danh"},
{"code":"UC-117","origin":"added","note":"Mở rộng phạm vị định danh vật tư thiết bị","agreed":"Đang chờ chốt phạm vi định danh"},
{"code":"UC-118","origin":"added","note":"Mở rộng phạm vị định danh vật tư thiết bị","agreed":"Đang chờ chốt phạm vi định danh"},
{"code":"UC-119","origin":"added","note":"Mở rộng phạm vị định danh vật tư thiết bị","agreed":"Đang chờ chốt phạm vi định danh"},
{"code":"UC-120","origin":"added","note":"Mở rộng phạm vị định danh vật tư thiết bị","agreed":"Đang chờ chốt phạm vi định danh"},
{"code":"UC-121","origin":"added","note":"Mở rộng phạm vị định danh vật tư thiết bị","agreed":"Đang chờ chốt phạm vi định danh"},
{"code":"UC-122","origin":"added","note":"Mở rộng phạm vị định danh vật tư thiết bị","agreed":"Đang chờ chốt phạm vi định danh"},
{"code":"UC-123","origin":"added","note":"Mở rộng phạm vị định danh vật tư thiết bị","agreed":"Đang chờ chốt phạm vi định danh"},
{"code":"UC-124","origin":"added","note":"Mở rộng phạm vị định danh vật tư thiết bị","agreed":"Đang chờ chốt phạm vi định danh"},
{"code":"UC-125","origin":"added","note":"Mở rộng phạm vị định danh vật tư thiết bị","agreed":"Đang chờ chốt phạm vi định danh"},
{"code":"UC-126","origin":"added","note":"Mở rộng phạm vị định danh vật tư thiết bị","agreed":"Đang chờ chốt phạm vi định danh"},
{"code":"UC-127","origin":"added","note":"Mở rộng phạm vị định danh vật tư thiết bị","agreed":"Đang chờ chốt phạm vi định danh"},
{"code":"UC-128","origin":"added","note":"Mở rộng phạm vị định danh vật tư thiết bị","agreed":"Đang chờ chốt phạm vi định danh"},
{"code":"UC-132","origin":"added","note":"","agreed":""},
{"code":"UC-171","origin":"added","note":"Khách hàng có nhu cầu xem báo cáo tổng hợp thời gian vận hành của VTTB","agreed":"Sau khi khảo sát nghiệp vụ vào tháng 01/2026"},
{"code":"UC-173","origin":"added","note":"Bổ sung theo yêu cầu của ban 10","agreed":""},
{"code":"UC-174","origin":"added","note":"Bổ sung theo yêu cầu của ban 10","agreed":""},
{"code":"UC-175","origin":"added","note":"Bổ sung theo yêu cầu của ban 10","agreed":""},
{"code":"UC-146","origin":"added","note":"Khách hàng có nhu cầu xem tổng hợp thu hồi","agreed":"Sau khi khảo sát nghiệp vụ vào tháng 03/2026"},
{"code":"UC-151","origin":"added","note":"Bổ sung theo yêu cầu của ban 10","agreed":""},
{"code":"UC-152","origin":"added","note":"Bổ sung theo yêu cầu của ban 10","agreed":""},
{"code":"UC-153","origin":"added","note":"Bổ sung theo yêu cầu của ban 10","agreed":""},
{"code":"UC-154","origin":"added","note":"Bổ sung theo yêu cầu của ban 10","agreed":""},
{"code":"UC-155","origin":"added","note":"Bổ sung theo yêu cầu của ban 10","agreed":""},
{"code":"UC-156","origin":"added","note":"Bổ sung theo yêu cầu của ban 10","agreed":""},
{"code":"UC-183","origin":"added","note":"Bổ sung","agreed":""},
{"code":"UC-184","origin":"added","note":"Bổ sung","agreed":""},
{"code":"UC-002","origin":"adjusted","note":"Theo hợp đồng: 5 transaction (Trung bình) → sau điều chỉnh: 1 transaction (Đơn giản). Giảm 4 transaction (do thay đổi từ người dùng tự cấu hình sang cấu hình tự động)","agreed":""},
{"code":"UC-135","origin":"adjusted","note":"Theo hợp đồng: 8 transaction (Phức tạp) → sau điều chỉnh: 9 transaction (Phức tạp). Tăng 1 transaction (Không làm thay đổi mức độ phức tạp của UC)","agreed":""},
{"code":"UC-136","origin":"adjusted","note":"Theo hợp đồng: 4 transaction (Trung bình) → sau điều chỉnh: 6 transaction (Trung bình). Tăng 2 transaction (Không làm thay đổi mức độ phức tạp của UC)","agreed":""},
{"code":"UC-137","origin":"adjusted","note":"Theo hợp đồng: 5 transaction (Trung bình) → sau điều chỉnh: 6 transaction (Trung bình). Tăng 1 transaction (Không làm thay đổi mức độ phức tạp của UC)","agreed":""},
{"code":"UC-142","origin":"adjusted","note":"Theo hợp đồng: 7 transaction (Trung bình) → sau điều chỉnh: 8 transaction (Phức tạp). Tăng 1 transaction (Thay đổi từ UC Trung Bình sang UC Phức tạp)","agreed":""},
{"code":"UC-144","origin":"adjusted","note":"Theo hợp đồng: 6 transaction (Trung bình) → sau điều chỉnh: 10 transaction (Phức tạp). Tăng 4 transaction (Thay đổi từ UC Trung Bình sang UC Phức tạp)","agreed":""},
{"code":"UC-145","origin":"adjusted","note":"Theo hợp đồng: 5 transaction (Trung bình) → sau điều chỉnh: 9 transaction (Phức tạp). Tăng 4 transaction (Thay đổi từ UC Trung Bình sang UC Phức tạp)","agreed":""}]
$json$::jsonb) as x(code text, origin text, note text, agreed text)
  loop
    update public.use_cases
       set origin = r.origin, change_note = r.note, agreed_when = r.agreed
     where project_id = v_project and code = r.code;
    if not found then
      raise exception 'Không tìm thấy use case % - hãy chạy qtvt_usecases_import.sql trước.', r.code;
    end if;
    n_marked := n_marked + 1;
  end loop;

  -- 2. Thêm các use case "Không thực hiện" (giữ để truy vết, không tính vào số lượng/UCP/tiến độ)
  for r in
    select * from jsonb_to_recordset($json$[{"sort":1,"code":"KTH-VP","parent":null,"kind":"group","title":"Không thực hiện (Văn phòng)","actor":"","flow":[],"tags":["Văn phòng"],"complexity":null,"transactions":null,"necessity":"B","note":"","agreed":""},
{"sort":2,"code":"KTH-001","parent":"W-I.1","kind":"usecase","title":"Quản lý cấu hình dữ liệu ghi vào thẻ RFID","actor":"Quản trị phần mềm","flow":["1. Quản trị phần mềm thêm mới cấu hình dữ liệu ghi vào thẻ RFID trên giao diện. Hệ thống lưu cấu hình dữ liệu ghi vào thẻ RFID được thêm mới","2. Quản trị phần mềm thực hiện chỉnh sửa cấu hình dữ liệu ghi vào thẻ RFID. Hệ thống lưu cấu hình dữ liệu ghi vào thẻ RFID do người dùng chỉnh sửa","3. Quản trị phần mềm thực hiện chọn và xóa một hoặc một số cấu hình dữ liệu ghi vào thẻ RFID. Hệ thống kiểm tra điều kiện ràng buộc và xóa thông tin theo yêu cầu người dùng","4. Quản trị phần mềm tìm kiếm cấu hình dữ liệu ghi vào thẻ RFID. Hệ thống tìm kiếm và trả kết quả cho người dùng","5. Quản trị phần mềm xem chi tiết cấu hình dữ liệu ghi vào thẻ RFID. Hệ thống hiển thị chi tiết cấu hình dữ liệu ghi vào thẻ RFID"],"tags":["Web"],"complexity":"medium","transactions":5,"necessity":"B","note":"Khách hàng không có nhu cầu thực hiện phương thức định danh RFID","agreed":"Sau khi khảo sát nghiệp vụ vào tháng 01/2026"},
{"sort":3,"code":"KTH-002","parent":"W-I.3","kind":"usecase","title":"Tích hợp với máy đọc RFID","actor":"Người dùng","flow":["1. Người dùng chọn loại máy đọc RFID để kết nối và nhập thông số kết nối. Hệ thống gửi yêu cầu kết nối đến máy đọc RFID","2. Máy đọc RFID phản hồi về trạng thái kết nối. Hệ thống hiển thị trạng thái kết nối"],"tags":["Web"],"complexity":"simple","transactions":2,"necessity":"B","note":"Khách hàng không có nhu cầu thực hiện phương thức định danh RFID","agreed":"Sau khi khảo sát nghiệp vụ vào tháng 01/2026"},
{"sort":4,"code":"KTH-003","parent":"W-I.4","kind":"usecase","title":"Nhập xuất chi tiết bằng mã RFID","actor":"Người dùng","flow":["1. Người dùng quét RFID trên VTTB cần nhập/xuất kho. Thiết bị quét thực hiện quét mã và gửi dữ liệu đến hệ thống.","2. Hệ thống nhận dữ liệu và kiểm tra thông tin và hiển thị thông tin chi tiết cho Người dùng. Người dùng xem chi tiết thông tin và xác nhận VTTB cần nhập/ xuất kho.","3. Hệ thống lưu thông tin do Người dùng xác nhận trong CSDL và hiển thị kết quả nhập/xuất kho cho Người dùng. Người dùng xem thông tin kết quả nhập/ xuất kho.","4. Hệ thống lưu lại lịch sử nhập/ xuất kho"],"tags":["Web"],"complexity":"medium","transactions":4,"necessity":"B","note":"Khách hàng không có nhu cầu thực hiện phương thức định danh RFID","agreed":"Sau khi khảo sát nghiệp vụ vào tháng 01/2026"},
{"sort":5,"code":"KTH-004","parent":"W-II","kind":"usecase","title":"Báo cáo số lượng VTTB hư hỏng","actor":"Người dùng","flow":["1. Người dùng xem Báo cáo số lượng VTTB hư hỏng. Hệ thống hiển thị thông tin chi tiết Báo cáo số lượng VTTB hư hỏng","2. Người dùng nhập các tiêu chí lọc về số lượng VTTB hư hỏng. Hệ thống truy vấn thông tin trong CSDL và hiển thị kết quả Báo cáo số lượng VTTB hư hỏng theo tiêu chí lọc"],"tags":["Web"],"complexity":"simple","transactions":2,"necessity":"B","note":"Báo cáo này đã được thể hiện nội dung ở báo cáo theo dõi hư hỏng (sự cố) của VTTB","agreed":"Sau khi khảo sát nghiệp vụ vào tháng 01/2026"},
{"sort":6,"code":"KTH-005","parent":"W-II","kind":"usecase","title":"Báo cáo Tính toán tỷ lệ hư hỏng VTTB theo nhà sản xuất theo lô sản xuất theo thời gian vận hành và theo khu vực","actor":"Người dùng","flow":["1. Người dùng xem Báo cáo Tính toán tỷ lệ hư hỏng VTTB theo nhà sản xuất theo lô sản xuất theo thời gian vận hành và theo khu vực. Hệ thống hiển thị thông tin chi tiết Báo cáo Tính toán tỷ lệ hư hỏng VTTB theo nhà sản xuất theo lô sản xuất theo thời gian vận hành và theo khu vực","2. Người dùng nhập các tiêu chí lọc về Tính toán tỷ lệ hư hỏng VTTB theo nhà sản xuất theo lô sản xuất theo thời gian vận hành và theo khu vực. Hệ thống truy vấn thông tin trong CSDL và hiển thị kết quả Báo cáo Tính toán tỷ lệ hư hỏng VTTB theo nhà sản xuất theo lô sản xuất theo thời gian vận hành và theo khu vực theo tiêu chí lọc"],"tags":["Web"],"complexity":"simple","transactions":2,"necessity":"B","note":"Báo cáo này đã được thể hiện nội dung ở báo cáo theo dõi hư hỏng (sự cố) của VTTB theo nhà sản xuất","agreed":"Sau khi khảo sát nghiệp vụ vào tháng 01/2026"},
{"sort":7,"code":"KTH-006","parent":"W-II","kind":"usecase","title":"Báo cáo so sánh tỷ lệ hư hỏng thực tế với định mức thiết lập để xác định nhà sản xuất chưa đạt yêu cầu so với định mức","actor":"Người dùng","flow":["1. Người dùng xem Báo cáo so sánh tỷ lệ hư hỏng thực tế với định mức thiết lập để xác định nhà sản xuất chưa đạt yêu cầu so với định mức. Hệ thống hiển thị thông tin chi tiết Báo cáo so sánh tỷ lệ hư hỏng thực tế với định mức thiết lập để xác định nhà sản xuất chưa đạt yêu cầu so với định mức","2. Người dùng nhập các tiêu chí lọc về so sánh tỷ lệ hư hỏng thực tế với định mức thiết lập để xác định nhà sản xuất chưa đạt yêu cầu so với định mức. Hệ thống truy vấn thông tin trong CSDL và hiển thị kết quả Báo cáo so sánh tỷ lệ hư hỏng thực tế với định mức thiết lập để xác định nhà sản xuất chưa đạt yêu cầu so với định mức theo tiêu chí lọc"],"tags":["Web"],"complexity":"simple","transactions":2,"necessity":"B","note":"Báo cáo này đã được thể hiện nội dung ở báo cáo theo dõi hư hỏng (sự cố) của VTTB theo nhà sản xuất","agreed":"Sau khi khảo sát nghiệp vụ vào tháng 01/2026"},
{"sort":8,"code":"KTH-007","parent":"W-IV","kind":"usecase","title":"Cảnh báo VTTB chưa có mã định danh","actor":"Người dùng","flow":["1. Người dùng xem VTTB chưa có mã định danh có phân trang. Hệ thống thực hiện chuyển trang theo yêu cầu"],"tags":["Web"],"complexity":"simple","transactions":1,"necessity":"B","note":"Hệ thống chỉ thực hiện sinh mã định danh và quản lý thông tin vật tư theo mã định danh đã được tạo từ các kế hoạch định danh, không quản lý thông tin vật tư chưa được định danh","agreed":"Sau khi khảo sát nghiệp vụ vào tháng 01/2026"},
{"sort":9,"code":"KTH-008","parent":"M-I.2","kind":"usecase","title":"Quét RFID trên ứng dụng di động","actor":"Người dùng","flow":["1. Người dùng sử dụng quét RFID bằng thiết bị quét. Thiết bị quét mã và gửi dữ liệu đến hệ thống.","2. Hệ thống tiếp nhận dữ liệu, giải mã RFID và hiển thị thông tin cho người dùng. Người dùng xem chi tiết thông tin trên giao diện"],"tags":["Mobile"],"complexity":"simple","transactions":2,"necessity":"B","note":"Khách hàng không có nhu cầu thực hiện phương thức định danh RFID","agreed":"Sau khi khảo sát nghiệp vụ vào tháng 01/2026"},
{"sort":10,"code":"KTH-009","parent":"M-I.3","kind":"usecase","title":"Nhập xuất chi tiết bằng mã RFID trên ứng dụng di động","actor":"Người dùng","flow":["1. Người dùng quét RFID trên VTTB cần nhập/xuất kho. Thiết bị quét thực hiện quét mã và gửi dữ liệu đến hệ thống.","2. Hệ thống nhận dữ liệu và kiểm tra thông tin và hiển thị thông tin chi tiết cho Người dùng. Người dùng xem chi tiết thông tin và xác nhận VTTB cần nhập/ xuất kho.","3. Hệ thống lưu thông tin do Người dùng xác nhận trong CSDL và hiển thị kết quả nhập/xuất kho cho Người dùng. Người dùng xem thông tin kết quả nhập/ xuất kho.","4. Hệ thống lưu lại lịch sử nhập/ xuất kho"],"tags":["Mobile"],"complexity":"medium","transactions":4,"necessity":"B","note":"Khách hàng không có nhu cầu thực hiện phương thức định danh RFID","agreed":"Sau khi khảo sát nghiệp vụ vào tháng 01/2026"},
{"sort":11,"code":"KTH-010","parent":"M-III","kind":"usecase","title":"Cảnh báo VTTB chưa có mã định danh","actor":"Người dùng","flow":["1. Người dùng xem VTTB chưa có mã định danh có phân trang. Hệ thống thực hiện chuyển trang theo yêu cầu"],"tags":["Mobile"],"complexity":"simple","transactions":1,"necessity":"B","note":"Hệ thống chỉ thực hiện sinh mã định danh và quản lý thông tin vật tư theo mã định danh đã được tạo từ các kế hoạch định danh, không quản lý thông tin vật tư chưa được định danh","agreed":"Sau khi khảo sát nghiệp vụ vào tháng 01/2026"},
{"sort":12,"code":"KTH-011","parent":"KTH-VP","kind":"usecase","title":"Quản lý bảo trì, bảo dưỡng vật tư, thiết bị","actor":"Chuyên viên Văn phòng/ NPCIT","flow":["1. Văn phòng, NPCIT thêm mới thông tin bảo trì, bảo dưỡng vật tư, thiết bị trên giao diện. Hệ thống lưu thông tin bảo trì, bảo dưỡng vật tư, thiết bị được thêm mới","2. Văn phòng, NPCIT thực hiện chỉnh sửa bảo trì, bảo dưỡng vật tư, thiết bị chưa trình phê duyệt. Hệ thống lưu bảo trì, bảo dưỡng vật tư, thiết bị do người dùng chỉnh sửa","3. Văn phòng, NPCIT xem chi tiết bảo trì, bảo dưỡng vật tư, thiết bị. Hệ thống hiển thị chi tiết bảo trì, bảo dưỡng vật tư, thiết bị"],"tags":["Văn phòng"],"complexity":"simple","transactions":3,"necessity":"B","note":"Điều chỉnh theo quy trình nghiệp vụ mới sau khảo sát","agreed":"Sau khi khảo sát nghiệp vụ vào tháng 03/2026"},
{"sort":13,"code":"KTH-012","parent":"KTH-VP","kind":"usecase","title":"Quản lý thanh lý","actor":"Chuyên viên Văn phòng","flow":["1. Chuyên viên Văn phòng tạo yêu cầu thanh lý trên giao diện. Hệ thống lưu thông tin thanh lý được yêu cầu","2. Chuyên viên Văn phòng thực hiện chỉnh sửa yêu cầu thanh lý. Hệ thống lưu thông tin thanh lý do người dùng chỉnh sửa","3. Chuyên viên Văn phòng thực hiện chọn và xóa một hoặc một số yêu cầu thanh lý. Hệ thống kiểm tra điều kiện ràng buộc và xóa thông tin theo yêu cầu người dùng","4. Chuyên viên Văn phòng tìm kiếm thanh lý. Hệ thống tìm kiếm và trả kết quả cho người dùng","5. Chuyên viên Văn phòng xem chi tiết thanh lý. Hệ thống hiển thị chi tiết thanh lý","6. Chuyên viên Văn phòng xuất dữ liệu thanh lý ra file excel. Hệ thống thực hiện xuất theo yêu cầu"],"tags":["Văn phòng"],"complexity":"medium","transactions":6,"necessity":"B","note":"Khách hàng không có nhu cầu quản lý thanh lý VTTB trên hệ thống","agreed":"Sau khi khảo sát nghiệp vụ vào tháng 03/2026"},
{"sort":14,"code":"KTH-013","parent":"VP-X.2","kind":"usecase","title":"Báo cáo xuất nhập tồn tài sản","actor":"Chuyên viên Văn phòng","flow":["1. Chuyên viên Văn phòng xem Báo cáo xuất nhập tồn tài sản. Hệ thống hiển thị thông tin chi tiết Báo cáo xuất nhập tồn tài sản","2. Chuyên viên Văn phòng nhập các tiêu chí lọc về xuất nhập tồn tài sản. Hệ thống truy vấn thông tin trong CSDL và hiển thị kết quả Báo cáo xuất nhập tồn tài sản theo tiêu chí lọc"],"tags":["Văn phòng"],"complexity":"simple","transactions":2,"necessity":"B","note":"Khách hàng không có nhu cầu","agreed":"Sau khi khảo sát nghiệp vụ vào tháng 03/2026"},
{"sort":15,"code":"KTH-014","parent":"KDL-I","kind":"usecase","title":"Mapping danh mục chủng loại vật tư, thiết bị giữa các hệ thống","actor":"Người dùng","flow":["1. Người dùng thực hiện mapping thủ công mã danh mục chủng loại vật tư, thiết bị giữa các hệ thống trên kho dữ liệu. Kho dữ liệu tạo mã danh mục chủng loại vật tư, thiết bị mới để mapping mã danh mục chủng loại vật tư, thiết bị giữa các hệ thống, lưu kết quả mapping và tên sau khi đã ánh xạ trên Kho dữ liệu tập trung","2. Người dùng xem kết quả gợi ý mapping danh mục. Kho dữ liệu hiển thị gợi ý mapping","3. Người dùng thực hiện xác nhận/ không xác nhận kết quả mapping theo gợi ý. Kho dữ liệu lưu kết quả mapping theo sự lựa chọn của người dùng","4. Người dùng import file mapping danh mục chủng loại vật tư, thiết bị giữa các hệ thống. Kho dữ liệu đọc file import vào lưu kết quả mapping","5. Người dùng chỉnh sửa kết quả mapping danh mục chủng loại vật tư, thiết bị giữa các hệ thống. Kho dữ liệu lưu kết quả chỉnh sửa mapping","6. Người dùng xóa kết quả mapping danh mục chủng loại vật tư, thiết bị giữa các hệ thống. Kho dữ liệu xóa kết quả mapping","7. Người dùng tìm kiếm danh mục chủng loại vật tư, thiết bị giữa các hệ thống đã được mapping. Kho dữ liệu hiển thị kết quả tìm kiếm cho người dùng"],"tags":["Kho dữ liệu"],"complexity":"medium","transactions":7,"necessity":"B","note":"Chức năng này đã được thể hiện ở chức năng mapping danh mục vật tư, thiết bị","agreed":"Sau khi khảo sát nghiệp vụ vào tháng 01/2026"},
{"sort":16,"code":"KTH-015","parent":"KDL-II","kind":"usecase","title":"Cảnh báo danh mục nhóm VTTB bị trùng","actor":"Người dùng","flow":["1. Người dùng xem danh mục nhóm VTTB bị trùng có phân trang. Hệ thống thực hiện chuyển trang theo yêu cầu"],"tags":["Kho dữ liệu"],"complexity":"simple","transactions":1,"necessity":"B","note":"Do các chức năng mapping đã bổ sung rule ràng buộc không cho phép người dùng thêm mới thông tin mappịng bị trùng nên sẽ không xảy ra trường hợp bị trùng thông tin","agreed":"Sau khi khảo sát nghiệp vụ vào tháng 01/2026"},
{"sort":17,"code":"KTH-016","parent":"KDL-II","kind":"usecase","title":"Cảnh báo danh mục chủng loại VTTB bị trùng","actor":"Người dùng","flow":["1. Người dùng xem danh mục chủng loại VTTB bị trùng có phân trang. Hệ thống thực hiện chuyển trang theo yêu cầu"],"tags":["Kho dữ liệu"],"complexity":"simple","transactions":1,"necessity":"B","note":"Do các chức năng mapping đã bổ sung rule ràng buộc không cho phép người dùng thêm mới thông tin mappịng bị trùng nên sẽ không xảy ra trường hợp bị trùng thông tin","agreed":"Sau khi khảo sát nghiệp vụ vào tháng 01/2026"},
{"sort":18,"code":"KTH-017","parent":"KDL-II","kind":"usecase","title":"Cảnh báo danh mục chủng loại VTTB chưa có mapping","actor":"Người dùng","flow":["1. Người dùng xem danh mục chủng loại VTTB chưa có mapping có phân trang. Hệ thống thực hiện chuyển trang theo yêu cầu"],"tags":["Kho dữ liệu"],"complexity":"simple","transactions":1,"necessity":"B","note":"Không thực hiện chức năng mapping danh mục chủng loại VTTB","agreed":"Sau khi khảo sát nghiệp vụ vào tháng 01/2026"},
{"sort":19,"code":"KTH-018","parent":"KDL-II","kind":"usecase","title":"Cảnh báo danh mục nhà cung cấp bị trùng","actor":"Người dùng","flow":["1. Người dùng xem danh mục nhà cung cấp bị trùng có phân trang. Hệ thống thực hiện chuyển trang theo yêu cầu"],"tags":["Kho dữ liệu"],"complexity":"simple","transactions":1,"necessity":"B","note":"Do các chức năng mapping đã bổ sung rule ràng buộc không cho phép người dùng thêm mới thông tin mappịng bị trùng nên sẽ không xảy ra trường hợp bị trùng thông tin","agreed":"Sau khi khảo sát nghiệp vụ vào tháng 01/2026"},
{"sort":20,"code":"KTH-019","parent":"KDL-II","kind":"usecase","title":"Cảnh báo danh mục nhà sản xuất bị trùng","actor":"Người dùng","flow":["1. Người dùng xem danh mục nhà sản xuất bị trùng có phân trang. Hệ thống thực hiện chuyển trang theo yêu cầu"],"tags":["Kho dữ liệu"],"complexity":"simple","transactions":1,"necessity":"B","note":"Do các chức năng mapping đã bổ sung rule ràng buộc không cho phép người dùng thêm mới thông tin mappịng bị trùng nên sẽ không xảy ra trường hợp bị trùng thông tin","agreed":"Sau khi khảo sát nghiệp vụ vào tháng 01/2026"},
{"sort":21,"code":"KTH-020","parent":"KDL-III.1","kind":"usecase","title":"Báo cáo theo dõi VTTB chưa định danh","actor":"Người dùng","flow":["1. Người dùng xem Báo cáo theo dõi VTTB chưa định danh. Hệ thống hiển thị thông tin chi tiết Báo cáo theo dõi VTTB chưa định danh","2. Người dùng nhập các tiêu chí lọc về theo dõi kế hoạch định danh. Hệ thống truy vấn thông tin trong CSDL và hiển thị kết quả Báo cáo theo dõi vật tư thiết bị chưa định danh theo tiêu chí lọc"],"tags":["Kho dữ liệu"],"complexity":"simple","transactions":2,"necessity":"B","note":"Nội dung này đã bao gồm trong báo cáo theo dõi tồn khi định danh và báo cáo tổng số VTTB trên lưới","agreed":"Sau khi khảo sát nghiệp vụ vào tháng 01/2026"},
{"sort":22,"code":"KTH-021","parent":"KDL-III.1","kind":"usecase","title":"Báo cáo chi tiết trạng thái ghi dữ liệu RFID","actor":"Người dùng","flow":["1. Người dùng xem Báo cáo chi tiết trạng thái ghi dữ liệu RFID. Hệ thống hiển thị thông tin chi tiết Báo cáo chi tiết trạng thái ghi dữ liệu RFID","2. Người dùng nhập các tiêu chí lọc về chi tiết trạng thái ghi dữ liệu RFID. Hệ thống truy vấn thông tin trong CSDL và hiển thị kết quả Báo cáo chi tiết trạng thái ghi dữ liệu RFID theo tiêu chí lọc"],"tags":["Kho dữ liệu"],"complexity":"simple","transactions":2,"necessity":"B","note":"Khách hàng không có nhu cầu thực hiện phương thức định danh RFID","agreed":"Sau khi khảo sát nghiệp vụ vào tháng 01/2026"},
{"sort":23,"code":"KTH-022","parent":"TH-I","kind":"usecase","title":"Lấy dữ liệu chủng loại VTTB","actor":"Kho dữ liệu","flow":["1. Hệ thống yêu cầu kết nối đến Kho dữ liệu. Kho dữ liệu phản hồi thông tin yêu cầu xác thực.","2. Hệ thống gửi thông tin xác thực. Kho dữ liệu xác thực thông tin và phản hồi lại kết quả kết nối: cho phép kết nối nếu xác thực thành công, từ chối mở kết nối nếu không xác thực thành công","3. Hệ thống Lấy dữ liệu chủng loại VTTB. Kho dữ liệu đẩy dữ liệu chủng loại VTTB","4. Hệ thống gửi yêu cầu đóng kết nối tới Kho dữ liệu và lưu chủng loại VTTB vào CSDL"],"tags":["Tích hợp dữ liệu"],"complexity":"medium","transactions":4,"necessity":"B","note":"Khách hàng không có nhu cầu","agreed":"Sau khi khảo sát nghiệp vụ vào tháng 01/2026"}]
$json$::jsonb) as x(sort integer, code text, parent text, kind text, title text, actor text, flow jsonb, tags jsonb,
                    complexity text, transactions integer, necessity text, note text, agreed text)
     order by sort
  loop
    v_parent := null;
    if r.parent is not null then
      select id into v_parent from public.use_cases where project_id = v_project and code = r.parent;
      if v_parent is null then
        raise exception 'Không tìm thấy use case cha % của % - hãy chạy qtvt_usecases_import.sql trước.', r.parent, r.code;
      end if;
    end if;

    insert into public.use_cases
      (project_id, parent_id, code, title, actor, main_flow, kind, tags, complexity, transactions, necessity,
       status, origin, change_note, agreed_when)
    values
      (v_project, v_parent, r.code, r.title, coalesce(r.actor, ''), array(select jsonb_array_elements_text(r.flow)),
       r.kind, array(select jsonb_array_elements_text(r.tags)), r.complexity, r.transactions, coalesce(r.necessity, 'B'),
       case when r.kind = 'usecase' then 'cancelled' else 'draft' end, 'contract', r.note, r.agreed)
    on conflict (project_id, code) do update
      set parent_id = excluded.parent_id, title = excluded.title, actor = excluded.actor, main_flow = excluded.main_flow,
          tags = excluded.tags, complexity = excluded.complexity, transactions = excluded.transactions,
          necessity = excluded.necessity, change_note = excluded.change_note, agreed_when = excluded.agreed_when
    returning (xmax = 0) into v_new;

    if v_new then n_new := n_new + 1; else n_upd := n_upd + 1; end if;
  end loop;

  raise notice 'Xong: % use case được đánh dấu nguồn gốc, % use case không thực hiện thêm mới, % cập nhật.', n_marked, n_new, n_upd;
end
$origin$;

-- Kiểm tra nhanh: kỳ vọng added = 83, adjusted = 7, contract = (còn lại), và 22 use case "cancelled".
select origin, status = 'cancelled' as khong_thuc_hien, count(*) as so_luong
  from public.use_cases
 where project_id = (select id from public.projects where code = 'GPDN_DNMB_EVNNPC_QTVT_251004') and kind = 'usecase'
 group by 1, 2
 order by 1, 2;
