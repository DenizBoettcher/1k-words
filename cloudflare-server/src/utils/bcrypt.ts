import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 10;

export const hashPassword   = (plain: string) => bcrypt.hash(plain, SALT_ROUNDS);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);