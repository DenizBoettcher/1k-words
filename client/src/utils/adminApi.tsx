import { RequestApi, jsonOrThrow } from './apiUtils';

export interface AdminUser {
  id: number;
  email: string;
  username: string;
  role: string;
  xp: number;
  listCount: number;
  createdAt: string;
}

export function getUsers(): Promise<AdminUser[]> {
  return RequestApi('admin/users').then((r) => jsonOrThrow<AdminUser[]>(r));
}

export function setRole(id: number, role: 'USER' | 'ADMIN') {
  return RequestApi(`admin/users/${id}/role`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role }),
  }).then((r) => jsonOrThrow(r));
}

export function deleteUser(id: number) {
  return RequestApi(`admin/users/${id}`, { method: 'DELETE' }).then((r) => jsonOrThrow(r));
}
