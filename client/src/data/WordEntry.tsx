export type WordEntry = {
  id: number;
  targetLang: string;
  sourceLang: string;
  history: {
    counter: number;
    learn: boolean[];
  };
};

export const EMPTY_WORD: WordEntry = {
  id: 0,
  targetLang: "",
  sourceLang: "",
  history: { counter: 0, learn: [] },
};