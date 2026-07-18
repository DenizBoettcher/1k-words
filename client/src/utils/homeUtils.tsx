import { WordEntry } from '../data/WordEntry';

/** Pick a different index than the current one, biased toward less-seen words. */
export const getRandomIndex = (words: WordEntry[], currentIndex: number): number => {
  if (words.length <= 1) return 0;
  const avg = words.reduce((s, w) => s + w.history.counter, 0) / words.length;

  let candidates = words
    .map((word, index) => ({ word, index }))
    .filter((e) => e.index !== currentIndex && e.word.history.counter <= avg);

  if (candidates.length === 0) {
    candidates = words
      .map((word, index) => ({ word, index }))
      .filter((e) => e.index !== currentIndex);
  }
  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  return pick.index;
};

/** Weight recently-missed words higher (mirrors the server-side scheduler).
 *  Never returns `excludeIndex`, so the same card can't repeat back-to-back. */
export function getWeightedRandomIndex(
  words: WordEntry[],
  excludeIndex = -1,
  allowedIndices?: number[],
): number {
  if (words.length === 0) return -1;
  const allowed = allowedIndices ? new Set(allowedIndices) : null;
  if (allowed && allowed.size === 0) return -1;
  if (words.length === 1) return 0;

  const weights = words.map((w, i) => {
    if (allowed && !allowed.has(i)) return 0; // outside the eligible pool
    if (i === excludeIndex && (!allowed || allowed.size > 1)) return 0; // no immediate repeats
    const learn = w.history.learn ?? [];
    if (learn.length === 0) return 4; // unseen → high priority
    const recent = learn.slice(-5);
    const misses = recent.filter((x) => x === false).length;
    const hits = recent.length - misses;
    return misses * 5 + hits * 1;
  });

  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) {
    if (allowed) return allowedIndices![0];
    return excludeIndex === 0 && words.length > 1 ? 1 : 0;
  }
  let r = Math.random() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return 0;
}
