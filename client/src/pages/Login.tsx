import { useState, type FormEvent } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Box, Paper, Stack, Title, Text, TextInput, PasswordInput, Button, Anchor, List, Checkbox,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconMail, IconLock, IconSparkles, IconUser } from '@tabler/icons-react';
import { RequestApi, jsonOrThrow } from '../utils/apiUtils';
import { setToken } from '../utils/authUtils';
import { refreshSettings } from '../utils/settingUtils';

async function loginRequest(email: string, password: string, rememberMe: boolean) {
  const res = await RequestApi('auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, rememberMe }),
  });
  return jsonOrThrow<{ token: string; user: { id: number; email: string; role: string } }>(res);
}

async function registerRequest(email: string, username: string, password: string) {
  const res = await RequestApi('auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, username, password }),
  });
  return jsonOrThrow<{ user: { id: number; email: string; username: string; role: string } }>(res);
}

export default function LoginPage() {
  const nav = useNavigate();
  const loc = useLocation();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const isLogin = mode === 'login';

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!isLogin && pw !== pw2) return setErr("Passwords don't match.");
    setLoading(true);
    try {
      if (isLogin) {
        const { token } = await loginRequest(email, pw, remember);
        setToken(token, remember);
        await refreshSettings(); // one fetch per session  pages read the cache
        nav((loc.state as any)?.from?.pathname ?? '/');
      } else {
        await registerRequest(email, username, pw);
        notifications.show({
          color: 'teal',
          title: 'Account created',
          message: 'Please sign in with your new account.',
        });
        setMode('login');
        setPw('');
        setPw2('');
      }
    } catch (e: any) {
      setErr(e.message ?? 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Box style={{ minHeight: '100vh', display: 'flex' }}>
      <Box
        visibleFrom="sm"
        p={48}
        style={{
          flex: '1.05 1 0', position: 'relative', overflow: 'hidden', color: '#fff',
          display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 20,
          background: 'linear-gradient(150deg, var(--mantine-color-brand-7), var(--mantine-color-brand-5) 55%, var(--mantine-color-brand-3))',
        }}
      >
        <Title order={1} fz={48} style={{ letterSpacing: '-.03em' }}>
          1K<span style={{ opacity: 0.7 }}>·</span>Words
        </Title>
        <Text fz="xl" maw={340} style={{ lineHeight: 1.5 }}>
          Master a thousand words  ten at a time, and never forget them.
        </Text>
        <List
          spacing="sm" mt="md"
          icon={<IconSparkles size={16} style={{ color: '#fff', opacity: 0.85, verticalAlign: 'middle' }} />}
        >
          <List.Item>Spaced repetition resurfaces what you miss</List.Item>
          <List.Item>Earn XP and level up as words stick</List.Item>
          <List.Item>Build and share your own word lists</List.Item>
        </List>
      </Box>

      <Box style={{ flex: '.95 1 0', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Paper component="form" onSubmit={handleSubmit} w="100%" maw={400} radius="lg" p="xl" withBorder>
          <Stack gap="md">
            <div>
              <Title order={2}>{isLogin ? 'Welcome back' : 'Create your account'}</Title>
              <Text c="dimmed" fz="sm" mt={4}>
                {isLogin ? 'Pick up right where you left off.' : 'Start your first word list in seconds.'}
              </Text>
            </div>

            {err && (
              <Text c="red" fz="sm" p="xs" style={{ background: 'var(--mantine-color-red-light)', borderRadius: 8 }}>
                {err}
              </Text>
            )}

            <TextInput
              type="email" required label="Email" placeholder="you@example.com"
              leftSection={<IconMail size={16} />}
              value={email} onChange={(e) => setEmail(e.currentTarget.value)}
            />
            {!isLogin && (
              <TextInput
                required label="Username" placeholder="e.g. deniz"
                leftSection={<IconUser size={16} />}
                value={username} onChange={(e) => setUsername(e.currentTarget.value)}
              />
            )}
            <PasswordInput
              required label="Password" placeholder="Your password"
              leftSection={<IconLock size={16} />}
              value={pw} onChange={(e) => setPw(e.currentTarget.value)}
            />
            {!isLogin && (
              <PasswordInput
                required label="Repeat password" placeholder="Repeat password"
                leftSection={<IconLock size={16} />}
                value={pw2} onChange={(e) => setPw2(e.currentTarget.value)}
              />
            )}

            {isLogin && (
              <Checkbox
                label="Keep me signed in"
                description="Stays signed in on this device for 30 days. Off: only until you close the browser."
                checked={remember}
                onChange={(e) => setRemember(e.currentTarget.checked)}
              />
            )}

            <Button type="submit" fullWidth size="md" loading={loading} mt={4}>
              {isLogin ? 'Sign in' : 'Create account'}
            </Button>

            <Text ta="center" fz="sm" c="dimmed">
              {isLogin ? 'New here? ' : 'Already have an account? '}
              <Anchor component="button" type="button" fw={600}
                onClick={() => { setMode(isLogin ? 'register' : 'login'); setErr(null); }}>
                {isLogin ? 'Create an account' : 'Sign in'}
              </Anchor>
            </Text>
          </Stack>
        </Paper>
      </Box>
    </Box>
  );
}
