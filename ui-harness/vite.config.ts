import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

const mock = path.resolve(import.meta.dirname, 'mockApp.tsx');

export default defineConfig({
  root: import.meta.dirname,
  plugins: [
    {
      name: 'mock-app-context',
      enforce: 'pre',
      resolveId(source) {
        if (/context\/AppContext$/.test(source)) return mock;
        return null;
      }
    },
    react(),
    tailwindcss()
  ],
  server: { fs: { allow: [path.resolve(import.meta.dirname, '..')] } }
});
