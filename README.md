# Omni Project Manager

Web quản lý dự án: nhiều dự án độc lập, nhiệm vụ (Kanban), use case + tiêu chí nghiệm thu, checklist chất lượng theo 5 giai đoạn (Quality Gates), dashboard + biểu đồ tiến độ, báo cáo định kỳ, nhắc deadline tự động và phân quyền theo vai trò.

**Stack:** React 19 + Vite 8 + Tailwind 4 · Supabase (Postgres, Auth, RLS, Realtime, pg_cron) · Cloudflare Workers (static assets).

## Tính năng

| Nhóm | Mô tả |
|---|---|
| Dự án | Nhiều dự án, mỗi dự án có PM, ngân sách, giai đoạn hiện tại, tiến độ tự tính (60% nhiệm vụ + 40% use case) |
| Nhiệm vụ | Kanban kéo thả + bảng, giao người phụ trách, hạn chót, giờ ước tính/thực tế, liên kết use case |
| Use case | Luồng chính/phụ, tiêu chí nghiệm thu; tick hết tiêu chí thì use case tự hoàn thành |
| Quality Gates | Checklist 5 giai đoạn, nhân bản từ mẫu cho mỗi dự án mới; server tự ghi người duyệt + ngày duyệt |
| Dashboard | KPI, phân bổ trạng thái, biểu đồ tiến độ thực tế so với kế hoạch (và burndown) |
| Nhắc deadline | `pg_cron` quét 8:00 sáng (giờ VN): task quá hạn hoặc còn ≤ 2 ngày; thông báo realtime + âm báo |
| Báo cáo | In PDF, Excel (CSV), sao lưu JSON; báo cáo tuần/tháng tự động lưu vào lịch sử |
| Phân quyền | Đăng nhập thật, quản trị viên toàn hệ thống + vai trò theo từng dự án, thực thi bằng RLS ở database |

### Vai trò

`is_admin` (toàn hệ thống) và vai trò theo từng dự án (`project_members.role`):

| Quyền | Admin | PM | Developer | QA | Viewer |
|---|:-:|:-:|:-:|:-:|:-:|
| Tạo dự án | ✓ | | | | |
| Sửa/xóa dự án, quản lý thành viên, tạo báo cáo, gửi nhắc việc | ✓ | ✓ | | | |
| Tạo/sửa/xóa nhiệm vụ và use case | ✓ | ✓ | ✓ | | |
| Tick tiêu chí nghiệm thu | ✓ | ✓ | | | |
| Duyệt checklist chất lượng | ✓ | ✓ | | ✓ | |
| Xem dữ liệu của dự án | ✓ | ✓ | ✓ | ✓ | ✓ |

Người đăng ký **đầu tiên** của hệ thống tự động là quản trị viên. Người đăng ký sau chỉ thấy các dự án họ được thêm vào (Đội ngũ & Phân quyền → thêm bằng email).

## Chạy local

Cần **Node ≥ 20.19** (Vite 8). File `.node-version` ghim Node 22 cho Cloudflare.

```bash
npm install
cp .env.example .env.local      # điền VITE_SUPABASE_URL và VITE_SUPABASE_ANON_KEY
npm run dev                     # http://localhost:3000
npm run lint                    # kiểm tra type
npm run build                   # build ra dist/
```

Chỉ dùng **anon / publishable key** ở frontend. Tuyệt đối không đưa `service_role` key vào code hay biến `VITE_*`.

## Cài đặt Supabase

1. Tạo project Supabase. Authentication → Sign In / Providers → Email: tắt "Confirm email" nếu muốn đăng ký dùng ngay (email mặc định của Supabase bị giới hạn vài thư mỗi giờ).
2. Authentication → URL Configuration: đặt **Site URL** là URL trang web đã deploy (và thêm `http://localhost:3000` vào Redirect URLs để dev).
3. Chạy lần lượt trong SQL Editor các file ở `supabase/migrations/`:

| File | Nội dung |
|---|---|
| `0001_schema.sql` | Bảng, hàm phân quyền, trigger, RLS, realtime |
| `0002_quality_template.sql` | 5 giai đoạn + checklist chất lượng mẫu |
| `0003_rpc_and_seed.sql` | Thêm thành viên theo email, gửi nhắc việc, `seed_demo_data()` |
| `0004_criteria_insert_guard.sql` | Chặn lách quyền tick tiêu chí khi tạo mới |
| `0005_deadlines_and_snapshots.sql` | Quét deadline, lịch sử tiến độ cho biểu đồ |
| `0006_schedule_cron.sql` | Lịch `pg_cron`: 8:00 quét deadline, 23:55 chốt tiến độ |
| `0007_report_schedules.sql` | Báo cáo định kỳ tự động, `ping()`; cron 8:10 tạo báo cáo |

