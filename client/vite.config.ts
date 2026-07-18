import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';

// The production build lands in ./build, which the Cloudflare Worker serves via
// its ASSETS binding (see cloudflare-server/wrangler.jsonc → assets.directory).
export default defineConfig({
  plugins: [
    react(),
    // piper-tts-web ships its onnx/piper runtime files inside the npm
    // package; this copies them next to the app (documented setup) fully
    // self-hosted neural TTS, no CDN.
    viteStaticCopy({
      targets: [
        { src: 'node_modules/piper-tts-web/dist/onnx', dest: '.' },
        { src: 'node_modules/piper-tts-web/dist/piper', dest: '.' },
      ],
    }),
  ],
  build: {
    outDir: 'build',
    sourcemap: false,
  },
  server: {
    port: 3000,
    // NOTE: do NOT add COOP/COEP (cross-origin isolation) headers here. They
    // enable multithreaded WASM, but onnxruntime's pthread workers fail to
    // boot in this stack (endless "worker sent an error!" loop). Neural TTS
    // runs single-threaded the audio cache + prefetch make that a non-issue.
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