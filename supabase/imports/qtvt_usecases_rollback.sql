-- Hoàn tác lần nhập use case dự án GPDN_DNMB_EVNNPC_QTVT_251004.
-- Xóa các module gốc do lần nhập tạo; các nhóm và use case bên dưới bị xóa theo (ON DELETE CASCADE).
-- Nhiệm vụ đã gắn vào các use case này sẽ mất liên kết use case (use_case_id = null) nhưng không bị xóa.
-- LƯU Ý: use case do bạn tự tạo thêm bên trong các module này cũng sẽ bị xóa theo.

delete from public.use_cases
 where project_id = (select id from public.projects where code = 'GPDN_DNMB_EVNNPC_QTVT_251004')
   and parent_id is null
   and code in ('W-I', 'W-II', 'W-III', 'W-IV', 'M-I', 'M-II', 'M-III', 'TH', 'VP-I', 'VP-II', 'VP-III', 'VP-IV', 'VP-V', 'VP-VI', 'VP-VII', 'VP-VIII', 'VP-IX', 'VP-X', 'VP-XI', 'KDL-I', 'KDL-II', 'KDL-III', 'KDL-IV');
