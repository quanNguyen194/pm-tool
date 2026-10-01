# Omni Project Manager

Web quản lý dự án: dự án, nhiệm vụ (Kanban), use case, checklist chất lượng theo giai đoạn, dashboard, báo cáo, phân quyền.

Stack: React 19 + Vite + Tailwind 4. Backend dự kiến: Supabase. Host: Cloudflare Pages.

## Chạy local

```bash
npm install
npm run dev      # http://localhost:3000
npm run lint     # kiểm tra type
npm run build    # build ra dist/
```

## Deploy (Cloudflare Pages)

- Build command: `npm run build`
- Output directory: `dist`
- Biến môi trường: xem `.env.example`

> Nhánh chính là `main`. Cloudflare build từ nhánh này, cấu hình trong `wrangler.jsonc`.

## Database (Supabase)

Schema, phân quyền (RLS) và dữ liệu demo nằm trong `supabase/migrations/`. Chạy lần lượt trong Supabase SQL Editor:

1. `0001_schema.sql` - bảng, hàm phân quyền, trigger, RLS
2. `0002_quality_template.sql` - 5 giai đoạn + checklist chất lượng mẫu
3. `0003_rpc_and_seed.sql` - hàm RPC + `seed_demo_data()`
4. `0004_criteria_insert_guard.sql` - vá quyền tick tiêu chí nghiệm thu

Người đăng ký đầu tiên tự động là quản trị viên. Nạp dữ liệu demo sau khi có tài khoản: `select public.seed_demo_data();`

Kiểm thử schema + RLS (chạy Postgres trong Node, không cần Supabase):

```bash
cd supabase/tests && npm install && npm test
```
