import express from 'express';
import cors from 'cors';
import loginRouter from './routes/login';
import importWordsRouter from './routes/importWords';
import wordsRouter from './routes/words';
import settingsRouter from './routes/settings';
import fs from 'node:fs';
import https from 'node:https';

const app = express();
const port = process.env.PORT;
const keyPath = process.env.KEY_PATH ?? "";
const certPath = process.env.CERT_PATH ?? "";
const httpsEnabled = process.env.ENABLE_HTTPS === "true";

app.use(cors());
app.use(express.json());

/* routes ------------------------------------------------------- */

app.use('/', () => console.log("I am ALIVE"))
app.use('/api/auth', loginRouter);
app.use('/api/importwords', importWordsRouter);
app.use('/api/words', wordsRouter)
app.use('/api/settings', settingsRouter)

if (httpsEnabled && fileExists(keyPath) && fileExists(certPath)) {
  const server = https.createServer(
    {
      cert: fs.readFileSync(certPath),
      key: fs.readFileSync(keyPath),
    },
    app,
  );

  server.listen(port, () => {
    console.log(`HTTPS server running on https://localhost:${port}`);
  });
}
else {
  app.listen(port, () => {
    console.log(`HTTP  server running on http://localhost:${port}`);
  });
}

function fileExists(file: string): boolean {
  try {
    return fs.existsSync(file);
  } catch {
    return false;
  }
}