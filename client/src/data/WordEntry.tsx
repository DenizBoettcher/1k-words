export type WordReason = 'due' | 'review' | 'new';

export type WordEntry = {
  id: number;
  targetLang: string;
  sourceLang: string;
  /** Why this word is in today's session (server-picked). */
  reason?: WordReason;
  history: {
    counter: number;
    flips: number;
    writes: number;
    learn: boolean[];
  };
};

export const EMPTY_WORD: WordEntry = {
  id: 0,
  targetLang: "",
  sourceLang: "",
  history: { counter: 0, flips: 0, writes: 0, learn: [] },
};
