/** Chuẩn hóa chuỗi để so khớp: bỏ dấu tiếng Việt, đ -> d, chữ thường, gộp khoảng trắng. */
export const norm = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
