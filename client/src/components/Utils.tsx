import { WordEntry } from "../data/WordEntry";

export function getWordById(words: WordEntry[], id: string): WordEntry | undefined {
  return words.find(w => w.id === id);
}

export function updateArrayInMemory(
  words: WordEntry[],
  id: string,
  changes: Partial<Omit<WordEntry, "id">>
): WordEntry[] {
  return words.map(word =>
    word.id === id ? { ...word, ...changes } : word
  );
}

export function getRandomRange<T>(array: T[]): T[] {
  const count = 15;
  if (array.length <= count) {
    return [...array]; // Return full array if not enough elements
  }

  // Shuffle a copy of the array using Fisher-Yates
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  // Return the first 30 elements
  return shuffled.slice(0, count);
}

export const getRandomIndex = (randomWords: WordEntry[], currentIndex: number): number => {
  // Calculate average counter
  const avgCounter = randomWords.reduce((sum, word) => sum + word.history.counter, 0) / randomWords.length;

  // Build list of eligible candidates (not currentIndex and under or equal to average)
  let candidates = randomWords
    .map((word, index) => ({ word, index }))
    .filter(entry => entry.index !== currentIndex && entry.word.history.counter <= avgCounter);

  // If none found, fallback to all except currentIndex
  if (candidates.length === 0) {
    candidates = randomWords
      .map((word, index) => ({ word, index }))
      .filter(entry => entry.index !== currentIndex);
  }

  // Randomly pick one
  const randomEntry = candidates[Math.floor(Math.random() * candidates.length)];
  if (currentIndex === randomEntry.index) {
    return getRandomIndex(randomWords, currentIndex)
  }
  return randomEntry.index;
};

export function getWeightedRandomIndex(
  words: WordEntry[]
): number {
  const pool = words.filter(w => w.history.counter > 1);
  if (pool.length === 0) 
    return -1;   // nothing to pick

  // 2) build a weight for every word
  const weights = pool.map(w => {
    const learn = w.history.learn;
    if (learn.length <= 3)
      return 25; // brand-new, max priority
    
    const latestAttemps = learn.slice(-5);
    const falses = latestAttemps.filter(x => x === false).length;
    const trues  = latestAttemps.length - falses;
    return falses * 5 + trues * 1;              // false is 5× more “desirable”
  });

  // 3) weighted random selection
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) {
      // translate back to the original words array’s index
      return words.indexOf(pool[i]);
    }
  }
  return -1; // fallback (shouldn’t happen)
}