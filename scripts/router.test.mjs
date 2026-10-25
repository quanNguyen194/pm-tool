// Kiểm tra phân tích / dựng đường dẫn của src/router/paths.ts.
// Chạy: npx -y node@22 --experimental-strip-types scripts/router.test.mjs
import { parsePath, buildPath, buildLoginPath, safeNext } from '../src/router/paths.ts';

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (ok ? '' : `\n   got  =${JSON.stringify(got)}\n   want =${JSON.stringify(want)}`));
};

eq('gốc', parsePath('/'), { kind: 'root' });
eq('danh sách dự án', parsePath('/projects'), { kind: 'app', tab: 'projects' });
eq('tổng quan dự án', parsePath('/p/GPDN_DNMB_EVNNPC_QTVT_251004'), { kind: 'app', tab: 'dashboard', projectCode: 'GPDN_DNMB_EVNNPC_QTVT_251004' });
eq('nhiệm vụ', parsePath('/p/ABC/tasks'), { kind: 'app', tab: 'tasks', projectCode: 'ABC' });
eq('một nhiệm vụ', parsePath('/p/ABC/tasks/OB-103'), { kind: 'app', tab: 'tasks', projectCode: 'ABC', itemCode: 'OB-103' });
eq('use case', parsePath('/p/ABC/usecases/UC-179'), { kind: 'app', tab: 'usecases', projectCode: 'ABC', itemCode: 'UC-179' });
eq('issue', parsePath('/p/ABC/issues/12'), { kind: 'app', tab: 'issues', projectCode: 'ABC', itemCode: '12' });
eq('quality, reports, team', ['quality', 'reports', 'team'].map(t => parsePath(`/p/ABC/${t}`).tab), ['quality', 'reports', 'team']);
eq('dấu / cuối được bỏ qua', parsePath('/p/ABC/tasks/'), { kind: 'app', tab: 'tasks', projectCode: 'ABC' });
eq('mã có ký tự đặc biệt được giải mã', parsePath('/p/A%20B/tasks/X%2F1'), { kind: 'app', tab: 'tasks', projectCode: 'A B', itemCode: 'X/1' });
eq('mã sai mã hóa phần trăm là không hợp lệ', parsePath('/p/%E0%A4%A/tasks'), { kind: 'unknown' });
eq('tab lạ', parsePath('/p/ABC/foo'), { kind: 'unknown' });
eq('quality không có mục con', parsePath('/p/ABC/quality/1'), { kind: 'unknown' });
eq('quá sâu', parsePath('/p/ABC/tasks/OB-1/x'), { kind: 'unknown' });
eq('đường dẫn lạ', parsePath('/abc'), { kind: 'unknown' });
eq('quản lý tài khoản', parsePath('/accounts'), { kind: 'app', tab: 'accounts' });
eq('quản lý tài khoản có đường dẫn con là không hợp lệ', parsePath('/accounts/x'), { kind: 'unknown' });
eq('dựng: quản lý tài khoản không cần mã dự án', buildPath({ tab: 'accounts', projectCode: 'ABC' }), '/accounts');
eq('trang đăng nhập', parsePath('/login'), { kind: 'login' });
eq('đăng nhập có đường dẫn con là không hợp lệ', parsePath('/login/x'), { kind: 'unknown' });

eq('dựng: dashboard', buildPath({ tab: 'dashboard', projectCode: 'ABC' }), '/p/ABC');
eq('dựng: nhiệm vụ có mã', buildPath({ tab: 'tasks', projectCode: 'ABC', itemCode: 'OB-103' }), '/p/ABC/tasks/OB-103');
eq('dựng: danh sách dự án không cần mã', buildPath({ tab: 'projects', projectCode: 'ABC' }), '/projects');
eq('dựng: thiếu mã dự án về gốc', buildPath({ tab: 'tasks' }), '/');
eq('dựng: quality bỏ qua mã mục', buildPath({ tab: 'quality', projectCode: 'ABC', itemCode: '1' }), '/p/ABC/quality');
eq('dựng: mã có ký tự đặc biệt được mã hóa', buildPath({ tab: 'tasks', projectCode: 'A B', itemCode: 'X/1' }), '/p/A%20B/tasks/X%2F1');
eq('dựng: đăng nhập kèm địa chỉ quay lại', buildLoginPath('/p/ABC/tasks/OB-1?view=gantt'), '/login?next=%2Fp%2FABC%2Ftasks%2FOB-1%3Fview%3Dgantt');
eq('dựng: đăng nhập từ chối địa chỉ ngoài', [buildLoginPath('https://evil.com'), buildLoginPath('//evil.com'), buildLoginPath('/login'), buildLoginPath()], ['/login', '/login', '/login', '/login']);
eq('next hợp lệ giữ nguyên', safeNext('/p/ABC/issues/3?view=board'), '/p/ABC/issues/3?view=board');
eq('next không an toàn về gốc', [safeNext('https://evil.com'), safeNext('//evil.com'), safeNext('javascript:alert(1)'), safeNext('/login?next=/x'), safeNext(null), safeNext('')], ['/', '/', '/', '/', '/', '/']);

const samples = ['/', '/projects', '/accounts', '/p/ABC', '/p/ABC/tasks', '/p/ABC/tasks/OB-103', '/p/ABC/usecases/UC-1', '/p/ABC/issues/9', '/p/ABC/reports', '/p/A%20B/team'];
eq('dựng rồi phân tích lại ra đúng đường dẫn cũ', samples.map(s => {
  const r = parsePath(s);
  return r.kind === 'app' ? buildPath(r) : '/';
}), samples);

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
