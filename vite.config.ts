import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    proxy: {
      '/api/stats-config': { target: 'http://127.0.0.1:2567', changeOrigin: false },
      '/api/stats-management': { target: 'http://127.0.0.1:2567', changeOrigin: false },
    },
  },
});
