import { defineConfig } from 'vite';
import { execFileSync } from 'node:child_process';

function diagnosticBuildIdentity() {
  const builtAt = new Date().toISOString();
  try {
    return {
      commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      dirty: Boolean(execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim()),
      builtAt,
    };
  } catch { return { commit: null, dirty: null, builtAt }; }
}

export default defineConfig({
  define: { __GRIDFALL_BUILD__: JSON.stringify(diagnosticBuildIdentity()) },
  server: {
    proxy: {
      '/api/stats-config': { target: 'http://127.0.0.1:2567', changeOrigin: false },
      '/api/stats-management': { target: 'http://127.0.0.1:2567', changeOrigin: false },
    },
  },
});
