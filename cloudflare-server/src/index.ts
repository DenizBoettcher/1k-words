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
 * share an origin there is no CORS and no dashboard env-var wiring one
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
  return c.json({ message: 'Server error' }, 500);
});

app.route('/api', api);

/* ---------- Static SPA (client build) with history fallback ---------- */
// NOTE: do NOT add COOP/COEP (cross-origin isolation) headers here see the
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