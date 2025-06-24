import { Hono } from 'hono'
import { authenticateJWT } from '../middleware/authenticateJWT';
import { RequestWithUser } from '../types/RequestWithUser';
import { getPrisma } from "../prisma/prismaHelper";

const app = new Hono<{ Bindings: CloudflareBindings }>();

app.get(
  '/lang/:pair',
  authenticateJWT,
  async (c) => {
    const prisma = await getPrisma(c.env);
    const [srcStr, tgtStr] = c.req.param('pair').split(',');
    const srcId = Number(srcStr);
    const tgtId = Number(tgtStr);
    
    console.log("Logged in and Getting words")

    if (!srcId || !tgtId || Number.isNaN(srcId) || Number.isNaN(tgtId)) {
      c.status(400);
      c.json({ error: 'Path must be /langs/<srcId>,<tgtId>' });
      return;
    }

    const userId = (c.req as unknown as RequestWithUser).user.id;

    console.log(`loading words for user ${userId} SourceLang ${srcId}, TargetLang ${tgtId}`)

    /* --- query words that have BOTH translations ---------- */
    const words = await prisma.word.findMany({
      where: {
        translations: {
          some: { languageId: srcId },
          every: {},
        },
        AND: {
          translations: {
            some: { languageId: tgtId },
          },
        },
      },
      include: {
        translations: {
          where: { languageId: { in: [srcId, tgtId] } },
          select: { languageId: true, text: true },
        },
        learnerStats: {
          where: { userId },
          select: { counter: true, learn: true },
        },
      },
    });

    /* --- reshape ------------------------------------------------------- */
    const payload = words.map((w : any) => {
      const sourceLang = w.translations.find((t : any) => t.languageId === srcId)!.text;
      const targetLang = w.translations.find((t : any) => t.languageId === tgtId)!.text;
      return {
        id: w.id,
        sourceLang,
        targetLang,
        history: w.learnerStats[0],
      };
    });

    c.json(payload);
  },
);

app.get(
  '/lang',
  authenticateJWT,
  async (c) => {
    const prisma = await getPrisma(c.env)
    const userId = (c.req as unknown as RequestWithUser).user.id;

    const languages = await prisma.language.findMany({
          where: {
            translations: {
              some: {
                word: {
                  learnerStats: {
                    some: { userId: userId },
                  },
                },
              },
            },
          },
          orderBy: { name: 'asc' },
          select: { id: true, code: true, name: true },
        });
      
    c.json(languages);
  },
);

/* ==========================================================
   2) POST /api/words/update
   ========================================================= */
app.post(
  '/update',
  authenticateJWT,
  async (c) => {
    const prisma = await getPrisma(c.env);
    const { wordId, incrementCounter, learnResult } = c.body as any as {
      wordId: number;
      incrementCounter?: boolean;
      learnResult?: boolean;
    };

    if (!wordId) {
      c.status(400);
      c.json({ error: 'wordId required' });
      return;
    }

    const userId = (c.req as unknown as RequestWithUser).user.id;

    const history = await prisma.learningHistory.upsert({
      where: { userId_wordId: { userId, wordId } },
      update: {},
      create: { userId, wordId, counter: 0, learn: [] },
    });

    const data: any = {};
    
    if (incrementCounter) 
        data.counter = history.counter + 1;

    if (typeof learnResult === 'boolean') {
      const arr = (history.learn as any[]) ?? [];
      arr.push(learnResult);
      data.learn = arr;
    }

    const updated = await prisma.learningHistory.update({
      where: { userId_wordId: { userId, wordId } },
      data,
    });

    c.json({ success: true, updated });
  },
);


export default app;
