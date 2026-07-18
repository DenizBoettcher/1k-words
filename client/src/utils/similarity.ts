/** "Sounds close enough" check for the SPEAK mode, built on the
 *  fastest-levenshtein package + our shared normalisation. */
import { distance } from 'fastest-levenshtein';
import { foldSpecialLetters } from './charFold';

function normalize(text: string): string {
  return foldSpecialLetters(text.toLowerCase().trim()).replace(/[^\p{L}\p{N} ]/gu, '');
}

/** True when the recognized speech is close enough to any accepted form. */
export function soundsLike(recognized: string, expectedForms: string): boolean {
  const heard = normalize(recognized);
  if (!heard) return false;
  return expectedForms.split('/').some((form) => {
    const want = normalize(form);
    if (!want) return false;
    if (heard === want || heard.includes(want)) return true;
    const tolerance = Math.max(1, Math.floor(want.length / 3));
    return distance(heard, want) <= tolerance;
  });
}
