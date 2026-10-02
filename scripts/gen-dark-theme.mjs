// Sinh src/styles/dark-theme.css: bảng màu chế độ tối cho toàn bộ giao diện mà không phải sửa từng class.
// Chạy lại khi thêm màu/biến thể mới:  node scripts/gen-dark-theme.mjs
//
// Cách hoạt động (Tailwind 4: mọi utility màu đọc biến --color-*):
//  1. Dưới `.dark`, đổi các biến sắc độ nhạt (slate 50-950, các màu nhấn 50-300) sang sắc độ tối tương ứng.
//  2. `text-<màu>-600..900` vốn là chữ đậm trên nền sáng => thay bằng sắc độ sáng hơn (class riêng, vì cùng sắc độ
//     đó còn dùng làm nền nút đặc `bg-indigo-600` cần giữ nguyên).
//  3. `bg-white` => màu bề mặt tối. `text-white` giữ nguyên.
//  4. `.theme-fixed` đặt lại biến về giá trị sáng cho vùng vốn đã tối sẵn (thanh Gantt, tab đang chọn).
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const theme = fs.readFileSync(path.join(root, 'node_modules/tailwindcss/theme.css'), 'utf8');
const val = (hue, shade) => {
  const m = theme.match(new RegExp(`--color-${hue}-${shade}:\\s*([^;]+);`));
  if (!m) throw new Error(`Không thấy --color-${hue}-${shade} trong theme Tailwind`);
  return m[1].trim();
};

// Sáng -> tối cho biến màu.
const SLATE_MAP = { 50: 950, 100: 800, 200: 700, 300: 600, 400: 400, 500: 400, 600: 300, 700: 200, 800: 100, 900: 50, 950: 50 };
const ACCENT_HUES = ['indigo', 'emerald', 'blue', 'amber', 'rose', 'purple'];
const ACCENT_MAP = { 50: 950, 100: 900, 200: 800, 300: 700 };
// Chữ đậm trên nền sáng -> chữ sáng trên nền tối.
const TEXT_MAP = { 600: 400, 700: 300, 800: 200, 900: 100, 950: 50 };
const SURFACE = val('slate', 900);

const lightVars = [];
const darkVars = [];
for (const [from, to] of Object.entries(SLATE_MAP)) {
  lightVars.push(`  --color-slate-${from}: ${val('slate', from)};`);
  darkVars.push(`  --color-slate-${from}: ${val('slate', to)};`);
}
for (const hue of ACCENT_HUES) {
  for (const [from, to] of Object.entries(ACCENT_MAP)) {
    lightVars.push(`  --color-${hue}-${from}: ${val(hue, from)};`);
    darkVars.push(`  --color-${hue}-${from}: ${val(hue, to)};`);
  }
}

// Chỉ sinh quy tắc chữ cho những class thật sự được dùng trong mã nguồn.
const walk = d =>
  fs.readdirSync(d, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const used = new Set();
const re = /(hover:)?text-(indigo|emerald|blue|amber|rose|purple)-(600|700|800|900|950)(?![\d/])/g;
for (const f of walk(path.join(root, 'src')).filter(f => /\.(tsx|ts)$/.test(f))) {
  for (const m of fs.readFileSync(f, 'utf8').matchAll(re)) used.add(m[0]);
}
const textRules = [...used].sort().map(cls => {
  const [, hover, hue, shade] = cls.match(/^(hover:)?text-([a-z]+)-(\d+)$/);
  const sel = `.dark .${hover ? 'hover\\:' : ''}text-${hue}-${shade}${hover ? ':hover' : ''}`;
  const fixedSel = sel.replace('.dark .', '.dark .theme-fixed .');
  return [`${sel} { color: ${val(hue, TEXT_MAP[shade])}; }`, `${fixedSel} { color: ${val(hue, shade)}; }`];
}).flat();

const css = `/* TỰ SINH bởi scripts/gen-dark-theme.mjs. Không sửa tay, hãy sửa script rồi chạy lại. */

.dark {
  color-scheme: dark;
${darkVars.join('\n')}
}

/* Vùng vốn đã tối sẵn (thanh Gantt, tab đang chọn): giữ nguyên bảng màu sáng. */
.dark .theme-fixed {
${lightVars.join('\n')}
}

/* Bề mặt */
.dark .bg-white { background-color: ${SURFACE}; }
.dark .border-white { border-color: ${SURFACE}; }

/* Chữ nhấn đậm -> sáng hơn (${used.size} class đang dùng); trong .theme-fixed thì giữ màu gốc */
${textRules.join('\n')}
`;

const out = path.join(root, 'src/styles/dark-theme.css');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, css);
console.log(`Đã ghi ${path.relative(root, out)} (${darkVars.length} biến, ${textRules.length} quy tắc chữ)`);
