import { Hono } from 'hono';
import { z } from 'zod';
import { getPrisma } from '../prisma/prismaHelper';
import { authenticateJWT } from '../middleware/authenticateJWT';
import type { AppEnv } from '../types/AppContext';
import { initialState, normalizeState, review, isMastered, type ReviewState } from '../lib/srs';
import { summarize, XP_REWARDS, computeXpGain, levelFromXp } from '../lib/leveling';
import { versionPairs, latestVersion } from '../lib/versioning';

const app = new Hono<AppEnv>();
app.use('*', authenticateJWT);

/** Parse a stored Progress.state via normalizeState — the ONE upgrade path for
 *  every stored shape, incl. legacy states (which e.g. lack `streakDays`;
 *  hand-rolling the mapping here once caused a 500 on exactly those rows). */
function stateFrom(row: { state: unknown } | null | undefined): ReviewState {
  return normalizeState(row?.state ?? null);
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

/**
 * Mastered/encountered counts of one version, without giant IN lists.
 * SEQUENTIAL on purpose: the Prisma D1 adapter can hang on concurrent
 * queries (Promise.all) — D1 has a single connection anyway, so running
 * queries one after another costs nothing and never deadlocks.
 */
async function versionProgressCounts(prisma: any, userId: number, versionId: number): Promise<[number, number]> {
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
async function listSummary(prisma: any, userId: number, listId: number, versionMap: Map<number, { versionId: number; itemCount: number }>, xp: number) {
  const active = versionMap.get(listId);
  if (!active) return summarize(0, 0, 0, xp);
  const [mastered, encountered] = await versionProgressCounts(prisma, userId, active.versionId);
  return summarize(mastered, encountered, active.itemCount, xp);
}

/** Account level = SUM of the levels of every actively studied list. */
async function accountSummary(prisma: any, userId: number, versionMap: Map<number, { versionId: number; itemCount: number }>, xp: number) {
  const titles = await prisma.wordList.findMany({
    where: { id: { in: Array.from(versionMap.keys()) } },
    select: { id: true, title: true, sourceLang: true, targetLang: true },
  });
  const titleById = new Map(titles.map((t: any) => [t.id, t]));
  let accountLevel = 0;
  const perList: any[] = [];
  for (const [listId] of versionMap) {
    const summary = await listSummary(prisma, userId, listId, versionMap, xp);
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

async function librarySummary(prisma: any, userId: number, versionIds: number[], xp: number) {
  const vItems = versionIds.length
    ? await prisma.versionItem.findMany({ where: { versionId: { in: versionIds } }, select: { wordItemId: true } })
    : [];
  const totalWords = new Set(vItems.map((v: any) => v.wordItemId)).size;

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

app.get('/summary', async (c) => {
  const prisma = getPrisma(c.env);
  const userId = c.get('user').id;
  const versionMap = await activeVersionMap(prisma, userId);
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { xp: true } });
  const xp = user?.xp ?? 0;
  const versionIds = Array.from(new Set(Array.from(versionMap.values()).map((entry) => entry.versionId)));
  const library = await librarySummary(prisma, userId, versionIds, xp);
  const account = await accountSummary(prisma, userId, versionMap, xp);
  return c.json({ ...library, account });
});

/* GET /api/study/activity — per-day review counts (last ~180 days) */
app.get('/activity', async (c) => {
  const prisma = getPrisma(c.env);
  const rows = await prisma.reviewLog.findMany({
    where: { userId: c.get('user').id }, orderBy: { day: 'desc' }, take: 180,
  });
  return c.json({ days: rows.map((r: any) => ({ day: r.day, count: r.count })) });
});

/* GET /api/study/:listId/grammar — cloze exercises + learned-status of refs */
app.get('/:listId/grammar', async (c) => {
  const prisma = getPrisma(c.env);
  const userId = c.get('user').id;
  const listId = Number(c.req.param('listId'));
  const versionId = await activeVersionId(prisma, userId, listId);
  if (!versionId) return c.json({ message: 'You are not studying this list' }, 403);

  const grammarRows = await prisma.grammarItem.findMany({
    where: { listId }, orderBy: { position: 'asc' },
  });
  const referencedIds = Array.from(new Set(grammarRows.flatMap((g: any) => {
    try { return JSON.parse(g.wordItemIds) as number[]; } catch { return []; }
  }))) as number[];

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
    progressRows.filter((row: any) => stateFrom(row).flips > 0).map((row: any) => row.wordItemId),
  );

  return c.json({
    exercises: grammarRows.map((g: any) => {
      let ids: number[] = [];
      try { ids = JSON.parse(g.wordItemIds); } catch { /* ignore */ }
      return { id: g.id, text: g.text, answers: g.answers, wordItemIds: ids };
    }),
    words: wordRows.map((w: any) => ({
      id: w.id, source: w.source, target: w.target, learned: learned.has(w.id),
    })),
  });
});

/**
 * GET /api/study/:listId?date=YYYY-MM-DD — the DAILY SESSION.
 * First call of a (local) day draws and STORES the day's words; every further
 * call returns the same set. Half needs-work (overdue, then shaky), half new;
 * empty pools donate their slots. Each word carries a `reason`.
 */
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

  const rawDate = c.req.query('date') ?? '';
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
  const stateById = new Map(progressRows.map((p: any) => [p.wordItemId, p.state]));
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
    due.sort((a, b) => b.overdue - a.overdue);
    shaky.sort((a, b) => a.dueAt - b.dueAt);
    for (let i = fresh.length - 1; i > 0; i--) {
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

  const versionMap = await activeVersionMap(prisma, userId);
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { xp: true } });
  const xp = user?.xp ?? 0;
  const summary = await listSummary(prisma, userId, listId, versionMap, xp);
  const account = await accountSummary(prisma, userId, versionMap, xp);
  return c.json({ list, sessionDate, words, summary: { ...summary, account } });
});

const ReviewBody = z.object({
  wordItemId: z.number().int().positive(),
  correct: z.boolean(),
  mode: z.enum(['flip', 'write', 'speak']).optional(), // flashcard / written / spoken
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), // client-local date for activity stats
  listId: z.number().int().positive().optional(), // list being studied, for a list-scoped summary
});
app.post('/review', async (c) => {
  const prisma = getPrisma(c.env);
  const userId = c.get('user').id;
  const parsed = ReviewBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ message: 'wordItemId + correct required' }, 400);
  const { wordItemId, correct, mode, listId, day } = parsed.data;

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
        // Mastery is live: gained on first mastering, lost again below the
        // threshold — the level reflects what the user currently knows.
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
  const versionMap = await activeVersionMap(prisma, userId);
  const freshUser = await prisma.user.findUnique({ where: { id: userId }, select: { xp: true } });
  const xp = freshUser?.xp ?? 0;
  const versionIds = Array.from(new Set(Array.from(versionMap.values()).map((entry) => entry.versionId)));
  const summary = listId
    ? await listSummary(prisma, userId, listId, versionMap, xp)
    : await librarySummary(prisma, userId, versionIds, xp);
  const account = await accountSummary(prisma, userId, versionMap, xp);
  return c.json({ state: after, xpGain, firstTimeMastered, summary: { ...summary, account } });
});

export default app;