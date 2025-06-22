import {
  Router,
  Request,
  Response,
  NextFunction,
  RequestHandler,
} from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateJWT } from './login';    
import { RequestWithUser } from './types/RequestWithUser';

const prisma = new PrismaClient();
const router  = Router();

/* ---------- async wrapper ---------- */
const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

router.get(
  '/lang/:pair',
  authenticateJWT,
  asyncHandler(async (req, res) => {
    /* --- parse path param "1,2" -------------------------- */
    const [srcStr, tgtStr] = req.params.pair.split(',');
    const srcId = Number(srcStr);
    const tgtId = Number(tgtStr);
    
    console.log("Logged in and Getting words")

    if (!srcId || !tgtId || Number.isNaN(srcId) || Number.isNaN(tgtId)) {
      res.status(400).json({ error: 'Path must be /langs/<srcId>,<tgtId>' });
      return;
    }

    const userId = (req as RequestWithUser).user.id;

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
    const payload = words.map((w) => {
      const sourceLang = w.translations.find((t) => t.languageId === srcId)!.text;
      const targetLang = w.translations.find((t) => t.languageId === tgtId)!.text;
      return {
        id: w.id,
        sourceLang,
        targetLang,
        history: w.learnerStats[0],
      };
    });

    res.json(payload);
  }),
);

router.get(
  '/lang',
  authenticateJWT,
  asyncHandler(async (req, res) => {
    const userId = (req as RequestWithUser).user.id;
    const userOnly = req.query.user === 'true' && userId;

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
      
    res.json(languages);
  }),
);

/* ==========================================================
   2) POST /api/words/update
   ========================================================= */
router.post(
  '/update',
  authenticateJWT,
  asyncHandler(async (req, res) => {
    const { wordId, incrementCounter, learnResult } = req.body as {
      wordId: number;
      incrementCounter?: boolean;
      learnResult?: boolean;
    };

    if (!wordId) {
      res.status(400).json({ error: 'wordId required' });
      return;
    }

    const userId = (req as RequestWithUser).user.id;

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

    res.json({ success: true, updated });
  }),
);


export default router;
