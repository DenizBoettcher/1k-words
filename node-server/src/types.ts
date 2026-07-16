import type { Request } from 'express';

export interface AuthUser {
  id: number;
  email: string;
  username: string;
  role: string;
}

/** Express request after authenticateJWT has run. */
export interface RequestWithUser extends Request {
  user: AuthUser;
}
