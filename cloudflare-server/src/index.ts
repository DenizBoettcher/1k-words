import { Hono } from 'hono';
import { cors } from 'hono/cors';
import loginRoutes from './routes/login';
import importWordsRoutes from './routes/importWords';
import wordsRoutes from './routes/words';
import settingsRoutes from './routes/settings';

const app = new Hono<{ Bindings: CloudflareBindings }>();

app.use('*', cors());               // Wide‑open CORS (adjust as needed)

/* ---------- Health check ---------- */
app.get("/", (c) => {
  return c.text("Hello Hono!");
});

/* ---------- API routes ---------- */
app.route('/api/auth',        loginRoutes);
app.route('/api/importwords', importWordsRoutes);
app.route('/api/words',       wordsRoutes);
app.route('/api/settings',    settingsRoutes);

/* ---------- 404 fallback ---------- */
app.notFound(c => c.json({ error: 'Not found' }, 404));

/* ---------- Worker export ---------- */
export default app;