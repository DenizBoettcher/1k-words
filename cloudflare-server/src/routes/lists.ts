import { Hono } from 'hono';
import { z } from 'zod';
import { getPrisma } from '../prisma/prismaHelper';
import { authenticateJWT } from '../middleware/authenticateJWT';
import type { AppEnv } from '../types/AppContext';
import { LIMITS, ROLES } from '../lib/config';
import { normaliseImport } from '../lib/importParser';
import {
  createVersion, forkVersion, latestVersion, versionPairs, diffVersions,
  cleanupOrphanItems, formatVersion, type Pair,
} from '../lib/versioning';

const app = new Hono<AppEnv>();
app.use('*', authenticateJWT);

const isAdmin = (role: string) => role === ROLES.admin;
const countOwnedOriginals = (prisma: any, userId: number) =>
  prisma.wordList.count({ where: { ownerId: userId, originListId: null, isSystem: false } });

async function isMaintainer(prisma: any, listId: number, userId: number) {
  return !!(await prisma.listMaintainer.findUnique({
    where: { listId_userId: { listId, userId } },
  }));
}
async function canEdit(prisma: any, list: any, userId: number, role: string) {
  if (list.isSystem) return isAdmin(role);
  if (list.ownerId === userId || isAdmin(role)) return true;
  return isMaintainer(prisma, list.id, userId);
}
function canManage(list: any, userId: number, role: string) {
  if (list.isSystem) return isAdmin(role);
  return list.ownerId === userId || isAdmin(role);
}

/* GET /mine  owned + maintained */
app.get('/mine', async (c) => {
  const prisma = getPrisma(c.env);
  const userId = c.get('user').id;
  const maintained = await prisma.listMaintainer.findMany({ where: { userId }, select: { listId: true } });
  const lists = await prisma.wordList.findMany({
    where: { OR: [{ ownerId: userId }, { id: { in: maintained.map((m: any) => m.listId) } }] },
    orderBy: { updatedAt: 'desc' },
    include: {
      versions: { orderBy: { version: 'desc' }, take: 1 },
      owner: { select: { username: true } },
      _count: { select: { likes: true, follows: true } },
    },
  });
  const originIds = lists.map((l: any) => l.originListId).filter((x: any): x is number => x !== null);
  const origins = originIds.length
    ? await prisma.wordList.findMany({ where: { id: { in: originIds } }, select: { id: true, title: true } })
    : [];
  const originTitle = new Map(origins.map((o: any) => [o.id, o.title]));

  return c.json(lists.map((l: any) => {
    const v = l.versions[0];
    return {
      id: l.id, title: l.title, description: l.description,
      sourceLang: l.sourceLang, targetLang: l.targetLang,
      isPublic: l.isPublic, isSystem: l.isSystem,
      isFork: l.originListId !== null,
      originListId: l.originListId, originVersion: l.originVersion,
      originTitle: l.originListId ? originTitle.get(l.originListId) ?? null : null,
      isOwner: l.ownerId === userId, owner: l.owner.username,
      version: v?.version ?? 0, versionLabel: v ? formatVersion(v.version) : '',
      itemCount: v?.itemCount ?? 0,
      likes: l._count.likes, followers: l._count.follows,
    };
  }));
});

