import { User, Project, Task, UseCase, QualityGatePhase, ProjectQualityGates } from '../types';

export const INITIAL_USERS: User[] = [
  {
    id: 'user-admin',
    name: 'Nguyễn Tuấn Minh',
    email: 'quan.ntm194@gmail.com',
    avatarColor: 'bg-indigo-600',
    role: 'admin',
    department: 'Ban Giám Đốc Công Nghệ (CTO Office)'
  },
  {
    id: 'user-pm',
    name: 'Trần Mai Phương',
    email: 'mai.phuong@omnicorp.vn',
    avatarColor: 'bg-emerald-600',
    role: 'pm',
    department: 'Ban Quản Trị Dự Án (PMO)'
  },
  {
    id: 'user-dev',
    name: 'Lê Hoàng Long',
    email: 'long.le@omnicorp.vn',
    avatarColor: 'bg-blue-600',
    role: 'developer',
    department: 'Khối Kỹ Thuật & Phát Triển Phần Mềm'
  },
  {
    id: 'user-qa',
    name: 'Đỗ Bích Ngọc',
    email: 'ngoc.do@omnicorp.vn',
    avatarColor: 'bg-amber-600',
    role: 'qa',
    department: 'Trung Tâm Đảm Bảo Chất Lượng (QA/QC)'
  },
  {
    id: 'user-viewer',
    name: 'Phạm Đình Vũ',
    email: 'vu.pham@khachhang.vn',
    avatarColor: 'bg-slate-600',
    role: 'viewer',
    department: 'Hội đồng Nghiệm thu & Khách hàng'
  }
];

export const INITIAL_PROJECTS: Project[] = [
  {
    id: 'proj-1',
    code: 'OMNI-BANK',
    name: 'Hệ Thống Ngân Hàng Số Omni-Channel',
    description: 'Nền tảng Internet Banking & Mobile Banking thế hệ mới hỗ trợ thanh toán tức thì, định danh điện tử eKYC và bảo mật đa lớp sinh trắc học.',
    status: 'in_progress',
    priority: 'urgent',
    managerId: 'user-pm',
    startDate: '2026-08-01',
    targetEndDate: '2026-11-15',
    budget: 1850000000,
    progressPercent: 68,
    currentPhase: 'phase_3',
    memberIds: ['user-admin', 'user-pm', 'user-dev', 'user-qa', 'user-viewer']
  },
  {
    id: 'proj-2',
    code: 'E-SHOP-B2B',
    name: 'Sàn Thương Mại Điện Tử & Phân Phối B2B',
    description: 'Cổng giao dịch kết nối nhà sản xuất với đại lý bán sỉ, tích hợp quản lý kho ERP, hạn mức tín dụng và tính thuế tự động.',
    status: 'in_progress',
    priority: 'high',
    managerId: 'user-pm',
    startDate: '2026-07-15',
    targetEndDate: '2026-10-25',
    budget: 920000000,
    progressPercent: 82,
    currentPhase: 'phase_4',
    memberIds: ['user-admin', 'user-pm', 'user-dev', 'user-qa']
  },
  {
    id: 'proj-3',
    code: 'TELE-HEALTH',
    name: 'Hệ Thống Y Tế & Khám Bệnh Trực Tuyến TeleHealth',
    description: 'Hồ sơ bệnh án điện tử tập trung, đặt lịch khám bác sĩ chuyên khoa, tư vấn video trực tuyến và đơn thuốc điện tử.',
    status: 'planning',
    priority: 'medium',
    managerId: 'user-admin',
    startDate: '2026-09-20',
    targetEndDate: '2027-01-30',
    budget: 1250000000,
    progressPercent: 24,
    currentPhase: 'phase_2',
    memberIds: ['user-admin', 'user-pm', 'user-dev']
  }
];

