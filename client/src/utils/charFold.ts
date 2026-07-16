/**
 * Special-letter folding for answer checking ("foldSpecialLetters" setting).
 *
 * Goal: someone without a Turkish/German/Danish/… keyboard can type the base
 * letter ("o" for "ö", "c" for "ç") and still be counted correct. Folding is
 * applied to BOTH the expected word and the typed answer, so exact typing
 * always stays correct too.
 *
 * How it works (two layers):
 *
 *  1. Unicode NFD decomposition + stripping combining marks. This correctly
 *     handles EVERY accent-composed letter without us listing them:
 *       á à â ä ã å ā ă ą  → a        é è ê ë ē ė ę ě   → e
 *       í ì î ï ī į ı̇      → i        ó ò ô ö õ ő ō     → o
 *       ú ù û ü ű ū ů ų    → u        ý ÿ               → y
 *       ñ ń ň ņ            → n        ç ć č ĉ           → c
 *       ş ś š ș            → s        ğ ĝ ģ             → g
 *       ž ź ż              → z        ř ŕ               → r
 *       ť ț ţ              → t        ď                 → d
 *       ĺ ľ ļ              → l        ķ                 → k
 *       ---
 *     Covers (among others): German ä ö ü · Turkish ç ğ ş İ · Spanish ñ á é í ó ú
 *     French é è ê ë à â î ï ô ù û ç · Portuguese ã õ â ê ô ç · Italian à è ì ò ù
 *     Swedish å ä ö · Polish ą ć ę ń ó ś ź ż · Czech/Slovak á č ď é ě í ň ř š ť ú ů ý ž
 *     Romanian ă â î ș ț · Hungarian á é í ó ö ő ú ü ű · Baltic ā č ē ģ ī ķ ļ ņ š ū ž
 *     Croatian/Serbian č ć š ž · Vietnamese tone marks · …
 *
 *  2. Explicit map for letters that do NOT decompose (no combining mark):
 */
export const SPECIAL_FOLDS: Record<string, string> = {
  // German
  'ß': 'ss', 'ẞ': 'ss',
  // Danish / Norwegian
  'ø': 'o', 'Ø': 'o',
  'æ': 'ae', 'Æ': 'ae',
  // Icelandic / Faroese
  'ð': 'd', 'Ð': 'd',
  'þ': 'th', 'Þ': 'th',
  // Polish
  'ł': 'l', 'Ł': 'l',
  // Croatian / Serbian / Vietnamese
  'đ': 'd', 'Đ': 'd',
  // French / Latin ligatures
  'œ': 'oe', 'Œ': 'oe',
  // Turkish dotless i (uppercase İ decomposes via NFD, ı does not)
  'ı': 'i',
  // Maltese
  'ħ': 'h', 'Ħ': 'h',
  // Sami / Nordic extras
  'ŧ': 't', 'Ŧ': 't', 'ŋ': 'n', 'Ŋ': 'n', 'ĸ': 'k',
  // Kurdish / Azeri schwa
  'ə': 'e', 'Ə': 'e',
};

/** Fold one string: NFD-strip accents, then apply the explicit map. */
export function foldSpecialLetters(input: string): string {
  const mapped = Array.from(input)
    .map((ch) => SPECIAL_FOLDS[ch] ?? ch)
    .join('');
  // Decompose (é -> e + ́) and drop all combining diacritical marks.
  return mapped.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