/* GET /following */
app.get('/following', async (c) => {
  const prisma = getPrisma(c.env);
  const userId = c.get('user').id;
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
  return c.json(follows.map((f: any) => {
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
});

/* GET /public?q=&sort= */
app.get('/public', async (c) => {
  const prisma = getPrisma(c.env);
  const userId = c.get('user').id;
  const q = (c.req.query('q') ?? '').trim();
  const sort = c.req.query('sort') ?? 'stars';

  const lists = await prisma.wordList.findMany({
    where: { isPublic: true, ...(q ? { title: { contains: q } } : {}) },
    take: 100,
    include: {
      owner: { select: { username: true } },
      versions: { orderBy: { version: 'desc' }, take: 1 },
      _count: { select: { likes: true, follows: true } },
    },
  });
  const [followedRows, likedRows] = await Promise.all([
    prisma.listFollow.findMany({ where: { userId, listId: { in: lists.map((l: any) => l.id) } }, select: { listId: true } }),
    prisma.listLike.findMany({ where: { userId, listId: { in: lists.map((l: any) => l.id) } }, select: { listId: true } }),
  ]);
  const followed = new Set(followedRows.map((f: any) => f.listId));
  const liked = new Set(likedRows.map((f: any) => f.listId));

  const ranked = lists
    .map((l: any) => ({ l, likes: l._count.likes, followers: l._count.follows }))
    .sort((a: any, b: any) => {
      if (sort === 'followers') return b.followers - a.followers || b.likes - a.likes;
      if (sort === 'popular') return (b.likes + b.followers) - (a.likes + a.followers) || b.likes - a.likes;
      return b.likes - a.likes || b.followers - a.followers;
    })
    .slice(0, 25);

  return c.json(ranked.map(({ l, likes, followers }: any) => {
    const v = l.versions[0];
    return {
      id: l.id, title: l.title, description: l.description,
      sourceLang: l.sourceLang, targetLang: l.targetLang,
      author: l.owner.username, isSystem: l.isSystem,
      version: v?.version ?? 0, versionLabel: v ? formatVersion(v.version) : '',
      itemCount: v?.itemCount ?? 0,
      likes, followers,
      isOwn: l.ownerId === userId,
      following: followed.has(l.id), liked: liked.has(l.id),
    };
  }));
});

/* POST /  upload */
app.post('/', async (c) => {
  const prisma = getPrisma(c.env);
  const user = c.get('user');
  let parsedList;
  try { parsedList = normaliseImport(await c.req.json()); }
  catch (e: any) { return c.json({ message: e?.message ?? 'Invalid list JSON' }, 400); }

  if (!isAdmin(user.role) && parsedList.items.length > LIMITS.maxItemsPerList)
    return c.json({ message: `Lists are limited to ${LIMITS.maxItemsPerList} words (this one has ${parsedList.items.length}).` }, 422);
  if (!isAdmin(user.role) && (await countOwnedOriginals(prisma, user.id)) >= LIMITS.maxOwnedLists)
    return c.json({ message: `You already have ${LIMITS.maxOwnedLists} lists. Delete one before uploading another.` }, 422);

  const list = await prisma.wordList.create({
    data: {
      ownerId: user.id, title: parsedList.title, description: parsedList.description,
      sourceLang: parsedList.sourceLang, targetLang: parsedList.targetLang, isPublic: parsedList.isPublic,
    },
  });
  const v = await createVersion(prisma, list.id, parsedList.items, 'Initial version');
  return c.json({ id: list.id, version: v.version, itemCount: v.itemCount }, 201);
});

/* POST /:id/version */
const VersionBody = z.object({
  commitMessage: z.string().max(200).optional(),
  items: z.array(z.object({ source: z.string().min(1), target: z.string().min(1) })).min(1),
});
app.post('/:id/version', async (c) => {
  const prisma = getPrisma(c.env);
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  const list = await prisma.wordList.findUnique({ where: { id } });
  if (!list) return c.json({ message: 'Not found' }, 404);
  if (!(await canEdit(prisma, list, user.id, user.role)))
    return c.json({ message: list.isSystem ? 'System lists can only be edited by an admin' : 'Not allowed to edit this list' }, 403);

  const parsed = VersionBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ message: 'items required' }, 400);
  if (!isAdmin(user.role) && parsed.data.items.length > LIMITS.maxItemsPerList)
    return c.json({ message: `Lists are limited to ${LIMITS.maxItemsPerList} words.` }, 422);

  const v = await createVersion(prisma, id, parsed.data.items as Pair[], parsed.data.commitMessage ?? '');
  return c.json({ version: v.version, itemCount: v.itemCount }, 201);
});

/* GET /:id  detail */
app.get('/:id', async (c) => {
  const prisma = getPrisma(c.env);
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  const list = await prisma.wordList.findUnique({
    where: { id },
    include: {
      owner: { select: { username: true } },
      versions: { orderBy: { version: 'desc' } },
      maintainers: { include: { user: { select: { id: true, username: true } } } },
      _count: { select: { likes: true, follows: true } },
    },
  });
  if (!list) return c.json({ message: 'Not found' }, 404);

  const follow = await prisma.listFollow.findUnique({ where: { userId_listId: { userId: user.id, listId: id } } });
  const editable = await canEdit(prisma, list, user.id, user.role);
  if (!(list.ownerId === user.id || list.isPublic || follow || editable))
    return c.json({ message: 'Not allowed' }, 403);

  let originTitle: string | null = null;
  if (list.originListId) {
    const origin = await prisma.wordList.findUnique({ where: { id: list.originListId }, select: { title: true } });
    originTitle = origin?.title ?? null;
  }

  const wanted = Number(c.req.query('version'));
  const chosen = list.versions.find((v: any) => v.version === wanted) ?? list.versions[0];
  const items = chosen ? await versionPairs(prisma, chosen.id) : [];

  return c.json({
    id: list.id, title: list.title, description: list.description,
    sourceLang: list.sourceLang, targetLang: list.targetLang,
    isPublic: list.isPublic, isSystem: list.isSystem,
    author: list.owner.username,
    isOwner: list.ownerId === user.id,
    canEdit: editable,
    canManage: canManage(list, user.id, user.role),
    originListId: list.originListId, originVersion: list.originVersion, originTitle,
    likes: list._count.likes, followers: list._count.follows,
    maintainers: list.maintainers.map((m: any) => ({ id: m.user.id, username: m.user.username })),
    versions: list.versions.map((v: any) => ({
      version: v.version, label: formatVersion(v.version),
      commitMessage: v.commitMessage, itemCount: v.itemCount, createdAt: v.createdAt,
    })),
    currentVersion: chosen?.version ?? 0,
    items,
  });
});

/* GET /:id/diff */
app.get('/:id/diff', async (c) => {
  const prisma = getPrisma(c.env);
  const id = Number(c.req.param('id'));
  const from = Number(c.req.query('from'));
  const to = Number(c.req.query('to'));
  const versions = await prisma.listVersion.findMany({ where: { listId: id, version: { in: [from, to] } } });
  const fromV = versions.find((v: any) => v.version === from);
  const toV = versions.find((v: any) => v.version === to);
  if (!fromV || !toV) return c.json({ message: 'Version not found' }, 404);
  return c.json(await diffVersions(prisma, fromV.id, toV.id));
});

/* PATCH /:id */
const PatchBody = z.object({
  title: z.string().min(1).max(120).optional(),
  description: z.string().max(500).optional(),
  isPublic: z.boolean().optional(),
});
app.patch('/:id', async (c) => {
  const prisma = getPrisma(c.env);
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  const list = await prisma.wordList.findUnique({ where: { id } });
  if (!list) return c.json({ message: 'Not found' }, 404);
  if (!canManage(list, user.id, user.role)) return c.json({ message: 'Not allowed' }, 403);
  const parsed = PatchBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success || Object.keys(parsed.data).length === 0) return c.json({ message: 'Nothing to update' }, 400);
  const updated = await prisma.wordList.update({ where: { id }, data: parsed.data });
  return c.json({ id: updated.id, isPublic: updated.isPublic, title: updated.title });
});

