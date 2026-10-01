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
