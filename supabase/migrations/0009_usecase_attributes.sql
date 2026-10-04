-- Omni Project Manager - 0009: thuộc tính mở rộng cho use case (phục vụ nhập danh sách chức năng hàng loạt).
-- Chạy trong Supabase SQL Editor SAU 0008. Chỉ THÊM cột nên bản giao diện hiện tại vẫn chạy bình thường.
--
--  kind        group = module/nhóm chức năng (chỉ để gom, không tính là use case); usecase = use case thật.
--  tags        nhãn phân loại (Web, Mobile, Tích hợp dữ liệu, Văn phòng, Kho dữ liệu...), dùng để lọc.
--  complexity  độ phức tạp: simple / medium / complex (trọng số điểm UCP 5 / 10 / 15).
--  transactions số transaction của use case.
--  necessity   mức độ cần thiết (B, M, T theo bảng chuyển đổi use case).

alter table public.use_cases
  add column kind text not null default 'usecase' check (kind in ('group', 'usecase')),
  add column tags text[] not null default '{}',
  add column complexity text check (complexity in ('simple', 'medium', 'complex')),
  add column transactions integer check (transactions >= 0),
  add column necessity text not null default 'B';

create index use_cases_tags_idx on public.use_cases using gin (tags);

-- Cho phép người có quyền sửa use case (admin, PM, DEV, BA) ghi các cột mới, giống các cột còn lại.
grant insert (kind, tags, complexity, transactions, necessity) on public.use_cases to authenticated;
grant update (kind, tags, complexity, transactions, necessity) on public.use_cases to authenticated;
