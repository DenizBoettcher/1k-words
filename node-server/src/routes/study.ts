import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { authenticateJWT, asyncHandler } from '../middleware/auth';
import { initialState, normalizeState, review, isMastered, type ReviewState } from '../lib/srs';
import { summarize, XP_REWARDS, computeXpGain, levelFromXp } from '../lib/leveling';
import { versionPairs, latestVersion } from '../lib/versioning';
import type { RequestWithUser } from '../types';

const router = Router();
router.use(authenticateJWT);

const uid = (req: any) => (req as RequestWithUser).user.id;

function stateFrom(row: { state: unknown } | null | undefined): ReviewState {
  if (!row) return initialState();
  return normalizeState(row.state);
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
 * versionItems.some) instead of `wordItemId: { in: [...] }` D1 caps bound
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

/**
 * Mastered/encountered counts of one version, without giant IN lists.
 * SEQUENTIAL on purpose: the Prisma D1 adapter can hang on concurrent
 * queries (Promise.all) D1 has a single connection anyway, so running
 * queries one after another costs nothing and never deadlocks.
 */
async function versionProgressCounts(userId: number, versionId: number): Promise<[number, number]> {
  const mastered = await prisma.progress.count({
    where: {
      userId,
      masteredAt: { not: null },
      wordItem: { versionItems: { some: { versionId } } },
    },
  });
  const encountered = await prisma.progress.count({
    where: {
      userId,
      wordItem: { versionItems: { some: { versionId } } },
    },
  });
  return [mastered, encountered];
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
  const titles = await prisma.wordList.findMany({
    where: { id: { in: Array.from(versionMap.keys()) } },
    select: { id: true, title: true, sourceLang: true, targetLang: true },
  });
  const titleById = new Map<number, { id: number; title: string; sourceLang: string; targetLang: string }>(
    titles.map((t) => [t.id, t]),
  );
  let accountLevel = 0;
  const perList: any[] = [];
  for (const [listId] of versionMap) {
    const summary = await listSummary(userId, listId, versionMap, xp);
    accountLevel += summary.level;
    const meta = titleById.get(listId);
    perList.push({
      listId,
      title: meta?.title ?? '?',
      sourceLang: meta?.sourceLang ?? '',
      targetLang: meta?.targetLang ?? '',
      level: summary.level,
      masteredWords: summary.masteredWords,
      encounteredWords: summary.encounteredWords,
      totalWords: summary.totalWords,
      masteryPercent: summary.masteryPercent,
    });
  }
  return { level: levelFromXp(xp).level, masterySum: accountLevel, lists: versionMap.size, xp, perList };
}

async function librarySummary(userId: number, versionIds: number[], xp: number) {
  // Distinct words across all active versions (one query; result-set size is
  // fine only bound parameters are limited).
  const vItems = versionIds.length
    ? await prisma.versionItem.findMany({ where: { versionId: { in: versionIds } }, select: { wordItemId: true } })
    : [];
  const totalWords = new Set(vItems.map((v) => v.wordItemId)).size;

  let mastered = 0;
  let encountered = 0;
  if (versionIds.length) {
    mastered = await prisma.progress.count({
      where: {
        userId,
        masteredAt: { not: null },
        wordItem: { versionItems: { some: { versionId: { in: versionIds } } } },
      },
    });
    encountered = await prisma.progress.count({
      where: {
        userId,
        wordItem: { versionItems: { some: { versionId: { in: versionIds } } } },
      },
    });
  }
  return summarize(mastered, encountered, totalWords, xp);
}

/* GET /api/study/summary */
router.get('/summary', asyncHandler(async (req, res) => {
  const userId = uid(req);
  const versionMap = await activeVersionMap(userId);
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { xp: true } });
  const xp = user?.xp ?? 0;
  const versionIds = Array.from(new Set(Array.from(versionMap.values()).map((entry) => entry.versionId)));
  const library = await librarySummary(userId, versionIds, xp);
  const account = await accountSummary(userId, versionMap, xp);
  res.json({ ...library, account });
}));

/* GET /api/study/activity per-day review counts (last ~180 days) */
router.get('/activity', asyncHandler(async (req, res) => {
  const rows = await prisma.reviewLog.findMany({
    where: { userId: uid(req) }, orderBy: { day: 'desc' }, take: 180,
  });
  res.json({ days: rows.map((r) => ({ day: r.day, count: r.count })) });
}));

