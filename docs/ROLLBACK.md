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
Mốc giao diện: **`stable-2026-10-02-ui`** (commit `cdd2306`, sau nâng cấp giao diện 5 bước: dark mode, thanh bên/ngăn kéo, Gantt, kéo thả Kanban, dashboard hiệu suất).
Mốc mới nhất: **`stable-2026-10-04`** (commit `e4b2c73`, cần DB đã chạy migration đến `0011`): vai trò PM/DEV/BA/Tester, nhiệm vụ mở rộng, cây use case 3 cấp, 184 use case thật, tiến độ theo 5 bước chuẩn + cập nhật hàng loạt, nguồn gốc/không thực hiện.

**Lưu ý khi quay về mốc cũ:** các mốc trước `stable-2026-10-04` không hiểu vai trò `dev`/`tester`/`ba` nên cần chạy thêm script rollback DB tương ứng (xem các mục 4b-4d). Quay về `stable-2026-10-04` thì DB giữ nguyên.

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

## 4d. Hoàn tác migration `0011` (nguồn gốc use case, "Không thực hiện")

- `0011` chỉ thêm cột và một giá trị trạng thái; bản giao diện cũ vẫn chạy (use case "Không thực hiện" sẽ hiện như use case thường ở bản cũ). Rollback Cloudflare/git là đủ để khôi phục dịch vụ.
- Gỡ hẳn trong DB: `supabase/imports/qtvt_usecases_origin_rollback.sql` (xóa KTH-xxx, trả nguồn gốc về mặc định) rồi `supabase/rollback/0011_rollback.sql`. Thứ tự gỡ khi cần quay về trước 0009: 0011 → 0010 → import/rollback → 0009.
- Giao diện bản mới ghi các cột `origin`, `change_note`, `agreed_when` khi lưu use case: luôn chạy `0011` trước khi deploy.

## 4e. Hoàn tác migration `0012` (nhiệm vụ liên kết nhiều use case)

- `0012` chỉ thêm bảng `task_use_cases`; cột `tasks.use_case_id` vẫn được giữ (luôn là use case đầu tiên) nên bản giao diện cũ vẫn chạy và thấy một use case cho mỗi nhiệm vụ. Rollback Cloudflare/git là đủ để khôi phục dịch vụ.
- Gỡ hẳn trong DB: `supabase/rollback/0012_rollback.sql` (mất các liên kết use case thứ hai trở đi). Giao diện bản mới đọc/ghi bảng này: chạy `0012` trước khi deploy; nếu chưa chạy, giao diện vẫn mở và xem được (dùng cột cũ) nhưng sẽ báo lỗi khi lưu nhiều liên kết.

## 4f. Hoàn tác migration `0013` (tài khoản ảo, gợi ý, hợp nhất, người thực hiện)

- `0013` cho phép bản ghi profile không có tài khoản đăng nhập (tài khoản ảo). Bản giao diện cũ vẫn chạy nhưng sẽ hiện tài khoản ảo như một thành viên thường (không có email). Rollback Cloudflare/git là đủ để khôi phục dịch vụ.
- Gỡ hẳn trong DB: `supabase/rollback/0013_rollback.sql`. **MẤT DỮ LIỆU:** mọi tài khoản ảo bị xóa (họ rời dự án, nhiệm vụ họ phụ trách thành chưa giao) vì phải gắn lại ràng buộc profiles → auth.users. Phải chạy TRƯỚC khi hoàn tác `0012` trở về trước.
- Giao diện bản mới gọi các hàm `suggest_accounts`, `add_project_member_by_id`, `set_use_case_stages(..., p_actor)`: luôn chạy `0013` trước khi deploy.

## 4g. Hoàn tác migration `0014` (nhắc nhở qua Telegram)