/* DELETE /:id */
app.delete('/:id', async (c) => {
  const prisma = getPrisma(c.env);
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  const list = await prisma.wordList.findUnique({ where: { id } });
  if (!list) return c.json({ message: 'Not found' }, 404);
  if (!canManage(list, user.id, user.role)) return c.json({ message: 'Not allowed' }, 403);
  await prisma.wordList.delete({ where: { id } });
  await cleanupOrphanItems(prisma, null);
  return c.json({ deleted: id });
});

/* Likes */
app.post('/:id/like', async (c) => {
  const prisma = getPrisma(c.env);
  const userId = c.get('user').id;
  const id = Number(c.req.param('id'));
  const list = await prisma.wordList.findUnique({ where: { id }, select: { isPublic: true, ownerId: true } });
  if (!list) return c.json({ message: 'Not found' }, 404);
  if (!list.isPublic && list.ownerId !== userId) return c.json({ message: 'Not allowed' }, 403);
  await prisma.listLike.upsert({
    where: { userId_listId: { userId, listId: id } },
    create: { userId, listId: id }, update: {},
  });
  return c.json({ liked: id }, 201);
});
app.delete('/:id/like', async (c) => {
  const prisma = getPrisma(c.env);
  const userId = c.get('user').id;
  const id = Number(c.req.param('id'));
  await prisma.listLike.deleteMany({ where: { userId, listId: id } });
  return c.json({ unliked: id });
});

/* Maintainers */
app.post('/:id/maintainers', async (c) => {
  const prisma = getPrisma(c.env);
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  const list = await prisma.wordList.findUnique({ where: { id } });
  if (!list) return c.json({ message: 'Not found' }, 404);
  if (!canManage(list, user.id, user.role)) return c.json({ message: 'Only the owner can manage maintainers' }, 403);

  const body = await c.req.json().catch(() => ({}));
  const username = String(body?.username ?? '').trim();
  const target = await prisma.user.findUnique({ where: { username }, select: { id: true, username: true } });
  if (!target) return c.json({ message: `No user named “${username}”` }, 404);
  if (target.id === list.ownerId) return c.json({ message: 'The owner is already a maintainer' }, 409);

  await prisma.listMaintainer.upsert({
    where: { listId_userId: { listId: id, userId: target.id } },
    create: { listId: id, userId: target.id }, update: {},
  });
  return c.json({ id: target.id, username: target.username }, 201);
});
app.delete('/:id/maintainers/:userId', async (c) => {
  const prisma = getPrisma(c.env);
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  const removeId = Number(c.req.param('userId'));
  const list = await prisma.wordList.findUnique({ where: { id } });
  if (!list) return c.json({ message: 'Not found' }, 404);
  if (!canManage(list, user.id, user.role)) return c.json({ message: 'Only the owner can manage maintainers' }, 403);
  await prisma.listMaintainer.deleteMany({ where: { listId: id, userId: removeId } });
  return c.json({ removed: removeId });
});

