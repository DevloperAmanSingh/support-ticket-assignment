import path from 'node:path';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const webDir = import.meta.dirname;
const sharedDir = path.resolve(webDir, '../shared');

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(webDir, 'src'), '@shared': sharedDir },
  },
  server: {
    proxy: { '/api': 'http://localhost:3000' },
    fs: { allow: [webDir, sharedDir] },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test/setup.ts'],
    testTimeout: 20_000,
  },
});
