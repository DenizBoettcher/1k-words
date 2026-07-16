import type { RequestHandler, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { Secret } from 'jsonwebtoken';
import { prisma } from '../prisma';
import { ROLES } from '../lib/config';
import type { RequestWithUser } from '../types';

export const JWT_SECRET: Secret =
  process.env.JWT_SECRET ??
  (() => {
    throw new Error('JWT_SECRET missing (set it in .env)');
  })();

/** Wrap an async handler so rejected promises reach Express' error path. */
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

/**
 * Verify the bearer token AND confirm the user still exists, reading the fresh
 * role/username from the database. Eliminates stale-token bugs after DB resets
 * (401 → the client logs out and returns to the login page automatically).
 */
export const authenticateJWT: RequestHandler = async (req, res, next) => {
  const bearer = req.headers.authorization;
  if (!bearer?.startsWith('Bearer ')) {
    res.status(401).json({ message: 'Missing auth token' });
    return;
  }

  let payload: { sub: number };
  try {
    payload = jwt.verify(bearer.slice(7), JWT_SECRET) as unknown as { sub: number };
  } catch {
    res.status(401).json({ message: 'Invalid or expired token' });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, email: true, username: true, role: true },
  });
  if (!user) {
    res.status(401).json({ message: 'Account no longer exists  please sign in again' });
    return;
  }

  (req as RequestWithUser).user = {
    id: user.id,
    email: user.email,
    username: user.username,
    role: user.role ?? ROLES.user,
  };
  next();
};

/** Chain after authenticateJWT to require the ADMIN role. */
export const requireAdmin: RequestHandler = (req, res, next) => {
  const user = (req as RequestWithUser).user;
  if (!user || user.role !== ROLES.admin) {
    res.status(403).json({ message: 'Admin only' });
    return;
  }
  next();
};
