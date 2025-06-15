export type WordEntry = {
  id: string;
  tr: string;
  de: string;
  history: {
    counter: number;
    learn: boolean[];
  };
};

export const EMPTY_WORD: WordEntry = {
  id: "",
  tr: "",
  de: "",
  history: { counter: 0, learn: [] },
};