-- Nhập danh sách Use Case dự án GPDN_DNMB_EVNNPC_QTVT_251004 - phần Mobile
-- Nguồn: Danh sách chức năng điều chỉnh BCC Vật tư_0508.xlsx (sheet UC sau điều chỉnh final)
-- Gồm 5 module/nhóm (kind = group) và 19 use case (kind = usecase), cây tối đa 3 cấp.
-- Sinh tự động bởi scripts/gen-usecase-import.py - đừng sửa tay, hãy sửa Excel rồi sinh lại.
--
-- Chạy SAU migration 0009_usecase_attributes.sql, trong Supabase SQL Editor.
-- An toàn khi chạy lại: khớp theo (dự án, mã); chỉ cập nhật tên/tác nhân/luồng/nhãn/độ phức tạp/transaction,
-- KHÔNG ghi đè trạng thái, tiến độ, người phụ trách, mô tả hay tiêu chí nghiệm thu đã nhập tay.
-- Hoàn tác: chạy qtvt_usecases_rollback.sql.

do $import$
declare
  v_project_code constant text := 'GPDN_DNMB_EVNNPC_QTVT_251004';
  v_project uuid;
  r record;
  v_parent uuid;
  v_new boolean;
  n_new integer := 0;
  n_upd integer := 0;
