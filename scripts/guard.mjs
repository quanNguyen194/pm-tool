// Kiểm tra "hợp đồng" của codebase sau khi giao diện được chỉnh sửa bằng công cụ bên ngoài (vd Google AI Studio).
// Không thay thế type check/build: bắt các lỗi mà tsc không thấy (lộ khóa, quay lại localStorage, bị CSP chặn...).
// Chạy: node scripts/guard.mjs   (exit 1 nếu có LỖI; CẢNH BÁO chỉ in ra)
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const errors = [];
const warnings = [];

const walk = dir =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
const rel = p => path.relative(root, p).replaceAll('\\', '/');
const read = p => fs.readFileSync(p, 'utf8');

const srcFiles = walk(path.join(root, 'src')).filter(f => /\.(ts|tsx|css)$/.test(f));
const codeFiles = srcFiles.filter(f => /\.(ts|tsx)$/.test(f));

// 1. Tệp bắt buộc còn tồn tại
for (const f of [
  'src/lib/supabase.ts',
  'src/context/AppContext.tsx',
  'src/context/AuthContext.tsx',
  'public/_headers',
  'wrangler.jsonc',
  'supabase/migrations/0001_schema.sql'
]) {
  if (!fs.existsSync(path.join(root, f))) errors.push(`Thiếu tệp bắt buộc: ${f}`);
}

// 2. Hợp đồng export của context (giao diện gọi qua useApp / useAuth)
const exportsOf = (file, names) => {
  const p = path.join(root, file);
  if (!fs.existsSync(p)) return;
  const text = read(p);
  for (const n of names) {
    if (!new RegExp(`export\\s+(const|function)\\s+${n}\\b`).test(text)) errors.push(`${file} không còn export "${n}"`);
  }
};
exportsOf('src/context/AppContext.tsx', ['AppProvider', 'useApp']);
exportsOf('src/context/AuthContext.tsx', ['AuthProvider', 'useAuth']);

// 3. Mẫu nguy hiểm trong mã nguồn
const rules = [
  { re: /service_role/i, level: 'error', msg: 'Nhắc tới service_role key (không bao giờ được đưa vào frontend)' },
  { re: /GEMINI_API_KEY|@google\/genai|GoogleGenAI/, level: 'error', msg: 'Dùng Gemini API ở frontend sẽ làm lộ khóa trong bundle' },
  { re: /process\.env\./, level: 'error', msg: 'process.env không tồn tại ở trình duyệt; dùng import.meta.env.VITE_*' },
  { re: /dangerouslySetInnerHTML/, level: 'warn', msg: 'dangerouslySetInnerHTML: chỉ dùng với nội dung do mình tạo, không chứa văn bản người dùng' },
  { re: /\beval\(|new Function\(/, level: 'error', msg: 'eval/new Function bị CSP chặn và không an toàn' },
  { re: /document\.write\(/, level: 'warn', msg: 'document.write: phải escape mọi văn bản người dùng (xem esc() trong exportUtils.ts)' }
];
for (const f of codeFiles) {
  const text = read(f);
  for (const r of rules) {
    if (r.re.test(text)) (r.level === 'error' ? errors : warnings).push(`${rel(f)}: ${r.msg}`);
  }
  // localStorage chỉ được dùng cho tuỳ chọn giao diện trong AppContext
  if (/localStorage/.test(text) && !['src/context/AppContext.tsx', 'src/context/ThemeContext.tsx'].includes(rel(f)) && !rel(f).startsWith('src/lib/supabase')) {
    warnings.push(`${rel(f)}: dùng localStorage. Dữ liệu nghiệp vụ phải lưu ở Supabase, không lưu ở trình duyệt`);
  }
}

// 4. Tên miền ngoài (CSP chỉ cho phép chính site, *.supabase.co, Google Fonts)
const allowedHost = h =>
  h === 'localhost' ||
  h.endsWith('.supabase.co') ||
  h === 'fonts.googleapis.com' ||
  h === 'fonts.gstatic.com' ||
  h === 'www.w3.org' || // xmlns của SVG
  h === 'claude.com'; // chỉ xuất hiện trong chú thích
const urlRe = /https?:\/\/([a-z0-9.-]+)/gi;
const urlSources = [...codeFiles, path.join(root, 'index.html'), ...srcFiles.filter(f => f.endsWith('.css'))];
for (const f of urlSources) {
  const hosts = new Set();
  for (const m of read(f).matchAll(urlRe)) if (!allowedHost(m[1].toLowerCase())) hosts.add(m[1]);
  for (const h of hosts) warnings.push(`${rel(f)}: gọi/nhúng tên miền ngoài "${h}". CSP trong public/_headers có thể chặn, hãy cập nhật nếu cố ý`);
}

// 5. CSP không bị nới lỏng
const headers = fs.existsSync(path.join(root, 'public/_headers')) ? read(path.join(root, 'public/_headers')) : '';
if (/script-src[^;\n]*('unsafe-inline'|'unsafe-eval')/.test(headers)) errors.push('public/_headers: script-src không được có unsafe-inline/unsafe-eval');
if (!/Content-Security-Policy/.test(headers)) errors.push('public/_headers: mất Content-Security-Policy');

// 6. Biến môi trường frontend: chỉ cho phép VITE_SUPABASE_*
for (const f of codeFiles) {
  for (const m of read(f).matchAll(/import\.meta\.env\.([A-Z0-9_]+)/g)) {
    if (!['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'].includes(m[1])) {
      warnings.push(`${rel(f)}: dùng biến môi trường ${m[1]} (cần khai báo trên Cloudflare lúc build, và đừng chứa bí mật)`);
    }
  }
}

for (const w of warnings) console.log(`CẢNH BÁO  ${w}`);
for (const e of errors) console.log(`LỖI       ${e}`);
console.log(`\nGuard: ${errors.length} lỗi, ${warnings.length} cảnh báo`);
process.exit(errors.length ? 1 : 0);
