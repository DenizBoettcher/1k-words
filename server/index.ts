import express from 'express';
import cors from 'cors';
import loginRouter from './routes/login';
import importWordsRouter from './routes/importWords';
import wordsRouter from './routes/words';

const app = express();
const PORT = 4000;

app.use(cors());
app.use(express.json());

/* routes ------------------------------------------------------- */

app.use('/api/auth', loginRouter);
app.use('/api/importwords', importWordsRouter);
app.use('/api/words', wordsRouter)

/* start server ------------------------------------------------- */
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
