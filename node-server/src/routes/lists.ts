import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { authenticateJWT, asyncHandler } from '../middleware/auth';
import { LIMITS, ROLES } from '../lib/config';
import { normaliseImport } from '../lib/importParser';
import {
  createVersion, forkVersion, latestVersion, versionPairs, diffVersions,
  cleanupOrphanItems, formatVersion, type Pair,
} from '../lib/versioning';
import type { RequestWithUser } from '../types';

const router = Router();
router.use(authenticateJWT);

const isAdmin = (role: string) => role === ROLES.admin;
const uid = (req: any) => (req as RequestWithUser).user.id;
const urole = (req: any) => (req as RequestWithUser).user.role;

const countOwnedOriginals = (userId: number) =>
  prisma.wordList.count({ where: { ownerId: userId, originListId: null, isSystem: false } });

async function isMaintainer(listId: number, userId: number) {
  return !!(await prisma.listMaintainer.findUnique({
    where: { listId_userId: { listId, userId } },
  }));
}

/**
 * Edit rights: system lists  admin only. Otherwise owner, maintainer, admin.
 */
async function canEdit(list: { id: number; ownerId: number; isSystem: boolean }, userId: number, role: string) {
  if (list.isSystem) return isAdmin(role);
  if (list.ownerId === userId || isAdmin(role)) return true;
  return isMaintainer(list.id, userId);
}

/** Manage rights (delete, visibility, maintainers): owner/admin; system: admin. */
function canManage(list: { ownerId: number; isSystem: boolean }, userId: number, role: string) {
  if (list.isSystem) return isAdmin(role);
  return list.ownerId === userId || isAdmin(role);
}

/* ───────────── GET /mine  owned + maintained ───────────── */
router.get('/mine', asyncHandler(async (req, res) => {
  const userId = uid(req);
  const maintained = await prisma.listMaintainer.findMany({ where: { userId }, select: { listId: true } });
  const lists = await prisma.wordList.findMany({
    where: { OR: [{ ownerId: userId }, { id: { in: maintained.map((m) => m.listId) } }] },
    orderBy: { updatedAt: 'desc' },
    include: {
      versions: { orderBy: { version: 'desc' }, take: 1 },
      owner: { select: { username: true } },
      _count: { select: { likes: true, follows: true } },
    },
  });

  // Resolve origin titles for forks in one query.
  const originIds = lists.map((l) => l.originListId).filter((x): x is number => x !== null);
  const origins = originIds.length
    ? await prisma.wordList.findMany({ where: { id: { in: originIds } }, select: { id: true, title: true } })
    : [];
  const originTitle = new Map(origins.map((o) => [o.id, o.title]));

  res.json(lists.map((l) => {
    const v = l.versions[0];
    return {
      id: l.id, title: l.title, description: l.description,
      sourceLang: l.sourceLang, targetLang: l.targetLang,
      isPublic: l.isPublic, isSystem: l.isSystem,
      isFork: l.originListId !== null,
      originListId: l.originListId,
      originVersion: l.originVersion,
      originTitle: l.originListId ? originTitle.get(l.originListId) ?? null : null,
      isOwner: l.ownerId === userId,
      owner: l.owner.username,
      version: v?.version ?? 0, versionLabel: v ? formatVersion(v.version) : '',
      itemCount: v?.itemCount ?? 0,
      likes: l._count.likes, followers: l._count.follows,
    };
  }));
}));

