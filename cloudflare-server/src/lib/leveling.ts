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

  return {
    level,
    masteredWords,
    encounteredWords,
    totalWords,
    masteryPercent,
    xp,
    nextLevelAt,
  };
}
