// Mỗi dự án có một màu nhận diện ổn định, suy ra từ mã dự án (không cần lưu trong DB).
// Liệt kê nguyên văn các class để Tailwind không loại bỏ chúng khi build.
export const PROJECT_COLORS = [
  { bg: 'bg-indigo-600', text: 'text-indigo-600' },
  { bg: 'bg-emerald-700', text: 'text-emerald-700' },
  { bg: 'bg-blue-600', text: 'text-blue-600' },
  { bg: 'bg-amber-700', text: 'text-amber-700' },
  { bg: 'bg-rose-600', text: 'text-rose-600' },
  { bg: 'bg-purple-600', text: 'text-purple-600' }
] as const;

export function projectColor(code: string) {
  let h = 0;
  for (let i = 0; i < code.length; i++) h = (h * 31 + code.charCodeAt(i)) >>> 0;
  return PROJECT_COLORS[h % PROJECT_COLORS.length];
}

/** Hai ký tự đầu của mã dự án, hiển thị trong chip màu. */
export const projectInitials = (code: string) => code.replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() || 'PM';
