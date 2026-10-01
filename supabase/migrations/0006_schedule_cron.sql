-- Omni Project Manager - 0006: lịch chạy tự động bằng pg_cron.
-- Cần bật extension pg_cron (Database -> Extensions -> pg_cron) hoặc để lệnh đầu tiên bên dưới tự bật.
-- Giờ trong cron là UTC; Việt Nam = UTC+7.

create extension if not exists pg_cron with schema pg_catalog;

-- Chạy lại file này an toàn: gỡ lịch cũ cùng tên trước.
select cron.unschedule(jobid) from cron.job
 where jobname in ('omni-scan-deadlines', 'omni-snapshot-progress');

-- 08:00 sáng giờ VN: quét task quá hạn / sắp đến hạn và tạo thông báo.
select cron.schedule('omni-scan-deadlines', '0 1 * * *', $$select public.scan_deadlines()$$);

-- 23:55 giờ VN: chốt ảnh chụp tiến độ trong ngày cho mọi dự án.
select cron.schedule('omni-snapshot-progress', '55 16 * * *', $$select public.snapshot_all_projects()$$);

-- Kiểm tra: select jobname, schedule, active from cron.job;
