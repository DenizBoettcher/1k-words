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

async function librarySummary(userId: number) {
  const versionIds = await activeVersionIds(userId);
  const vItems = versionIds.length
    ? await prisma.versionItem.findMany({ where: { versionId: { in: versionIds } }, select: { wordItemId: true } })
    : [];
  const wordItemIds = Array.from(new Set(vItems.map((v) => v.wordItemId)));

  const [mastered, encountered, user] = await Promise.all([
    wordItemIds.length
      ? prisma.progress.count({ where: { userId, masteredAt: { not: null }, wordItemId: { in: wordItemIds } } })
      : Promise.resolve(0),
    wordItemIds.length
      ? prisma.progress.count({ where: { userId, wordItemId: { in: wordItemIds } } })
      : Promise.resolve(0),
    prisma.user.findUnique({ where: { id: userId }, select: { xp: true } }),
  ]);
  return summarize(mastered, encountered, wordItemIds.length, user?.xp ?? 0);
}

/* GET /api/study/summary */
router.get('/summary', asyncHandler(async (req, res) => {
  res.json(await librarySummary(uid(req)));
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
    where: { userId, wordItemId: { in: pairs.map((p) => p.id) } },
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

  res.json({ list, words, summary: await librarySummary(userId) });
}));

/* POST /api/study/review */
const ReviewBody = z.object({
  wordItemId: z.number().int().positive(),
  correct: z.boolean(),
  quality: z.number().int().min(0).max(5).optional(),
});
router.post('/review', asyncHandler(async (req, res) => {
  const userId = uid(req);
  const parsed = ReviewBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: 'wordItemId + correct required' }); return; }
  const { wordItemId, correct, quality } = parsed.data;

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

  res.json({ state: after, xpGain, firstTimeMastered, summary: await librarySummary(userId) });
}));

export default router;
