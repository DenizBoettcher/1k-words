import { WordEntry } from "../data/WordEntry";// <-- adjust the import path if needed

// internal stores (module scope = survive unmounts)
const seen = new Set<number>();
const hits = new Map<number, number>();

// call this every time the Vocabulary card is *displayed*
export function registerVocabWord(word: WordEntry): void {
    if (!word)
        return;
    seen.add(word.id);
    hits.set(word.id, (hits.get(word.id) ?? 0) + 1);
}

// derive numbers for the <ProgressBar />
export function getVocabCoverage(total: number) {
    const covered = seen.size;
    const valuesArray = Array.from(hits.values());
    const minHits = total === 0 ? 0 : Math.min(...valuesArray) || 0;

    return { covered, minHits };
}

// optional helper if you want to reset when starting a brand-new session
export function resetVocabProgress(): void {
    seen.clear();
    hits.clear();
}