- `0014` chỉ thêm bảng `telegram_links`, trigger gửi tin và vài hàm RPC; không đổi dữ liệu cũ. Bản giao diện cũ vẫn chạy bình thường khi `0014` còn trong DB. Rollback Cloudflare/git là đủ để khôi phục dịch vụ; nếu chỉ muốn tạm ngừng gửi tin thì xóa token: `delete from vault.secrets where name = 'telegram_bot_token';`.
- Gỡ hẳn trong DB: `supabase/rollback/0014_rollback.sql` (xóa các Chat ID đã lưu, khôi phục `scan_deadlines` bản 0005, giữ nguyên extension và secret trong Vault). Phải chạy TRƯỚC khi hoàn tác `0013` trở về trước.
- Giao diện bản mới gọi `get_my_telegram`, `set_my_telegram`, `send_telegram_test`, `telegram_test_result`: luôn chạy `0014` trước khi deploy.

## 4h. Hoàn tác migration `0015`, `0016`, `0017` (Telegram: thời gian chờ, kết quả nút nhắc nhở, nhắc lặp lại)

- `0015` chỉ đổi thời gian chờ gọi Telegram (`supabase/rollback/0015_rollback.sql`). `0016` đổi `send_task_reminder` để trả kết quả giao tin và gửi bản sao cho người bấm (`supabase/rollback/0016_rollback.sql` trả về bản gốc, không mất dữ liệu). Giao diện bản mới chạy được với cả bản DB cũ (chỉ hiện thông báo chung). Thứ tự hoàn tác: `0017` -> `0016` -> `0015` -> `0014`.
- `0017` (nhắc lặp lại hằng ngày): `supabase/rollback/0017_rollback.sql` trả `scan_deadlines` về bản chỉ nhắc việc mới (mất bảng nhật ký `telegram_digest_log`, không ảnh hưởng dữ liệu khác).

## 4i. Migration `0018` (sửa lỗ hổng phân quyền) và `0020` (bước tuần tự, đặt mức, báo cáo quyền)

- `0018` chỉ thay các hàm `can_*` bằng bản luôn trả true/false. **Không nên hoàn tác** (bản cũ để người ngoài dự án vượt kiểm tra của các RPC). Giao diện không phụ thuộc vào nó.
- `0020`: giao diện bản mới chạy được với DB cũ ở phần tick từng bước (chỉ mất quy tắc tuần tự); các nút "Đặt mức tiến độ" và "Kiểm tra quyền thực tế" cần `0020`. Hoàn tác DB: `supabase/rollback/0020_rollback.sql` (không mất dữ liệu; các bước đã tick giữ nguyên). Thứ tự hoàn tác: `0020` trước `0018`.

## 4j. Hoàn tác migration `0021` (cấu hình ma trận phân quyền)

- `0021` chuyển các hàm `can_*` sang tra bảng `role_permissions`; không cấu hình gì thì hành vi y hệt trước. Giao diện bản mới chạy được với DB cũ (ma trận chỉ đọc theo mặc định, nút chỉnh sửa báo cần chạy migration).
- Hoàn tác DB: `supabase/rollback/0021_rollback.sql` trả các hàm về ma trận CỐ ĐỊNH. **MẤT DỮ LIỆU:** mọi cấu hình phân quyền và nhật ký thay đổi. Nếu admin đã nới quyền cho vai trò nào thì sau hoàn tác họ mất quyền đó ngay. Thứ tự hoàn tác: `0021` -> `0020` -> `0018`.
- Nếu một cấu hình làm hệ thống khó dùng: quản trị viên luôn đủ mọi quyền, mở Đội ngũ -> Chỉnh sửa phân quyền -> "Khôi phục mặc định" (không cần rollback).

## 4k. Hoàn tác migration `0022` (thêm/sửa/xóa tiêu chuẩn Quality Gates)

