import { PrismaClient } from '@prisma/client';

// One shared client for the whole process (unlike the Worker, which is
// request-scoped). Prisma pools connections internally.
export const prisma = new PrismaClient();
