import { Hono } from 'hono';
import { z } from 'zod';
import { getPrisma } from '../prisma/prismaHelper';
import { authenticateJWT } from '../middleware/authenticateJWT';
import type { AppEnv } from '../types/AppContext';
import { initialState, review, isMastered, selectionWeight, type ReviewState } from '../lib/srs';
import { summarize, XP_REWARDS } from '../lib/leveling';
import { versionPairs, latestVersion } from '../lib/versioning';

const app = new Hono<AppEnv>();
app.use('*', authenticateJWT);

function stateFrom(row: { state: unknown } | null | undefined): ReviewState {
  if (!row) return initialState();
  const s = row.state as Partial<ReviewState> | null;
  if (!s || typeof s.ease !== 'number') return initialState();
  return {
    repetitions: s.repetitions ?? 0, ease: s.ease, intervalDays: s.intervalDays ?? 0,
    dueAt: s.dueAt ?? Date.now(), lapses: s.lapses ?? 0, reviews: s.reviews ?? 0,
    correct: s.correct ?? 0, recent: Array.isArray(s.recent) ? s.recent : [],
  };
}

async function activeVersionId(prisma: any, userId: number, listId: number): Promise<number | null> {
  const list = await prisma.wordList.findUnique({ where: { id: listId }, select: { ownerId: true } });
  if (!list) return null;
  const maintainer = await prisma.listMaintainer.findUnique({
    where: { listId_userId: { listId, userId } },
  });
  if (list.ownerId === userId || maintainer) {
    const latest = await latestVersion(prisma, listId);
    return latest?.id ?? null;
  }
  const follow = await prisma.listFollow.findUnique({ where: { userId_listId: { userId, listId } } });
  return follow?.versionId ?? null;
}

async function activeVersionIds(prisma: any, userId: number): Promise<number[]> {
  const maintained = await prisma.listMaintainer.findMany({ where: { userId }, select: { listId: true } });
  const owned = await prisma.wordList.findMany({
    where: { OR: [{ ownerId: userId }, { id: { in: maintained.map((m: any) => m.listId) } }] },
    include: { versions: { orderBy: { version: 'desc' }, take: 1, select: { id: true } } },
  });
  const followed = await prisma.listFollow.findMany({ where: { userId }, select: { versionId: true } });
  const ids = [
    ...owned.map((l: any) => l.versions[0]?.id).filter((x: any): x is number => !!x),
    ...followed.map((f: any) => f.versionId),
  ];
  return Array.from(new Set(ids));
}

/**
 * All actively studied lists in ONE place (3 queries). Returns
 * listId -> { versionId, itemCount }. Summaries below filter progress
 * RELATIONALLY (versionItems.some) instead of `wordItemId: { in: [...] }` —
 * D1 caps bound parameters at ~100/query, so a 3000-word IN list explodes.
 */
async function activeVersionMap(prisma: any, userId: number): Promise<Map<number, { versionId: number; itemCount: number }>> {
  const maintained = await prisma.listMaintainer.findMany({ where: { userId }, select: { listId: true } });
  const owned = await prisma.wordList.findMany({
    where: { OR: [{ ownerId: userId }, { id: { in: maintained.map((m: any) => m.listId) } }] },
    include: { versions: { orderBy: { version: 'desc' }, take: 1, select: { id: true, itemCount: true } } },
  });
  const follows = await prisma.listFollow.findMany({
    where: { userId },
    include: { version: { select: { id: true, itemCount: true } } },
  });

  const map = new Map<number, { versionId: number; itemCount: number }>();
  for (const follow of follows) {
    map.set(follow.listId, { versionId: follow.version.id, itemCount: follow.version.itemCount });
  }
  for (const list of owned) {
    const latest = list.versions[0];
    if (latest) map.set(list.id, { versionId: latest.id, itemCount: latest.itemCount });
  }
  return map;
}

/** Mastered/encountered counts of one version, without giant IN lists. */
function versionProgressCounts(prisma: any, userId: number, versionId: number) {
  return Promise.all([
    prisma.progress.count({
      where: {
        userId,
        masteredAt: { not: null },
        wordItem: { versionItems: { some: { versionId } } },
      },
    }),
    prisma.progress.count({
      where: {
        userId,
        wordItem: { versionItems: { some: { versionId } } },
      },
    }),
  ]);
}

/** Level/mastery numbers for ONE list (xp injected by the caller). */
async function listSummary(prisma: any, userId: number, listId: number, versionMap: Map<number, { versionId: number; itemCount: number }>, xp: number) {
  const active = versionMap.get(listId);
  if (!active) return summarize(0, 0, 0, xp);
  const [mastered, encountered] = await versionProgressCounts(prisma, userId, active.versionId);
  return summarize(mastered, encountered, active.itemCount, xp);
}

/** Account level = SUM of the levels of every actively studied list. */
async function accountSummary(prisma: any, userId: number, versionMap: Map<number, { versionId: number; itemCount: number }>, xp: number) {
  let accountLevel = 0;
  for (const [listId] of versionMap) {
    const summary = await listSummary(prisma, userId, listId, versionMap, xp);
    accountLevel += summary.level;
  }
  return { level: accountLevel, lists: versionMap.size, xp };
}

async function librarySummary(prisma: any, userId: number, versionIds: number[], xp: number) {
  const vItems = versionIds.length
    ? await prisma.versionItem.findMany({ where: { versionId: { in: versionIds } }, select: { wordItemId: true } })
    : [];
  const totalWords = new Set(vItems.map((v: any) => v.wordItemId)).size;

  const [mastered, encountered] = versionIds.length
    ? await Promise.all([
        prisma.progress.count({
          where: {
            userId,
            masteredAt: { not: null },
            wordItem: { versionItems: { some: { versionId: { in: versionIds } } } },
          },
        }),
        prisma.progress.count({
          where: {
            userId,
            wordItem: { versionItems: { some: { versionId: { in: versionIds } } } },
          },
        }),
      ])
    : [0, 0];
  return summarize(mastered, encountered, totalWords, xp);
}

