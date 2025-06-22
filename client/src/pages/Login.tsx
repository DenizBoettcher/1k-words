import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Mail, Lock } from 'lucide-react';
import { Button, Card, CardContent, Input } from '../components/LoginComponents'
import { ApiUrl } from '../data/ApiUrl';

async function request(
  path: 'login' | 'register',
  email: string,
  password: string,
) {
  const res = await fetch(`${ApiUrl}/api/auth/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const msg = (await res.json().catch(() => ({}))).message ?? 'Request failed';
    throw new Error(msg);
  }
  return res.json() as Promise<{ token: string; user: { id: number; email: string } }>;
}

export default function LoginPage() {
  const nav = useNavigate();
  const loc = useLocation();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);

    if (mode === 'register' && pw !== pw2) {
      setErr("Passwords don't match");
      return;
    }

    setLoading(true);
    try {
      const { token } = await request(mode, email, pw);
      localStorage.setItem('token', token);
      nav((loc.state as any)?.from?.pathname ?? '/');
    } catch (e: any) {
      setErr(e.message ?? 'Request failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-screen items-center justify-center bg-gray-100">
      <Card className="w-full max-w-md">
        <CardContent>
          <form onSubmit={handleSubmit} className="grid gap-4">
            <h1 className="text-center text-2xl font-semibold">
              {mode === 'login' ? 'Sign in' : 'Create account'}
            </h1>

            {err && (
              <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
                {err}
              </p>
            )}

            <label className="relative">
              <Mail className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 opacity-60" />
              <Input
                type="email"
                placeholder="you@example.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-8"
              />
            </label>

            <label className="relative">
              <Lock className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 opacity-60" />
              <Input
                type="password"
                placeholder="••••••••"
                required
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                className="pl-8"
              />
            </label>

            {mode === 'register' && (
              <label className="relative">
                <Lock className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 opacity-60" />
                <Input
                  type="password"
                  placeholder="Repeat password"
                  required
                  value={pw2}
                  onChange={(e) => setPw2(e.target.value)}
                  className="pl-8"
                />
              </label>
            )}

            <Button type="submit" disabled={loading}>
              {loading
                ? mode === 'login'
                  ? 'Logging in…'
                  : 'Creating…'
                : mode === 'login'
                ? 'Log in'
                : 'Register'}
            </Button>

            <button
              type="button"
              className="text-center text-sm text-blue-600 hover:underline"
              onClick={() => {
                setMode(mode === 'login' ? 'register' : 'login');
                setErr(null);
              }}
            >
              {mode === 'login'
                ? "Don't have an account? Register"
                : 'Already have an account? Log in'}
            </button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
