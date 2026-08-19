import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const directory = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: { '@': directory }
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.js']
  }
});
