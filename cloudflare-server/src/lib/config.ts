/**
 * All tunable limits live here so there is a single source of truth for the
 * front-end and back-end rules described in the README.
 */
export const LIMITS = {
  /** Max word-pairs in a single list, for non-admins. */
  maxItemsPerList: 3000,
  /** Max *uploaded* (original) lists a non-admin may own. Clones don't count. */
  maxOwnedLists: 4,
} as const;

export const ROLES = {
  user: 'USER',
  admin: 'ADMIN',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

/** JWT lifetime in seconds. */
export const JWT_TTL_REMEMBER = 60 * 60 * 24 * 30; // "keep me signed in": 30 days
export const JWT_TTL_SESSION = 60 * 60 * 12; // otherwise: 12 hours
