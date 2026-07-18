import { RequestApi, jsonOrThrow } from './apiUtils';
import { WordEntry } from '../data/WordEntry';
import { LevelSummary } from '../data/LevelSummary';

export interface StudyBatch {
  list: { id: number; title: string; sourceLang: string; targetLang: string };
  sessionDate: string;
  words: WordEntry[];
  summary: LevelSummary;
}

/** The user's LOCAL calendar date the server keys the daily session on it. */
export function localDate(): string {
  return new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
}

export function getStudyBatch(listId: number): Promise<StudyBatch> {
  return RequestApi(`study/${listId}?date=${localDate()}`).then((r) => jsonOrThrow<StudyBatch>(r));
}

export function getSummary(): Promise<LevelSummary> {
  return RequestApi('study/summary').then((r) => jsonOrThrow<LevelSummary>(r));
}

export interface ActivityDay { day: string; count: number }
export function getActivity(): Promise<{ days: ActivityDay[] }> {
  return RequestApi('study/activity').then((r) => jsonOrThrow<{ days: ActivityDay[] }>(r));
}

export interface GrammarData {
  exercises: { id: number; text: string; answers: string; wordItemIds: number[] }[];
  words: { id: number; source: string; target: string; learned: boolean }[];
}

export function getGrammar(listId: number): Promise<GrammarData> {
  return RequestApi(`study/${listId}/grammar`).then((r) => jsonOrThrow<GrammarData>(r));
}

export interface ReviewResult {
  xpGain: number;
  firstTimeMastered: boolean;
  summary: LevelSummary;
}

export type ReviewMode = 'flip' | 'write' | 'speak';

export function submitReview(
  wordItemId: number,
  correct: boolean,
  listId?: number,
  mode: ReviewMode = 'flip',
): Promise<ReviewResult> {
  return RequestApi('study/review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wordItemId, correct, listId, mode, day: localDate() }),
  }).then((r) => jsonOrThrow<ReviewResult>(r));
}