- `0022` tách quyền định nghĩa tiêu chuẩn khỏi quyền thẩm định. Giao diện bản mới chạy được với DB cũ (PM thêm/sửa/xóa được vì quyền cũ đã gồm PM; Tester thì vẫn được như trước cho đến khi chạy `0022`).
- Hoàn tác DB: `supabase/rollback/0022_rollback.sql` (không mất tiêu chuẩn nào; chỉ xóa cấu hình `edit_quality_items` đã lưu). Thứ tự hoàn tác: `0022` -> `0021`.
- Nếu Tester cần thêm tiêu chuẩn như trước: Đội ngũ -> Chỉnh sửa phân quyền -> bật "Thêm, sửa, xóa tiêu chuẩn Quality Gates" cho Tester (không cần rollback).

## 4p. Hoàn tác migration `0027` (dự án Công khai / Riêng tư)

- Hoàn tác DB: `supabase/rollback/0027_rollback.sql` (xóa cột `visibility` và hai hàm): mọi dự án về Riêng tư, **người chưa đăng nhập không còn xem được gì**. Giao diện bản mới chạy được cả khi thiếu `0027` (người xem ẩn danh thấy trang đăng nhập; nút Công khai ẩn). Cần `0025` và `0026` còn nguyên (hàm đọc dữ liệu dùng bảng độ ưu tiên và mã cũ của dự án). Độc lập về thứ tự rollback: chạy `0027` trước `0026`/`0025`.

## 4o. Hoàn tác migration `0026` (link Telegram, mã cũ của dự án)

- Giao diện chạy được cả khi chưa có `0026` (tra mã cũ báo lỗi thì coi như không có). Hoàn tác DB: `supabase/rollback/0026_rollback.sql`: tin Telegram và bản tóm tắt hằng ngày trở lại không kèm link; mất cài đặt địa chỉ gốc và bảng mã cũ của dự án (link cũ chứa mã cũ sẽ báo "không tìm thấy"). Độc lập với `0023`-`0025`.

## 4n. Hoàn tác migration `0025` (độ ưu tiên issue cấu hình được)

- **Khác các lần trước:** giao diện bản mới (từ commit độ ưu tiên) cần `0025`; giao diện bản cũ cần DB chưa có `0025`. Hoàn tác DB thì phải rollback Cloudflare/git về bản trước đó, nếu không tab Lỗi & Yêu Cầu tự ẩn (thiếu bảng độ ưu tiên).
- Hoàn tác DB: `supabase/rollback/0025_rollback.sql`. Issue được chuyển về 4 mức chữ theo tên mức (Khẩn cấp, Cao, Thấp giữ nguyên; mọi mức khác, kể cả "Vừa" và tên tự đặt, thành "Trung bình"). **MẤT:** cấu hình độ ưu tiên đã chỉnh. Thứ tự: `0025` -> `0024` -> `0023`.

## 4m. Hoàn tác migration `0024` (ảnh / video đính kèm issue)

- Giao diện bản mới chạy được với DB cũ: khi chưa có `0024`, phần "Ảnh / video đính kèm" tự ẩn, issue vẫn dùng bình thường. Rollback Cloudflare/git là đủ để gỡ phần giao diện.
- Hoàn tác DB: `supabase/rollback/0024_rollback.sql`. **MẤT DỮ LIỆU:** thông tin các tệp đính kèm (và dòng nhật ký "Tệp đính kèm"). Tệp thật trong Storage KHÔNG bị SQL xóa: vào Dashboard > Storage > bucket `issue-attachments` > Empty bucket rồi Delete bucket. Thứ tự: `0024` -> `0023`.

## 4l. Hoàn tác migration `0023` (quản lý issue)

- Giao diện bản mới chạy được với DB cũ: khi chưa có `0023`, tab "Lỗi & Yêu Cầu" tự ẩn khỏi menu. Rollback Cloudflare/git là đủ để gỡ phần giao diện.
- Hoàn tác DB: `supabase/rollback/0023_rollback.sql`. **MẤT DỮ LIỆU:** mọi issue, nhật ký, loại/trạng thái issue, cấu hình phân quyền của các quyền issue và thông báo loại "issue". Nếu đã chạy `0024` (tệp đính kèm) thì hoàn tác `0024` trước. Thứ tự: `0024` -> `0023` -> `0022`.

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
