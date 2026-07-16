export interface LevelSummary {
  level: number;
  masteredWords: number;
  encounteredWords: number;
  totalWords: number;
  masteryPercent: number;
  xp: number;
  nextLevelAt: number | null;
}

export const EMPTY_SUMMARY: LevelSummary = {
  level: 0,
  masteredWords: 0,
  encounteredWords: 0,
  totalWords: 0,
  masteryPercent: 0,
  xp: 0,
  nextLevelAt: null,
};
