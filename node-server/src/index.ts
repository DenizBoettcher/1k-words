import 'dotenv/config';
import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';

import authRouter from './routes/auth';
import listsRouter from './routes/lists';
import studyRouter from './routes/study';
import settingsRouter from './routes/settings';
import adminRouter from './routes/admin';

const app = express();
const port = Number(process.env.PORT ?? 8787);

app.use(cors());
app.use(express.json({ limit: '5mb' })); // lists can be large

/* ---------- API ---------- */
app.get('/api/health', (_req, res) => { res.json({ ok: true }); });
app.use('/api/auth', authRouter);
app.use('/api/lists', listsRouter);
app.use('/api/study', studyRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/admin', adminRouter);

// Unknown API route -> JSON 404 (before the SPA fallback below).
app.use('/api', (_req, res) => { res.status(404).json({ message: 'Unknown API route' }); });

/* ---------- Static client (single-origin, optional) ---------- */
// Serve the built React app if present. Set CLIENT_DIR to override; defaults to
// ../client/build relative to the process working directory (node-server/).
const clientDir =
  process.env.CLIENT_DIR ?? path.resolve(process.cwd(), '..', 'client', 'build');

if (fs.existsSync(path.join(clientDir, 'index.html'))) {
  app.use(express.static(clientDir));
  // SPA history fallback for GET requests (Express 5-safe: plain middleware,
  // no wildcard path pattern).
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET') return next();
    res.sendFile(path.join(clientDir, 'index.html'));
  });
  console.log(`Serving client from ${clientDir}`);
} else {
  console.log(
    `No client build at ${clientDir}  running API-only ` +
      `(use the Vite dev server, which proxies /api here).`,
  );
}

/* ---------- Error handler ---------- */
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ message: 'Server error' });
});

/* ---------- Listen (HTTP or HTTPS) ---------- */
const httpsEnabled = process.env.ENABLE_HTTPS === 'true';
const keyPath = process.env.KEY_PATH ?? '';
const certPath = process.env.CERT_PATH ?? '';

if (httpsEnabled && fs.existsSync(keyPath) && fs.existsSync(certPath)) {
  https
    .createServer(
      { cert: fs.readFileSync(certPath), key: fs.readFileSync(keyPath) },
      app,
    )
    .listen(port, () => console.log(`HTTPS server on https://localhost:${port}`));
} else {
  app.listen(port, () => console.log(`HTTP server on http://localhost:${port}`));
}