4. Đăng ký tài khoản đầu tiên trên web (thành admin), rồi nạp dữ liệu demo bằng nút "Nạp dữ liệu demo" hoặc `select public.seed_demo_data();`. Muốn biểu đồ có lịch sử minh họa: `select public.backfill_demo_progress();`.

Kiểm tra lịch tự động: `select jobname, schedule, active from cron.job;` (phải có `omni-scan-deadlines`, `omni-snapshot-progress`, `omni-generate-reports`).

## Kiểm thử database

Schema + RLS được kiểm thử trên Postgres chạy trong Node (PGlite), giả lập các role `anon` / `authenticated`, không cần Supabase:

```bash
cd supabase/tests && npm install && npm test
```

Bộ test kiểm tra từng vai trò (viewer/developer/qa/pm/admin/người ngoài dự án) làm được và **không** làm được gì, trigger tiến độ, quét deadline và báo cáo định kỳ. `pg_cron` không có trong PGlite nên các lịch cron ở `0006`/`0007` chỉ kiểm tra được trên Supabase thật.

## Deploy

**Cloudflare (Workers Builds)** build từ nhánh `main` của GitHub:

- Build command: `npm run build` · Deploy command: `npx wrangler deploy` (cấu hình `dist/` + SPA fallback nằm ở `wrangler.jsonc`)
- Build variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (biến `VITE_*` được nhúng lúc build, đổi giá trị thì phải build lại)
- Header bảo mật + CSP nằm ở `public/_headers`. CSP chỉ cho phép kết nối tới chính site và `*.supabase.co`; nếu thêm dịch vụ bên ngoài (analytics, CDN…) cần cập nhật `connect-src`/`script-src`.

**GitHub Actions** (`.github/workflows/`):

- `ci.yml`: chạy type check, build và test database cho mỗi lần push/PR.
- `keepalive.yml`: mỗi tuần gọi `ping()` để Supabase gói free không bị tạm dừng sau 7 ngày không hoạt động. Cần tạo 2 secret `SUPABASE_URL` và `SUPABASE_ANON_KEY`.

### Giới hạn gói miễn phí

- Supabase free: DB 500 MB, 50.000 người dùng/tháng; project bị tạm dừng sau 7 ngày không hoạt động (bấm Restore trong dashboard là chạy lại).
- Cloudflare Workers free: 100.000 request/ngày cho Worker; tài nguyên tĩnh được phục vụ miễn phí.
- Truy vấn mặc định của PostgREST trả tối đa 1000 dòng; app đang tải toàn bộ dữ liệu của người dùng một lần, đủ cho quy mô dùng thử. Dự án rất lớn cần chuyển sang phân trang.

## Bảo mật

- Toàn bộ quyền thực thi bằng RLS + column grants ở database; giao diện chỉ ẩn/hiện nút. Tiến độ, người duyệt, ngày duyệt do server tính, client không ghi được.
- Văn bản người dùng nhập được escape trước khi đưa vào cửa sổ in báo cáo (chống XSS lưu trữ).
- Không lưu `service_role` key ở bất kỳ đâu trong repo.

## Xử lý sự cố

| Triệu chứng | Nguyên nhân thường gặp |
|---|---|
| "Thiếu cấu hình Supabase" | Chưa đặt `VITE_SUPABASE_*` lúc build, hãy đặt rồi build lại |
| "Chưa tải được hồ sơ tài khoản" | Chưa chạy `0001_schema.sql` (trigger tạo profile) |
| "Không tải được dữ liệu" | Thiếu migration hoặc project Supabase đang bị tạm dừng |
| Biểu đồ / báo cáo định kỳ trống | Chưa chạy `0005` / `0007` (các phần này lỗi thì app vẫn chạy) |
| Không nhận được thông báo deadline | Chưa chạy `0006` (cron), hoặc bấm "Quét deadline" (admin) để chạy ngay |
| Email xác nhận không đến | Tắt "Confirm email" ở bước cài đặt, hoặc dùng SMTP riêng |

## Chỉnh sửa giao diện bằng công cụ ngoài (Google AI Studio) và roll-back

- Luôn `git pull --rebase origin main` trước khi làm việc, rồi chạy `npm run verify` (guard + type check + build) sau khi nhận code mới.
- `scripts/guard.mjs` bắt các lỗi mà type check không thấy: lộ khóa bí mật, quay lại `localStorage`, mất export của `useApp()`, tên miền ngoài bị CSP chặn.
- Sự cố sau khi deploy: xem **[docs/ROLLBACK.md](docs/ROLLBACK.md)** (rollback Cloudflare trong 1 phút, `git revert`, quay về mốc `stable-*`).

## Chưa làm

- Gửi báo cáo/nhắc deadline qua email (Edge Function + Resend). Báo cáo định kỳ hiện đã được tạo và lưu sẵn trong hệ thống nên chỉ cần thêm bước gửi.
