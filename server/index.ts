import express from 'express';
import cors from 'cors';
import loginRouter from './routes/login';
import importWordsRouter from './routes/importWords';
import wordsRouter from './routes/words';
import settingsRouter from './routes/settings';
import fs from 'node:fs';
import https from 'node:https';

const app = express();
const PORT = 4000;

app.use(cors());
app.use(express.json());

/* routes ------------------------------------------------------- */

app.use('/api/auth', loginRouter);
app.use('/api/importwords', importWordsRouter);
app.use('/api/words', wordsRouter)
app.use('/api/settings', settingsRouter)

const server = https.createServer(
  {
    cert: fs.readFileSync('certs/localhost+2.pem'),
    key:  fs.readFileSync('certs/localhost+2-key.pem'),
  },
  app,
);

server.listen(PORT, () => {
  console.log(`Server running on https://localhost:${PORT}`);
});