export const INITIAL_TASKS: Task[] = [
  // Tasks for OMNI-BANK
  {
    id: 'task-101',
    projectId: 'proj-1',
    code: 'OB-101',
    title: 'Tích hợp Module Xác thực sinh trắc học eKYC và CCCD gắn chip',
    description: 'Xây dựng API kết nối cổng dịch vụ xác thực căn cước công dân bộ Công An và nhận diện khuôn mặt Liveness Detection.',
    status: 'in_progress',
    priority: 'urgent',
    assigneeId: 'user-dev',
    phase: 'Giai đoạn 3: Phát triển',
    estimatedHours: 40,
    actualHours: 26,
    startDate: '2026-09-24',
    dueDate: '2026-10-02', // Approaching deadline!
    tags: ['Security', 'eKYC', 'Backend'],
    useCaseId: 'uc-1'
  },
  {
    id: 'task-102',
    projectId: 'proj-1',
    code: 'OB-102',
    title: 'Xây dựng dịch vụ Chuyển tiền nhanh NAPAS 24/7 qua mã QR VietQR',
    description: 'Xử lý luồng tạo mã QR động kèm nội dung thanh toán và xử lý webhook xác nhận số dư tài khoản thời gian thực.',
    status: 'in_progress',
    priority: 'high',
    assigneeId: 'user-dev',
    phase: 'Giai đoạn 3: Phát triển',
    estimatedHours: 32,
    actualHours: 18,
    startDate: '2026-09-25',
    dueDate: '2026-10-04',
    tags: ['Payment', 'NAPAS', 'VietQR'],
    useCaseId: 'uc-2'
  },
  {
    id: 'task-103',
    projectId: 'proj-1',
    code: 'OB-103',
    title: 'Thực hiện kiểm thử xâm nhập bảo mật (Penetration Test) chuẩn PCI-DSS',
    description: 'Kiểm toán an ninh mạng, quét lỗ hổng SQLi, XSS, CSRF, đánh giá mã hóa JWT và khóa lưu trữ HSM.',
    status: 'todo',
    priority: 'urgent',
    assigneeId: 'user-qa',
    phase: 'Giai đoạn 4: Kiểm thử',
    estimatedHours: 35,
    actualHours: 0,
    startDate: '2026-09-28',
    dueDate: '2026-09-30', // Overdue!
    tags: ['Security', 'Audit', 'PCI-DSS'],
    useCaseId: 'uc-1'
  },
  {
    id: 'task-104',
    projectId: 'proj-1',
    code: 'OB-104',
    title: 'Thiết kế giao diện Dark Mode màn hình tổng quan tài khoản khách hàng',
    description: 'Hoàn thiện hệ thống icon chuẩn thiết kế Figma, bảng màu tương phản AA và tối ưu hiển thị trên màn hình OLED.',
    status: 'review',
    priority: 'medium',
    assigneeId: 'user-pm',
    phase: 'Giai đoạn 3: Phát triển',
    estimatedHours: 20,
    actualHours: 22,
    startDate: '2026-09-15',
    dueDate: '2026-10-03',
    tags: ['UI/UX', 'Mobile', 'Design'],
    useCaseId: 'uc-3'
  },
  {
    id: 'task-105',
    projectId: 'proj-1',
    code: 'OB-105',
    title: 'Hoàn thiện tài liệu kiến trúc kỹ thuật microservices và phân rã cơ sở dữ liệu',
    description: 'Đặc tả giao thức gRPC nội bộ, Event-driven Kafka message queue và cơ chế phân vùng dữ liệu tài khoản.',
    status: 'done',
    priority: 'high',
    assigneeId: 'user-admin',
    phase: 'Giai đoạn 2: Phân tích & Thiết kế',
    estimatedHours: 45,
    actualHours: 42,
    startDate: '2026-08-10',
    dueDate: '2026-09-10',
    tags: ['Architecture', 'Docs'],
    useCaseId: 'uc-1'
  },

  // Tasks for E-SHOP-B2B
  {
    id: 'task-201',
    projectId: 'proj-2',
    code: 'ES-201',
    title: 'Kiểm thử tải đồng thời (Load Test 10,000 CCU) trong chiến dịch Flash Sale',
    description: 'Mô phỏng áp lực mua hàng đồng thời với Apache JMeter và kiểm tra độ trễ khóa dữ liệu kho.',
    status: 'in_progress',
    priority: 'urgent',
    assigneeId: 'user-qa',
    phase: 'Giai đoạn 4: Kiểm thử',
    estimatedHours: 24,
    actualHours: 16,
    startDate: '2026-09-27',
    dueDate: '2026-10-01', // Due today!
    tags: ['QA', 'Performance', 'JMeter'],
    useCaseId: 'uc-4'
  },
  {
    id: 'task-202',
    projectId: 'proj-2',
    code: 'ES-202',
    title: 'Tích hợp cổng thanh toán doanh nghiệp và xuất hóa đơn điện tử VNPT',
    description: 'Kết nối API tạo e-Invoice tự động khi đơn hàng B2B được phê duyệt thanh toán.',
    status: 'done',
    priority: 'high',
    assigneeId: 'user-dev',
    phase: 'Giai đoạn 3: Phát triển',
    estimatedHours: 30,
    actualHours: 28,
    startDate: '2026-09-01',
    dueDate: '2026-09-20',
    tags: ['Invoice', 'B2B', 'ERP'],
    useCaseId: 'uc-4'
  },

  // Tasks for TELE-HEALTH
  {
    id: 'task-301',
    projectId: 'proj-3',
    code: 'TH-301',
    title: 'Khảo sát và chuẩn hóa biểu mẫu bệnh án điện tử chuẩn HL7/FHIR',
    description: 'Làm việc với hội đồng bác sĩ chuyên khoa để chuẩn hóa dữ liệu tiền sử bệnh và kết quả cận lâm sàng.',
    status: 'in_progress',
    priority: 'high',
    assigneeId: 'user-pm',
    phase: 'Giai đoạn 2: Phân tích & Thiết kế',
    estimatedHours: 50,
    actualHours: 24,
    startDate: '2026-09-21',
    dueDate: '2026-10-10',
    tags: ['Medical', 'HL7', 'Requirements'],
    useCaseId: 'uc-5'
  }
];