begin
  select id into v_project from public.projects where code = v_project_code;
  if v_project is null then
    raise exception 'Không tìm thấy dự án có mã %. Kiểm tra lại mã dự án.', v_project_code;
  end if;

  for r in
    select *
      from jsonb_to_recordset($json$[{"sort":46,"code":"M-I","parent":null,"kind":"group","title":"Quản lý định danh vật tư, thiết bị","actor":"","flow":[],"tags":["Mobile"],"complexity":null,"transactions":null,"necessity":"B"},
{"sort":47,"code":"M-I.2","parent":"M-I","kind":"group","title":"Quản lý định danh","actor":"","flow":[],"tags":["Mobile"],"complexity":null,"transactions":null,"necessity":"B"},
{"sort":48,"code":"UC-038","parent":"M-I.2","kind":"usecase","title":"Cập nhật serial number trên ứng dụng di động","actor":"Người dùng","flow":["1. Người dùng tìm kiếm danh sách mã định danh để gán serial number. Hệ thống hiển thị danh sách mã định danh theo điều kiện tìm kiếm","2. Người dùng nhập serial number theo từng mã định danh. Hệ thống lưu kết quả do Người dùng nhập và cập nhật trạng thái đã dán QR Code đối với VTTB được quản lý bằng QR Code hoặc trạng thái đã gắn thẻ RFID đối với VTTB được quản lý bằng RFID.","3. Người dùng chỉnh sửa serial number đã nhập. Hệ thống lưu kết quả chỉnh sửa cho Người dùng nhập","4. Người dùng tìm kiếm mã serial number đã nhập. Hệ thống hiển thị kết quả tìm kiếm theo yêu cầu của Người dùng","5. Người dùng xóa mã serial number đã nhập. Hệ thống xóa serial number theo yêu cầu của Người dùng.","6. Người dùng xem chi tiết mã serial number đã nhập. Hệ thống hiển thị thông tin chi tiết mã serial number"],"tags":["Mobile"],"complexity":"medium","transactions":6,"necessity":"B"},
{"sort":49,"code":"UC-039","parent":"M-I.2","kind":"usecase","title":"Map mã định danh giữa các phần mềm trên ứng dụng di động","actor":"Người dùng","flow":["1. Người dùng tìm kiếm danh sách mã định danh để mapping giữa các phần mềm. Hệ thống hiển thị danh sách mã định danh theo điều kiện tìm kiếm","2. Người dùng mapping mã định danh trên hệ thống với mã của VTTB trên hệ thống CMIS, PMIS, QLMBA. Hệ thống lưu kết quả do Người dùng nhập.","3. Người dùng chỉnh sửa kết quả mapping mã định danh giữa các phần mềm đã thực hiện. Hệ thống lưu kết quả chỉnh sửa cho Người dùng nhập","4. Người dùng xóa kết quả mapping. Hệ thống xóa kết quả mapping theo yêu cầu của Người dùng.","5. Người dùng xem chi tiết kết quả mapping mã định danh giữa các phần mềm. Hệ thống hiển thị thông tin chi tiết kết quả mapping","6. Người dùng tìm kiếm kết quả mapping giữa các hệ thống. Hệ thống hiển thị kết quả tìm kiếm theo yêu cầu của Người dùng","7. Người dùng xem danh sách mapping giữa các hệ thống có phân trang. Hệ thống chuyển trang theo yêu cầu."],"tags":["Mobile"],"complexity":"medium","transactions":7,"necessity":"B"},
{"sort":50,"code":"UC-040","parent":"M-I.2","kind":"usecase","title":"Quét mã QR trên ứng dụng di động","actor":"Người dùng","flow":["1. Người dùng sử dụng quét mã QR Code bằng máy quét mã vạch. Máy quét quét mã và gửi dữ liệu đến hệ thống.","2. Hệ thống tiếp nhận dữ liệu, giải mã QR Code và hiển thị thông tin cho người dùng. Người dùng xem chi tiết thông tin trên giao diện"],"tags":["Mobile"],"complexity":"simple","transactions":2,"necessity":"B"},
{"sort":51,"code":"M-I.3","parent":"M-I","kind":"group","title":"Quản lý giao dịch nhập xuất chi tiết theo mã định danh","actor":"","flow":[],"tags":["Mobile"],"complexity":null,"transactions":null,"necessity":"B"},
{"sort":52,"code":"UC-041","parent":"M-I.3","kind":"usecase","title":"Quản lý giao dịch nhập xuất chi tiết theo mã định danh trên ứng dụng di động","actor":"Người dùng","flow":["1. Người dùng nhập điều kiện tìm kiếm giao dịch nhập xuất chi tiết. Hệ thống thực hiện truy vấn thông tin trong CSDL và hiển thị danh sách giao dịch nhập xuất.","2. Người dùng Xem chi tiết giao dịch nhập xuất chi tiết. Hệ thống hiển thị chi tiết thông tin giao dịch nhập xuất chi tiết","3. Người dùng thực hiện nhập mã định danh cho VTTB trong giao dịch nhập xuất. Hệ thống lưu thông tin do Người dùng nhập.","4. Người dùng thực hiện chỉnh sửa mã định danh cho VTTTB trong giao dịch nhập xuất. Hệ thống lưu thông tin do Người dùng chỉnh sửa","5. Người dùng thực hiện xem chi tiết mã định danh cho VTTB trong giao dịch nhập, xuất. Hệ thống hiển thị thông tin chi tiết cho người dùng.","6. Người dùng xóa mã định danh cho VTTB trong giao dịch nhập xuất. Hệ thống thực hiện xóa theo yêu cầu người dùng","7. Người dùng tìm kiếm mã định danh của VTTB trong giao dịch nhập xuất. Hệ thống tìm kiếm và hiển thị thông tin cho Người dùng."],"tags":["Mobile"],"complexity":"medium","transactions":7,"necessity":"B"},
{"sort":53,"code":"UC-042","parent":"M-I.3","kind":"usecase","title":"Nhập xuất chi tiết bằng mã QR trên ứng dụng di động","actor":"Người dùng","flow":["1. Người dùng quét mã QR trên VTTB cần nhập/xuất kho. Máy quét mã vạch thực hiện quét mã và gửi dữ liệu đến hệ thống.","2. Hệ thống nhận dữ liệu và kiểm tra thông tin và hiển thị thông tin chi tiết cho Người dùng. Người dùng xem chi tiết thông tin và xác nhận VTTB cần nhập/ xuất kho.","3. Hệ thống lưu thông tin do Người dùng xác nhận trong CSDL và hiển thị kết quả nhập/xuất kho cho Người dùng. Người dùng xem thông tin kết quả nhập/ xuất kho.","4. Hệ thống lưu lại lịch sử nhập/ xuất kho"],"tags":["Mobile"],"complexity":"medium","transactions":4,"necessity":"B"},
{"sort":54,"code":"M-II","parent":null,"kind":"group","title":"Quản lý hồ sơ vật tư, thiết bị trên ứng dụng di động","actor":"","flow":[],"tags":["Mobile"],"complexity":null,"transactions":null,"necessity":"B"},
{"sort":55,"code":"UC-043","parent":"M-II","kind":"usecase","title":"Tìm kiếm và xem danh sách hồ sơ vật tư, thiết bị","actor":"Người dùng","flow":["1. Người dùng tìm kiếm và xem danh sách hồ sơ vật tư, thiết bị. Hệ thống hiển thị danh sách hồ sơ vật tư thiết bị theo điều kiện tìm kiếm"],"tags":["Mobile"],"complexity":"simple","transactions":1,"necessity":"B"},
{"sort":56,"code":"UC-044","parent":"M-II","kind":"usecase","title":"Chỉnh sửa thông tin Hồ sơ vật tư, thiết bị","actor":"Người dùng","flow":["1. Người dùng chỉnh sửa thông tin một vật tư, thiết bị. Hệ thống lưu thông tin chỉnh sửa của vật tư, thiết bị"],"tags":["Mobile"],"complexity":"simple","transactions":1,"necessity":"B"},
{"sort":57,"code":"UC-045","parent":"M-II","kind":"usecase","title":"Xem thông tin Hồ sơ vật tư, thiết bị - thông tin chung","actor":"Người dùng","flow":["1. Người dùng xem chi tiết thông tin chung của một vật tư, thiết bị. Hệ thống hiển thị chi tiết về thông tin chung của vật tư, thiết bị"],"tags":["Mobile"],"complexity":"simple","transactions":1,"necessity":"B"},
{"sort":58,"code":"UC-046","parent":"M-II","kind":"usecase","title":"Xem thông tin Hồ sơ vật tư, thiết bị - hợp đồng","actor":"Người dùng","flow":["1. Người dùng xem chi tiết hợp đồng của một vật tư, thiết bị. Hệ thống hiển thị chi tiết về hợp đồng của vật tư, thiết bị"],"tags":["Mobile"],"complexity":"simple","transactions":1,"necessity":"B"},
{"sort":59,"code":"UC-047","parent":"M-II","kind":"usecase","title":"Xem thông tin Hồ sơ vật tư, thiết bị - thông tin tồn kho","actor":"Người dùng","flow":["1. Người dùng xem chi tiết thông tin tồn kho của một vật tư, thiết bị. Hệ thống hiển thị chi tiết về thông tin kho của vật tư, thiết bị"],"tags":["Mobile"],"complexity":"simple","transactions":1,"necessity":"B"},
{"sort":60,"code":"UC-048","parent":"M-II","kind":"usecase","title":"Xem thông tin Hồ sơ vật tư, thiết bị - Lịch sử điều chuyển","actor":"Người dùng","flow":["1. Người dùng tìm kiếm lịch sử điều chuyển của vật tư, thiết bị. Hệ thống tìm kiếm và trả kết quả cho người dùng","2. Người dùng xem danh sách lịch sử điều chuyển có phân trang. Hệ thống thực hiện chuyển trang theo yêu cầu","3. Người dùng xem chi tiết lịch sử điều chuyển của một vật tư, thiết bị. Hệ thống hiển thị chi tiết về lịch sử điều chuyển của vật tư, thiết bị"],"tags":["Mobile"],"complexity":"simple","transactions":3,"necessity":"B"},
{"sort":61,"code":"UC-049","parent":"M-II","kind":"usecase","title":"Xem thông tin vật tư, thiết bị - thông tin Kế toán","actor":"Người dùng","flow":["1. Người dùng xem chi tiết thông tin Kế toáncủa một vật tư, thiết bị. Hệ thống hiển thị chi tiết về Kế toán của vật tư, thiết bị bao gồm: Nguyên giá, khấu hao, giá trị thanh lý"],"tags":["Mobile"],"complexity":"simple","transactions":1,"necessity":"B"},
{"sort":62,"code":"UC-050","parent":"M-II","kind":"usecase","title":"Xem thông tin Hồ sơ vật tư, thiết bị - thông tin vận hành","actor":"Người dùng","flow":["1. Người dùng tìm kiếm thông tin vận hành của vật tư, thiết bị. Hệ thống tìm kiếm và trả kết quả cho người dùng","2. Người dùng xem chi tiết thông tin vận hành của một vật tư, thiết bị. Hệ thống hiển thị chi tiết về Vận hành của vật tư, thiết bị bao gồm: + Vị trí, + Thông số kỹ thuật, + Thông số vận hành, + Lịch sử lắp đặt, + Lịch sử kiểm tra, thí nghiệm, + Thông tin sửa chữa, + Thông tin sự cố"],"tags":["Mobile"],"complexity":"simple","transactions":2,"necessity":"B"},
{"sort":63,"code":"M-III","parent":null,"kind":"group","title":"Cảnh báo","actor":"","flow":[],"tags":["Mobile"],"complexity":null,"transactions":null,"necessity":"B"},
{"sort":64,"code":"UC-051","parent":"M-III","kind":"usecase","title":"Cảnh báo mã định danh chưa được dán","actor":"Người dùng","flow":["1. Người dùng xem mã định danh chưa được dán có phân trang. Hệ thống thực hiện chuyển trang theo yêu cầu"],"tags":["Mobile"],"complexity":"simple","transactions":1,"necessity":"B"},
{"sort":65,"code":"UC-052","parent":"M-III","kind":"usecase","title":"Cảnh báo kế hoạch định danh chưa hoàn thành","actor":"Người dùng","flow":["1. Người dùng xem kế hoạch định danh chưa hoàn thành có phân trang. Hệ thống thực hiện chuyển trang theo yêu cầu"],"tags":["Mobile"],"complexity":"simple","transactions":1,"necessity":"B"},
{"sort":66,"code":"UC-053","parent":"M-III","kind":"usecase","title":"Cảnh báo mã định danh chưa mapping","actor":"Người dùng","flow":["1. Người dùng xem mã định danh chưa mapping có phân trang. Hệ thống thực hiện chuyển trang theo yêu cầu"],"tags":["Mobile"],"complexity":"simple","transactions":1,"necessity":"B"},
{"sort":67,"code":"UC-054","parent":"M-III","kind":"usecase","title":"Cảnh báo thiết bị đã nhập trên ERP nhưng quá hạn chưa được định danh","actor":"Người dùng","flow":["1. Người dùng xem thiết bị đã nhập trên ERP nhưng quá hạn chưa được định danh có phân trang. Hệ thống thực hiện chuyển trang theo yêu cầu"],"tags":["Mobile"],"complexity":"simple","transactions":1,"necessity":"B"},
{"sort":68,"code":"UC-055","parent":"M-III","kind":"usecase","title":"Cảnh báo vật tư đã xuất kho nhưng chưa được treo tháo","actor":"Người dùng","flow":["1. Người dùng xem vật tư đã xuất kho nhưng chưa được treo tháo có phân trang. Hệ thống thực hiện chuyển trang theo yêu cầu"],"tags":["Mobile"],"complexity":"simple","transactions":1,"necessity":"B"},
{"sort":69,"code":"UC-056","parent":"M-III","kind":"usecase","title":"Cảnh báo thiết bị xuống lưới nhưng không nhập kho","actor":"Người dùng","flow":["1. Người dùng xem thiết bị xuống lưới nhưng không nhập kho có phân trang. Hệ thống thực hiện chuyển trang theo yêu cầu"],"tags":["Mobile"],"complexity":"simple","transactions":1,"necessity":"B"}]
$json$::jsonb)
        as x(sort integer, code text, parent text, kind text, title text, actor text, flow jsonb, tags jsonb,
             complexity text, transactions integer, necessity text)
     order by sort
  loop
    v_parent := null;
    if r.parent is not null then
      select id into v_parent from public.use_cases where project_id = v_project and code = r.parent;
      if v_parent is null then
        raise exception 'Không tìm thấy use case cha % của %', r.parent, r.code;
      end if;
    end if;

    insert into public.use_cases
      (project_id, parent_id, code, title, actor, main_flow, kind, tags, complexity, transactions, necessity)
    values
      (v_project, v_parent, r.code, r.title, coalesce(r.actor, ''),
       array(select jsonb_array_elements_text(r.flow)),
       r.kind, array(select jsonb_array_elements_text(r.tags)), r.complexity, r.transactions, coalesce(r.necessity, 'B'))
    on conflict (project_id, code) do update
      set parent_id = excluded.parent_id,
          title = excluded.title,
          actor = excluded.actor,
          main_flow = excluded.main_flow,
          kind = excluded.kind,
          tags = excluded.tags,
          complexity = excluded.complexity,
          transactions = excluded.transactions,
          necessity = excluded.necessity
    returning (xmax = 0) into v_new;

    if v_new then n_new := n_new + 1; else n_upd := n_upd + 1; end if;
  end loop;

  raise notice 'Nhập xong: % use case/nhóm mới, % cập nhật.', n_new, n_upd;
end
$import$;

-- Kiểm tra nhanh: kỳ vọng 5 nhóm và 19 use case.
select kind, count(*) as so_luong
  from public.use_cases
 where project_id = (select id from public.projects where code = 'GPDN_DNMB_EVNNPC_QTVT_251004')
   and code in ('M-I', 'M-I.2', 'UC-038', 'UC-039', 'UC-040', 'M-I.3', 'UC-041', 'UC-042', 'M-II', 'UC-043', 'UC-044', 'UC-045', 'UC-046', 'UC-047', 'UC-048', 'UC-049', 'UC-050', 'M-III', 'UC-051', 'UC-052', 'UC-053', 'UC-054', 'UC-055', 'UC-056')
 group by kind
 order by kind;
