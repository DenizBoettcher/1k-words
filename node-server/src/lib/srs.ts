/**
 * Spaced-repetition / reinforcement core time-aware edition.
 *
 * Every (user, wordItem) pair carries a small progress record; each review
 * mutates it. Key design decisions:
 *
 * - History entries carry TIMESTAMPS and the study MODE ('f'lip / 'w'rite),
 *   not just booleans. Stability is measured in *distinct success days* and
 *   the *time span* they cover: ten correct answers on one day count as a
 *   single day (barely stable), while "correct today + correct two months
 *   ago" yields a long interval exactly the reinforcement the user asked
 *   for.
 * - A lapse (wrong answer) clears the current success streak and makes the
 *   word due immediately, but lifetime counters stay for mastery/statistics.
 * - Mastery remains interval-based (>= 21 days), which now inherits the
 *   time-span logic automatically.
 */

export type StudyMode = 'f' | 'w'; // flip card / write

export interface ReviewEntry {
  /** Epoch millis of the review. */
  t: number;
  /** Was the answer correct? */
  ok: boolean;
  /** Mode: 'f' flashcard flip, 'w' written answer. */
  m: StudyMode;
}

export interface ReviewState {
  /** Distinct day-numbers (floor(t/DAY)) with a correct answer since the last lapse. */
  streakDays: number[];
  /** SM-2 ease factor. Starts at 2.5, floored at 1.3. */
  ease: number;
  /** Current inter-review interval in days. */
  intervalDays: number;
  /** Epoch millis when this item next becomes due. */
  dueAt: number;
  /** Total times the item lapsed (was known, then failed). */
  lapses: number;
  /** Total reviews ever. */
  reviews: number;
  /** Total correct answers ever. */
  correct: number;
  /** Total flashcard (flip) reviews ever gates the write mode. */
  flips: number;
  /** Total written reviews ever. */
  writes: number;
  /** Last few results with timestamps, newest last. */
  recent: ReviewEntry[];
}

export const DEFAULT_EASE = 2.5;
const MIN_EASE = 1.3;
const RECENT_WINDOW = 20;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_INTERVAL_DAYS = 180;
const MASTERY_INTERVAL_DAYS = 21;

/** A word an uploader just added has no history yet. */
export function initialState(now: number = Date.now()): ReviewState {
  return {
    streakDays: [],
    ease: DEFAULT_EASE,
    intervalDays: 0,
    dueAt: now, // due immediately
    lapses: 0,
    reviews: 0,
    correct: 0,
    flips: 0,
    writes: 0,
    recent: [],
  };
}

/**
 * Upgrade any stored state (including the legacy shape with `repetitions` and
 * `recent: boolean[]`) to the current shape. Legacy booleans are treated as
 * happening on one single day they only gain time-value going forward.
 */
export function normalizeState(raw: any, now: number = Date.now()): ReviewState {
  if (!raw || typeof raw !== 'object') return initialState(now);

  const state: ReviewState = {
    streakDays: Array.isArray(raw.streakDays) ? raw.streakDays.slice(-64) : [],
    ease: typeof raw.ease === 'number' ? raw.ease : DEFAULT_EASE,
    intervalDays: typeof raw.intervalDays === 'number' ? raw.intervalDays : 0,
    dueAt: typeof raw.dueAt === 'number' ? raw.dueAt : now,
    lapses: typeof raw.lapses === 'number' ? raw.lapses : 0,
    reviews: typeof raw.reviews === 'number' ? raw.reviews : 0,
    correct: typeof raw.correct === 'number' ? raw.correct : 0,
    flips: typeof raw.flips === 'number' ? raw.flips : 0,
    writes: typeof raw.writes === 'number' ? raw.writes : 0,
    recent: [],
  };

  if (Array.isArray(raw.recent)) {
    if (raw.recent.length > 0 && typeof raw.recent[0] === 'boolean') {
      // Legacy boolean history: collapse onto "one day in the past".
      const legacyDay = now - DAY_MS;
      state.recent = (raw.recent as boolean[]).map((ok) => ({ t: legacyDay, ok, m: 'f' as StudyMode }));
      if (state.flips === 0) state.flips = state.recent.length; // old reviews were flashcard-era
      if (state.streakDays.length === 0 && typeof raw.repetitions === 'number' && raw.repetitions > 0) {
        state.streakDays = [Math.floor(legacyDay / DAY_MS)];
      }
    } else {
      state.recent = (raw.recent as ReviewEntry[])
        .filter((e) => e && typeof e.t === 'number' && typeof e.ok === 'boolean')
        .slice(-RECENT_WINDOW);
    }
  }
  return state;
}