app.get('/summary', async (c) => {
  const prisma = getPrisma(c.env);
  const userId = c.get('user').id;
  const versionMap = await activeVersionMap(prisma, userId);
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { xp: true } });
  const xp = user?.xp ?? 0;
  const versionIds = Array.from(new Set(Array.from(versionMap.values()).map((entry) => entry.versionId)));
  const [library, account] = await Promise.all([
    librarySummary(prisma, userId, versionIds, xp),
    accountSummary(prisma, userId, versionMap, xp),
  ]);
  return c.json({ ...library, account });
});

app.get('/:listId', async (c) => {
  const prisma = getPrisma(c.env);
  const userId = c.get('user').id;
  const listId = Number(c.req.param('listId'));
  const list = await prisma.wordList.findUnique({
    where: { id: listId }, select: { id: true, title: true, sourceLang: true, targetLang: true },
  });
  if (!list) return c.json({ message: 'List not found' }, 404);

  const versionId = await activeVersionId(prisma, userId, listId);
  if (!versionId) return c.json({ message: 'You are not studying this list' }, 403);

  const settings = await prisma.userSettings.findUnique({ where: { userId } });
  const batchSize = settings?.wordsPerSession ?? 15;

  const pairs = await versionPairs(prisma, versionId);
  const progressRows = await prisma.progress.findMany({
    where: { userId, wordItem: { versionItems: { some: { versionId } } } },
    select: { wordItemId: true, state: true },
  });
  const byId = new Map(progressRows.map((p: any) => [p.wordItemId, p.state]));

  const now = Date.now();
  const scored = pairs.map((p) => {
    const state = stateFrom(byId.has(p.id) ? { state: byId.get(p.id) } : null);
    const weight = selectionWeight(state, now);
    const sortKey = Math.pow(Math.random(), 1 / Math.max(weight, 0.0001));
    return { id: p.id, sourceLang: p.source, targetLang: p.target, history: { counter: state.reviews, learn: state.recent }, sortKey };
  });
  scored.sort((a, b) => b.sortKey - a.sortKey);
  const words = scored.slice(0, batchSize).map(({ sortKey, ...rest }) => rest);

  const versionMap = await activeVersionMap(prisma, userId);
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { xp: true } });
  const xp = user?.xp ?? 0;
  const [summary, account] = await Promise.all([
    listSummary(prisma, userId, listId, versionMap, xp),
    accountSummary(prisma, userId, versionMap, xp),
  ]);
  return c.json({ list, words, summary: { ...summary, account } });
});

const ReviewBody = z.object({
  wordItemId: z.number().int().positive(),
  correct: z.boolean(),
  quality: z.number().int().min(0).max(5).optional(),
  listId: z.number().int().positive().optional(), // list being studied, for a list-scoped summary
});
app.post('/review', async (c) => {
  const prisma = getPrisma(c.env);
  const userId = c.get('user').id;
  const parsed = ReviewBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ message: 'wordItemId + correct required' }, 400);
  const { wordItemId, correct, quality, listId } = parsed.data;

  const item = await prisma.wordItem.findUnique({ where: { id: wordItemId }, select: { id: true } });
  if (!item) return c.json({ message: 'Word not found' }, 404);
  const myVersionIds = await activeVersionIds(prisma, userId);
  const inMyLibrary = myVersionIds.length
    ? await prisma.versionItem.findFirst({
        where: { wordItemId, versionId: { in: myVersionIds } },
        select: { versionId: true },
      })
    : null;
  if (!inMyLibrary) return c.json({ message: 'Not your word' }, 403);

  const existing = await prisma.progress.findUnique({
    where: { userId_wordItemId: { userId, wordItemId } }, select: { state: true, masteredAt: true },
  });
  const after = review(stateFrom(existing), correct, quality);
  const nowMastered = isMastered(after);
  const firstTimeMastered = nowMastered && existing?.masteredAt == null;
  const lostMastery = !nowMastered && existing?.masteredAt != null;
  let xpGain = correct ? XP_REWARDS.correctAnswer : XP_REWARDS.wrongAnswer;
  if (firstTimeMastered) xpGain += XP_REWARDS.firstTimeMastered;

  await prisma.$transaction([
    prisma.progress.upsert({
      where: { userId_wordItemId: { userId, wordItemId } },
      create: { userId, wordItemId, state: after as any, masteredAt: nowMastered ? new Date() : null },
      update: {
        state: after as any,
        // Mastery is live: gained on first mastering, lost again below the
        // threshold — the level reflects what the user currently knows.
        ...(firstTimeMastered ? { masteredAt: new Date() } : {}),
        ...(lostMastery ? { masteredAt: null } : {}),
      },
    }),
    prisma.user.update({ where: { id: userId }, data: { xp: { increment: xpGain } } }),
  ]);
  const versionMap = await activeVersionMap(prisma, userId);
  const freshUser = await prisma.user.findUnique({ where: { id: userId }, select: { xp: true } });
  const xp = freshUser?.xp ?? 0;
  const versionIds = Array.from(new Set(Array.from(versionMap.values()).map((entry) => entry.versionId)));
  const [summary, account] = await Promise.all([
    listId ? listSummary(prisma, userId, listId, versionMap, xp) : librarySummary(prisma, userId, versionIds, xp),
    accountSummary(prisma, userId, versionMap, xp),
  ]);
  return c.json({ state: after, xpGain, firstTimeMastered, summary: { ...summary, account } });
});

export default app;