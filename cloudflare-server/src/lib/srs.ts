/**
 * Spaced-repetition / reinforcement core.
 *
 * This is an SM-2 derivative tuned for a binary "correct / wrong" flashcard
 * flow. Every (user, wordItem) pair carries a small progress record; each
 * review mutates it. The scheduler then serves the words that are due (or
 * least-known) first, which is the formalised version of the old
 * "wrong words show up 5x more often" heuristic.
 */

export interface ReviewState {
  /** Consecutive successful reviews. Reset to 0 on a lapse. */
  repetitions: number;
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
  /** Last few results, newest last. Kept short for weighting. */
  recent: boolean[];
}

export const DEFAULT_EASE = 2.5;
const MIN_EASE = 1.3;
const RECENT_WINDOW = 8;
const DAY_MS = 24 * 60 * 60 * 1000;

/** A word an uploader just added has no history yet. */
export function initialState(now: number = Date.now()): ReviewState {
  return {
    repetitions: 0,
    ease: DEFAULT_EASE,
    intervalDays: 0,
    dueAt: now, // due immediately
    lapses: 0,
    reviews: 0,
    correct: 0,
    recent: [],
  };
}

/**
 * Apply one review outcome and return the next state.
 *
 * `quality` is optional and lets the caller pass a richer signal than a plain
 * boolean (0 = blackout, 5 = perfect). A bare correct/wrong maps to 4 / 1.
 */
export function review(
  previous: ReviewState,
  wasCorrect: boolean,
  quality?: number,
  now: number = Date.now(),
): ReviewState {
  const effectiveQuality =
    typeof quality === 'number' ? clamp(quality, 0, 5) : wasCorrect ? 4 : 1;

  const recent = [...previous.recent, wasCorrect].slice(-RECENT_WINDOW);
  const reviews = previous.reviews + 1;
  const correct = previous.correct + (wasCorrect ? 1 : 0);

  if (!wasCorrect) {
    // Lapse: relearn from scratch but keep a slightly reduced ease.
    return {
      repetitions: 0,
      ease: Math.max(MIN_EASE, previous.ease - 0.2),
      intervalDays: 0,
      dueAt: now, // show again this session
      lapses: previous.lapses + 1,
      reviews,
      correct,
      recent,
    };
  }

  const repetitions = previous.repetitions + 1;

  // Standard SM-2 ease update.
  const ease = Math.max(
    MIN_EASE,
    previous.ease +
      (0.1 - (5 - effectiveQuality) * (0.08 + (5 - effectiveQuality) * 0.02)),
  );

  let intervalDays: number;
  if (repetitions === 1) intervalDays = 1;
  else if (repetitions === 2) intervalDays = 6;
  else intervalDays = Math.round(previous.intervalDays * ease);

  return {
    repetitions,
    ease,
    intervalDays,
    dueAt: now + intervalDays * DAY_MS,
    lapses: previous.lapses,
    reviews,
    correct,
    recent,
  };
}

/**
 * Mastery of a single item in [0, 1].
 *
 * Driven mainly by how long the item can survive between reviews (interval),
 * damped by recent mistakes. An item that reliably survives ~21 days counts
 * as fully mastered.
 */
export function mastery(state: ReviewState): number {
  const MASTERED_INTERVAL = 21; // days
  const intervalScore = clamp(state.intervalDays / MASTERED_INTERVAL, 0, 1);

  if (state.recent.length === 0) return 0;
  const recentAccuracy =
    state.recent.filter(Boolean).length / state.recent.length;

  // Weight interval more heavily, but a recent failure should pull it down.
  return clamp(intervalScore * 0.7 + recentAccuracy * 0.3, 0, 1);
}

/** True once an item is considered "known". */
export function isMastered(state: ReviewState): boolean {
  return mastery(state) >= 0.8;
}

/**
 * Selection weight for the study scheduler. Higher = show sooner.
 * Overdue items and repeatedly-missed items float to the top.
 */
export function selectionWeight(state: ReviewState, now: number = Date.now()): number {
  const overdueDays = Math.max(0, (now - state.dueAt) / DAY_MS);
  const lastWrong = state.recent.length > 0 && !state.recent[state.recent.length - 1];

  let weight = 1;
  weight += overdueDays * 2; // more overdue -> more likely
  weight += state.lapses * 1.5; // chronically hard words
  if (lastWrong) weight *= 5; // preserves the old "5x more often" rule
  if (state.repetitions === 0) weight += 3; // brand-new words
  return weight;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
