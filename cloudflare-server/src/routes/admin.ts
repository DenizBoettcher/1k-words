import { Hono } from 'hono';
import { getPrisma } from '../prisma/prismaHelper';
import { authenticateJWT, requireAdmin } from '../middleware/authenticateJWT';
import type { AppEnv } from '../types/AppContext';
import { ROLES } from '../lib/config';
import { normaliseImport } from '../lib/importParser';
import { createVersion, latestVersion, versionPairs } from '../lib/versioning';

const app = new Hono<AppEnv>();
app.use('*', authenticateJWT, requireAdmin);

/* Overview of every user, with list + word counts. */
app.get('/users', async (c) => {
  const prisma = getPrisma(c.env);

  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      email: true,
      username: true,
      role: true,
      xp: true,
      createdAt: true,
      _count: { select: { lists: true } },
    },
  });

  return c.json(
    users.map((u) => ({
      id: u.id,
      email: u.email,
      username: u.username,
      role: u.role,
      xp: u.xp,
      listCount: u._count.lists,
      createdAt: u.createdAt,
    })),
  );
});

/* Promote / demote a user. Cannot demote yourself to avoid lockout. */
app.post('/users/:id/role', async (c) => {
  const prisma = getPrisma(c.env);
  const self = c.get('user');
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) return c.json({ message: 'Bad id' }, 400);

  const body = (await c.req.json().catch(() => ({}))) as { role?: string };
  const role = body.role === ROLES.admin ? ROLES.admin : ROLES.user;

  if (id === self.id && role !== ROLES.admin) {
    return c.json({ message: 'You cannot demote yourself' }, 409);
  }

  const updated = await prisma.user.update({
    where: { id },
    data: { role },
    select: { id: true, email: true, role: true },
  });
  return c.json(updated);
});

/* Delete a user and everything they own (cascades). */
app.delete('/users/:id', async (c) => {
  const prisma = getPrisma(c.env);
  const self = c.get('user');
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) return c.json({ message: 'Bad id' }, 400);
  if (id === self.id) return c.json({ message: 'You cannot delete yourself' }, 409);

  await prisma.user.delete({ where: { id } });
  return c.json({ deleted: id });
});

/** Idempotent system-set import (create / update / skip). */
app.post('/system-sets', async (c) => {
  const prisma = getPrisma(c.env);
  const admin = c.get('user');
  let parsed;
  try { parsed = normaliseImport(await c.req.json()); }
  catch (e: any) { return c.json({ message: e?.message ?? 'Invalid list JSON' }, 400); }

  const existing = await prisma.wordList.findFirst({
    where: {
      isSystem: true, title: parsed.title,
      sourceLang: parsed.sourceLang, targetLang: parsed.targetLang,
    },
  });

  if (!existing) {
    const list = await prisma.wordList.create({
      data: {
        ownerId: admin.id, title: parsed.title, description: parsed.description,
        sourceLang: parsed.sourceLang, targetLang: parsed.targetLang,
        isPublic: true, isSystem: true,
      },
    });
    const v = await createVersion(prisma, list.id, parsed.items, 'Initial system import');
    return c.json({ id: list.id, action: 'created', version: v.version, itemCount: v.itemCount }, 201);
  }

  const latest = await latestVersion(prisma, existing.id);
  if (latest) {
    const current = await versionPairs(prisma, latest.id);
    const same =
      current.length === parsed.items.length &&
      current.every((cur, i) => cur.source === parsed.items[i].source && cur.target === parsed.items[i].target);
    if (same) return c.json({ id: existing.id, action: 'skipped', version: latest.version, itemCount: latest.itemCount });
  }

  const v = await createVersion(prisma, existing.id, parsed.items, 'System import update');
  return c.json({ id: existing.id, action: 'updated', version: v.version, itemCount: v.itemCount }, 201);
});

export default app;
