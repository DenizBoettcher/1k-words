import { HonoRequest } from 'hono';

export interface RequestWithUser extends HonoRequest {
  user: { id: number; email: string };
}