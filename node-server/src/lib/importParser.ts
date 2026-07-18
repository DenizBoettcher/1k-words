import { z } from 'zod';

/**
 * Accepts either of two JSON shapes and normalises to { source, target } pairs:
 *
 *  A) Structured (what the current client sends):
 *     { title, sourceLang, targetLang, isPublic?, items: [{ source, target }] }
 *
 *  B) Legacy import files (test_data/*.json):
 *     { "words": [ { "en": "and", "de": "und" }, ... ] }
 *     or a bare array of the same 2-key objects.
 *     Language codes are inferred from the two keys; target = the language
 *     that is NOT the provided/most-common source.
 */

/** A word value: a single string or an array of accepted alternatives. */
const WordValue = z.union([
  z.string().min(1),
  z.array(z.string().min(1)).min(1),
]);

/** Normalise "ein" | ["ein","eine"] to the internal "ein/eine" form. */
function joinAlternatives(value: string | string[]): string {
  const parts = (Array.isArray(value) ? value : [value])
    .flatMap((v) => v.split('/'))
    .map((v) => v.trim())
    .filter(Boolean);
  return Array.from(new Set(parts)).join('/');
}

const Pair = z.object({
  source: WordValue,
  target: WordValue,
});

/**
 * Optional grammar (cloze) exercises. `text` contains a ___ gap; `answers`
 * lists every accepted fill (conjugated form AND base form, e.g.
 * ["schaue", "schauen"]); `hint` is the translation shown while the word is
 * still unlearned; `wordRef` optionally links the sentence to a vocabulary
 * word (matched against the list's target words) so answering feeds its SRS.
 */
const GrammarEntry = z.object({
  text: z.string().min(3).max(300),
  answers: WordValue,
  answer: WordValue.optional(), // tolerated alias
  words: z.array(z.string().min(1).max(120)).max(20).optional(),
  word: z.string().max(120).optional(), // tolerated alias (single ref)
});

export interface NormalisedGrammar {
  text: string;
  /** "a/b" alternative form, same convention as word targets. */
  answers: string;
  /** Base forms of every referenced vocabulary word; first = the gap word. */
  words: string[];
}

/**
 * Parse a STANDALONE grammar file: a bare array of entries or
 * { "grammar": [...] }. Uploaded separately from the word list.
 */
export function normaliseGrammarFile(raw: unknown): NormalisedGrammar[] {
  const arr = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as any).grammar)
      ? (raw as any).grammar
      : null;
  if (!arr) throw new Error('Expected a JSON array of grammar entries (or { "grammar": [...] })');

  const out: NormalisedGrammar[] = [];
  for (const entry of arr.slice(0, 500)) {
    const parsed = GrammarEntry.safeParse(entry);
    if (!parsed.success) continue;
    const g = parsed.data;
    if (!g.text.includes('___')) continue;
    const answers = joinAlternatives(g.answers ?? g.answer ?? '');
    if (!answers) continue;
    const words = (g.words ?? (g.word ? [g.word] : []))
      .map((w) => w.trim())
      .filter(Boolean);
    out.push({ text: g.text.trim(), answers, words });
  }
  if (out.length === 0) throw new Error('No usable grammar entries found (each needs "text" with ___ and "answers")');
  return out;
}

const StructuredBody = z.object({
  title: z.string().min(1).max(120),
  description: z.string().max(500).optional().default(''),
  sourceLang: z.string().min(2).max(12),
  targetLang: z.string().min(2).max(12),
  isPublic: z.boolean().optional().default(false),
  items: z.array(Pair).min(1),
});

export interface NormalisedList {
  title: string;
  description: string;
  sourceLang: string;
  targetLang: string;
  isPublic: boolean;
  items: { source: string; target: string }[];
}

const LegacyEntry = z.record(z.string().min(2), WordValue);

export function normaliseImport(
  raw: unknown,
  fallbackTitle = 'Imported list',
): NormalisedList {
  // Shape A
  const structured = StructuredBody.safeParse(raw);
  if (structured.success) {
    const d = structured.data;
    return {
      title: d.title,
      description: d.description,
      sourceLang: d.sourceLang.toLowerCase(),
      targetLang: d.targetLang.toLowerCase(),
      isPublic: d.isPublic,
      items: dedupe(d.items.map((it) => ({
        source: joinAlternatives(it.source),
        target: joinAlternatives(it.target),
      }))),
    };
  }

  // Shape B pull the array out. A wrapping object may still carry a title
  // and description even without sourceLang/targetLang fields; keep them.
  const wrapper = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as any) : null;
  const wrapperTitle = typeof wrapper?.title === 'string' && wrapper.title.trim().length > 0
    ? wrapper.title.trim().slice(0, 120)
    : null;
  const wrapperDescription = typeof wrapper?.description === 'string'
    ? wrapper.description.trim().slice(0, 500)
    : '';

  const arr = Array.isArray(raw)
    ? raw
    : wrapper && Array.isArray(wrapper.words)
      ? wrapper.words
      : null;

  if (!arr) {
    throw new Error(
      'JSON must be a structured list, an array of {lang:word} objects, or an object with a "words" array',
    );
  }

  const entries = z.array(LegacyEntry).min(1).parse(arr);

  // Infer the two language codes from the keys.
  const codeCounts = new Map<string, number>();
  for (const entry of entries) {
    for (const code of Object.keys(entry)) {
      const lc = code.toLowerCase();
      codeCounts.set(lc, (codeCounts.get(lc) ?? 0) + 1);
    }
  }
  const codes = [...codeCounts.keys()];
  if (codes.length < 2) {
    throw new Error('Legacy import needs two language codes across the entries');
  }
  const [sourceLang, targetLang] = codes;

  const items = entries
    .map((entry) => {
      const lowered: Record<string, string> = {};
      for (const [k, v] of Object.entries(entry)) lowered[k.toLowerCase()] = joinAlternatives(v as string | string[]);
      const source = lowered[sourceLang];
      const target = lowered[targetLang];
      if (!source || !target) return null;
      return { source, target };
    })
    .filter((x): x is { source: string; target: string } => x !== null);

  if (items.length === 0) {
    throw new Error('No usable word pairs found in import');
  }

  return {
    title: wrapperTitle ?? fallbackTitle,
    description: wrapperDescription,
    sourceLang,
    targetLang,
    isPublic: false,
    items: dedupe(items),
  };
}

/** Drop exact duplicate pairs while preserving order. */
function dedupe(items: { source: string; target: string }[]) {
  const seen = new Set<string>();
  const out: { source: string; target: string }[] = [];
  for (const it of items) {
    const key = `${it.source}\u0000${it.target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ source: it.source.trim(), target: it.target.trim() });
  }
  return out;
}
