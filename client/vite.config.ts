import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The production build lands in ./build, which the Cloudflare Worker serves via
// its ASSETS binding (see cloudflare-server/wrangler.jsonc → assets.directory).
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'build',
    sourcemap: false,
  },
  server: {
    port: 3000,
    // In dev, forward API calls to the local Worker so the app can keep using
    // same-origin "/api/..." with no env var. Start `wrangler dev` (:8787) too.
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
});