/* Follow */
app.post('/:id/follow', async (c) => {
  const prisma = getPrisma(c.env);
  const userId = c.get('user').id;
  const id = Number(c.req.param('id'));
  const list = await prisma.wordList.findUnique({ where: { id } });
  if (!list) return c.json({ message: 'Not found' }, 404);
  if (!list.isPublic && list.ownerId !== userId) return c.json({ message: 'That list is private' }, 403);
  if (list.ownerId === userId) return c.json({ message: "That's your own list" }, 409);
  const latest = await latestVersion(prisma, id);
  if (!latest) return c.json({ message: 'List has no versions yet' }, 400);
  await prisma.listFollow.upsert({
    where: { userId_listId: { userId, listId: id } },
    create: { userId, listId: id, versionId: latest.id },
    update: { versionId: latest.id },
  });
  return c.json({ following: id, version: latest.version }, 201);
});
app.patch('/:id/follow', async (c) => {
  const prisma = getPrisma(c.env);
  const userId = c.get('user').id;
  const id = Number(c.req.param('id'));
  const body = await c.req.json().catch(() => ({}));
  const version = Number(body?.version);
  const target = await prisma.listVersion.findUnique({ where: { listId_version: { listId: id, version } } });
  if (!target) return c.json({ message: 'Version not found' }, 404);
  const follow = await prisma.listFollow.findUnique({ where: { userId_listId: { userId, listId: id } } });
  if (!follow) return c.json({ message: 'Not following this list' }, 404);
  await prisma.listFollow.update({ where: { userId_listId: { userId, listId: id } }, data: { versionId: target.id } });
  return c.json({ following: id, version });
});
app.delete('/:id/follow', async (c) => {
  const prisma = getPrisma(c.env);
  const userId = c.get('user').id;
  const id = Number(c.req.param('id'));
  await prisma.listFollow.deleteMany({ where: { userId, listId: id } });
  return c.json({ unfollowed: id });
});

/* POST /:id/fork  reference-based, zero-copy */
app.post('/:id/fork', async (c) => {
  const prisma = getPrisma(c.env);
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  const source = await prisma.wordList.findUnique({ where: { id } });
  if (!source) return c.json({ message: 'Not found' }, 404);
  if (source.isSystem) return c.json({ message: 'System lists cannot be forked  follow them instead' }, 403);
  if (!source.isPublic && source.ownerId !== user.id) return c.json({ message: 'That list is private' }, 403);

  const latest = await latestVersion(prisma, id);
  if (!latest) return c.json({ message: 'Nothing to fork' }, 400);

  const fork = await prisma.wordList.create({
    data: {
      ownerId: user.id, title: source.title, description: source.description,
      sourceLang: source.sourceLang, targetLang: source.targetLang,
      isPublic: false, originListId: source.id, originVersion: latest.version,
    },
  });
  const v = await forkVersion(prisma, fork.id, latest.id, `Forked from “${source.title}” ${formatVersion(latest.version)}`);
  await prisma.listFollow.deleteMany({ where: { userId: user.id, listId: id } });
  return c.json({ id: fork.id, version: v.version, itemCount: v.itemCount }, 201);
});

/* GET /:id/export */
app.get('/:id/export', async (c) => {
  const prisma = getPrisma(c.env);
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  const list = await prisma.wordList.findUnique({
    where: { id }, include: { versions: { orderBy: { version: 'desc' } } },
  });
  if (!list) return c.json({ message: 'Not found' }, 404);
  const follow = await prisma.listFollow.findUnique({ where: { userId_listId: { userId: user.id, listId: id } } });
  const mayRead = list.ownerId === user.id || list.isPublic || follow || isAdmin(user.role) || (await isMaintainer(prisma, id, user.id));
  if (!mayRead) return c.json({ message: 'Not allowed' }, 403);

  const wanted = Number(c.req.query('version'));
  const chosen = list.versions.find((v: any) => v.version === wanted) ?? list.versions[0];
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
  return new Response(JSON.stringify(file, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${safeName}.json"`,
    },
  });
});

export default app;
