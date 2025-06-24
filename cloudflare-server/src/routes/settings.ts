import { Hono } from 'hono'
import { z } from 'zod';
import { authenticateJWT } from '../middleware/authenticateJWT';
import { RequestWithUser } from '../types/RequestWithUser';
import { getPrisma } from "../prisma/prismaHelper";

const app = new Hono<{ Bindings: CloudflareBindings }>();

/* ------------ validation for PUT body ------------------------------ */
const SettingsBody = z.object({
  sourceLangId:    z.number().int().positive().optional(),
  targetLangId:    z.number().int().positive().optional(),
  darkMode:        z.boolean().optional(),
  wordsPerSession: z.number().int().min(5).max(200).optional(),
});

/* ================= GET /api/settings =============================== */
app.get(
  '/',
  authenticateJWT,
  async (c) => {
    const prisma = await getPrisma(c.env)
    const { id: userId } = (c.req as unknown as RequestWithUser).user;

    const settings = await prisma.userSettings.upsert({
      where:  { userId },
      update: {},
      create: { userId },
    });

    c.json(settings);
  },
);

/* ================= PUT /api/settings =============================== */
app.put(
  '/',
  authenticateJWT,
  async (c) => {
    const prisma = await getPrisma(c.env);
    const body = SettingsBody.parse(c.body);

    if (Object.keys(body).length === 0) {
      c.status(400);
      c.json({ error: 'No settings supplied' });
      return;
    }

    const { id: userId } = (c.req as unknown as RequestWithUser).user;

    const updated = await prisma.userSettings.upsert({
      where:  { userId },
      update: body,
      create: { userId, ...body },
    });

    c.json(updated);
  },
);

export default app;
