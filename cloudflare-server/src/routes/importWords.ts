import { z as zod } from 'zod';
import { authenticateJWT } from '../middleware/authenticateJWT';
import { RequestWithUser } from '../types/RequestWithUser';
import { Hono } from 'hono'
import { getPrisma } from '../prisma/prismaHelper';
import { PrismaClient } from '../generated/prisma/index';

const app = new Hono<{ Bindings: CloudflareBindings }>();

/* ──────────────────────────────────────────────────────────────
   1. Zod: expect an array of objects { langCode: "translation" }
   ────────────────────────────────────────────────────────────── */
const WordEntry = zod.record(zod.string().min(2), zod.string().min(1));
const Payload = zod.array(WordEntry).min(1);

/* ──────────────────────────────────────────────────────────────
   2. Helper – ensure language row exists, cache ids in memory
   ────────────────────────────────────────────────────────────── */
const langCache = new Map<string, number>();

async function langId(code: string, prisma: PrismaClient) {
  if (langCache.has(code)) return langCache.get(code)!;
  const lc = code.toLowerCase();

  const rec = await prisma.language.upsert({
    where: { code: lc },
    update: {},
    create: { code: lc, name: lc },
  });
  langCache.set(lc, rec.id);
  return rec.id;
}

/* ──────────────────────────────────────────────────────────────
   3. POST  /api/words/json
   ────────────────────────────────────────────────────────────── */
app.post(
  '/json',
  authenticateJWT,              
  async (c, next) => {
    const prisma = await getPrisma(c.env);

    try {
      /* 3-a validate body */
      const data = Payload.parse(c.body);
      

      /* 3-b process each entry serially (SQLite safe) */
      for (const entry of data) {
        /*  Step 1: is there already a word with ANY of these translations? */
        let wordId: number | null = null;

        for (const [code, text] of Object.entries(entry)) {
          const existing = await prisma.translation.findFirst({
            where: {
              text,
              language: { code: code.toLowerCase() },
            },
            select: { wordId: true },
          });
          
          if (existing) {
            wordId = existing.wordId;
            break;   // stop on first match
          }
        }
        
        /*  Step 2: create Word row if none matched */
        if (!wordId) {
          const created = await prisma.word.create({ data: {} });
          wordId = created.id;
        }

        /*  Step 3: add / upsert translations */
        for (const [code, text] of Object.entries(entry)) {
          const languageId = await langId(code, prisma);

          await prisma.translation.upsert({
            where: {
              wordId_languageId: { wordId, languageId }, // composite unique
            },
            update: { text },      // if you want to overwrite, otherwise {}
            create: { wordId, languageId, text },
          });
        }
        
        const userId = (c.req as unknown as RequestWithUser).user.id;
        /*  Step 4: initialise history for the uploader */
        await prisma.learningHistory.upsert({
          where: { userId_wordId: { userId: userId, wordId: wordId } },
          update: {},
          create: { userId: userId, wordId, counter: 0, learn: [] },
        });
      }

      c.status(201)
      const message = { message: 'Imported', count: data.length };
      console.log(message)
      c.json(message)
    } catch (err) {
      console.log(err)
      next();
    }
  },
);

export default app;
