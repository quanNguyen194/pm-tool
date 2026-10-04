-- Hoàn tác lần gắn nguồn gốc dự án GPDN_DNMB_EVNNPC_QTVT_251004.
-- Xóa các use case "Không thực hiện" (KTH-xxx) và module dự phòng đã thêm, trả nguồn gốc các use case khác về "theo hợp đồng".

delete from public.use_cases
 where project_id = (select id from public.projects where code = 'GPDN_DNMB_EVNNPC_QTVT_251004')
   and code in ('KTH-VP', 'KTH-001', 'KTH-002', 'KTH-003', 'KTH-004', 'KTH-005', 'KTH-006', 'KTH-007', 'KTH-008', 'KTH-009', 'KTH-010', 'KTH-011', 'KTH-012', 'KTH-013', 'KTH-014', 'KTH-015', 'KTH-016', 'KTH-017', 'KTH-018', 'KTH-019', 'KTH-020', 'KTH-021', 'KTH-022');

update public.use_cases
   set origin = 'contract', change_note = '', agreed_when = ''
 where project_id = (select id from public.projects where code = 'GPDN_DNMB_EVNNPC_QTVT_251004')
   and code in ('UC-004', 'UC-035', 'UC-036', 'UC-037', 'UC-024', 'UC-025', 'UC-054', 'UC-055', 'UC-056', 'UC-043', 'UC-044', 'UC-070', 'UC-071', 'UC-072', 'UC-073', 'UC-074', 'UC-075', 'UC-076', 'UC-077', 'UC-078', 'UC-079', 'UC-080', 'UC-081', 'UC-082', 'UC-083', 'UC-084', 'UC-085', 'UC-086', 'UC-087', 'UC-088', 'UC-089', 'UC-090', 'UC-091', 'UC-092', 'UC-093', 'UC-094', 'UC-095', 'UC-096', 'UC-097', 'UC-099', 'UC-100', 'UC-101', 'UC-102', 'UC-103', 'UC-104', 'UC-105', 'UC-106', 'UC-107', 'UC-108', 'UC-109', 'UC-110', 'UC-111', 'UC-112', 'UC-113', 'UC-114', 'UC-115', 'UC-116', 'UC-117', 'UC-118', 'UC-119', 'UC-120', 'UC-121', 'UC-122', 'UC-123', 'UC-124', 'UC-125', 'UC-126', 'UC-127', 'UC-128', 'UC-132', 'UC-171', 'UC-173', 'UC-174', 'UC-175', 'UC-146', 'UC-151', 'UC-152', 'UC-153', 'UC-154', 'UC-155', 'UC-156', 'UC-183', 'UC-184', 'UC-002', 'UC-135', 'UC-136', 'UC-137', 'UC-142', 'UC-144', 'UC-145');