export const INITIAL_USE_CASES: UseCase[] = [
  {
    id: 'uc-1',
    projectId: 'proj-1',
    code: 'UC-OB-01',
    title: 'Đăng ký tài khoản và Định danh điện tử (eKYC)',
    actor: 'Khách hàng cá nhân',
    description: 'Cho phép khách hàng mở mới tài khoản thanh toán từ xa thông qua ứng dụng di động mà không cần đến quầy giao dịch.',
    priority: 'urgent',
    status: 'developing',
    progressPercent: 75,
    mainFlow: [
      '1. Khách hàng nhập số điện thoại và xác thực OTP qua SMS',
      '2. Chụp ảnh 2 mặt Căn cước công dân gắn chip',
      '3. Ứng dụng quét thông tin OCR và kiểm tra tính hợp lệ',
      '4. Thực hiện quét khuôn mặt sinh trắc học theo hướng dẫn (quay trái, phải, chớp mắt)',
      '5. Hệ thống đối chiếu dữ liệu với Cơ sở dữ liệu quốc gia về dân cư',
      '6. Khách hàng thiết lập mật khẩu, mã PIN giao dịch và hoàn tất kích hoạt'
    ],
    alternateFlow: [
      '3a. Ảnh giấy tờ mờ hoặc lóa sáng: Hệ thống yêu cầu chụp lại',
      '4a. Nhận diện khuôn mặt thất bại quá 3 lần: Chuyển sang luồng Video Call xác minh với điện thoại viên',
      '5a. Số định danh đã tồn tại: Thông báo đăng nhập hoặc khôi phục tài khoản'
    ],
    acceptanceCriteria: [
      { id: 'ac-1', description: 'Độ chính xác nhận diện OCR tiếng Việt đạt trên 98%', completed: true },
      { id: 'ac-2', description: 'Chống giả mạo hình ảnh tĩnh / màn hình video (Anti-spoofing) thành công', completed: true },
      { id: 'ac-3', description: 'Thời gian phản hồi toàn trình xác thực không quá 5 giây', completed: false },
      { id: 'ac-4', description: 'Lưu vết lịch sử kiểm tra đầy đủ vào bảng Audit Log bảo mật', completed: true }
    ],
    assignedTo: 'user-dev',
    updatedAt: '2026-09-29'
  },
  {
    id: 'uc-2',
    projectId: 'proj-1',
    code: 'UC-OB-02',
    title: 'Chuyển tiền nhanh liên ngân hàng Napas 24/7 & VietQR',
    actor: 'Khách hàng đã đăng nhập',
    description: 'Thực hiện lệnh chuyển tiền ngay lập tức tới tài khoản tại hơn 50 ngân hàng thành viên qua số tài khoản hoặc mã VietQR.',
    priority: 'urgent',
    status: 'developing',
    progressPercent: 60,
    mainFlow: [
      '1. Người dùng chọn tính năng Chuyển tiền hoặc Quét mã VietQR',
      '2. Nhập/quét thông tin ngân hàng thụ hưởng và số tài khoản',
      '3. Hệ thống tự động truy vấn tên chủ tài khoản thụ hưởng hiển thị xác nhận',
      '4. Nhập số tiền và nội dung chuyển tiền',
      '5. Xác thực giao dịch bằng Sinh trắc học (Smart OTP / FaceID)',
      '6. Tiền được trừ khỏi tài khoản nguồn và ghi có tài khoản thụ hưởng',
      '7. Hiển thị biên lai giao dịch thành công và gửi thông báo biến động số dư'
    ],
    alternateFlow: [
      '3a. Ngân hàng thụ hưởng bảo trì hoặc lỗi kết nối: Báo lỗi và gợi ý chuyển thường',
      '4a. Số dư khả dụng không đủ: Báo lỗi số dư và chặn tiếp tục',
      '5a. Sai Smart OTP 3 lần: Khóa tạm thời tính năng chuyển tiền trong 15 phút'
    ],
    acceptanceCriteria: [
      { id: 'ac-5', description: 'Tự động kiểm tra tra cứu đúng tên người nhận trong vòng 1.5s', completed: true },
      { id: 'ac-6', description: 'Hạn mức giao dịch tuân thủ đúng phân loại tài khoản theo Thông tư NHNN', completed: true },
      { id: 'ac-7', description: 'Đảm bảo tính nhất quán dữ liệu kép (ACID Transaction) khi có lỗi mạng', completed: false }
    ],
    assignedTo: 'user-dev',
    updatedAt: '2026-09-28'
  },
  {
    id: 'uc-3',
    projectId: 'proj-1',
    code: 'UC-OB-03',
    title: 'Quản lý Thẻ tín dụng & Thanh toán hóa đơn tự động',
    actor: 'Chủ thẻ ngân hàng',
    description: 'Xem sao kê hàng tháng, khóa/mở khóa thẻ tức thì, kích hoạt chi tiêu quốc tế và đặt lịch thanh toán tiền điện nước tự động.',
    priority: 'medium',
    status: 'approved',
    progressPercent: 40,
    mainFlow: [
      '1. Chọn thẻ trong danh sách thẻ của tôi',
      '2. Xem hạn mức còn lại, sao kê chu kỳ gần nhất',
      '3. Bật/tắt thanh toán trực tuyến hoặc đổi mã PIN thẻ online',
      '4. Cấu hình trích nợ tự động ngày đến hạn sao kê'
    ],
    acceptanceCriteria: [
      { id: 'ac-8', description: 'Khóa thẻ khẩn cấp phản hồi dưới 1 giây', completed: true },
      { id: 'ac-9', description: 'Thông báo nhắc nhở sao kê trước 5 ngày qua Push Notification', completed: false }
    ],
    assignedTo: 'user-pm',
    updatedAt: '2026-09-20'
  },

  // Use case for E-SHOP-B2B
  {
    id: 'uc-4',
    projectId: 'proj-2',
    code: 'UC-ES-01',
    title: 'Đặt hàng theo lô (Bulk Order) và xét duyệt công nợ đại lý',
    actor: 'Đại lý phân phối cấp 1',
    description: 'Nhập file Excel đơn hàng sỉ hoặc chọn danh mục chiết khấu theo số lượng, áp dụng chính sách công nợ 30 ngày.',
    priority: 'high',
    status: 'tested',
    progressPercent: 90,
    mainFlow: [
      '1. Tải lên danh sách mã sản phẩm và số lượng đặt mua',
      '2. Hệ thống kiểm tra tồn kho sẵn sàng tại các chi nhánh',
      '3. Tự động tính tỷ lệ chiết khấu thương mại và thuế GTGT',
      '4. Kiểm tra hạn mức tín dụng công nợ còn lại của đại lý',
      '5. Tạo đơn đặt hàng và gửi thông báo phê duyệt tới quản lý bán hàng'
    ],
    acceptanceCriteria: [
      { id: 'ac-10', description: 'Hỗ trợ tải lên file Excel đến 1,000 dòng trong vòng 3 giây', completed: true },
      { id: 'ac-11', description: 'Chặn đặt hàng nếu công nợ quá hạn chưa thanh toán', completed: true },
      { id: 'ac-12', description: 'Sinh biên bản xác nhận đặt hàng có mã vạch định danh', completed: true }
    ],
    assignedTo: 'user-qa',
    updatedAt: '2026-09-27'
  },

  // Use case for TELE-HEALTH
  {
    id: 'uc-5',
    projectId: 'proj-3',
    code: 'UC-TH-01',
    title: 'Đặt lịch khám video trực tuyến với Bác sĩ chuyên khoa',
    actor: 'Bệnh nhân',
    description: 'Tìm kiếm bác sĩ theo chuyên khoa, chọn khung giờ trống và thanh toán phí khám trước buổi hẹn.',
    priority: 'high',
    status: 'in_review',
    progressPercent: 30,
    mainFlow: [
      '1. Bệnh nhân chọn chuyên khoa và bác sĩ cần khám',
      '2. Chọn khung giờ rảnh trong lịch công tác của bác sĩ',
      '3. Mô tả triệu chứng lâm sàng và đính kèm hồ sơ xét nghiệm trước đó',
      '4. Thanh toán phí tư vấn trực tuyến',
      '5. Nhận đường dẫn phòng khám bảo mật WebRTC và mã nhắc hẹn'
    ],
    acceptanceCriteria: [
      { id: 'ac-13', description: 'Tự động đồng bộ lịch vào Google Calendar/Apple Calendar', completed: false },
      { id: 'ac-14', description: 'Bảo mật dữ liệu đường truyền video mã hóa đầu cuối (E2EE)', completed: false }
    ],
    assignedTo: 'user-pm',
    updatedAt: '2026-09-25'
  }
];