/**
 * Apply one review outcome and return the next state.
 *
 * Interval model: n = distinct success DAYS since the last lapse.
 *   n=1 → 1 day, n=2 → 3 days, n>=3 → 3 * ease^(n-2), capped.
 * Span bonus: the interval is at least half the span the streak covers, so
 * "correct today + correct two months ago" schedules ~a month out even though
 * n is only 2 long-range recall is worth more than same-day drilling.
 */
export function review(
  previous: ReviewState,
  wasCorrect: boolean,
  mode: StudyMode = 'f',
  now: number = Date.now(),
): ReviewState {
  const state = normalizeState(previous, now);
  const next: ReviewState = { ...state, streakDays: [...state.streakDays], recent: [...state.recent] };

  next.reviews += 1;
  if (mode === 'w') next.writes += 1;
  else next.flips += 1;
  next.recent.push({ t: now, ok: wasCorrect, m: mode });
  next.recent = next.recent.slice(-RECENT_WINDOW);

  if (!wasCorrect) {
    // Lapse: streak is gone, word is hot again. Lifetime stats remain.
    next.lapses += 1;
    next.streakDays = [];
    next.intervalDays = 0;
    next.dueAt = now;
    next.ease = Math.max(MIN_EASE, next.ease - 0.2);
    return next;
  }

  next.correct += 1;
  next.ease = Math.max(MIN_EASE, Math.min(3.0, next.ease + 0.05));

  const dayNumber = Math.floor(now / DAY_MS);
  if (!next.streakDays.includes(dayNumber)) {
    next.streakDays.push(dayNumber);
    next.streakDays.sort((a, b) => a - b);
    next.streakDays = next.streakDays.slice(-64);
  }

  const successDayCount = next.streakDays.length;
  const spanDays = successDayCount > 1
    ? next.streakDays[next.streakDays.length - 1] - next.streakDays[0]
    : 0;

  let intervalDays: number;
  if (successDayCount <= 1) intervalDays = 1;
  else if (successDayCount === 2) intervalDays = 3;
  else intervalDays = Math.round(3 * Math.pow(next.ease, successDayCount - 2));

  // Long-range recall beats same-day drilling.
  intervalDays = Math.max(intervalDays, Math.round(spanDays * 0.5));
  intervalDays = Math.min(intervalDays, MAX_INTERVAL_DAYS);

  next.intervalDays = intervalDays;
  next.dueAt = now + intervalDays * DAY_MS;
  return next;
}

/** Recent accuracy in [0,1]; unseen words count as 0. */
export function recentAccuracy(state: ReviewState): number {
  if (state.recent.length === 0) return 0;
  const hits = state.recent.filter((e) => e.ok).length;
  return hits / state.recent.length;
}

/**
 * Mastery score in [0,1]: 70% interval maturity (time-aware by construction),
 * 30% recent accuracy. Mastered at >= 0.8, i.e. roughly a 21-day interval
 * with a clean recent record.
 */
export function masteryScore(state: ReviewState): number {
  const intervalScore = Math.min(1, state.intervalDays / MASTERY_INTERVAL_DAYS);
  return intervalScore * 0.7 + recentAccuracy(state) * 0.3;
}

export function isMastered(state: ReviewState): boolean {
  return masteryScore(state) >= 0.8;
}

/**
 * Weight for picking the next card INSIDE a session. Due/overdue words
 * dominate; a recent miss multiplies; brand-new words get a moderate base so
 * they neither flood the session nor vanish.
 */
export function selectionWeight(state: ReviewState, now: number = Date.now()): number {
  if (state.reviews === 0) return 2; // new: moderate quota already capped at selection time

  const overdueDays = Math.max(0, (now - state.dueAt) / DAY_MS);
  let weight = 1 + overdueDays * 3;

  const lastEntry = state.recent[state.recent.length - 1];
  if (lastEntry && !lastEntry.ok) weight *= 5; // the old "wrong → 5x more often" rule

  const wrongRecently = state.recent.slice(-5).filter((e) => !e.ok).length;
  weight += wrongRecently * 2;

  return weight;
}
