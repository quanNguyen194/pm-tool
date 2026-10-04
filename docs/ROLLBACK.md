# Roll-back khi thay đổi giao diện gây lỗi

Dùng khi một lần đẩy code (đặc biệt từ Google AI Studio) làm web lỗi, mất chức năng hoặc gián đoạn dịch vụ.
**Nguyên tắc: khôi phục dịch vụ trước (phương án A), sửa nguồn sau (phương án B/C).**

## 1. Nhận diện nhanh

| Triệu chứng | Khả năng cao | Hành động |
|---|---|---|
| Trang trắng / "Không tải được dữ liệu" ngay sau deploy | Lỗi build/runtime, đổi `useApp()`, thiếu biến `VITE_*` | A, rồi B |
| Một màn hình lỗi, các màn khác bình thường | Lỗi component đó | A nếu ảnh hưởng nhiều người, rồi B |
| Thao tác báo "Bạn không có quyền…" bất thường | Giao diện gửi sai cột/dữ liệu lên Supabase (RLS từ chối) | B |
| Font/ảnh/script ngoài không hiện, console có "violates Content Security Policy" | CSP trong `public/_headers` chặn dịch vụ mới | Sửa `_headers` hoặc B |
| Build trên Cloudflare đỏ | Lỗi type/build | Web cũ vẫn chạy (Cloudflare không thay bản đang chạy); sửa hoặc B |
| Lộ khóa bí mật trong code | `guard` báo LỖI | Gỡ khóa **và đổi khóa mới** trước, rồi B |

## 2. Phương án A - Cloudflare rollback (nhanh nhất, khoảng 1 phút, không đụng git)

1. Cloudflare Dashboard → Workers & Pages → `pm-tool` → **Deployments**.
2. Chọn phiên bản gần nhất còn hoạt động tốt → **Rollback to this version**.
3. Mở https://pm-tool.quan-ntm194.workers.dev kiểm tra lại.

Lưu ý: git vẫn chứa code lỗi, **lần push kế tiếp lên `main` sẽ deploy lại bản lỗi**. Làm phương án B ngay sau đó.

## 3. Phương án B - `git revert` (khuyên dùng để sửa nguồn, giữ nguyên lịch sử)

```bash
git pull --rebase origin main
git log --oneline -10                         # tìm commit gây lỗi
git revert --no-edit <sha-loi>                # hoàn tác một commit
git revert --no-edit <sha-cu>..<sha-moi>      # hoặc một dải commit (không gồm sha-cu)
git push origin main                          # Cloudflare tự deploy bản đã hoàn tác
```

Commit hoàn tác được thêm vào lịch sử, không ai mất công việc; có thể `git revert` lại chính commit hoàn tác để đưa thay đổi giao diện trở lại sau khi sửa.

## 4. Phương án C - quay về mốc ổn định (tag `stable-*`)

Dùng khi nhiều commit liên tiếp đều lỗi:

```bash
git pull --rebase origin main
git revert --no-commit stable-2026-10-02-ui..HEAD   # hoàn tác mọi thay đổi sau mốc ổn định mới nhất
git commit -m "Restore to stable-2026-10-02-ui"
git push origin main
```

Xem các mốc: `git tag -l "stable-*"`. Sau mỗi lần phát hành đã kiểm tra kỹ, tạo mốc mới:

```bash
git tag -a stable-YYYY-MM-DD -m "Đã kiểm tra: đăng nhập, dashboard, kanban, báo cáo"
git push origin stable-YYYY-MM-DD
```

Mốc hiện tại: **`stable-2026-10-02`** (commit `a440d69`, đủ giai đoạn 0-5).
Mốc mới nhất: **`stable-2026-10-02-ui`** (commit `cdd2306`, sau nâng cấp giao diện 5 bước: dark mode, thanh bên/ngăn kéo, Gantt, kéo thả Kanban, dashboard hiệu suất). Mốc `stable-2026-10-02` vẫn dùng được để quay về giao diện trước khi nâng cấp.

## 4b. Hoàn tác migration `0008` (vai trò mới, use case phân cấp, trường nhiệm vụ)

Migration `0008` đổi tên vai trò (`developer`→`dev`, `qa`→`tester`) nên **chỉ revert giao diện là chưa đủ**: bản giao diện cũ không nhận ra vai trò mới (thành viên DEV/Tester sẽ mất quyền thao tác trên giao diện).
Thứ tự đúng khi cần quay về trước `0008`:

