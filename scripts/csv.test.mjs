// Kiểm tra lớp chống CSV injection của src/utils/csv.ts. Chạy: npx -y node@22 --experimental-strip-types scripts/csv.test.mjs
import { csvSafeText, csvCell, buildCsv } from '../src/utils/csv.ts';

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = got === want;
  ok ? pass++ : fail++;
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (ok ? '' : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`));
};

eq('công thức = bị chặn', csvSafeText('=SUM(A1:A9)'), "'=SUM(A1:A9)");
eq('công thức + bị chặn', csvSafeText('+cmd|calc'), "'+cmd|calc");
eq('công thức - bị chặn', csvSafeText('-2+3'), "'-2+3");
eq('công thức @ bị chặn', csvSafeText('@SUM(1)'), "'@SUM(1)");
eq('tab đầu ô bị chặn', csvSafeText('\tx'), "'\tx");
eq('dấu - đơn lẻ giữ nguyên', csvSafeText('-'), '-');
eq('số âm giữ nguyên', csvSafeText('-5'), '-5');
eq('số thập phân dương giữ nguyên', csvSafeText('+3.5'), '+3.5');
eq('phần trăm giữ nguyên', csvSafeText('-10%'), '-10%');
eq('ngày giữ nguyên', csvSafeText('2026-10-21'), '2026-10-21');
eq('chữ thường giữ nguyên', csvSafeText('Lỗi đăng nhập'), 'Lỗi đăng nhập');
eq('ô số không bị đụng', csvCell(-7), '"-7"');
eq('dấu nháy kép được nhân đôi', csvCell('a"b'), '"a""b"');
eq('null thành ô rỗng', csvCell(null), '""');
eq('dựng CSV có BOM, xuống dòng và chặn công thức', buildCsv([['Mã', 'Tiêu đề'], ['#1', '=HYPERLINK("http://x")']]), '﻿"Mã","Tiêu đề"\n"#1","\'=HYPERLINK(""http://x"")"');

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