/* GET /api/study/:listId/grammar cloze exercises + learned-status of refs */
router.get('/:listId/grammar', asyncHandler(async (req, res) => {
  const userId = uid(req);
  const listId = Number(req.params.listId);
  const versionId = await activeVersionId(userId, listId);
  if (!versionId) { res.status(403).json({ message: 'You are not studying this list' }); return; }

  const grammarRows = await prisma.grammarItem.findMany({
    where: { listId }, orderBy: { position: 'asc' },
  });
  const referencedIds = Array.from(new Set(grammarRows.flatMap((g) => {
    try { return JSON.parse(g.wordItemIds) as number[]; } catch { return []; }
  })));

  // Referenced words + whether the user has met them (flash-card flips > 0).
  const wordRows = referencedIds.length
    ? await prisma.wordItem.findMany({
        where: { id: { in: referencedIds.slice(0, 90) } },
        select: { id: true, source: true, target: true },
      })
    : [];
  const progressRows = referencedIds.length
    ? await prisma.progress.findMany({
        where: { userId, wordItemId: { in: referencedIds.slice(0, 90) } },
        select: { wordItemId: true, state: true },
      })
    : [];
  const learned = new Set(
    progressRows.filter((row) => stateFrom(row).flips > 0).map((row) => row.wordItemId),
  );

  res.json({
    exercises: grammarRows.map((g) => {
      let ids: number[] = [];
      try { ids = JSON.parse(g.wordItemIds); } catch { /* ignore */ }
      return { id: g.id, text: g.text, answers: g.answers, wordItemIds: ids };
    }),
    words: wordRows.map((w) => ({
      id: w.id, source: w.source, target: w.target, learned: learned.has(w.id),
    })),
  });
}));

/**
 * GET /api/study/:listId?date=YYYY-MM-DD the DAILY SESSION.
 *
 * The first call of a (local) day draws the day's word set and STORES it;
 * every further call navigation, reload, another device returns the exact
 * same words. Composition: half the slots go to words that need work (overdue
 * first, then shaky streaks), half to brand-new words; whichever pool runs
 * dry donates its slots to the other. Each word carries a `reason`
 * (due/review/new) so the UI can show WHY it was picked.
 */
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

  const rawDate = String(req.query.date ?? '');
  const sessionDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDate)
    ? rawDate
    : new Date().toISOString().slice(0, 10);

  let sessionEntries: { i: number; r: string }[] | null = null;
  const existingSession = await prisma.dailySession.findUnique({
    where: { userId_listId_sessionDate: { userId, listId, sessionDate } },
  });
  if (existingSession) {
    try { sessionEntries = JSON.parse(existingSession.wordItemIds); } catch { sessionEntries = null; }
  }

  const pairs = await versionPairs(prisma, versionId);
  const pairById = new Map(pairs.map((p) => [p.id, p]));
  const progressRows = await prisma.progress.findMany({
    where: { userId, wordItem: { versionItems: { some: { versionId } } } },
    select: { wordItemId: true, state: true },
  });
  const stateById = new Map(progressRows.map((p) => [p.wordItemId, p.state]));
  const now = Date.now();
  const endOfDay = now + 24 * 60 * 60 * 1000;

  if (!sessionEntries) {
    const settings = await prisma.userSettings.findUnique({ where: { userId } });
    const batchSize = settings?.wordsPerSession ?? 15;

    const due: { id: number; overdue: number }[] = [];
    const shaky: { id: number; dueAt: number }[] = [];
    const fresh: number[] = [];
    for (const p of pairs) {
      const raw = stateById.get(p.id);
      if (!raw) { fresh.push(p.id); continue; }
      const state = stateFrom({ state: raw });
      if (state.reviews === 0) { fresh.push(p.id); continue; }
      if (state.dueAt <= endOfDay) due.push({ id: p.id, overdue: now - state.dueAt });
      else if (state.streakDays.length < 3) shaky.push({ id: p.id, dueAt: state.dueAt });
    }
    due.sort((a, b) => b.overdue - a.overdue);      // most overdue first
    shaky.sort((a, b) => a.dueAt - b.dueAt);        // weakest/soonest first
    for (let i = fresh.length - 1; i > 0; i--) {    // shuffle the new pool
      const j = Math.floor(Math.random() * (i + 1));
      [fresh[i], fresh[j]] = [fresh[j], fresh[i]];
    }

    const oldTarget = Math.ceil(batchSize / 2);
    const newTarget = batchSize - oldTarget;
    const picked: { i: number; r: string }[] = [];
    for (const d of due) { if (picked.length >= oldTarget) break; picked.push({ i: d.id, r: 'due' }); }
    for (const s of shaky) { if (picked.length >= oldTarget) break; picked.push({ i: s.id, r: 'review' }); }
    let newTaken = 0;
    for (const id of fresh) { if (newTaken >= newTarget) break; picked.push({ i: id, r: 'new' }); newTaken += 1; }
    // Donate unused slots to the other pool.
    if (picked.length < batchSize) {
      for (const d of due) {
        if (picked.length >= batchSize) break;
        if (!picked.some((e) => e.i === d.id)) picked.push({ i: d.id, r: 'due' });
      }
      for (const s of shaky) {
        if (picked.length >= batchSize) break;
        if (!picked.some((e) => e.i === s.id)) picked.push({ i: s.id, r: 'review' });
      }
      for (const id of fresh) {
        if (picked.length >= batchSize) break;
        if (!picked.some((e) => e.i === id)) picked.push({ i: id, r: 'new' });
      }
    }

    sessionEntries = picked;
    await prisma.dailySession.create({
      data: { userId, listId, sessionDate, wordItemIds: JSON.stringify(picked) },
    });
  }

  const words = sessionEntries
    .filter((entry) => pairById.has(entry.i))
    .map((entry) => {
      const pair = pairById.get(entry.i)!;
      const state = stateFrom(stateById.has(entry.i) ? { state: stateById.get(entry.i) } : null);
      return {
        id: pair.id,
        sourceLang: pair.source,
        targetLang: pair.target,
        reason: entry.r,
        history: {
          counter: state.reviews,
          flips: state.flips,
          writes: state.writes,
          learn: state.recent.map((e) => e.ok),
        },
      };
    });

  const versionMap = await activeVersionMap(userId);
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { xp: true } });
  const xp = user?.xp ?? 0;
  const summary = await listSummary(userId, listId, versionMap, xp);
  const account = await accountSummary(userId, versionMap, xp);
  res.json({ list, sessionDate, words, summary: { ...summary, account } });
}));

