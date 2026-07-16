export type JwtPayload = {
  sub: number; // user id
  email: string;
  username: string;
  role: string; // "USER" | "ADMIN"
  exp: number;
  iat?: number;
};
