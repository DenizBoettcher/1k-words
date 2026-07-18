import { RequestApi, jsonOrThrow, ApiUrl, getAuthHeader } from './apiUtils';
import {
  OwnedList, FollowedList, PublicList, ListDetail, VersionDiff, StudyableList,
} from '../data/List';

export const getMyLists = () => RequestApi('lists/mine').then((r) => jsonOrThrow<OwnedList[]>(r));
export const getFollowing = () => RequestApi('lists/following').then((r) => jsonOrThrow<FollowedList[]>(r));
export type PublicSort = 'stars' | 'followers' | 'popular';
export const getPublicLists = (q = '', sort: PublicSort = 'stars') => {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  params.set('sort', sort);
  return RequestApi(`lists/public?${params.toString()}`).then((r) => jsonOrThrow<PublicList[]>(r));
};

/** Merge owned + followed into one list for study/settings pickers. */
export async function getStudyableLists(): Promise<StudyableList[]> {
  const [mine, following] = await Promise.all([getMyLists(), getFollowing()]);
  return [
    ...mine.map((l): StudyableList => ({
      id: l.id, title: l.title, sourceLang: l.sourceLang, targetLang: l.targetLang,
      itemCount: l.itemCount, kind: 'owned',
    })),
    ...following.map((l): StudyableList => ({
      id: l.id, title: l.title, sourceLang: l.sourceLang, targetLang: l.targetLang,
      itemCount: l.itemCount, kind: 'followed',
    })),
  ];
}

export interface UploadBody {
  title: string;
  description?: string;
  sourceLang: string;
  targetLang: string;
  isPublic?: boolean;
  items: { source: string; target: string }[];
}
export const uploadList = (body: UploadBody) =>
  RequestApi('lists', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    .then((r) => jsonOrThrow<{ id: number; version: number; itemCount: number }>(r));

export const addVersion = (id: number, items: { source: string; target: string }[], commitMessage: string) =>
  RequestApi(`lists/${id}/version`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items, commitMessage }),
  }).then((r) => jsonOrThrow<{ version: number; itemCount: number }>(r));

export const getListDetail = (id: number, version?: number) =>
  RequestApi(`lists/${id}${version ? `?version=${version}` : ''}`).then((r) => jsonOrThrow<ListDetail>(r));

export const getDiff = (id: number, from: number, to: number) =>
  RequestApi(`lists/${id}/diff?from=${from}&to=${to}`).then((r) => jsonOrThrow<VersionDiff>(r));

export const uploadGrammar = (id: number, grammarJson: unknown) =>
  RequestApi(`lists/${id}/grammar`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(grammarJson),
  }).then((r) => jsonOrThrow<{ count: number; unresolvedWordRefs: number }>(r));

export const patchList = (id: number, patch: Partial<Pick<OwnedList, 'title' | 'description' | 'isPublic'>>) =>
  RequestApi(`lists/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) })
    .then((r) => jsonOrThrow(r));

export const deleteList = (id: number) =>
  RequestApi(`lists/${id}`, { method: 'DELETE' }).then((r) => jsonOrThrow(r));

export const followList = (id: number) =>
  RequestApi(`lists/${id}/follow`, { method: 'POST' }).then((r) => jsonOrThrow(r));
export const unfollowList = (id: number) =>
  RequestApi(`lists/${id}/follow`, { method: 'DELETE' }).then((r) => jsonOrThrow(r));
export const setFollowVersion = (id: number, version: number) =>
  RequestApi(`lists/${id}/follow`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version }) })
    .then((r) => jsonOrThrow(r));

export const forkList = (id: number) =>
  RequestApi(`lists/${id}/fork`, { method: 'POST' }).then((r) => jsonOrThrow<{ id: number }>(r));

export const likeList = (id: number) =>
  RequestApi(`lists/${id}/like`, { method: 'POST' }).then((r) => jsonOrThrow(r));
export const unlikeList = (id: number) =>
  RequestApi(`lists/${id}/like`, { method: 'DELETE' }).then((r) => jsonOrThrow(r));

export const addMaintainer = (id: number, username: string) =>
  RequestApi(`lists/${id}/maintainers`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username }),
  }).then((r) => jsonOrThrow<{ id: number; username: string }>(r));
export const removeMaintainer = (id: number, userId: number) =>
  RequestApi(`lists/${id}/maintainers/${userId}`, { method: 'DELETE' }).then((r) => jsonOrThrow(r));

export async function downloadListJson(id: number, title: string, version?: number): Promise<void> {
  const res = await fetch(`${ApiUrl}/api/lists/${id}/export${version ? `?version=${version}` : ''}`, {
    headers: { ...getAuthHeader() },
  });
  if (!res.ok) throw new Error(`Export failed (${res.status})`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${title.replace(/[^a-z0-9-_]+/gi, '_').slice(0, 50) || 'list'}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
