import { Hono } from 'hono';
import { z } from 'zod';
import { getPrisma } from '../prisma/prismaHelper';
import { authenticateJWT } from '../middleware/authenticateJWT';
import type { AppEnv } from '../types/AppContext';

const app = new Hono<AppEnv>();
app.use('*', authenticateJWT);

const SettingsBody = z.object({
  activeListId: z.number().int().positive().nullable().optional(),
  darkMode: z.boolean().optional(),
  wordsPerSession: z.number().int().min(5).max(200).optional(),
  checkCapitalization: z.boolean().optional(),
  foldSpecialLetters: z.boolean().optional(),
});

app.get('/', async (c) => {
  const prisma = getPrisma(c.env);
  const userId = c.get('user').id;

  const settings = await prisma.userSettings.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });

  return c.json(settings);
});

app.put('/', async (c) => {
  const prisma = getPrisma(c.env);
  const userId = c.get('user').id;

  const parsed = SettingsBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    return c.json({ message: 'No valid settings supplied' }, 400);
  }

  // If activeListId is set, make sure it belongs to the user.
  if (parsed.data.activeListId != null) {
    const listId = parsed.data.activeListId;
    const [owns, follows] = await Promise.all([
      prisma.wordList.findFirst({ where: { id: listId, ownerId: userId }, select: { id: true } }),
      prisma.listFollow.findUnique({ where: { userId_listId: { userId, listId } }, select: { id: true } }),
    ]);
    if (!owns && !follows) return c.json({ message: 'activeListId is not in your library' }, 422);
  }

  const updated = await prisma.userSettings.upsert({
    where: { userId },
    update: parsed.data,
    create: { userId, ...parsed.data },
  });

  return c.json(updated);
});

export default app;
