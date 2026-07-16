import { PrismaClient } from '../generated/prisma';
import { PrismaD1 } from '@prisma/adapter-d1';

/**
 * One Prisma client per request. The D1 adapter is cheap to construct and
 * Workers are single-request scoped, so there is no connection pool to reuse.
 */
export function getPrisma(env: CloudflareBindings): PrismaClient {
  const adapter = new PrismaD1(env.DB);
  return new PrismaClient({ adapter });
}
