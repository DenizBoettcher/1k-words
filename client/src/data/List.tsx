export interface OwnedList {
  id: number;
  title: string;
  description: string;
  sourceLang: string;
  targetLang: string;
  isPublic: boolean;
  isSystem: boolean;
  isFork: boolean;
  originListId: number | null;
  originVersion: number | null;
  originTitle: string | null;
  isOwner: boolean;
  owner: string;
  version: number;
  versionLabel: string;
  itemCount: number;
  likes: number;
  followers: number;
}

export interface FollowedList {
  id: number;
  title: string;
  sourceLang: string;
  targetLang: string;
  author: string;
  followedVersion: number;
  followedLabel: string;
  latestVersion: number;
  latestLabel: string;
  updateAvailable: boolean;
  itemCount: number;
}

export interface PublicList {
  id: number;
  title: string;
  description: string;
  sourceLang: string;
  targetLang: string;
  author: string;
  isSystem: boolean;
  version: number;
  versionLabel: string;
  itemCount: number;
  likes: number;
  followers: number;
  isOwn: boolean;
  following: boolean;
  liked: boolean;
}

export interface VersionMeta {
  version: number;
  label: string;
  commitMessage: string;
  itemCount: number;
  createdAt: string;
}

export interface ListDetail {
  id: number;
  title: string;
  description: string;
  sourceLang: string;
  targetLang: string;
  isPublic: boolean;
  isSystem: boolean;
  author: string;
  isOwner: boolean;
  canEdit: boolean;
  canManage: boolean;
  originListId: number | null;
  originVersion: number | null;
  originTitle: string | null;
  likes: number;
  followers: number;
  maintainers: { id: number; username: string }[];
  versions: VersionMeta[];
  currentVersion: number;
  items: { id: number; source: string; target: string; position: number }[];
}

export interface VersionDiff {
  added: { source: string; target: string }[];
  removed: { source: string; target: string }[];
  changed: { source: string; from: string; to: string }[];
}

/** A list the user can study (owned or followed), for pickers. */
export interface StudyableList {
  id: number;
  title: string;
  sourceLang: string;
  targetLang: string;
  itemCount: number;
  kind: 'owned' | 'followed';
}
