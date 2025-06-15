import express, { Request, Response } from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';


type Word = {
  tr: string;
  de: string;
  history: { counter: number; learn: boolean[] };
  id: string;
};
type Vocabulary = Record<string, { words: Word[] }>;

const app = express();
const PORT = 4000;

app.use(cors());
app.use(express.json());

// absolute path to vocabulary.json
const vocabPath = path.join(__dirname, 'Data/vocabulary.json');

/* helpers ------------------------------------------------------ */
const readVocab = (): Vocabulary =>
  JSON.parse(fs.readFileSync(vocabPath, 'utf-8'));

const writeVocab = (data: Vocabulary) =>
  fs.writeFileSync(vocabPath, JSON.stringify(data, null, 2), 'utf-8');

/* routes ------------------------------------------------------- */

app.get(
  '/',
  (_, res: Response): void => {
    res.send('API is working');
    console.log(`User Connected`);
  }
);

app.get('/words', (req: Request, res: Response): any => {
  const lang = 'turkish'

  const db = readVocab();
  const bucket = db[lang];
  if (!bucket)
    return res.status(404).json({ error: `language "${lang}" not found` });

  console.log(`Sended All Words`);
  res.json(bucket.words);
});

app.post('/update-word', (req: Request, res: Response): any => {
  const { lang = 'turkish', id, incrementCounter, learnResult } = req.body;
  // Checks
  if (typeof id !== 'string' || !id.trim())
    return res.status(400).json({ error: 'id must be a non-empty string' });

  const data = readVocab();
  const bucket = data[lang];
  if (!bucket) return res.status(404).json({ error: `language ${lang} not found` });

  const word = bucket.words.find(x => x.id === id);
  if (!word) return res.status(404).json({ error: 'word not found' });

  //Sets
  if (incrementCounter) 
    word.history.counter += 1;

  if (typeof learnResult === 'boolean') 
    word.history.learn.push(learnResult);

  writeVocab(data);

  const updateChanged = incrementCounter ? `counter = ${word.history.counter}` : `learnResult pushed got pushed → ${learnResult}`
  console.log(
    `[update-word] ${word.de}:${word.tr} (${word.id}) → ` + updateChanged
  );

  res.json({ success: true, updated: word });
});

/* start server ------------------------------------------------- */
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
