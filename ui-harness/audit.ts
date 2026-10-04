// Kiểm tra tự động cho từng màn hình: tràn ngang, tương phản chữ, lỗi runtime. Gọi: await window.__run()
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

function contrastAudit() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 1;
  const cx = cv.getContext('2d', { willReadFrequently: true })!;
  const rgba = (c: string) => {
    cx.clearRect(0, 0, 1, 1);
    cx.fillStyle = '#000';
    cx.fillStyle = c;
    cx.fillRect(0, 0, 1, 1);
    const d = cx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], d[3] / 255];
  };
  const lum = ([r, g, b]: number[]) => {
    const f = (v: number) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const dark = document.documentElement.classList.contains('dark');
  const bgOf = (el: Element) => {
    const layers: number[][] = [];
    for (let e: Element | null = el; e; e = e.parentElement) {
      const c = rgba(getComputedStyle(e).backgroundColor);
      if (c[3] > 0) {
        layers.push(c);
        if (c[3] >= 0.99) break;
      }
    }
    let base = dark ? [2, 6, 23] : [255, 255, 255];
    for (const l of layers.reverse()) base = base.map((b, i) => l[i] * l[3] + b * (1 - l[3]));
    return base;
  };
  const out: { r: number; t: string; c: string }[] = [];
  let n = 0;
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (w.nextNode()) {
    const t = w.currentNode as Text;
    const text = t.textContent!.trim();
    if (!text) continue;
    const el = t.parentElement;
    if (!el || el.closest('script,style,svg')) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    const fg = rgba(cs.color);
    const bg = bgOf(el);
    const fgc = fg.slice(0, 3).map((v, i) => v * fg[3] + bg[i] * (1 - fg[3]));
    const L1 = lum(fgc);
    const L2 = lum(bg);
    const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const big = parseFloat(cs.fontSize) >= 24 || (parseFloat(cs.fontSize) >= 18.66 && +cs.fontWeight >= 700);
    n++;
    if (ratio < (big ? 3 : 4.5) && !/^[|·•\-—]$/.test(text)) out.push({ r: +ratio.toFixed(2), t: text.slice(0, 28), c: String(el.className || '').slice(0, 45) });
  }
  out.sort((a, b) => a.r - b.r);
  return { n, fail: out.length, worst: out.slice(0, 4) };
}

function overflowAudit() {
  const vw = document.documentElement.clientWidth;
  const sidebar = document.getElementById('app-sidebar');
  const sidebarHidden = sidebar && getComputedStyle(sidebar).visibility === 'hidden';
  const bad: string[] = [];
  document.querySelectorAll('body *').forEach(el => {
    if (sidebarHidden && el.closest('#app-sidebar')) return;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    if (r.right > vw + 1 || r.left < -1) {
      let p = el.parentElement;
      let clipped = false;
      while (p && p !== document.body) {
        if (/(auto|scroll|hidden|clip)/.test(getComputedStyle(p).overflowX)) {
          const pr = p.getBoundingClientRect();
          if (pr.right <= vw + 1 && pr.left >= -1) {
            clipped = true;
            break;
          }
        }
        p = p.parentElement;
      }
      if (!clipped) bad.push(`${el.tagName.toLowerCase()}.${String(el.className || '').slice(0, 40)} [${Math.round(r.left)}→${Math.round(r.right)}]`);
    }
  });
  return bad.slice(0, 4);
}

(window as any).__run = async () => {
  const res: Record<string, unknown> = { width: innerWidth, dark: document.documentElement.classList.contains('dark') };
  const errors: string[] = [];
  window.addEventListener('error', e => errors.push(e.message));
  const snap = () => ({ hScroll: document.documentElement.scrollWidth > innerWidth, overflow: overflowAudit(), contrast: contrastAudit() });
  const clickText = (sel: string, text: string) => {
    const el = [...document.querySelectorAll<HTMLElement>(sel)].find(e => (e.textContent || '').includes(text));
    el?.click();
    return !!el;
  };
  for (const tab of ['dashboard', 'projects', 'tasks', 'usecases', 'quality', 'reports', 'team']) {
    (window as any).__setTab(tab);
    await wait(1300);
    res[tab] = snap();
    // Các lớp phủ / vùng ẩn của từng màn hình
    if (tab === 'tasks') {
      if (clickText('main button, [role="tree"] button, button', 'Tích hợp Module')) {
        await wait(400);
        res['tasks:chi-tiết'] = snap();
        clickText('button', 'Đóng');
        await wait(300);
      }
      if (clickText('button', 'Thêm Nhiệm Vụ')) {
        await wait(400);
        res['tasks:form'] = snap();
        if (clickText('button', 'Không liên kết')) {
          await wait(300);
          res['tasks:chọn-use-case'] = snap();
        }
        clickText('button', 'Hủy bỏ');
        await wait(300);
      }
      if (clickText('button', 'Bảng Chi Tiết')) {
        await wait(500);
        res['tasks:bảng'] = snap();
      }
    }
    if (tab === 'usecases') {
      if (clickText('[role="treeitem"] h3', 'Đăng ký tài khoản')) {
        await wait(400);
        res['usecases:mở-chi-tiết'] = snap();
      }
      if (clickText('button', 'Mở hết')) {
        await wait(500);
        res['usecases:mở-hết'] = snap();
        if (clickText('[role="treeitem"] h3', 'Quản lý cấu hình danh mục số 2')) {
          await wait(400);
          res['usecases:chi-tiết-bước'] = snap();
        }
        clickText('button', 'Thu gọn');
        await wait(300);
      }
      if (clickText('label', 'Hiện không thực hiện')) {
        await wait(400);
        res['usecases:hiện-không-thực-hiện'] = snap();
        clickText('label', 'Hiện không thực hiện');
        await wait(300);
      }
      if (clickText('button', 'Chọn tất cả')) {
        await wait(400);
        res['usecases:chọn-hàng-loạt'] = snap();
        clickText('button', 'Bỏ chọn');
        await wait(300);
      }
      if (clickText('button', 'Thêm Use Case')) {
        await wait(400);
        res['usecases:form'] = snap();
        clickText('button', 'Hủy bỏ');
        await wait(300);
      }
      if (clickText('button', 'Thêm Module')) {
        await wait(400);
        res['usecases:form-module'] = snap();
        clickText('button', 'Hủy bỏ');
        await wait(300);
      }
    }
  }
  res.errors = errors;
  return res;
};
