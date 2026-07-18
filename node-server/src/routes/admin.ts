import { Router } from 'express';
import { prisma } from '../prisma';
import { authenticateJWT, requireAdmin, asyncHandler } from '../middleware/auth';
import { ROLES } from '../lib/config';
import { normaliseImport } from '../lib/importParser';
import { createVersion, latestVersion, versionPairs } from '../lib/versioning';
import type { RequestWithUser } from '../types';

const router = Router();
router.use(authenticateJWT, requireAdmin);

router.get(
  '/users',
  asyncHandler(async (_req, res) => {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        id: true, email: true, username: true, role: true, xp: true, createdAt: true,
        _count: { select: { lists: true } },
      },
    });
    res.json(users.map((u) => ({
      id: u.id, email: u.email, username: u.username, role: u.role, xp: u.xp,
      listCount: u._count.lists, createdAt: u.createdAt,
    })));
  }),
);

router.post(
  '/users/:id/role',
  asyncHandler(async (req, res) => {
    const self = (req as RequestWithUser).user;
    const id = Number(req.params.id);
    if (Number.isNaN(id)) { res.status(400).json({ message: 'Bad id' }); return; }

    const validRoles: string[] = Object.values(ROLES);
    if (!req.body?.role || !validRoles.includes(req.body.role)) {
      res.status(400).json({ message: `Role must be one of: ${validRoles.join(', ')}` }); return;
    }
    const role = req.body.role as string;
    if (id === self.id && role !== ROLES.admin) {
      res.status(409).json({ message: 'You cannot demote yourself' }); return;
    }

    const updated = await prisma.user.update({
      where: { id }, data: { role }, select: { id: true, email: true, role: true },
    });
    res.json(updated);
  }),
);

router.delete(
  '/users/:id',
  asyncHandler(async (req, res) => {
    const self = (req as RequestWithUser).user;
    const id = Number(req.params.id);
    if (Number.isNaN(id)) { res.status(400).json({ message: 'Bad id' }); return; }
    if (id === self.id) { res.status(409).json({ message: 'You cannot delete yourself' }); return; }

    await prisma.user.delete({ where: { id } });
    res.json({ deleted: id });
  }),
);

/**
 * Idempotent system-set import. Body = a list JSON (structured or legacy).
 * - No system list with this title+langs → create (isSystem, isPublic, owner = admin)
 * - Exists and content identical to latest version → skipped
 * - Exists and content differs → new version
 */
router.post(
  '/system-sets',
  asyncHandler(async (req, res) => {
    const admin = (req as RequestWithUser).user;
    let parsed;
    try { parsed = normaliseImport(req.body); }
    catch (e: any) { res.status(400).json({ message: e?.message ?? 'Invalid list JSON' }); return; }

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
      res.status(201).json({ id: list.id, action: 'created', version: v.version, itemCount: v.itemCount });
      return;
    }

    const latest = await latestVersion(prisma, existing.id);
    if (latest) {
      const current = await versionPairs(prisma, latest.id);
      const same =
        current.length === parsed.items.length &&
        current.every((c, i) => c.source === parsed.items[i].source && c.target === parsed.items[i].target);
      if (same) {
        res.json({ id: existing.id, action: 'skipped', version: latest.version, itemCount: latest.itemCount });
        return;
      }
    }

    const v = await createVersion(prisma, existing.id, parsed.items, 'System import update');
    res.status(201).json({ id: existing.id, action: 'updated', version: v.version, itemCount: v.itemCount });
  }),
);

export default router;
