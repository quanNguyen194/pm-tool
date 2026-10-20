// Quy tắc và tiện ích cho ảnh / video đính kèm issue. Giới hạn ở đây phải khớp migration 0024 (CSDL kiểm lại lần nữa).

export const ATTACH_BUCKET = 'issue-attachments';
export const MAX_FILES_PER_ISSUE = 10;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 45 * 1024 * 1024;
/** Ảnh lớn hơn mức này (cạnh dài nhất) sẽ được thu nhỏ trước khi tải lên. */
const MAX_IMAGE_SIDE = 1920;
/** Ảnh không cần nén lại nếu không lớn quá mức này. */
const KEEP_AS_IS_BYTES = 1.5 * 1024 * 1024;

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov'
};
const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime'
};

export const ACCEPT_ATTR = '.jpg,.jpeg,.png,.gif,.webp,.mp4,.webm,.mov,image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm,video/quicktime';

export const formatBytes = (n: number): string => {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
};

export const extOf = (name: string): string => (/\.([a-z0-9]+)$/i.exec(name)?.[1] ?? '').toLowerCase();

/** Loại nội dung thực dùng để tải lên (một số trình duyệt để trống với .mov). */
export const mimeOf = (file: File): string => {
  const t = file.type.toLowerCase();
  if (EXT_BY_MIME[t]) return t;
  return MIME_BY_EXT[extOf(file.name)] ?? t;
};

export const kindOfMime = (mime: string): 'image' | 'video' | null =>
  mime.startsWith('image/') && EXT_BY_MIME[mime] ? 'image' : mime.startsWith('video/') && EXT_BY_MIME[mime] ? 'video' : null;

export const extForMime = (mime: string): string => EXT_BY_MIME[mime] ?? 'bin';

/** Trả về lý do bị từ chối, hoặc null nếu hợp lệ. */
export const checkFile = (file: File): string | null => {
  const mime = mimeOf(file);
  const kind = kindOfMime(mime);
  if (!kind) return `"${file.name}": chỉ nhận ảnh JPG/PNG/GIF/WebP và video MP4/WebM/MOV.`;
  if (file.size <= 0) return `"${file.name}": tệp rỗng.`;
  if (kind === 'image' && file.size > MAX_IMAGE_BYTES * 4) return `"${file.name}": ảnh quá lớn (${formatBytes(file.size)}).`;
  if (kind === 'video' && file.size > MAX_VIDEO_BYTES) return `"${file.name}": video vượt ${formatBytes(MAX_VIDEO_BYTES)} (${formatBytes(file.size)}).`;
  return null;
};

/**
 * Chuẩn bị ảnh trước khi tải lên: GIF giữ nguyên (để không mất hoạt ảnh); ảnh khác lớn hơn 1920 px hoặc nặng hơn 1,5 MB
 * thì thu nhỏ và nén sang WebP. Trả về tệp gốc nếu không nén được hoặc nén không nhỏ hơn.
 */
export async function prepareImage(file: File): Promise<File> {
  const mime = mimeOf(file);
  if (kindOfMime(mime) !== 'image' || mime === 'image/gif') return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size <= KEEP_AS_IS_BYTES) {
      bmp.close();
      return file;
    }
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bmp.width * scale));
    canvas.height = Math.max(1, Math.round(bmp.height * scale));
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/webp', 0.85));
    canvas.width = canvas.height = 0;
    if (!blob || blob.type !== 'image/webp' || (blob.size >= file.size && scale === 1)) return file;
    const base = file.name.replace(/\.[a-z0-9]+$/i, '') || 'anh';
    return new File([blob], `${base}.webp`, { type: 'image/webp', lastModified: Date.now() });
  } catch {
    return file;
  }
}

/** Kiểm tra sau khi chuẩn bị (ảnh đã nén vẫn phải ≤ 5 MB). */
export const checkPrepared = (file: File): string | null => {
  const kind = kindOfMime(mimeOf(file));
  if (kind === 'image' && file.size > MAX_IMAGE_BYTES) return `"${file.name}": ảnh vẫn lớn hơn ${formatBytes(MAX_IMAGE_BYTES)} sau khi nén (${formatBytes(file.size)}).`;
  return null;
};

/** Ảnh dán từ clipboard thường tên "image.png": đặt tên có ngày giờ để dễ phân biệt. */
export const nameForPasted = (file: File): File => {
  if (!/^image\.[a-z0-9]+$/i.test(file.name)) return file;
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  return new File([file], `anh-dan-${stamp}.${extOf(file.name)}`, { type: file.type, lastModified: file.lastModified });
};
