export interface Settings {
  activeListId: number | null;
  darkMode: boolean;
  wordsPerSession: number;
  checkCapitalization: boolean;
  foldSpecialLetters: boolean;
  speakWords: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  activeListId: null,
  darkMode: false,
  wordsPerSession: 15,
  checkCapitalization: false,
  foldSpecialLetters: false,
  speakWords: true,
};
