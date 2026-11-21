import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
    server: {
    host: '127.0.0.1',
    port: 5173,
    allowedHosts: true,
    proxy: { '/api': 'http://127.0.0.1:3000' },
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve('index.html'),
        quiz: resolve('quiz/index.html'),
        privacy: resolve('privacy/index.html'),
      },
    },
  },
});
