export type JwtPayload = {
  sub: number;        // user-id
  email: string;
  exp: number;
  iat: number;
  tv?: number;        // tokenVersion (optional)
};