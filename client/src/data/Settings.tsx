export interface Settings {
  sourceLangId: number;
  targetLangId: number;
  darkMode: boolean;
  wordsPerSession: number;
}

export const DEFAULT_SETTINGS: Settings = {
  sourceLangId: 1,
  targetLangId: 2,
  darkMode: false,
  wordsPerSession: 15,
} as const;