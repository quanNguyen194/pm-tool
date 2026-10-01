# UI harness - kiểm tra giao diện không cần đăng nhập

Chạy toàn bộ khung ứng dụng (`MainLayout`: thanh trên, thanh bên và 7 màn hình thật) với **dữ liệu giả**, không kết nối Supabase.
Dùng để kiểm tra giao diện sau mỗi lần chỉnh sửa (đặc biệt khi nhận code mới từ Google AI Studio).

```bash
npm run harness          # http://localhost:4300  (cần Node >= 20.19)
```

URL tham số:

| Tham số | Giá trị | Ý nghĩa |
|---|---|---|
| `theme` | `light` / `dark` | Giao diện sáng / tối |
| `page` | `dashboard`, `projects`, `tasks`, `usecases`, `quality`, `reports`, `team` | Màn hình mở đầu |
| `role` | `admin` (mặc định), `pm`, `developer`, `qa`, `viewer` | Vai trò giả lập (ảnh hưởng nút thao tác) |

## Kiểm tra tự động

Mở trang ở kích thước cần thử (DevTools hoặc trình duyệt tích hợp: 375 / 768 / 1280) rồi chạy trong console:

```js
await window.__run()
```

Trả về cho từng màn hình: tràn ngang (`hScroll`, `overflow`), số đoạn chữ không đạt tương phản WCAG AA (`contrast.fail`, `contrast.worst`) và lỗi runtime (`errors`).
Mục tiêu: 0 ở mọi màn hình, cả hai giao diện, ở 375 / 768 / 1024 px.

## Cách hoạt động

- `vite.config.ts` thay `src/context/AppContext` bằng `mockApp.tsx` (cùng giao diện `useApp()`, mọi hàm thao tác là hàm rỗng).
- Nếu `useApp()` thêm trường dữ liệu mới, hãy thêm trường đó vào `mockApp.tsx` (hàm thì tự là no-op nhờ `Proxy`).
- Thư mục này nằm trong gốc dự án để Tailwind tự quét `src/`; không ảnh hưởng bản build production.
