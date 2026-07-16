import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { authenticateJWT, asyncHandler } from '../middleware/auth';
import type { RequestWithUser } from '../types';

const router = Router();
router.use(authenticateJWT);

const SettingsBody = z.object({
  activeListId: z.number().int().positive().nullable().optional(),
  darkMode: z.boolean().optional(),
  wordsPerSession: z.number().int().min(5).max(200).optional(),
  checkCapitalization: z.boolean().optional(),
  foldSpecialLetters: z.boolean().optional(),
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const userId = (req as RequestWithUser).user.id;
    const settings = await prisma.userSettings.upsert({
      where: { userId }, update: {}, create: { userId },
    });
    res.json(settings);
  }),
);

router.put(
  '/',
  asyncHandler(async (req, res) => {
    const userId = (req as RequestWithUser).user.id;
    const parsed = SettingsBody.safeParse(req.body);
    if (!parsed.success || Object.keys(parsed.data).length === 0) {
      res.status(400).json({ message: 'No valid settings supplied' }); return;
    }

    if (parsed.data.activeListId != null) {
      const listId = parsed.data.activeListId;
      const [owns, follows] = await Promise.all([
        prisma.wordList.findFirst({ where: { id: listId, ownerId: userId }, select: { id: true } }),
        prisma.listFollow.findUnique({ where: { userId_listId: { userId, listId } }, select: { id: true } }),
      ]);
      if (!owns && !follows) { res.status(422).json({ message: 'activeListId is not in your library' }); return; }
    }

    const updated = await prisma.userSettings.upsert({
      where: { userId }, update: parsed.data, create: { userId, ...parsed.data },
    });
    res.json(updated);
  }),
);

export default router;
