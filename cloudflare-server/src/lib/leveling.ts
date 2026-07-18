/**
 * Leveling & XP.
 *
 * Two distinct numbers on purpose:
 *
 *  - LEVEL is mastery-based and capped at 100. It answers "how much of my
 *    vocabulary do I actually know?". By definition level 100 means every
 *    word in the user's library is mastered and level 50 means roughly half
 *    are. This is what the product spec asks for.
 *
 *  - XP is a lifetime gamification score. It only ever goes up and rewards
 *    activity (correct answers, first-time mastering a word). It is shown
 *    next to the level as flavour but does not drive the level.
 */

export interface LevelSummary {
  level: number; // 0..100, mastery-based
  xpLevel: number; // XP-based level for the progress bar
  xpIntoLevel: number; // XP gathered inside the current level
  xpForNext: number; // XP needed to finish the current level
  masteredWords: number;
  encounteredWords: number; // words reviewed at least once
  totalWords: number;
  masteryPercent: number; // 0..100, one decimal
  xp: number; // lifetime points
  nextLevelAt: number | null; // mastered-word count needed for next level, null at 100
}

/** XP awarded per event. Kept in one place so it is easy to retune. */
export const XP_REWARDS = {
  correctAnswer: 10,
  wrongAnswer: 2, // trying still counts a little
  firstTimeMastered: 100,
};

/**
 * Map mastered fraction -> level. Deliberately linear so the spec holds
 * exactly: mastered = total -> 100, mastered = total/2 -> ~50.
 */
export function levelFromMastery(masteredWords: number, totalWords: number): number {
  if (totalWords <= 0) return 0;
  return Math.min(100, Math.floor((masteredWords / totalWords) * 100));
}

export function summarize(
  masteredWords: number,
  encounteredWords: number,
  totalWords: number,
  xp: number,
): LevelSummary {
  const level = levelFromMastery(masteredWords, totalWords);
  const masteryPercent =
    totalWords <= 0 ? 0 : Math.round((masteredWords / totalWords) * 1000) / 10;

  let nextLevelAt: number | null = null;
  if (level < 100 && totalWords > 0) {
    // How many mastered words are needed to reach the next whole level.
    nextLevelAt = Math.ceil(((level + 1) / 100) * totalWords);
  }

  const xpInfo = levelFromXp(xp);
  return {
    level,
    xpLevel: xpInfo.level,
    xpIntoLevel: xpInfo.intoLevel,
    xpForNext: xpInfo.forNext,
    masteredWords,
    encounteredWords,
    totalWords,
    masteryPercent,
    xp,
    nextLevelAt,
  };
}

/* ---------------- XP levels (progress bar) ----------------
 * The bar levels on XP, not mastery. Rising cost per level:
 * total XP needed for level L = 100 * L^1.6  → L1=100, L5≈1320,
 * L10≈4000, L25≈17k, L50≈52k, L100≈250k. Mastery stays a separate %.
 */
export function totalXpForLevel(level: number): number {
  return Math.round(100 * Math.pow(level, 1.6));
}

export function levelFromXp(xp: number): { level: number; intoLevel: number; forNext: number } {
  let level = 0;
  while (totalXpForLevel(level + 1) <= xp) level += 1;
  const floor = totalXpForLevel(level);
  const ceil = totalXpForLevel(level + 1);
  return { level, intoLevel: xp - floor, forNext: ceil - floor };
}

/* ---------------- proportional XP per review ----------------
 * - First-ever encounter of a word pays the most base XP.
 * - A comeback (correct after recent misses) pays a bonus that grows with
 *   how many misses it overcame fixing a hard word beats grinding an easy
 *   one.
 * - Repeated correct answers pay less and less (diminishing streak).
 * - Getting a well-known/mastered word WRONG costs XP.
 */
export function computeXpGain(
  previous: { reviews: number; recent: { ok: boolean }[]; intervalDays: number },
  correct: boolean,
  wasMastered: boolean,
): number {
  const recent = previous.recent ?? [];
  let trailing = 0; // how many same-outcome answers directly before this one
  for (let i = recent.length - 1; i >= 0; i--) {
    if (recent[i].ok === !correct) trailing += 1;
    else break;
  }

  if (correct) {
    if (previous.reviews === 0) return 25;             // first time ever seeing it
    if (trailing > 0) return 12 + Math.min(trailing * 8, 40); // comeback: more misses fixed = more XP
    let okStreak = 0;
    for (let i = recent.length - 1; i >= 0; i--) { if (recent[i].ok) okStreak += 1; else break; }
    return Math.max(3, Math.round(10 / (1 + okStreak * 0.35))); // 10, 7, 6, 5, 4, 3…
  }

  // Wrong: small consolation, but forgetting known words costs.
  if (wasMastered) return -50;
  let okStreak = 0;
  for (let i = recent.length - 1; i >= 0; i--) { if (recent[i].ok) okStreak += 1; else break; }
  if (okStreak >= 3 || previous.intervalDays >= 3) return -Math.min(25, 5 + okStreak * 4);
  return 2;
}
