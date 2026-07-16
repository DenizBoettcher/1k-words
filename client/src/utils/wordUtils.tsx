// Answer checking for Learn mode. Behaviour is driven by two user settings:
//  - checkCapitalization (default off): when off, case is ignored.
//  - foldSpecialLetters (default off): when on, ö→o, ç→c, ø→o, ß→ss … so
//    learners without those keys can still answer (see utils/charFold.ts).
import { settings } from './settingUtils';
import { foldSpecialLetters } from './charFold';

export function normalize(str: string): string {
  let out = str.trim();
  if (!settings.checkCapitalization) out = out.toLowerCase();
  if (settings.foldSpecialLetters) out = foldSpecialLetters(out);
  return out;
}

/** Any of the "/"-separated alternatives counts as correct. */
export function isAnswerCorrect(input: string, correctRaw: string): boolean {
  const accepted = correctRaw.split('/').map((alt) => normalize(alt));
  return accepted.includes(normalize(input));
}
