-- Hoàn tác migration 0012 (nhiệm vụ liên kết nhiều use case).
-- Cột tasks.use_case_id được giữ nguyên nên bản giao diện cũ vẫn thấy use case "chính" của mỗi nhiệm vụ.
-- Nhiệm vụ nào chưa có use case chính nhưng có liên kết trong bảng mới sẽ lấy liên kết đầu tiên.
-- Mất dữ liệu: các liên kết use case thứ hai trở đi.

update public.tasks t
   set use_case_id = (select l.use_case_id from public.task_use_cases l where l.task_id = t.id order by l.use_case_id limit 1)
 where t.use_case_id is null
   and exists (select 1 from public.task_use_cases l where l.task_id = t.id);

drop trigger if exists task_use_case_mirror on public.tasks;
drop function if exists public.trg_task_use_case_mirror();
drop trigger if exists task_use_case_project on public.task_use_cases;
drop function if exists public.trg_task_use_case_project();
drop table if exists public.task_use_cases;
