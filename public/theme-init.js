// Áp chế độ sáng/tối trước khi React chạy để không bị nháy màu. Là file riêng vì CSP không cho script inline.
try {
  if (localStorage.getItem('omni_theme_v1') === 'dark') document.documentElement.classList.add('dark');
} catch (e) {
  /* localStorage bị chặn: dùng giao diện sáng */
}