/* ───────────── GET /following ───────────── */
router.get('/following', asyncHandler(async (req, res) => {
  const userId = uid(req);
  const follows = await prisma.listFollow.findMany({
    where: { userId },
    include: {
      version: true,
      list: {
        include: {
          owner: { select: { username: true } },
          versions: { orderBy: { version: 'desc' }, take: 1 },
          _count: { select: { likes: true, follows: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json(follows.map((f) => {
    const latest = f.list.versions[0];
    return {
      id: f.list.id, title: f.list.title,
      sourceLang: f.list.sourceLang, targetLang: f.list.targetLang,
      author: f.list.owner.username, isSystem: f.list.isSystem,
      followedVersion: f.version.version, followedLabel: formatVersion(f.version.version),
      latestVersion: latest?.version ?? f.version.version,
      latestLabel: formatVersion(latest?.version ?? f.version.version),
      updateAvailable: (latest?.version ?? 0) > f.version.version,
      itemCount: f.version.itemCount,
      likes: f.list._count.likes, followers: f.list._count.follows,
    };
  }));
}));

/* ───────────── GET /public?q=&sort=stars|followers|popular ───────────── */
router.get('/public', asyncHandler(async (req, res) => {
  const userId = uid(req);
  const q = String(req.query.q ?? '').trim();
  const sort = String(req.query.sort ?? 'stars');

  const lists = await prisma.wordList.findMany({
    where: { isPublic: true, ...(q ? { title: { contains: q } } : {}) },
    take: 100, // fetch a window, rank in JS, return top 25
    include: {
      owner: { select: { username: true } },
      versions: { orderBy: { version: 'desc' }, take: 1 },
      _count: { select: { likes: true, follows: true } },
    },
  });

  const [followedRows, likedRows] = await Promise.all([
    prisma.listFollow.findMany({ where: { userId, listId: { in: lists.map((l) => l.id) } }, select: { listId: true } }),
    prisma.listLike.findMany({ where: { userId, listId: { in: lists.map((l) => l.id) } }, select: { listId: true } }),
  ]);
  const followed = new Set(followedRows.map((f) => f.listId));
  const liked = new Set(likedRows.map((f) => f.listId));

  const ranked = lists
    .map((l) => ({ l, likes: l._count.likes, followers: l._count.follows }))
    .sort((a, b) => {
      if (sort === 'followers') return b.followers - a.followers || b.likes - a.likes;
      if (sort === 'popular') return (b.likes + b.followers) - (a.likes + a.followers) || b.likes - a.likes;
      return b.likes - a.likes || b.followers - a.followers; // stars (default), followers tiebreak
    })
    .slice(0, 25);

  res.json(ranked.map(({ l, likes, followers }) => {
    const v = l.versions[0];
    return {
      id: l.id, title: l.title, description: l.description,
      sourceLang: l.sourceLang, targetLang: l.targetLang,
      author: l.owner.username, isSystem: l.isSystem,
      version: v?.version ?? 0, versionLabel: v ? formatVersion(v.version) : '',
      itemCount: v?.itemCount ?? 0,
      likes, followers,
      isOwn: l.ownerId === userId,
      following: followed.has(l.id),
      liked: liked.has(l.id),
    };
  }));
}));

/* ───────────── POST /  upload (v1) ───────────── */
router.post('/', asyncHandler(async (req, res) => {
  const userId = uid(req);
  let parsedList;
  try { parsedList = normaliseImport(req.body); }
  catch (e: any) { res.status(400).json({ message: e?.message ?? 'Invalid list JSON' }); return; }

  if (!isAdmin(urole(req)) && parsedList.items.length > LIMITS.maxItemsPerList) {
    res.status(422).json({ message: `Lists are limited to ${LIMITS.maxItemsPerList} words (this one has ${parsedList.items.length}).` });
    return;
  }
  if (!isAdmin(urole(req)) && (await countOwnedOriginals(userId)) >= LIMITS.maxOwnedLists) {
    res.status(422).json({ message: `You already have ${LIMITS.maxOwnedLists} lists. Delete one before uploading another.` });
    return;
  }

  const list = await prisma.wordList.create({
    data: {
      ownerId: userId, title: parsedList.title, description: parsedList.description,
      sourceLang: parsedList.sourceLang, targetLang: parsedList.targetLang, isPublic: parsedList.isPublic,
    },
  });
  const v = await createVersion(prisma, list.id, parsedList.items, 'Initial version');
  res.status(201).json({ id: list.id, version: v.version, itemCount: v.itemCount });
}));

/* ───────────── POST /:id/version  owner/maintainer adds a version ───────────── */
const VersionBody = z.object({
  commitMessage: z.string().max(200).optional(),
  items: z.array(z.object({ source: z.string().min(1), target: z.string().min(1) })).min(1),
});
router.post('/:id/version', asyncHandler(async (req, res) => {
  const userId = uid(req);
  const id = Number(req.params.id);
  const list = await prisma.wordList.findUnique({ where: { id } });
  if (!list) { res.status(404).json({ message: 'Not found' }); return; }
  if (!(await canEdit(list, userId, urole(req)))) {
    res.status(403).json({ message: list.isSystem ? 'System lists can only be edited by an admin' : 'Not allowed to edit this list' });
    return;
  }

  const parsed = VersionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: 'items required' }); return; }
  if (!isAdmin(urole(req)) && parsed.data.items.length > LIMITS.maxItemsPerList) {
    res.status(422).json({ message: `Lists are limited to ${LIMITS.maxItemsPerList} words.` }); return;
  }

  const v = await createVersion(prisma, id, parsed.data.items as Pair[], parsed.data.commitMessage ?? '');
  res.status(201).json({ version: v.version, itemCount: v.itemCount });
}));

/* ───────────── GET /:id  detail ───────────── */
router.get('/:id', asyncHandler(async (req, res) => {
  const userId = uid(req);
  const id = Number(req.params.id);
  const list = await prisma.wordList.findUnique({
    where: { id },
    include: {
      owner: { select: { username: true } },
      versions: { orderBy: { version: 'desc' } },
      maintainers: { include: { user: { select: { id: true, username: true } } } },
      _count: { select: { likes: true, follows: true } },
    },
  });
  if (!list) { res.status(404).json({ message: 'Not found' }); return; }

  const follow = await prisma.listFollow.findUnique({ where: { userId_listId: { userId, listId: id } } });
  const editable = await canEdit(list, userId, urole(req));
  const mayRead = list.ownerId === userId || list.isPublic || !!follow || editable;
  if (!mayRead) { res.status(403).json({ message: 'Not allowed' }); return; }

  let originTitle: string | null = null;
  if (list.originListId) {
    const origin = await prisma.wordList.findUnique({ where: { id: list.originListId }, select: { title: true } });
    originTitle = origin?.title ?? null;
  }

  const wanted = Number(req.query.version);
  const chosen = list.versions.find((v) => v.version === wanted) ?? list.versions[0];
  const items = chosen ? await versionPairs(prisma, chosen.id) : [];

  res.json({
    id: list.id, title: list.title, description: list.description,
    sourceLang: list.sourceLang, targetLang: list.targetLang,
    isPublic: list.isPublic, isSystem: list.isSystem,
    author: list.owner.username,
    isOwner: list.ownerId === userId,
    canEdit: editable,
    canManage: canManage(list, userId, urole(req)),
    originListId: list.originListId, originVersion: list.originVersion, originTitle,
    likes: list._count.likes, followers: list._count.follows,
    maintainers: list.maintainers.map((m) => ({ id: m.user.id, username: m.user.username })),
    versions: list.versions.map((v) => ({
      version: v.version, label: formatVersion(v.version),
      commitMessage: v.commitMessage, itemCount: v.itemCount, createdAt: v.createdAt,
    })),
    currentVersion: chosen?.version ?? 0,
    items,
  });
}));

/* ───────────── GET /:id/diff?from=&to= ───────────── */
router.get('/:id/diff', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const from = Number(req.query.from);
  const to = Number(req.query.to);
  const versions = await prisma.listVersion.findMany({ where: { listId: id, version: { in: [from, to] } } });
  const fromV = versions.find((v) => v.version === from);
  const toV = versions.find((v) => v.version === to);
  if (!fromV || !toV) { res.status(404).json({ message: 'Version not found' }); return; }
  res.json(await diffVersions(prisma, fromV.id, toV.id));
}));

/* ───────────── PATCH /:id  meta (owner/admin; system: admin) ───────────── */
const PatchBody = z.object({
  title: z.string().min(1).max(120).optional(),
  description: z.string().max(500).optional(),
  isPublic: z.boolean().optional(),
});
router.patch('/:id', asyncHandler(async (req, res) => {
  const userId = uid(req);
  const id = Number(req.params.id);
  const list = await prisma.wordList.findUnique({ where: { id } });
  if (!list) { res.status(404).json({ message: 'Not found' }); return; }
  if (!canManage(list, userId, urole(req))) { res.status(403).json({ message: 'Not allowed' }); return; }
  const parsed = PatchBody.safeParse(req.body);
  if (!parsed.success || Object.keys(parsed.data).length === 0) { res.status(400).json({ message: 'Nothing to update' }); return; }
  const updated = await prisma.wordList.update({ where: { id }, data: parsed.data });
  res.json({ id: updated.id, isPublic: updated.isPublic, title: updated.title });
}));

/* ───────────── DELETE /:id ───────────── */
router.delete('/:id', asyncHandler(async (req, res) => {
  const userId = uid(req);
  const id = Number(req.params.id);
  const list = await prisma.wordList.findUnique({ where: { id } });
  if (!list) { res.status(404).json({ message: 'Not found' }); return; }
  if (!canManage(list, userId, urole(req))) { res.status(403).json({ message: 'Not allowed' }); return; }
  await prisma.wordList.delete({ where: { id } });
  // Items are SetNull'd; drop the ones nothing references anymore.
  await cleanupOrphanItems(prisma, null);
  res.json({ deleted: id });
}));

/* ───────────── Likes ───────────── */
router.post('/:id/like', asyncHandler(async (req, res) => {
  const userId = uid(req);
  const id = Number(req.params.id);
  const list = await prisma.wordList.findUnique({ where: { id }, select: { isPublic: true, ownerId: true } });
  if (!list) { res.status(404).json({ message: 'Not found' }); return; }
  if (!list.isPublic && list.ownerId !== userId) { res.status(403).json({ message: 'Not allowed' }); return; }
  await prisma.listLike.upsert({
    where: { userId_listId: { userId, listId: id } },
    create: { userId, listId: id }, update: {},
  });
  res.status(201).json({ liked: id });
}));
router.delete('/:id/like', asyncHandler(async (req, res) => {
  const userId = uid(req);
  const id = Number(req.params.id);
  await prisma.listLike.deleteMany({ where: { userId, listId: id } });
  res.json({ unliked: id });
}));

/* ───────────── Maintainers (owner/admin) ───────────── */
router.post('/:id/maintainers', asyncHandler(async (req, res) => {
  const userId = uid(req);
  const id = Number(req.params.id);
  const list = await prisma.wordList.findUnique({ where: { id } });
  if (!list) { res.status(404).json({ message: 'Not found' }); return; }
  if (!canManage(list, userId, urole(req))) { res.status(403).json({ message: 'Only the owner can manage maintainers' }); return; }

  const username = String(req.body?.username ?? '').trim();
  const target = await prisma.user.findUnique({ where: { username }, select: { id: true, username: true } });
  if (!target) { res.status(404).json({ message: `No user named “${username}”` }); return; }
  if (target.id === list.ownerId) { res.status(409).json({ message: 'The owner is already a maintainer' }); return; }

  await prisma.listMaintainer.upsert({
    where: { listId_userId: { listId: id, userId: target.id } },
    create: { listId: id, userId: target.id }, update: {},
  });
  res.status(201).json({ id: target.id, username: target.username });
}));
router.delete('/:id/maintainers/:userId', asyncHandler(async (req, res) => {
  const userId = uid(req);
  const id = Number(req.params.id);
  const removeId = Number(req.params.userId);
  const list = await prisma.wordList.findUnique({ where: { id } });
  if (!list) { res.status(404).json({ message: 'Not found' }); return; }
  if (!canManage(list, userId, urole(req))) { res.status(403).json({ message: 'Only the owner can manage maintainers' }); return; }
  await prisma.listMaintainer.deleteMany({ where: { listId: id, userId: removeId } });
  res.json({ removed: removeId });
}));

/* ───────────── Follow ───────────── */
router.post('/:id/follow', asyncHandler(async (req, res) => {
  const userId = uid(req);
  const id = Number(req.params.id);
  const list = await prisma.wordList.findUnique({ where: { id } });
  if (!list) { res.status(404).json({ message: 'Not found' }); return; }
  if (!list.isPublic && list.ownerId !== userId) { res.status(403).json({ message: 'That list is private' }); return; }
  if (list.ownerId === userId) { res.status(409).json({ message: "That's your own list" }); return; }

  const latest = await latestVersion(prisma, id);
  if (!latest) { res.status(400).json({ message: 'List has no versions yet' }); return; }
  await prisma.listFollow.upsert({
    where: { userId_listId: { userId, listId: id } },
    create: { userId, listId: id, versionId: latest.id },
    update: { versionId: latest.id },
  });
  res.status(201).json({ following: id, version: latest.version });
}));
router.patch('/:id/follow', asyncHandler(async (req, res) => {
  const userId = uid(req);
  const id = Number(req.params.id);
  const version = Number(req.body?.version);
  const target = await prisma.listVersion.findUnique({ where: { listId_version: { listId: id, version } } });
  if (!target) { res.status(404).json({ message: 'Version not found' }); return; }
  const follow = await prisma.listFollow.findUnique({ where: { userId_listId: { userId, listId: id } } });
  if (!follow) { res.status(404).json({ message: 'Not following this list' }); return; }
  await prisma.listFollow.update({ where: { userId_listId: { userId, listId: id } }, data: { versionId: target.id } });
  res.json({ following: id, version });
}));
router.delete('/:id/follow', asyncHandler(async (req, res) => {
  const userId = uid(req);
  const id = Number(req.params.id);
  await prisma.listFollow.deleteMany({ where: { userId, listId: id } });
  res.json({ unfollowed: id });
}));

/* ───────────── POST /:id/fork  reference-based editable copy ───────────── */
router.post('/:id/fork', asyncHandler(async (req, res) => {
  const userId = uid(req);
  const id = Number(req.params.id);
  const source = await prisma.wordList.findUnique({ where: { id } });
  if (!source) { res.status(404).json({ message: 'Not found' }); return; }
  if (source.isSystem) { res.status(403).json({ message: 'System lists cannot be forked  follow them instead' }); return; }
  if (!source.isPublic && source.ownerId !== userId) { res.status(403).json({ message: 'That list is private' }); return; }

  // Forks don't count toward the owned-lists cap (originListId is set).
  const latest = await latestVersion(prisma, id);
  if (!latest) { res.status(400).json({ message: 'Nothing to fork' }); return; }

  const fork = await prisma.wordList.create({
    data: {
      ownerId: userId, title: source.title, description: source.description,
      sourceLang: source.sourceLang, targetLang: source.targetLang,
      isPublic: false, originListId: source.id, originVersion: latest.version,
    },
  });
  // Zero-copy: fork v1 references the exact items of the source version.
  const v = await forkVersion(prisma, fork.id, latest.id, `Forked from “${source.title}” ${formatVersion(latest.version)}`);
  // Forking replaces following (progress carries over  same item ids).
  await prisma.listFollow.deleteMany({ where: { userId, listId: id } });
  res.status(201).json({ id: fork.id, version: v.version, itemCount: v.itemCount });
}));

/* ───────────── GET /:id/export?version= ───────────── */
router.get('/:id/export', asyncHandler(async (req, res) => {
  const userId = uid(req);
  const id = Number(req.params.id);
  const list = await prisma.wordList.findUnique({
    where: { id },
    include: { versions: { orderBy: { version: 'desc' } } },
  });
  if (!list) { res.status(404).json({ message: 'Not found' }); return; }
  const follow = await prisma.listFollow.findUnique({ where: { userId_listId: { userId, listId: id } } });
  const mayRead = list.ownerId === userId || list.isPublic || !!follow || isAdmin(urole(req)) || (await isMaintainer(id, userId));
  if (!mayRead) { res.status(403).json({ message: 'Not allowed' }); return; }

  const wanted = Number(req.query.version);
  const chosen = list.versions.find((v) => v.version === wanted) ?? list.versions[0];
  const pairs = chosen ? await versionPairs(prisma, chosen.id) : [];

  const file = {
    title: list.title, sourceLang: list.sourceLang, targetLang: list.targetLang,
    version: chosen?.version ?? 1,
    words: pairs.map((p) => ({
      [list.sourceLang]: p.source.includes('/') ? p.source.split('/') : p.source,
      [list.targetLang]: p.target.includes('/') ? p.target.split('/') : p.target,
    })),
  };
  const safeName = `${list.title.replace(/[^a-z0-9-_]+/gi, '_').slice(0, 50) || 'list'}_v${chosen?.version ?? 1}`;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}.json"`);
  res.send(JSON.stringify(file, null, 2));
}));

export default router;