export const INITIAL_QUALITY_GATES: ProjectQualityGates[] = [
  {
    projectId: 'proj-1',
    phases: [
      {
        id: 'phase_1',
        name: 'Giai đoạn 1: Khởi tạo & Lập Kế Hoạch',
        shortName: 'Khởi tạo & Kế hoạch',
        description: 'Xác định mục tiêu kinh doanh, điều lệ dự án, phạm vi công việc WBS và ma trận phân công RACI.',
        items: [
          {
            id: 'qg-1-1',
            title: 'Tài liệu Điều lệ Dự án (Project Charter) đã được phê duyệt',
            description: 'Có chữ ký đầy đủ của Ban Giám đốc và Đại diện Nghiệp vụ (PO).',
            isMandatory: true,
            isPassed: true,
            checkedBy: 'Trần Mai Phương (PM)',
            checkedAt: '2026-08-05',
            notes: 'Đã ký kết hợp đồng tài trợ và cam kết mốc tiến độ.'
          },
          {
            id: 'qg-1-2',
            title: 'Cơ cấu phân rã công việc (WBS) & Dự toán ngân sách',
            description: 'Phân rã chi tiết các gói công việc đến cấp độ công việc tuần và kế hoạch giải ngân.',
            isMandatory: true,
            isPassed: true,
            checkedBy: 'Nguyễn Tuấn Minh (Admin)',
            checkedAt: '2026-08-07',
            notes: 'Ngân sách 1.85 tỷ đã được thẩm định.'
          },
          {
            id: 'qg-1-3',
            title: 'Kế hoạch Quản lý Rủi ro & Ma trận RACI',
            description: 'Xác định các kịch bản rủi ro bảo mật, chậm tiến độ và đầu mối xử lý.',
            isMandatory: true,
            isPassed: true,
            checkedBy: 'Trần Mai Phương (PM)',
            checkedAt: '2026-08-09'
          }
        ]
      },
      {
        id: 'phase_2',
        name: 'Giai đoạn 2: Phân Tích Yêu Cầu & Thiết Kế Kiến Trúc',
        shortName: 'Phân tích & Thiết kế',
        description: 'Đặc tả yêu cầu phần mềm BRD/SRS, thiết kế kiến trúc hệ thống, ERD CSDL và giao diện UI/UX.',
        items: [
          {
            id: 'qg-2-1',
            title: 'Đặc tả Yêu cầu Nghiệp vụ (BRD/SRS) và Danh mục Use Case hoàn tất 100%',
            description: 'Tất cả các ca sử dụng cốt lõi đã có tiêu chí chấp nhận Acceptance Criteria rõ ràng.',
            isMandatory: true,
            isPassed: true,
            checkedBy: 'Trần Mai Phương (PM)',
            checkedAt: '2026-08-28',
            notes: 'Đã chốt toàn bộ 18 Use Case nghiệp vụ ngân hàng.'
          },
          {
            id: 'qg-2-2',
            title: 'Thiết kế Kiến trúc Microservices & Mô hình CSDL (ERD/Schema)',
            description: 'Đảm bảo tuân thủ tính chịu lỗi High Availability và mã hóa CSDL.',
            isMandatory: true,
            isPassed: true,
            checkedBy: 'Lê Hoàng Long (Tech Lead)',
            checkedAt: '2026-09-02',
            notes: 'Thông qua hội đồng kiến trúc phần mềm.'
          },
          {
            id: 'qg-2-3',
            title: 'Bộ thiết kế giao diện UI/UX Prototype được PO ký duyệt',
            description: 'Kiểm tra chuẩn Accessibility WCAG 2.1 AA và luồng trải nghiệm người dùng.',
            isMandatory: true,
            isPassed: true,
            checkedBy: 'Phạm Đình Vũ (PO)',
            checkedAt: '2026-09-05'
          },
          {
            id: 'qg-2-4',
            title: 'Kế hoạch tuân thủ An toàn Thông tin & Tiêu chuẩn PCI-DSS',
            description: 'Quy hoạch vùng mạng DMZ, cơ chế lưu trữ mật mã và chứng thư số HSM.',
            isMandatory: true,
            isPassed: true,
            checkedBy: 'Nguyễn Tuấn Minh (Admin)',
            checkedAt: '2026-09-08'
          }
        ]
      },
      {
        id: 'phase_3',
        name: 'Giai đoạn 3: Phát Triển Sprint & Kiểm Soát Mã Nguồn',
        shortName: 'Phát triển Sprint',
        description: 'Tuân thủ Coding Standards, quy trình Code Review, tỷ lệ bao phủ Unit Test và CI/CD Pipeline.',
        items: [
          {
            id: 'qg-3-1',
            title: 'Tỷ lệ bao phủ kiểm thử tự động (Unit Test Coverage) đạt tối thiểu >= 80%',
            description: 'Áp dụng cho toàn bộ các module xử lý tiền tệ, giao dịch và tính toán số dư.',
            isMandatory: true,
            isPassed: false,
            checkedBy: 'Đỗ Bích Ngọc (QA)',
            checkedAt: '2026-09-29',
            notes: 'Hiện tại đạt 74.5%. Cần bổ sung test case cho module eKYC và webhook NAPAS.'
          },
          {
            id: 'qg-3-2',
            title: 'Quy trình Code Review bắt buộc (Tối thiểu 1 Senior Dev + 1 Tech Lead duyệt PR)',
            description: 'Không được phép merge trực tiếp vào nhánh `main` hoặc `staging`.',
            isMandatory: true,
            isPassed: true,
            checkedBy: 'Lê Hoàng Long (Tech Lead)',
            checkedAt: '2026-09-28'
          },
          {
            id: 'qg-3-3',
            title: 'Pipeline CI/CD tự động quét mã nguồn (SonarQube & Static Analysis)',
            description: 'Không có lỗi Security Hotspot hoặc Critical Code Smells.',
            isMandatory: true,
            isPassed: true,
            checkedBy: 'Lê Hoàng Long (Tech Lead)',
            checkedAt: '2026-09-25'
          },
          {
            id: 'qg-3-4',
            title: 'Tài liệu API Swagger / OpenAPI được sinh tự động và cập nhật',
            description: 'Mọi API endpoint phải có tài liệu request/response mẫu và mã lỗi chi tiết.',
            isMandatory: false,
            isPassed: true,
            checkedBy: 'Lê Hoàng Long (Tech Lead)',
            checkedAt: '2026-09-22'
          }
        ]
      },
      {
        id: 'phase_4',
        name: 'Giai đoạn 4: Kiểm Thử QA/QC & Đảm Bảo Chất Lượng',
        shortName: 'Kiểm thử QA/QC',
        description: 'Kiểm thử chức năng 100%, kiểm thử hiệu năng chịu tải, quét lỗ hổng bảo mật và xử lý Bug.',
        items: [
          {
            id: 'qg-4-1',
            title: 'Hoàn thành 100% kịch bản Kiểm thử Chức năng (Functional Test Matrix)',
            description: 'Tất cả các ca kiểm thử chính và biên đều được thực thi và có log kết quả.',
            isMandatory: true,
            isPassed: false,
            notes: 'Đang triển khai thực hiện (tiến độ 65%).'
          },
          {
            id: 'qg-4-2',
            title: 'Không còn lỗi nghiêm trọng tồn đọng (Zero Blocker / Critical Bugs)',
            description: 'Mọi lỗi cấp độ nghiêm trọng phải được giải quyết triệt để trước khi chuyển UAT.',
            isMandatory: true,
            isPassed: false,
            notes: 'Còn 1 lỗi pending liên quan đến timeout cổng NAPAS.'
          },
          {
            id: 'qg-4-3',
            title: 'Kiểm thử tải và hiệu năng (Performance & Stress Test) đạt tiêu chuẩn SLA',
            description: 'Thời gian phản hồi P95 <= 800ms khi chịu tải 5,000 giao dịch/giây.',
            isMandatory: true,
            isPassed: false,
            notes: 'Lịch chạy test vào ngày 05/10/2026.'
          },
          {
            id: 'qg-4-4',
            title: 'Báo cáo Kiểm toán An ninh Mạng & Thử nghiệm Xâm nhập (Pentest Report)',
            description: 'Được cấp chứng nhận bảo mật không có lỗ hổng High hoặc Critical.',
            isMandatory: true,
            isPassed: false,
            notes: 'Đơn vị bảo mật bên ngoài đang tiến hành quét.'
          }
        ]
      },
      {
        id: 'phase_5',
        name: 'Giai đoạn 5: Kiểm Thử Nghiệm Thu UAT & Triển Khai Phát Hành',
        shortName: 'UAT & Release',
        description: 'Biên bản nghiệm thu UAT, kịch bản triển khai Go-live, kế hoạch khôi phục Rollback và giám sát.',
        items: [
          {
            id: 'qg-5-1',
            title: 'Biên bản Nghiệm thu Người dùng (UAT Sign-off) được ký nhận chính thức',
            description: 'Người đại diện nghiệp vụ và khách hàng xác nhận hệ thống đáp ứng đúng yêu cầu.',
            isMandatory: true,
            isPassed: false,
            notes: 'Dự kiến sau khi hoàn tất kiểm thử QA.'
          },
          {
            id: 'qg-5-2',
            title: 'Kịch bản Triển khai Chi tiết (Deployment Plan) & Kế hoạch Khôi phục (Rollback)',
            description: 'Chi tiết từng bước triển khai giờ vàng (off-peak hours) và phương án dự phòng khi có sự cố.',
            isMandatory: true,
            isPassed: false
          },
          {
            id: 'qg-5-3',
            title: 'Bộ Tài liệu Hướng Dẫn Sử Dụng & Vận Hành Hệ Thống (Operations Manual)',
            description: 'Tài liệu bàn giao cho đội IT Support, quản trị viên hạ tầng và trung tâm chăm sóc khách hàng.',
            isMandatory: false,
            isPassed: false
          },
          {
            id: 'qg-5-4',
            title: 'Hệ thống Giám sát Real-time & Cảnh báo Sự cố (APM & Alerting 24/7)',
            description: 'Thiết lập Dashboard Grafana/Prometheus cảnh báo qua Telegram/SMS khi lỗi vượt ngưỡng.',
            isMandatory: true,
            isPassed: false
          }
        ]
      }
    ]
  },
  {
    projectId: 'proj-2',
    phases: [
      {
        id: 'phase_1',
        name: 'Giai đoạn 1: Khởi tạo & Lập Kế Hoạch',
        shortName: 'Khởi tạo & Kế hoạch',
        description: 'Điều lệ dự án, WBS và kế hoạch dự án.',
        items: [
          {
            id: 'qg-2-1-1',
            title: 'Điều lệ dự án Sàn E-Shop B2B được phê duyệt',
            description: 'Ký kết với đại diện ban kinh doanh.',
            isMandatory: true,
            isPassed: true,
            checkedBy: 'Trần Mai Phương (PM)',
            checkedAt: '2026-07-20'
          }
        ]
      },
      {
        id: 'phase_2',
        name: 'Giai đoạn 2: Phân Tích & Thiết Kế',
        shortName: 'Phân tích & Thiết kế',
        description: 'BRD, ERD và UI/UX.',
        items: [
          {
            id: 'qg-2-2-1',
            title: 'Đặc tả nghiệp vụ công nợ và chiết khấu đại lý',
            description: 'Chốt công thức tính chiết khấu nhiều bậc.',
            isMandatory: true,
            isPassed: true,
            checkedBy: 'Trần Mai Phương (PM)',
            checkedAt: '2026-08-15'
          }
        ]
      },
      {
        id: 'phase_3',
        name: 'Giai đoạn 3: Phát Triển Sprint',
        shortName: 'Phát triển Sprint',
        description: 'Phát triển module cốt lõi.',
        items: [
          {
            id: 'qg-2-3-1',
            title: 'Unit Test đạt >= 80%',
            description: 'Đạt 84% độ bao phủ test.',
            isMandatory: true,
            isPassed: true,
            checkedBy: 'Lê Hoàng Long (Tech Lead)',
            checkedAt: '2026-09-18'
          }
        ]
      },
      {
        id: 'phase_4',
        name: 'Giai đoạn 4: Kiểm Thử QA/QC',
        shortName: 'Kiểm thử QA/QC',
        description: 'Kiểm thử chức năng và tải.',
        items: [
          {
            id: 'qg-2-4-1',
            title: 'Kiểm thử hiệu năng Flash Sale đạt 10,000 CCU',
            description: 'Kiểm thử tải đồng thời hệ thống giỏ hàng.',
            isMandatory: true,
            isPassed: false,
            notes: 'Đang chạy test đợt 2.'
          }
        ]
      },
      {
        id: 'phase_5',
        name: 'Giai đoạn 5: UAT & Release',
        shortName: 'UAT & Release',
        description: 'Nghiệm thu và triển khai.',
        items: [
          {
            id: 'qg-2-5-1',
            title: 'Nghiệm thu đại lý mẫu đợt 1',
            description: '5 đại lý thí điểm nghiệm thu.',
            isMandatory: true,
            isPassed: false
          }
        ]
      }
    ]
  },
  {
    projectId: 'proj-3',
    phases: [
      {
        id: 'phase_1',
        name: 'Giai đoạn 1: Khởi tạo & Lập Kế Hoạch',
        shortName: 'Khởi tạo & Kế hoạch',
        description: 'Kế hoạch triển khai y tế từ xa.',
        items: [
          {
            id: 'qg-3-1-1',
            title: 'Phê duyệt giấy phép thử nghiệm dịch vụ TeleHealth',
            description: 'Hồ sơ pháp lý y tế từ xa.',
            isMandatory: true,
            isPassed: true,
            checkedBy: 'Nguyễn Tuấn Minh (Admin)',
            checkedAt: '2026-09-22'
          }
        ]
      },
      {
        id: 'phase_2',
        name: 'Giai đoạn 2: Phân Tích & Thiết Kế',
        shortName: 'Phân tích & Thiết kế',
        description: 'Thiết kế hệ thống và chuẩn y khoa.',
        items: [
          {
            id: 'qg-3-2-1',
            title: 'Chuẩn hóa định dạng bệnh án HL7/FHIR',
            description: 'Tương thích với các phần mềm HIS bệnh viện.',
            isMandatory: true,
            isPassed: false,
            notes: 'Đang họp thống nhất với khối bệnh viện đối tác.'
          }
        ]
      },
      {
        id: 'phase_3',
        name: 'Giai đoạn 3: Phát Triển Sprint',
        shortName: 'Phát triển Sprint',
        description: 'Module Video Call WebRTC và hồ sơ bệnh án.',
        items: [
          {
            id: 'qg-3-3-1',
            title: 'Thiết lập môi trường WebRTC mã hóa đầu cuối E2EE',
            description: 'Bảo mật video tư vấn bệnh án.',
            isMandatory: true,
            isPassed: false
          }
        ]
      },
      {
        id: 'phase_4',
        name: 'Giai đoạn 4: Kiểm Thử QA/QC',
        shortName: 'Kiểm thử QA/QC',
        description: 'Đánh giá độ trễ và chất lượng âm thanh hình ảnh y tế.',
        items: [
          {
            id: 'qg-3-4-1',
            title: 'Độ trễ truyền hình ảnh dưới 200ms',
            description: 'Đảm bảo độ phân giải hình ảnh chuẩn chẩn đoán.',
            isMandatory: true,
            isPassed: false
          }
        ]
      },
      {
        id: 'phase_5',
        name: 'Giai đoạn 5: UAT & Release',
        shortName: 'UAT & Release',
        description: 'Thử nghiệm lâm sàng và bàn giao.',
        items: [
          {
            id: 'qg-3-5-1',
            title: 'Biên bản nghiệm thu chuyên môn y tế',
            description: 'Ký duyệt bởi hội đồng chuyên môn.',
            isMandatory: true,
            isPassed: false
          }
        ]
      }
    ]
  }
];

