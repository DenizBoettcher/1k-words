import { Hono } from 'hono';
import type { AppEnv } from './types/AppContext';
import authRoutes from './routes/auth';
import listsRoutes from './routes/lists';
import studyRoutes from './routes/study';
import settingsRoutes from './routes/settings';
import adminRoutes from './routes/admin';

/**
 * Single Worker that serves BOTH the JSON API (under /api/*) and the built
 * React SPA (everything else, via the ASSETS binding). Because the app and API
 * share an origin there is no CORS and no dashboard env-var wiring — one
 * `wrangler deploy` ships the whole thing.
 */
const app = new Hono<AppEnv>();

/* ---------- API ---------- */
const api = new Hono<AppEnv>();
api.get('/health', (c) => c.json({ ok: true }));
api.route('/auth', authRoutes);
api.route('/lists', listsRoutes);
api.route('/study', studyRoutes);
api.route('/settings', settingsRoutes);
api.route('/admin', adminRoutes);
api.notFound((c) => c.json({ message: 'Unknown API route' }, 404));
api.onError((err, c) => {
  console.error(err);
  // With DEBUG_ERRORS=1 (e.g. in .dev.vars) the real error is returned to the
  // client — for local debugging against the remote DB. Never set it in prod.
  if ((c.env as any).DEBUG_ERRORS === '1') {
    return c.json({ message: err.message, stack: err.stack, name: err.name }, 500);
  }
  return c.json({ message: 'Server error' }, 500);
});

app.route('/api', api);

/* ---------- Vendor files from R2 (too large for static assets) ---------- */
// piper-tts-web's dist JS inlines its WASM as base64 (~43 MiB) — over the
// 25 MiB Workers asset limit, and jsdelivr 403s files over 20 MiB. Serving it
// from R2 on our own origin needs no CORS and keeps the build small.
app.get('/vendor/:file', async (c) => {
  const object = await (c.env as any).VENDOR?.get(c.req.param('file'));
  if (!object) return c.json({ message: 'Not found' }, 404);
  return new Response(object.body, {
    headers: {
      'Content-Type': 'text/javascript; charset=utf-8',
      // Immutable: the filename is version-pinned, a new version = new name.
      'Cache-Control': 'public, max-age=31536000, immutable',
      'ETag': object.httpEtag,
    },
  });
});

/* ---------- Static SPA (client build) with history fallback ---------- */
// NOTE: do NOT add COOP/COEP (cross-origin isolation) headers here — see the
// matching note in client/vite.config.ts (onnxruntime pthread workers break).
app.get('*', async (c) => {
  const res = await c.env.ASSETS.fetch(c.req.raw);
  // Client-side routes (e.g. /library, /settings) 404 as files → serve index.html.
  if (res.status === 404) {
    const url = new URL(c.req.url);
    url.pathname = '/';
    return c.env.ASSETS.fetch(new Request(url.toString(), c.req.raw));
  }
  return res;
});

export default app;
