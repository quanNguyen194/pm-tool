import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

const mock = path.resolve(import.meta.dirname, 'mockApp.tsx');
const mockSupabase = path.resolve(import.meta.dirname, 'mockSupabase.ts');

export default defineConfig({
  root: import.meta.dirname,
  plugins: [
    {
      name: 'mock-app-context',
      enforce: 'pre',
      resolveId(source, importer) {
        if (/context\/AppContext$/.test(source)) return mock;
        // Màn hình Tài khoản gọi supabase trực tiếp: dùng bản giả trong bộ kiểm tra giao diện
        if (/lib\/supabase$/.test(source) && importer?.includes('AccountsView')) return mockSupabase;
        return null;
      }
    },
    react(),
    tailwindcss()
  ],
  server: { fs: { allow: [path.resolve(import.meta.dirname, '..')] } }
});
