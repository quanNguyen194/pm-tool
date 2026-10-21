// Dựng nội dung CSV an toàn cho Excel.

/**
 * Ô văn bản bắt đầu bằng = + - @ (hoặc tab / xuống dòng) bị Excel hiểu là công thức (CSV injection): thêm dấu ' phía trước.
 * Không động vào số, ngày (bắt đầu bằng chữ số) và dấu "-" đơn lẻ dùng làm chỗ trống.
 */
export function csvSafeText(text: string): string {
  if (!/^[=+\-@\t\r]/.test(text)) return text;
  if (text === '-' || /^[+-]?\d+([.,]\d+)?%?$/.test(text)) return text;
  return "'" + text;
}

export function csvCell(cell: string | number | null | undefined): string {
  if (cell === null || cell === undefined) return '""';
  const text = typeof cell === 'number' ? String(cell) : csvSafeText(String(cell));
  return `"${text.replace(/"/g, '""')}"`;
}

/** Nội dung CSV có BOM UTF-8 để Excel hiển thị đúng tiếng Việt. */
export function buildCsv(rows: (string | number | null | undefined)[][]): string {
  return '﻿' + rows.map(r => r.map(csvCell).join(',')).join('\n');
}
