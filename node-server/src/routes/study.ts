import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { authenticateJWT, asyncHandler } from '../middleware/auth';
import { initialState, review, isMastered, selectionWeight, type ReviewState } from '../lib/srs';
import { summarize, XP_REWARDS } from '../lib/leveling';
import { versionPairs, latestVersion } from '../lib/versioning';
import type { RequestWithUser } from '../types';

const router = Router();
router.use(authenticateJWT);

const uid = (req: any) => (req as RequestWithUser).user.id;

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

/** Version the user is currently on for a list: owned → latest, followed → followed. */
async function activeVersionId(userId: number, listId: number): Promise<number | null> {
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

/** All version ids the user is actively studying (owned latest + followed). */
async function activeVersionIds(userId: number): Promise<number[]> {
  const maintained = await prisma.listMaintainer.findMany({ where: { userId }, select: { listId: true } });
  const owned = await prisma.wordList.findMany({
    where: { OR: [{ ownerId: userId }, { id: { in: maintained.map((m) => m.listId) } }] },
    include: { versions: { orderBy: { version: 'desc' }, take: 1, select: { id: true } } },
  });
  const followed = await prisma.listFollow.findMany({ where: { userId }, select: { versionId: true } });
  const ids = [
    ...owned.map((l) => l.versions[0]?.id).filter((x): x is number => !!x),
    ...followed.map((f) => f.versionId),
  ];
  return Array.from(new Set(ids));
}

/**
 * All actively studied lists in ONE place (3 queries): owned + maintained use
 * their latest version, followed lists their followed version.
 * Returns listId -> { versionId, itemCount }.
 *
 * IMPORTANT: every summary below filters progress RELATIONALLY (via
 * versionItems.some) instead of `wordItemId: { in: [...] }` — D1 caps bound
 * parameters at ~100 per query, so a 3000-word list would blow up an IN list.
 */
async function activeVersionMap(userId: number): Promise<Map<number, { versionId: number; itemCount: number }>> {
  const maintained = await prisma.listMaintainer.findMany({ where: { userId }, select: { listId: true } });
  const owned = await prisma.wordList.findMany({
    where: { OR: [{ ownerId: userId }, { id: { in: maintained.map((m) => m.listId) } }] },
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
function versionProgressCounts(userId: number, versionId: number) {
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
async function listSummary(userId: number, listId: number, versionMap: Map<number, { versionId: number; itemCount: number }>, xp: number) {
  const active = versionMap.get(listId);
  if (!active) return summarize(0, 0, 0, xp);
  const [mastered, encountered] = await versionProgressCounts(userId, active.versionId);
  return summarize(mastered, encountered, active.itemCount, xp);
}

/** Account level = SUM of the levels of every actively studied list. */
async function accountSummary(userId: number, versionMap: Map<number, { versionId: number; itemCount: number }>, xp: number) {
  let accountLevel = 0;
  for (const [listId] of versionMap) {
    const summary = await listSummary(userId, listId, versionMap, xp);
    accountLevel += summary.level;
  }
  return { level: accountLevel, lists: versionMap.size, xp };
}

async function librarySummary(userId: number, versionIds: number[], xp: number) {
  // Distinct words across all active versions (one query; result-set size is
  // fine — only bound parameters are limited).
  const vItems = versionIds.length
    ? await prisma.versionItem.findMany({ where: { versionId: { in: versionIds } }, select: { wordItemId: true } })
    : [];
  const totalWords = new Set(vItems.map((v) => v.wordItemId)).size;

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

/* GET /api/study/summary */
router.get('/summary', asyncHandler(async (req, res) => {
  const userId = uid(req);
  const versionMap = await activeVersionMap(userId);
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { xp: true } });
  const xp = user?.xp ?? 0;
  const versionIds = Array.from(new Set(Array.from(versionMap.values()).map((entry) => entry.versionId)));
  const [library, account] = await Promise.all([
    librarySummary(userId, versionIds, xp),
    accountSummary(userId, versionMap, xp),
  ]);
  res.json({ ...library, account });
}));

/* GET /api/study/:listId — weighted batch from the active version */
router.get('/:listId', asyncHandler(async (req, res) => {
  const userId = uid(req);
  const listId = Number(req.params.listId);
  const list = await prisma.wordList.findUnique({
    where: { id: listId },
    select: { id: true, title: true, sourceLang: true, targetLang: true },
  });
  if (!list) { res.status(404).json({ message: 'List not found' }); return; }

  const versionId = await activeVersionId(userId, listId);
  if (!versionId) { res.status(403).json({ message: 'You are not studying this list' }); return; }

  const settings = await prisma.userSettings.findUnique({ where: { userId } });
  const batchSize = settings?.wordsPerSession ?? 15;

  const pairs = await versionPairs(prisma, versionId);
  const progressRows = await prisma.progress.findMany({
    where: { userId, wordItem: { versionItems: { some: { versionId } } } },
    select: { wordItemId: true, state: true },
  });
  const byId = new Map(progressRows.map((p) => [p.wordItemId, p.state]));

  const now = Date.now();
  const scored = pairs.map((p) => {
    const state = stateFrom(byId.has(p.id) ? { state: byId.get(p.id) } : null);
    const weight = selectionWeight(state, now);
    const sortKey = Math.pow(Math.random(), 1 / Math.max(weight, 0.0001));
    return { id: p.id, sourceLang: p.source, targetLang: p.target, history: { counter: state.reviews, learn: state.recent }, sortKey };
  });
  scored.sort((a, b) => b.sortKey - a.sortKey);
  const words = scored.slice(0, batchSize).map(({ sortKey, ...rest }) => rest);

  const versionMap = await activeVersionMap(userId);
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { xp: true } });
  const xp = user?.xp ?? 0;
  const [summary, account] = await Promise.all([
    listSummary(userId, listId, versionMap, xp),
    accountSummary(userId, versionMap, xp),
  ]);
  res.json({ list, words, summary: { ...summary, account } });
}));

/* POST /api/study/review */
const ReviewBody = z.object({
  wordItemId: z.number().int().positive(),
  correct: z.boolean(),
  quality: z.number().int().min(0).max(5).optional(),
  listId: z.number().int().positive().optional(), // list being studied, for a list-scoped summary
});
router.post('/review', asyncHandler(async (req, res) => {
  const userId = uid(req);
  const parsed = ReviewBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: 'wordItemId + correct required' }); return; }
  const { wordItemId, correct, quality, listId } = parsed.data;

  const item = await prisma.wordItem.findUnique({ where: { id: wordItemId }, select: { id: true } });
  if (!item) { res.status(404).json({ message: 'Word not found' }); return; }

  // Items can be shared across lists (forks). Allow the review when the word is
  // part of any version the user actively studies (owned, maintained, followed).
  const myVersionIds = await activeVersionIds(userId);
  const inMyLibrary = myVersionIds.length
    ? await prisma.versionItem.findFirst({
        where: { wordItemId, versionId: { in: myVersionIds } },
        select: { versionId: true },
      })
    : null;
  if (!inMyLibrary) { res.status(403).json({ message: 'Not your word' }); return; }

  const existing = await prisma.progress.findUnique({
    where: { userId_wordItemId: { userId, wordItemId } },
    select: { state: true, masteredAt: true },
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
        // Mastery is a live measure: gained on first mastering, LOST again when
        // the word drops below the threshold — the level reflects what the
        // user currently knows, so it can go down.
        ...(firstTimeMastered ? { masteredAt: new Date() } : {}),
        ...(lostMastery ? { masteredAt: null } : {}),
      },
    }),
    prisma.user.update({ where: { id: userId }, data: { xp: { increment: xpGain } } }),
  ]);

  const versionMap = await activeVersionMap(userId);
  const freshUser = await prisma.user.findUnique({ where: { id: userId }, select: { xp: true } });
  const xp = freshUser?.xp ?? 0;
  const versionIds = Array.from(new Set(Array.from(versionMap.values()).map((entry) => entry.versionId)));
  const [summary, account] = await Promise.all([
    listId ? listSummary(userId, listId, versionMap, xp) : librarySummary(userId, versionIds, xp),
    accountSummary(userId, versionMap, xp),
  ]);
  res.json({ state: after, xpGain, firstTimeMastered, summary: { ...summary, account } });
}));

export default router;