export interface ListStat {
  listId: number; title: string; sourceLang: string; targetLang: string;
  level: number; masteredWords: number; encounteredWords: number;
  totalWords: number; masteryPercent: number;
}

export interface AccountSummary {
  level: number; // sum of all list levels
  lists: number; // how many lists are actively studied
  xp: number;
  perList?: ListStat[];
}

export interface LevelSummary {
  level: number;
  xpLevel: number;
  xpIntoLevel: number;
  xpForNext: number;
  masteredWords: number;
  encounteredWords: number;
  totalWords: number;
  masteryPercent: number;
  xp: number;
  nextLevelAt: number | null;
  account?: AccountSummary;
}

export const EMPTY_SUMMARY: LevelSummary = {
  level: 0,
  xpLevel: 0,
  xpIntoLevel: 0,
  xpForNext: 100,
  masteredWords: 0,
  encounteredWords: 0,
  totalWords: 0,
  masteryPercent: 0,
  xp: 0,
  nextLevelAt: null,
};
