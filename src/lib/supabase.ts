import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(url && anonKey);

// Khi thiếu biến môi trường, AuthGate hiển thị màn hình hướng dẫn thay vì gọi mạng.
export const supabase = createClient(url ?? 'http://localhost:54321', anonKey ?? 'missing-key', {
  auth: { persistSession: true, autoRefreshToken: true }
});

/** Chuyển lỗi Supabase/Postgres thành thông báo tiếng Việt dễ hiểu. */
export function describeError(err: unknown): string {
  const e = err as { code?: string; message?: string } | null;
  const msg = e?.message || 'Đã xảy ra lỗi không xác định';
  if (e?.code === '23505') return 'Mã này đã tồn tại trong dự án. Hãy dùng mã khác.';
  if (e?.code === '42501' && /row-level security|permission denied/i.test(msg)) {
    return 'Bạn không có quyền thực hiện thao tác này.';
  }
  if (/row-level security/i.test(msg)) return 'Bạn không có quyền thực hiện thao tác này.';
  if (/Failed to fetch|NetworkError/i.test(msg)) return 'Không kết nối được máy chủ. Kiểm tra mạng và thử lại.';
  return msg;
}

/**
 * Tải hết một bảng theo từng trang (PostgREST mặc định chỉ trả tối đa 1000 dòng mỗi lần, phần dư bị cắt IM LẶNG).
 * `make(from, to)` phải dựng truy vấn có thứ tự ổn định và gọi `.range(from, to)`.
 */
export async function fetchAll<T>(
  make: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = 1000
): Promise<{ data: T[]; error: { message: string } | null }> {
  const all: T[] = [];
  for (let page = 0; page < 100; page++) {
    const { data, error } = await make(page * pageSize, page * pageSize + pageSize - 1);
    if (error) return { data: all, error };
    all.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return { data: all, error: null };
}
