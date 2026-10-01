-- Omni Project Manager - 0003: hàm RPC cho frontend + dữ liệu demo.

-- Thêm thành viên vào dự án theo email (người đó phải đã đăng ký tài khoản).
create function public.add_project_member(p_project uuid, p_email text, p_role text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid;
begin
  if not public.can_manage_project(p_project) then
    raise exception 'Bạn không có quyền quản lý thành viên của dự án này' using errcode = '42501';
  end if;
  if p_role not in ('pm', 'developer', 'qa', 'viewer') then
    raise exception 'Vai trò không hợp lệ: %', p_role using errcode = '22023';
  end if;
  select id into uid from public.profiles where lower(email) = lower(trim(p_email));
  if uid is null then
    raise exception 'Chưa có tài khoản với email này. Hãy yêu cầu họ đăng ký trước.' using errcode = 'P0002';
  end if;
  insert into public.project_members (project_id, user_id, role)
  values (p_project, uid, p_role)
  on conflict (project_id, user_id) do update set role = excluded.role;
end
$$;

-- Gửi nhắc deadline thủ công cho người phụ trách (hoặc PM nếu task chưa giao).
create function public.send_task_reminder(p_task uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  t public.tasks;
  recipient uuid;
  recipient_name text;
  sender_name text;
begin
  select * into t from public.tasks where id = p_task;
  if not found then
    raise exception 'Không tìm thấy nhiệm vụ' using errcode = 'P0002';
  end if;
  if not public.can_manage_project(t.project_id) then
    raise exception 'Chỉ quản trị viên hoặc PM mới được gửi nhắc việc' using errcode = '42501';
  end if;
  recipient := coalesce(t.assignee_id, (select manager_id from public.projects where id = t.project_id));
  if recipient is null then
    raise exception 'Nhiệm vụ chưa có người phụ trách' using errcode = 'P0002';
  end if;
  select name into recipient_name from public.profiles where id = recipient;
  select name into sender_name from public.profiles where id = auth.uid();
  insert into public.notifications (user_id, project_id, type, title, message, task_id)
  values (
    recipient, t.project_id, 'deadline_warning',
    'Nhắc việc gửi tới ' || coalesce(recipient_name, 'thành viên'),
    coalesce(sender_name, 'Quản trị viên') || ' đã gửi nhắc nhở deadline nhiệm vụ "' || t.title
      || '" (Hạn chót: ' || to_char(t.due_date, 'YYYY-MM-DD') || ').',
    t.id
  );
end
$$;

-- Nạp 3 dự án demo (Omni-Bank, E-Shop B2B, TeleHealth). Người gọi (hoặc p_owner) làm PM + người phụ trách.
-- Chạy từ SQL Editor:  select public.seed_demo_data();
-- Ngày tháng tính tương đối theo hôm nay để luôn có task quá hạn / sắp đến hạn cho demo.
create function public.seed_demo_data(p_owner uuid default null)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  owner_id uuid;
  owner_label text;
  p1 uuid; p2 uuid; p3 uuid;
  uc1 uuid; uc2 uuid; uc3 uuid; uc4 uuid; uc5 uuid;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'Chỉ quản trị viên mới được nạp dữ liệu demo' using errcode = '42501';
  end if;
  owner_id := coalesce(p_owner, auth.uid(), (select id from public.profiles where is_admin order by created_at limit 1));
  if owner_id is null then
    raise exception 'Chưa có tài khoản nào. Hãy đăng ký một tài khoản trước rồi chạy lại.';
  end if;
  if exists (select 1 from public.projects where code in ('OMNI-BANK', 'E-SHOP-B2B', 'TELE-HEALTH')) then
    return 'Dữ liệu demo đã tồn tại, bỏ qua.';
  end if;
  select name || case when is_admin then ' (ADMIN)' else ' (PM)' end into owner_label
    from public.profiles where id = owner_id;

  perform set_config('app.seeding', 'on', true);

  -- Dự án (trigger tự gán PM + nhân bản checklist mẫu)
  insert into public.projects (code, name, description, status, priority, manager_id, created_by, start_date, target_end_date, budget, current_phase)
  values ('OMNI-BANK', 'Hệ Thống Ngân Hàng Số Omni-Channel',
          'Nền tảng Internet Banking & Mobile Banking thế hệ mới hỗ trợ thanh toán tức thì, định danh điện tử eKYC và bảo mật đa lớp sinh trắc học.',
          'in_progress', 'urgent', owner_id, owner_id, today - 60, today + 45, 1850000000, 'phase_3')
  returning id into p1;
  insert into public.projects (code, name, description, status, priority, manager_id, created_by, start_date, target_end_date, budget, current_phase)
  values ('E-SHOP-B2B', 'Sàn Thương Mại Điện Tử & Phân Phối B2B',
          'Cổng giao dịch kết nối nhà sản xuất với đại lý bán sỉ, tích hợp quản lý kho ERP, hạn mức tín dụng và tính thuế tự động.',
          'in_progress', 'high', owner_id, owner_id, today - 78, today + 24, 920000000, 'phase_4')
  returning id into p2;
  insert into public.projects (code, name, description, status, priority, manager_id, created_by, start_date, target_end_date, budget, current_phase)
  values ('TELE-HEALTH', 'Hệ Thống Y Tế & Khám Bệnh Trực Tuyến TeleHealth',
          'Hồ sơ bệnh án điện tử tập trung, đặt lịch khám bác sĩ chuyên khoa, tư vấn video trực tuyến và đơn thuốc điện tử.',
          'planning', 'medium', owner_id, owner_id, today - 11, today + 121, 1250000000, 'phase_2')
  returning id into p3;

  -- Use case + tiêu chí nghiệm thu
  insert into public.use_cases (project_id, code, title, actor, description, priority, status, progress_percent, main_flow, alternate_flow, assigned_to, updated_at)
  values (p1, 'UC-OB-01', 'Đăng ký tài khoản và Định danh điện tử (eKYC)', 'Khách hàng cá nhân',
          'Cho phép khách hàng mở mới tài khoản thanh toán từ xa thông qua ứng dụng di động mà không cần đến quầy giao dịch.',
          'urgent', 'developing', 75,
          array['1. Khách hàng nhập số điện thoại và xác thực OTP qua SMS',
                '2. Chụp ảnh 2 mặt Căn cước công dân gắn chip',
                '3. Ứng dụng quét thông tin OCR và kiểm tra tính hợp lệ',
                '4. Thực hiện quét khuôn mặt sinh trắc học theo hướng dẫn (quay trái, phải, chớp mắt)',
                '5. Hệ thống đối chiếu dữ liệu với Cơ sở dữ liệu quốc gia về dân cư',
                '6. Khách hàng thiết lập mật khẩu, mã PIN giao dịch và hoàn tất kích hoạt'],
          array['3a. Ảnh giấy tờ mờ hoặc lóa sáng: Hệ thống yêu cầu chụp lại',
                '4a. Nhận diện khuôn mặt thất bại quá 3 lần: Chuyển sang luồng Video Call xác minh với điện thoại viên',
                '5a. Số định danh đã tồn tại: Thông báo đăng nhập hoặc khôi phục tài khoản'],
          owner_id, now() - interval '2 days')
  returning id into uc1;
  insert into public.use_cases (project_id, code, title, actor, description, priority, status, progress_percent, main_flow, alternate_flow, assigned_to, updated_at)
  values (p1, 'UC-OB-02', 'Chuyển tiền nhanh liên ngân hàng Napas 24/7 & VietQR', 'Khách hàng đã đăng nhập',
          'Thực hiện lệnh chuyển tiền ngay lập tức tới tài khoản tại hơn 50 ngân hàng thành viên qua số tài khoản hoặc mã VietQR.',
          'urgent', 'developing', 60,
          array['1. Người dùng chọn tính năng Chuyển tiền hoặc Quét mã VietQR',
                '2. Nhập/quét thông tin ngân hàng thụ hưởng và số tài khoản',
                '3. Hệ thống tự động truy vấn tên chủ tài khoản thụ hưởng hiển thị xác nhận',
                '4. Nhập số tiền và nội dung chuyển tiền',
                '5. Xác thực giao dịch bằng Sinh trắc học (Smart OTP / FaceID)',
                '6. Tiền được trừ khỏi tài khoản nguồn và ghi có tài khoản thụ hưởng',
                '7. Hiển thị biên lai giao dịch thành công và gửi thông báo biến động số dư'],
          array['3a. Ngân hàng thụ hưởng bảo trì hoặc lỗi kết nối: Báo lỗi và gợi ý chuyển thường',
                '4a. Số dư khả dụng không đủ: Báo lỗi số dư và chặn tiếp tục',
                '5a. Sai Smart OTP 3 lần: Khóa tạm thời tính năng chuyển tiền trong 15 phút'],
          owner_id, now() - interval '3 days')
  returning id into uc2;
  insert into public.use_cases (project_id, code, title, actor, description, priority, status, progress_percent, main_flow, assigned_to, updated_at)
  values (p1, 'UC-OB-03', 'Quản lý Thẻ tín dụng & Thanh toán hóa đơn tự động', 'Chủ thẻ ngân hàng',
          'Xem sao kê hàng tháng, khóa/mở khóa thẻ tức thì, kích hoạt chi tiêu quốc tế và đặt lịch thanh toán tiền điện nước tự động.',
          'medium', 'approved', 40,
          array['1. Chọn thẻ trong danh sách thẻ của tôi',
                '2. Xem hạn mức còn lại, sao kê chu kỳ gần nhất',
                '3. Bật/tắt thanh toán trực tuyến hoặc đổi mã PIN thẻ online',
                '4. Cấu hình trích nợ tự động ngày đến hạn sao kê'],
          owner_id, now() - interval '11 days')
  returning id into uc3;
  insert into public.use_cases (project_id, code, title, actor, description, priority, status, progress_percent, main_flow, assigned_to, updated_at)
  values (p2, 'UC-ES-01', 'Đặt hàng theo lô (Bulk Order) và xét duyệt công nợ đại lý', 'Đại lý phân phối cấp 1',
          'Nhập file Excel đơn hàng sỉ hoặc chọn danh mục chiết khấu theo số lượng, áp dụng chính sách công nợ 30 ngày.',
          'high', 'tested', 90,
          array['1. Tải lên danh sách mã sản phẩm và số lượng đặt mua',
                '2. Hệ thống kiểm tra tồn kho sẵn sàng tại các chi nhánh',
                '3. Tự động tính tỷ lệ chiết khấu thương mại và thuế GTGT',
                '4. Kiểm tra hạn mức tín dụng công nợ còn lại của đại lý',
                '5. Tạo đơn đặt hàng và gửi thông báo phê duyệt tới quản lý bán hàng'],
          owner_id, now() - interval '4 days')
  returning id into uc4;
  insert into public.use_cases (project_id, code, title, actor, description, priority, status, progress_percent, main_flow, assigned_to, updated_at)
  values (p3, 'UC-TH-01', 'Đặt lịch khám video trực tuyến với Bác sĩ chuyên khoa', 'Bệnh nhân',
          'Tìm kiếm bác sĩ theo chuyên khoa, chọn khung giờ trống và thanh toán phí khám trước buổi hẹn.',
          'high', 'in_review', 30,
          array['1. Bệnh nhân chọn chuyên khoa và bác sĩ cần khám',
                '2. Chọn khung giờ rảnh trong lịch công tác của bác sĩ',
                '3. Mô tả triệu chứng lâm sàng và đính kèm hồ sơ xét nghiệm trước đó',
                '4. Thanh toán phí tư vấn trực tuyến',
                '5. Nhận đường dẫn phòng khám bảo mật WebRTC và mã nhắc hẹn'],
          owner_id, now() - interval '6 days')
  returning id into uc5;

  insert into public.acceptance_criteria (use_case_id, sort, description, completed) values
    (uc1, 1, 'Độ chính xác nhận diện OCR tiếng Việt đạt trên 98%', true),
    (uc1, 2, 'Chống giả mạo hình ảnh tĩnh / màn hình video (Anti-spoofing) thành công', true),
    (uc1, 3, 'Thời gian phản hồi toàn trình xác thực không quá 5 giây', false),
    (uc1, 4, 'Lưu vết lịch sử kiểm tra đầy đủ vào bảng Audit Log bảo mật', true),
    (uc2, 1, 'Tự động kiểm tra tra cứu đúng tên người nhận trong vòng 1.5s', true),
    (uc2, 2, 'Hạn mức giao dịch tuân thủ đúng phân loại tài khoản theo Thông tư NHNN', true),
    (uc2, 3, 'Đảm bảo tính nhất quán dữ liệu kép (ACID Transaction) khi có lỗi mạng', false),
    (uc3, 1, 'Khóa thẻ khẩn cấp phản hồi dưới 1 giây', true),
    (uc3, 2, 'Thông báo nhắc nhở sao kê trước 5 ngày qua Push Notification', false),
    (uc4, 1, 'Hỗ trợ tải lên file Excel đến 1,000 dòng trong vòng 3 giây', true),
    (uc4, 2, 'Chặn đặt hàng nếu công nợ quá hạn chưa thanh toán', true),
    (uc4, 3, 'Sinh biên bản xác nhận đặt hàng có mã vạch định danh', true),
    (uc5, 1, 'Tự động đồng bộ lịch vào Google Calendar/Apple Calendar', false),
    (uc5, 2, 'Bảo mật dữ liệu đường truyền video mã hóa đầu cuối (E2EE)', false);

  -- Nhiệm vụ (assignee = người nạp demo; hạn chót tính theo hôm nay)
  insert into public.tasks (project_id, code, title, description, status, priority, assignee_id, phase, estimated_hours, actual_hours, start_date, due_date, tags, use_case_id) values
    (p1, 'OB-101', 'Tích hợp Module Xác thực sinh trắc học eKYC và CCCD gắn chip',
     'Xây dựng API kết nối cổng dịch vụ xác thực căn cước công dân bộ Công An và nhận diện khuôn mặt Liveness Detection.',
     'in_progress', 'urgent', owner_id, 'Giai đoạn 3: Phát triển', 40, 26, today - 7, today + 1, array['Security', 'eKYC', 'Backend'], uc1),
    (p1, 'OB-102', 'Xây dựng dịch vụ Chuyển tiền nhanh NAPAS 24/7 qua mã QR VietQR',
     'Xử lý luồng tạo mã QR động kèm nội dung thanh toán và xử lý webhook xác nhận số dư tài khoản thời gian thực.',
     'in_progress', 'high', owner_id, 'Giai đoạn 3: Phát triển', 32, 18, today - 6, today + 3, array['Payment', 'NAPAS', 'VietQR'], uc2),
    (p1, 'OB-103', 'Thực hiện kiểm thử xâm nhập bảo mật (Penetration Test) chuẩn PCI-DSS',
     'Kiểm toán an ninh mạng, quét lỗ hổng SQLi, XSS, CSRF, đánh giá mã hóa JWT và khóa lưu trữ HSM.',
     'todo', 'urgent', owner_id, 'Giai đoạn 4: Kiểm thử', 35, 0, today - 3, today - 1, array['Security', 'Audit', 'PCI-DSS'], uc1),
    (p1, 'OB-104', 'Thiết kế giao diện Dark Mode màn hình tổng quan tài khoản khách hàng',
     'Hoàn thiện hệ thống icon chuẩn thiết kế Figma, bảng màu tương phản AA và tối ưu hiển thị trên màn hình OLED.',
     'review', 'medium', owner_id, 'Giai đoạn 3: Phát triển', 20, 22, today - 16, today + 2, array['UI/UX', 'Mobile', 'Design'], uc3),
    (p1, 'OB-105', 'Hoàn thiện tài liệu kiến trúc kỹ thuật microservices và phân rã cơ sở dữ liệu',
     'Đặc tả giao thức gRPC nội bộ, Event-driven Kafka message queue và cơ chế phân vùng dữ liệu tài khoản.',
     'done', 'high', owner_id, 'Giai đoạn 2: Phân tích & Thiết kế', 45, 42, today - 52, today - 21, array['Architecture', 'Docs'], uc1),
    (p2, 'ES-201', 'Kiểm thử tải đồng thời (Load Test 10,000 CCU) trong chiến dịch Flash Sale',
     'Mô phỏng áp lực mua hàng đồng thời với Apache JMeter và kiểm tra độ trễ khóa dữ liệu kho.',
     'in_progress', 'urgent', owner_id, 'Giai đoạn 4: Kiểm thử', 24, 16, today - 4, today, array['QA', 'Performance', 'JMeter'], uc4),
    (p2, 'ES-202', 'Tích hợp cổng thanh toán doanh nghiệp và xuất hóa đơn điện tử VNPT',
     'Kết nối API tạo e-Invoice tự động khi đơn hàng B2B được phê duyệt thanh toán.',
     'done', 'high', owner_id, 'Giai đoạn 3: Phát triển', 30, 28, today - 30, today - 11, array['Invoice', 'B2B', 'ERP'], uc4),
    (p3, 'TH-301', 'Khảo sát và chuẩn hóa biểu mẫu bệnh án điện tử chuẩn HL7/FHIR',
     'Làm việc với hội đồng bác sĩ chuyên khoa để chuẩn hóa dữ liệu tiền sử bệnh và kết quả cận lâm sàng.',
     'in_progress', 'high', owner_id, 'Giai đoạn 2: Phân tích & Thiết kế', 50, 24, today - 10, today + 9, array['Medical', 'HL7', 'Requirements'], uc5);

  -- Trạng thái checklist chất lượng (bản mẫu đã được nhân bản bởi trigger)
  update public.quality_items q
     set is_passed = v.passed,
         checked_by = case when v.passed then owner_label end,
         checked_at = case when v.passed then today + v.off end,
         notes = v.note
    from (values
      ('phase_1', 1, true,  -57, 'Đã ký kết hợp đồng tài trợ và cam kết mốc tiến độ.'),
      ('phase_1', 2, true,  -55, 'Ngân sách 1.85 tỷ đã được thẩm định.'),
      ('phase_1', 3, true,  -53, null),
      ('phase_2', 1, true,  -34, 'Đã chốt toàn bộ 18 Use Case nghiệp vụ ngân hàng.'),
      ('phase_2', 2, true,  -29, 'Thông qua hội đồng kiến trúc phần mềm.'),
      ('phase_2', 3, true,  -26, null),
      ('phase_2', 4, true,  -23, null),
      ('phase_3', 1, false,   0, 'Hiện tại đạt 74.5%. Cần bổ sung test case cho module eKYC và webhook NAPAS.'),
      ('phase_3', 2, true,   -3, null),
      ('phase_3', 3, true,   -6, null),
      ('phase_3', 4, true,   -9, null),
      ('phase_4', 1, false,   0, 'Đang triển khai thực hiện (tiến độ 65%).'),
      ('phase_4', 2, false,   0, 'Còn 1 lỗi pending liên quan đến timeout cổng NAPAS.'),
      ('phase_4', 3, false,   0, 'Lịch chạy test sắp tới, chờ chốt môi trường.'),
      ('phase_4', 4, false,   0, 'Đơn vị bảo mật bên ngoài đang tiến hành quét.'),
      ('phase_5', 1, false,   0, 'Dự kiến sau khi hoàn tất kiểm thử QA.')
    ) as v(phase_key, sort, passed, off, note)
   where q.project_id = p1 and q.phase_key = v.phase_key and q.sort = v.sort;

  update public.quality_items
     set is_passed = true, checked_by = owner_label, checked_at = today - 30
   where project_id = p2 and phase_key in ('phase_1', 'phase_2', 'phase_3');
  update public.quality_items
     set is_passed = true, checked_by = owner_label, checked_at = today - 9
   where project_id = p3 and phase_key = 'phase_1';

  perform set_config('app.seeding', 'off', true);
  return 'Đã nạp 3 dự án demo cho ' || owner_label;
end
$$;

revoke execute on function public.seed_demo_data(uuid) from public, anon, authenticated;
grant execute on function public.seed_demo_data(uuid) to authenticated;
grant execute on function public.add_project_member(uuid, text, text) to authenticated;
grant execute on function public.send_task_reminder(uuid) to authenticated;
revoke execute on function public.add_project_member(uuid, text, text) from public, anon;
revoke execute on function public.send_task_reminder(uuid) from public, anon;