export const INITIAL_NOTIFICATIONS = [
  {
    id: 'notif-1',
    projectId: 'proj-1',
    type: 'overdue' as const,
    title: 'Nhiệm vụ Quá Hạn: OB-103',
    message: 'Nhiệm vụ "Thực hiện kiểm thử xâm nhập bảo mật (Penetration Test) chuẩn PCI-DSS" đã quá hạn từ ngày 30/09/2026!',
    taskId: 'task-103',
    createdAt: '2026-10-01 08:00',
    isRead: false
  },
  {
    id: 'notif-2',
    projectId: 'proj-1',
    type: 'deadline_warning' as const,
    title: 'Sắp Đến Hạn (< 48h): OB-101',
    message: 'Nhiệm vụ "Tích hợp Module Xác thực sinh trắc học eKYC" có hạn chót vào ngày 02/10/2026. Vui lòng cập nhật tiến độ.',
    taskId: 'task-101',
    createdAt: '2026-10-01 08:30',
    isRead: false
  },
  {
    id: 'notif-3',
    projectId: 'proj-1',
    type: 'quality_alert' as const,
    title: 'Cảnh báo Quality Gate Giai đoạn 3',
    message: 'Tiêu chuẩn "Tỷ lệ bao phủ kiểm thử tự động (Unit Test Coverage)" hiện tại mới đạt 74.5% (yêu cầu >= 80%).',
    createdAt: '2026-09-30 16:45',
    isRead: false
  },
  {
    id: 'notif-4',
    projectId: 'proj-2',
    type: 'deadline_warning' as const,
    title: 'Hôm nay đến hạn: ES-201',
    message: 'Nhiệm vụ "Kiểm thử tải đồng thời (Load Test 10,000 CCU)" có hạn chót hoàn thành trong ngày hôm nay 01/10/2026.',
    taskId: 'task-201',
    createdAt: '2026-10-01 09:00',
    isRead: true
  }
];