/* POST /api/study/review */
const ReviewBody = z.object({
  wordItemId: z.number().int().positive(),
  correct: z.boolean(),
  mode: z.enum(['flip', 'write', 'speak']).optional(), // flashcard / written / spoken
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), // client-local date for activity stats
  listId: z.number().int().positive().optional(), // list being studied, for a list-scoped summary
});
router.post('/review', asyncHandler(async (req, res) => {
  const userId = uid(req);
  const parsed = ReviewBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: 'wordItemId + correct required' }); return; }
  const { wordItemId, correct, mode, listId, day } = parsed.data;

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
  const after = review(stateFrom(existing), correct, mode === 'write' ? 'w' : 'f'); // speak counts as 'f' (seen)
  const nowMastered = isMastered(after);
  const firstTimeMastered = nowMastered && existing?.masteredAt == null;
  const lostMastery = !nowMastered && existing?.masteredAt != null;

  const before = stateFrom(existing);
  let xpGain = computeXpGain(before, correct, existing?.masteredAt != null);
  if (firstTimeMastered) xpGain += XP_REWARDS.firstTimeMastered;

  await prisma.$transaction([
    prisma.progress.upsert({
      where: { userId_wordItemId: { userId, wordItemId } },
      create: { userId, wordItemId, state: after as any, masteredAt: nowMastered ? new Date() : null },
      update: {
        state: after as any,
        // Mastery is a live measure: gained on first mastering, LOST again when
        // the word drops below the threshold the level reflects what the
        // user currently knows, so it can go down.
        ...(firstTimeMastered ? { masteredAt: new Date() } : {}),
        ...(lostMastery ? { masteredAt: null } : {}),
      },
    }),
    prisma.user.update({ where: { id: userId }, data: { xp: { increment: xpGain } } }),
  ]);
  await prisma.user.updateMany({ where: { id: userId, xp: { lt: 0 } }, data: { xp: 0 } }); // floor at 0
  const activityDay = day ?? new Date().toISOString().slice(0, 10);
  await prisma.reviewLog.upsert({
    where: { userId_day: { userId, day: activityDay } },
    create: { userId, day: activityDay, count: 1 },
    update: { count: { increment: 1 } },
  });

  const versionMap = await activeVersionMap(userId);
  const freshUser = await prisma.user.findUnique({ where: { id: userId }, select: { xp: true } });
  const xp = freshUser?.xp ?? 0;
  const versionIds = Array.from(new Set(Array.from(versionMap.values()).map((entry) => entry.versionId)));
  const summary = listId
    ? await listSummary(userId, listId, versionMap, xp)
    : await librarySummary(userId, versionIds, xp);
  const account = await accountSummary(userId, versionMap, xp);
  res.json({ state: after, xpGain, firstTimeMastered, summary: { ...summary, account } });
}));

export default router;
