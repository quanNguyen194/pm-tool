import { Project, Task, UseCase, QualityGatePhase, User, ProgressSnapshot, ReportRun } from '../types';
import { buildProgressChartSvg } from './chartSvg';
import { flattenUseCaseTree, leafUseCases } from './useCaseTree';
import { ASSESSMENT_LABELS, effectiveAssessment } from './taskAssessment';

/** Escape văn bản người dùng nhập trước khi chèn vào HTML của cửa sổ in (chống XSS). */
function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Downloads a UTF-8 CSV string with BOM so that Vietnamese accents render correctly in Excel.
 */
export function downloadCSV(filename: string, rows: (string | number)[][]) {
  const processCell = (cell: string | number): string => {
    if (cell === null || cell === undefined) return '""';
    const text = String(cell).replace(/"/g, '""');
    return `"${text}"`;
  };

  const csvContent = '\uFEFF' + rows.map(e => e.map(processCell).join(',')).join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Exports current project tasks to CSV
 */
export function exportTasksToCSV(project: Project, tasks: Task[], users: User[], useCases: UseCase[] = []) {
  const userMap = new Map(users.map(u => [u.id, u.name]));
  const useCaseCodes = new Map(useCases.map(u => [u.id, u.code]));
  
  const headers = [
    'Mã Công Việc',
    'Nội Dung',
    'Mô Tả',
    'Người Chủ Trì',
    'Người Phối Hợp',
    'Bộ Phận Thực Hiện',
    'Ngày Bắt Đầu Dự Kiến',
    'Deadline',
    'Ngày Hoàn Thành Thực Tế',
    'Trạng Thái',
    'Tiến Độ (%)',
    'Đánh Giá',
    'Mô Tả Yêu Cầu Đầu Ra',
    'Ghi Chú',
    'Nỗ Lực Dự Kiến (ngày công)',
    'Nỗ Lực Thực Tế (ngày công)',
    'Mức Độ Ưu Tiên',
    'Giai Đoạn',
    'Liên Kết Use Case'
  ];

  const departmentMap: Record<string, string> = { pm: 'PM', ba: 'BA', dev: 'DEV', tester: 'Tester' };

  const statusMap: Record<string, string> = {
    todo: 'Cần làm (To Do)',
    in_progress: 'Đang thực hiện (In Progress)',
    review: 'Chờ duyệt / Review',
    done: 'Hoàn thành (Done)'
  };

  const priorityMap: Record<string, string> = {
    low: 'Thấp',
    medium: 'Trung bình',
    high: 'Cao',
    urgent: 'Khẩn cấp'
  };

  const rows = tasks.map(t => [
    t.code,
    t.title,
    t.description || '',
    userMap.get(t.assigneeId) || 'Chưa phân công',
    t.collaboratorIds.map(id => userMap.get(id) || id).join('; '),
    (t.department && departmentMap[t.department]) || '',
    t.startDate,
    t.dueDate,
    t.actualEndDate || '',
    statusMap[t.status] || t.status,
    t.progressPercent,
    ASSESSMENT_LABELS[effectiveAssessment(t).value],
    t.deliverable,
    t.notes,
    t.estimatedEffort,
    t.actualEffort,
    priorityMap[t.priority] || t.priority,
    t.phase,
    (t.useCaseId && (useCaseCodes.get(t.useCaseId) ?? t.useCaseId)) || 'Không'
  ]);

  downloadCSV(`Danh_sach_cong_viec_${project.code}_${new Date().toISOString().split('T')[0]}.csv`, [headers, ...rows]);
}

/**
 * Exports project use cases to CSV
 */
export function exportUseCasesToCSV(project: Project, useCases: UseCase[]) {
  const headers = [
    'Cấp',
    'Loại',
    'Nhãn',
    'Độ Phức Tạp',
    'Số Transaction',
    'Mức Cần Thiết',
    'Mã Use Case',
    'Mã Use Case Cha',
    'Tên Chức Năng',
    'Tác Nhân (Actor)',
    'Trạng Thái',
    'Mức Độ Ưu Tiên',
    'Tiến Độ (%)',
    'Số Tiêu Chí Nghiệm Thu',
    'Tiêu Chí Đã Hoàn Thành',
    'Ngày Cập Nhật',
    'Nguồn Gốc',
    'Lý Do / Giải Trình',
    'Thời Điểm Thống Nhất'
  ];

  const statusMap: Record<string, string> = {
    draft: 'Bản thảo',
    in_review: 'Đang xem xét',
    approved: 'Đã phê duyệt',
    developing: 'Đang phát triển',
    tested: 'Đã kiểm thử QA',
    completed: 'Hoàn thành',
    cancelled: 'Không thực hiện'
  };

  const codeById = new Map(useCases.map(u => [u.id, u.code]));
  const rows = flattenUseCaseTree(useCases).map(({ useCase: uc, depth }) => {
    const totalCriteria = uc.acceptanceCriteria.length;
    const passedCriteria = uc.acceptanceCriteria.filter(c => c.completed).length;

    const complexityMap: Record<string, string> = { simple: 'Đơn giản', medium: 'Trung bình', complex: 'Phức tạp' };
    return [
      depth,
      uc.kind === 'group' ? 'Module/Nhóm' : 'Use case',
      uc.tags.join('; '),
      (uc.complexity && complexityMap[uc.complexity]) || '',
      uc.transactions ?? '',
      uc.necessity,
      uc.code,
      (uc.parentId && codeById.get(uc.parentId)) || '',
      uc.title,
      uc.actor,
      statusMap[uc.status] || uc.status,
      uc.priority.toUpperCase(),
      `${uc.progressPercent}%`,
      totalCriteria,
      passedCriteria,
      uc.updatedAt,
      { contract: 'Theo hợp đồng', added: 'Bổ sung', adjusted: 'Điều chỉnh' }[uc.origin],
      uc.changeNote,
      uc.agreedWhen
    ];
  });

  downloadCSV(`Danh_sach_UseCase_${project.code}_${new Date().toISOString().split('T')[0]}.csv`, [headers, ...rows]);
}

/**
 * Generates and triggers browser print for a complete, beautifully formatted periodic report
 */
export function printPeriodicReport(
  project: Project,
  tasks: Task[],
  useCases: UseCase[],
  phases: QualityGatePhase[],
  reportType: 'weekly' | 'monthly' | 'sprint',
  currentUserName: string,
  snapshots: ProgressSnapshot[] = []
) {
  const reportTitles = {
    weekly: 'BÁO CÁO TIẾN ĐỘ ĐỊNH KỲ TUẦN (WEEKLY STATUS REPORT)',
    monthly: 'BÁO CÁO QUẢN TRỊ TỔNG HỢP THÁNG (MONTHLY EXECUTIVE REPORT)',
    sprint: 'BÁO CÁO TỔNG KẾT GIAI ĐOẠN / SPRINT RELEASE'
  };

  const totalTasks = tasks.length;
  const doneTasks = tasks.filter(t => t.status === 'done').length;
  const inProgressTasks = tasks.filter(t => t.status === 'in_progress').length;
  const overdueTasks = tasks.filter(t => t.status !== 'done' && new Date(t.dueDate) < new Date()).length;

  const leaves = leafUseCases(useCases);
  const totalUseCases = leaves.length;
  const completedUseCases = leaves.filter(uc => uc.status === 'completed' || uc.status === 'tested').length;

  // Calculate Quality Gate passing rate
  let totalQualityItems = 0;
  let passedQualityItems = 0;
  phases.forEach(p => {
    p.items.forEach(item => {
      totalQualityItems++;
      if (item.isPassed) passedQualityItems++;
    });
  });
  const qualityRate = totalQualityItems > 0 ? Math.round((passedQualityItems / totalQualityItems) * 100) : 100;

  const chartSection =
    snapshots.length > 0
      ? `<h2>BIỂU ĐỒ TIẾN ĐỘ THEO THỜI GIAN</h2>
  <div style="margin-bottom: 20px;">${buildProgressChartSvg(snapshots, project, { mode: 'progress' })}</div>`
      : '';

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    window.print();
    return;
  }

  const html = `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <title>${reportTitles[reportType]} - ${esc(project.name)}</title>
  <style>
    @page { size: A4; margin: 15mm; }
    body {
      font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
      color: #0f172a;
      line-height: 1.5;
      font-size: 13px;
      margin: 0;
      padding: 20px;
    }
    .header {
      border-bottom: 2px solid #0f172a;
      padding-bottom: 15px;
      margin-bottom: 20px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    .brand { font-size: 18px; font-weight: 700; letter-spacing: -0.5px; }
    .report-title { font-size: 16px; font-weight: 700; color: #0f172a; margin-top: 5px; }
    .meta-box { font-size: 12px; color: #475569; text-align: right; }
    .grid-kpi {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      margin-bottom: 24px;
    }
    .kpi-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      padding: 12px;
      border-radius: 6px;
    }
    .kpi-title { font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 600; margin-bottom: 4px; }
    .kpi-value { font-size: 20px; font-weight: 700; color: #0f172a; font-variant-numeric: tabular-nums; }
    .kpi-sub { font-size: 11px; color: #475569; margin-top: 4px; }
    h2 { font-size: 14px; font-weight: 700; border-left: 4px solid #4f46e5; padding-left: 8px; margin: 20px 0 10px 0; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 12px; }
    th { background: #f1f5f9; text-align: left; padding: 8px 10px; font-weight: 600; border: 1px solid #cbd5e1; }
    td { padding: 7px 10px; border: 1px solid #e2e8f0; vertical-align: top; }
    tr:nth-child(even) { background: #fafafa; }
    .badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 600; }
    .badge-done { background: #dcfce7; color: #166534; }
    .badge-in_progress { background: #dbeafe; color: #1e40af; }
    .badge-review { background: #fef3c7; color: #92400e; }
    .badge-todo { background: #f1f5f9; color: #475569; }
    .badge-urgent { background: #fee2e2; color: #991b1b; }
    .footer {
      margin-top: 30px;
      border-top: 1px solid #e2e8f0;
      padding-top: 12px;
      font-size: 11px;
      color: #64748b;
      display: flex;
      justify-content: space-between;
    }
    .sign-section {
      display: flex;
      justify-content: space-between;
      margin-top: 40px;
      text-align: center;
      page-break-inside: avoid;
    }
    .sign-box { width: 30%; }
    .sign-box .role { font-weight: 600; margin-bottom: 50px; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="brand">OMNIPROJECT ENTERPRISE PMO</div>
      <div class="report-title">${reportTitles[reportType]}</div>
      <div style="font-size: 13px; font-weight: 600; margin-top: 4px;">Dự án: [${esc(project.code)}] ${esc(project.name)}</div>
    </div>
    <div class="meta-box">
      <div><strong>Ngày xuất báo cáo:</strong> ${new Date().toLocaleDateString('vi-VN')}</div>
      <div><strong>Người lập báo cáo:</strong> ${esc(currentUserName)}</div>
      <div><strong>Thời gian dự án:</strong> ${project.startDate} đến ${project.targetEndDate}</div>
    </div>
  </div>

  <div class="grid-kpi">
    <div class="kpi-card">
      <div class="kpi-title">Tiến Độ Dự Án</div>
      <div class="kpi-value">${project.progressPercent}%</div>
      <div class="kpi-sub">Giai đoạn: ${project.currentPhase.replace('_', ' ').toUpperCase()}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-title">Nhiệm Vụ Hoàn Thành</div>
      <div class="kpi-value">${doneTasks}/${totalTasks}</div>
      <div class="kpi-sub">${inProgressTasks} việc đang chạy · ${overdueTasks} quá hạn</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-title">Chỉ Số Use Case</div>
      <div class="kpi-value">${completedUseCases}/${totalUseCases}</div>
      <div class="kpi-sub">Đã kiểm thử & hoàn thành</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-title">Tuân Thủ Quality Gate</div>
      <div class="kpi-value">${qualityRate}%</div>
      <div class="kpi-sub">${passedQualityItems}/${totalQualityItems} tiêu chuẩn đạt</div>
    </div>
  </div>

  ${chartSection}

  <h2>1. TỔNG QUAN VÀ TIẾN ĐỘ THỰC HIỆN USE CASE NGHIỆP VỤ</h2>
  <table>
    <thead>
      <tr>
        <th style="width: 100px;">Mã Use Case</th>
        <th>Tên Chức Năng</th>
        <th style="width: 130px;">Tác Nhân (Actor)</th>
        <th style="width: 100px;">Trạng Thái</th>
        <th style="width: 80px; text-align: right;">Tiến Độ</th>
      </tr>
    </thead>
    <tbody>
      ${flattenUseCaseTree(useCases.filter(u => u.status !== 'cancelled')).map(({ useCase: uc, depth }) => `
        <tr>
          <td><strong>${esc(uc.code)}</strong></td>
          <td style="padding-left: ${10 + (depth - 1) * 16}px;">${esc(uc.title)}</td>
          <td>${esc(uc.actor)}</td>
          <td>${uc.status.toUpperCase()}</td>
          <td style="text-align: right; font-weight: 600;">${uc.progressPercent}%</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <h2>2. DANH SÁCH CÔNG VIỆC VÀ CẢNH BÁO TIẾN ĐỘ / DEADLINE</h2>
  <table>
    <thead>
      <tr>
        <th style="width: 80px;">Mã</th>
        <th>Tiêu Đề Công Việc</th>
        <th style="width: 90px;">Ưu Tiên</th>
        <th style="width: 100px;">Hạn Chót</th>
        <th style="width: 100px;">Trạng Thái</th>
        <th style="width: 120px;">Tiến Độ / Đánh Giá</th>
      </tr>
    </thead>
    <tbody>
      ${tasks.map(t => {
        const isPastDue = t.status !== 'done' && new Date(t.dueDate) < new Date();
        return `
          <tr>
            <td><strong>${esc(t.code)}</strong></td>
            <td>${esc(t.title)}</td>
            <td><span class="badge badge-${t.priority}">${t.priority.toUpperCase()}</span></td>
            <td style="${isPastDue ? 'color: #dc2626; font-weight: 700;' : ''}">${t.dueDate} ${isPastDue ? '(QUÁ HẠN)' : ''}</td>
            <td><span class="badge badge-${t.status}">${t.status.toUpperCase()}</span></td>
            <td>${t.progressPercent}% · ${esc(ASSESSMENT_LABELS[effectiveAssessment(t).value])}</td>
          </tr>
        `;
      }).join('')}
    </tbody>
  </table>

  <h2>3. ĐÁNH GIÁ TIÊU CHUẨN ĐẦU RA QUALITY GATES (THEO GIAI ĐOẠN)</h2>
  <table>
    <thead>
      <tr>
        <th style="width: 140px;">Giai Đoạn</th>
        <th>Tiêu Chuẩn Đảm Bảo Chất Lượng</th>
        <th style="width: 90px; text-align: center;">Bắt Buộc</th>
        <th style="width: 100px; text-align: center;">Đánh Giá</th>
      </tr>
    </thead>
    <tbody>
      ${phases.flatMap(p => p.items.map(item => `
        <tr>
          <td><strong>${esc(p.shortName)}</strong></td>
          <td>
            <div style="font-weight: 600;">${esc(item.title)}</div>
            <div style="font-size: 11px; color: #475569;">${esc(item.description)}</div>
            ${item.notes ? `<div style="font-size: 11px; color: #0284c7; margin-top: 2px;"><em>Ghi chú: ${esc(item.notes)}</em></div>` : ''}
          </td>
          <td style="text-align: center;">${item.isMandatory ? 'Bắt buộc' : 'Khuyến nghị'}</td>
          <td style="text-align: center; font-weight: 700; color: ${item.isPassed ? '#166534' : '#b91c1c'};">
            ${item.isPassed ? '✓ ĐẠT CHUẨN' : '✗ CHƯA ĐẠT'}
          </td>
        </tr>
      `)).join('')}
    </tbody>
  </table>

  <div class="sign-section">
    <div class="sign-box">
      <div class="role">ĐẠI DIỆN QUẢN LÝ DỰ ÁN (PM)</div>
      <div>(Ký và ghi rõ họ tên)</div>
    </div>
    <div class="sign-box">
      <div class="role">TRƯỞNG NHÓM QA/QC</div>
      <div>(Ký và ghi rõ họ tên)</div>
    </div>
    <div class="sign-box">
      <div class="role">BAN GIÁM ĐỐC / KHÁCH HÀNG (PO)</div>
      <div>(Ký và xác nhận nghiệm thu)</div>
    </div>
  </div>

  <div class="footer">
    <div>OmniProject Enterprise Governance Suite · Bảo mật nội bộ</div>
    <div>Trang 1 / 1 · Xuất bản lúc ${new Date().toLocaleTimeString('vi-VN')}</div>
  </div>
</body>
</html>
  `;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => {
    printWindow.print();
  }, 400);
}

const FREQUENCY_TITLES: Record<string, string> = {
  weekly: 'BÁO CÁO TIẾN ĐỘ TUẦN',
  monthly: 'BÁO CÁO TỔNG HỢP THÁNG',
  sprint: 'BÁO CÁO TỔNG KẾT SPRINT'
};

/** In một bản báo cáo đã được hệ thống lưu (dữ liệu chốt tại thời điểm tạo, không đọc lại dữ liệu hiện tại). */
export function printStoredReport(run: ReportRun, currentUserName: string) {
  const s = run.summary;
  const qualityRate = s.quality.total > 0 ? Math.round((s.quality.passed / s.quality.total) * 100) : 100;
  const delta = s.progress.delta;
  const deltaText = delta === null ? 'chưa có mốc so sánh' : `${delta >= 0 ? '+' : ''}${delta} điểm % so với đầu kỳ`;
  const fmtDate = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('vi-VN');

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    window.print();
    return;
  }

  const html = `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <title>${FREQUENCY_TITLES[run.frequency] || 'BÁO CÁO'} - ${esc(s.project.name)}</title>
  <style>
    @page { size: A4; margin: 15mm; }
    body { font-family: system-ui, -apple-system, sans-serif; color: #0f172a; line-height: 1.5; font-size: 13px; padding: 20px; }
    .header { border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 18px; }
    .brand { font-size: 18px; font-weight: 700; }
    .title { font-size: 16px; font-weight: 700; margin-top: 4px; }
    .meta { font-size: 12px; color: #475569; margin-top: 6px; }
    .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 22px; }
    .card { background: #f8fafc; border: 1px solid #e2e8f0; padding: 12px; border-radius: 6px; }
    .card .k { font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 600; }
    .card .v { font-size: 20px; font-weight: 700; }
    .card .s { font-size: 11px; color: #475569; margin-top: 4px; }
    h2 { font-size: 14px; border-left: 4px solid #4f46e5; padding-left: 8px; margin: 20px 0 10px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th { background: #f1f5f9; text-align: left; padding: 8px 10px; border: 1px solid #cbd5e1; }
    td { padding: 7px 10px; border: 1px solid #e2e8f0; }
    .late { color: #dc2626; font-weight: 700; }
    .footer { margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 10px; font-size: 11px; color: #64748b; }
  </style>
</head>
<body>
  <div class="header">
    <div class="brand">OMNIPROJECT ENTERPRISE PMO</div>
    <div class="title">${FREQUENCY_TITLES[run.frequency] || 'BÁO CÁO'}</div>
    <div class="meta">
      Dự án: <strong>[${esc(s.project.code)}] ${esc(s.project.name)}</strong> ·
      Kỳ báo cáo: <strong>${fmtDate(run.periodStart)} - ${fmtDate(run.periodEnd)}</strong> ·
      Tạo lúc: ${new Date(run.createdAt).toLocaleString('vi-VN')} · Người in: ${esc(currentUserName)}
    </div>
  </div>

  <div class="grid">
    <div class="card"><div class="k">Tiến độ dự án</div><div class="v">${s.progress.end}%</div><div class="s">${esc(deltaText)}</div></div>
    <div class="card"><div class="k">Nhiệm vụ hoàn thành</div><div class="v">${s.tasks.done}/${s.tasks.total}</div><div class="s">${s.tasks.inProgress} đang chạy · ${s.tasks.overdue} quá hạn${s.tasks.doneInPeriod !== null ? ` · ${s.tasks.doneInPeriod} xong trong kỳ` : ''}</div></div>
    <div class="card"><div class="k">Use case</div><div class="v">${s.useCases.completed}/${s.useCases.total}</div><div class="s">Đã kiểm thử &amp; hoàn thành</div></div>
    <div class="card"><div class="k">Quality Gate</div><div class="v">${qualityRate}%</div><div class="s">${s.quality.passed}/${s.quality.total} tiêu chuẩn đạt</div></div>
  </div>

  <h2>Công việc cần chú ý (quá hạn hoặc đến hạn trong 7 ngày)</h2>
  ${
    s.attention.length === 0
      ? '<p>Không có công việc nào cần chú ý.</p>'
      : `<table>
    <thead><tr><th style="width:80px">Mã</th><th>Tiêu đề</th><th style="width:110px">Hạn chót</th><th style="width:110px">Trạng thái</th></tr></thead>
    <tbody>${s.attention
      .map(a => {
        const late = new Date(a.dueDate + 'T23:59:59') < new Date();
        return `<tr><td><strong>${esc(a.code)}</strong></td><td>${esc(a.title)}</td><td class="${late ? 'late' : ''}">${esc(a.dueDate)}${late ? ' (QUÁ HẠN)' : ''}</td><td>${esc(a.status.toUpperCase())}</td></tr>`;
      })
      .join('')}</tbody>
  </table>`
  }

  <div class="footer">OmniProject · Báo cáo được hệ thống chốt số liệu tại thời điểm tạo.</div>
</body>
</html>`;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 400);
}