1. Cloudflare rollback (phương án A) hoặc `git revert` (phương án B/C) về bản giao diện trước `0008`.
2. Chạy `supabase/rollback/0008_rollback.sql` trong SQL Editor (đã có test: `supabase/tests/rollback.test.mjs`). Vai trò `dev`/`ba` gộp thành `developer`, `tester` thành `qa`; các cột/bảng mới được giữ lại để không mất dữ liệu.

Nếu chỉ cần khôi phục dịch vụ thật nhanh thì làm bước 1 là đủ: Admin và PM dùng bình thường (hai vai trò này không đổi tên); chỉ thành viên DEV/BA/Tester tạm chưa thao tác được trên giao diện cũ cho đến khi làm bước 2.

## 4c. Hoàn tác migration `0009` và `0010`

- `0009` (thuộc tính use case) và `0010` (tiến độ theo 5 bước) chỉ **thêm** cột/bảng, nên bản giao diện cũ vẫn chạy khi hai migration này đã có trong DB. Rollback Cloudflare/git (phương án A/B/C) là đủ để khôi phục dịch vụ.
- Muốn gỡ hẳn trong DB: chạy `supabase/rollback/0010_rollback.sql` trước, rồi `supabase/imports/qtvt_usecases_rollback.sql` (nếu đã nhập use case từ Excel), rồi `supabase/rollback/0009_rollback.sql`. Mất dữ liệu các bước đã tick, nhãn và độ phức tạp.
- Lưu ý: giao diện bản mới ghi cột `progress_model` (dự án) và đọc bảng `use_case_stages`; nếu đưa giao diện mới lên khi DB chưa có `0010` thì sửa/tạo dự án sẽ báo lỗi. Luôn chạy migration trước.

## 5. Không khuyến khích: `git reset --hard` + `git push --force`

Xóa lịch sử trên GitHub và có thể ghi đè công việc AI Studio vừa đẩy. Chỉ dùng khi bắt buộc (ví dụ lỡ đẩy khóa bí mật), và nên thống nhất trước.

## 6. Cơ sở dữ liệu

- AI Studio chỉ đổi **frontend**. Dữ liệu, tài khoản, RLS trên Supabase không bị ảnh hưởng, nên roll-back frontend là đủ.
- Các file `supabase/migrations/*.sql` chỉ thêm (additive) và **không tự hoàn tác**. Trước khi chạy migration mới, sao lưu: Supabase → Database → Backups, hoặc `supabase db dump`. Gói free không có point-in-time recovery.
- Nếu một bản frontend cũ chạy với DB mới: các phần phụ (biểu đồ, báo cáo định kỳ) tự ẩn khi thiếu bảng, phần lõi vẫn chạy.

## 7. Quy trình khi AI Studio đẩy code mới

1. `git pull --rebase origin main`
2. `npm run verify` (guard + type check + build; cần Node ≥ 20.19). CI trên GitHub chạy cùng các bước này cho mỗi lần push. Với thay đổi giao diện, chạy thêm `npm run harness` và `await window.__run()` ở 375/768/1280px (xem `ui-harness/README.md`).
3. Xem build trên Cloudflare xanh, mở web:
   - Đăng nhập, chọn dự án, Dashboard có biểu đồ
   - Kéo một task sang cột khác, tick một tiêu chí nghiệm thu
   - Tab Báo cáo mở được, "In / Xuất PDF" hoạt động
   - Chuông thông báo, đăng xuất
4. Có lỗi → phương án A ngay, sau đó B hoặc C, và báo cáo: commit nào gây lỗi, triệu chứng, đã khôi phục bằng cách nào.
5. Mọi thứ ổn → gắn tag `stable-*` mới.

## 8. Phòng ngừa (nên làm)

- Cho AI Studio đồng bộ vào nhánh riêng (ví dụ `ai-studio`), xem bản **Preview** của Cloudflare (bật "Non-production branch builds"), CI xanh rồi mới merge vào `main`. Nhờ vậy bản lỗi không bao giờ chạm production.
- Bật branch protection cho `main` (yêu cầu CI `check` xanh trước khi merge) tại GitHub → Settings → Branches.
- Giữ nguyên hợp đồng `useApp()` ở `src/context/AppContext.tsx`; `scripts/guard.mjs` báo lỗi khi mất export hoặc xuất hiện mẫu nguy hiểm (khóa bí mật, `process.env`, localStorage lưu dữ liệu, tên miền ngoài bị CSP chặn).
