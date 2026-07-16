import { RequestApi, jsonOrThrow } from './apiUtils';
import { WordEntry } from '../data/WordEntry';
import { LevelSummary } from '../data/LevelSummary';

export interface StudyBatch {
  list: { id: number; title: string; sourceLang: string; targetLang: string };
  words: WordEntry[];
  summary: LevelSummary;
}

export function getStudyBatch(listId: number): Promise<StudyBatch> {
  return RequestApi(`study/${listId}`).then((r) => jsonOrThrow<StudyBatch>(r));
}

export function getSummary(): Promise<LevelSummary> {
  return RequestApi('study/summary').then((r) => jsonOrThrow<LevelSummary>(r));
}

export interface ReviewResult {
  xpGain: number;
  firstTimeMastered: boolean;
  summary: LevelSummary;
}

export function submitReview(
  wordItemId: number,
  correct: boolean,
): Promise<ReviewResult> {
  return RequestApi('study/review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wordItemId, correct }),
  }).then((r) => jsonOrThrow<ReviewResult>(r));
}
