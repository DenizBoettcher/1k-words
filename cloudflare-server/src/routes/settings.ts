import {
  Router,
  Request,
  Response,
  NextFunction,
  RequestHandler,
} from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { authenticateJWT } from './login';
import { RequestWithUser } from './types/RequestWithUser';

const prisma  = new PrismaClient();
const router  = Router();

/* ------------ async wrapper keeps RequestHandler type ------------- */
const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>): RequestHandler =>
  (req, res, next) => void fn(req, res, next).catch(next);

/* ------------ validation for PUT body ------------------------------ */
const SettingsBody = z.object({
  sourceLangId:    z.number().int().positive().optional(),
  targetLangId:    z.number().int().positive().optional(),
  darkMode:        z.boolean().optional(),
  wordsPerSession: z.number().int().min(5).max(200).optional(),
});

/* ================= GET /api/settings =============================== */
router.get(
  '/',
  authenticateJWT,
  asyncHandler(async (req, res) => {
    const { id: userId } = (req as RequestWithUser).user;

    const settings = await prisma.userSettings.upsert({
      where:  { userId },
      update: {},
      create: { userId },
    });

    res.json(settings);
  }),
);

/* ================= PUT /api/settings =============================== */
router.put(
  '/',
  authenticateJWT,
  asyncHandler(async (req, res) => {
    const body = SettingsBody.parse(req.body);
    if (Object.keys(body).length === 0) {
      res.status(400).json({ error: 'No settings supplied' });
      return;
    }

    const { id: userId } = (req as RequestWithUser).user;

    const updated = await prisma.userSettings.upsert({
      where:  { userId },
      update: body,
      create: { userId, ...body },
    });

    res.json(updated);
  }),
);

export default router;
