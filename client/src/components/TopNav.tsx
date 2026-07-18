import { Link, useLocation } from 'react-router-dom';
import {
  Box, Group, Button, ActionIcon, Text, Avatar, useMantineColorScheme, useComputedColorScheme,
} from '@mantine/core';
import {
  IconBook2, IconLibrary, IconSettings, IconShieldHalf, IconLogout, IconSun, IconMoon,
} from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { isAdmin, logout, getUsername } from '../utils/authUtils';
import { setSettings } from '../utils/settingUtils';

const links = [
  { to: '/', label: 'Study', icon: IconBook2, end: true },
  { to: '/library', label: 'Library', icon: IconLibrary },
  { to: '/settings', label: 'Settings', icon: IconSettings },
];

export default function TopNav() {
  const nav = useNavigate();
  const { pathname } = useLocation();
  const { setColorScheme } = useMantineColorScheme();
  const scheme = useComputedColorScheme('dark');

  const isActive = (to: string, end?: boolean) =>
    end ? pathname === to : pathname.startsWith(to);

  return (
    <Box
      component="header"
      style={{
        position: 'sticky', top: 0, zIndex: 20,
        borderBottom: '1px solid var(--mantine-color-default-border)',
        backdropFilter: 'saturate(1.4) blur(10px)',
        background: 'color-mix(in srgb, var(--mantine-color-body) 82%, transparent)',
      }}
    >
      <Group justify="space-between" px="lg" h={58}>
        <Text
          component={Link}
          to="/"
          ff="'Space Grotesk', sans-serif"
          fw={700}
          fz="lg"
          style={{ letterSpacing: '-.03em', textDecoration: 'none', color: 'inherit' }}
        >
          1K<Text span c="brand.5" inherit>·</Text>Words
        </Text>

        <Group gap={4}>
          {links.map(({ to, label, icon: Icon, end }) => (
            <Button
              key={to}
              component={Link}
              to={to}
              size="xs"
              variant={isActive(to, end) ? 'light' : 'subtle'}
              color={isActive(to, end) ? 'brand' : 'gray'}
              leftSection={<Icon size={16} />}
              px="sm"
            >
              {label}
            </Button>
          ))}
          {isAdmin() && (
            <Button
              component={Link}
              to="/admin"
              size="xs"
              variant={isActive('/admin') ? 'light' : 'subtle'}
              color={isActive('/admin') ? 'brand' : 'gray'}
              leftSection={<IconShieldHalf size={16} />}
              px="sm"
            >
              Admin
            </Button>
          )}

          <ActionIcon
            variant="subtle"
            color="gray"
            aria-label="Toggle color scheme"
            onClick={() => {
              const next = scheme === 'dark' ? 'light' : 'dark';
              setColorScheme(next);
              setSettings({ darkMode: next === 'dark' }); // keep the account setting in sync
            }}
          >
            {scheme === 'dark' ? <IconSun size={18} /> : <IconMoon size={18} />}
          </ActionIcon>

          <Group style={{ cursor: 'pointer' }} title="Profile & stats" onClick={() => nav('/profile')} gap={6} pl={4}>
            <Avatar color="brand" radius="xl" size={26}>
              {(getUsername() ?? '?').slice(0, 2).toUpperCase()}
            </Avatar>
            <Text fz="sm" fw={500} visibleFrom="xs">{getUsername()}</Text>
            <Text fz="xs" c="dimmed" visibleFrom="sm">Profile</Text>
          </Group>

          <ActionIcon
            variant="subtle"
            color="gray"
            aria-label="Log out"
            onClick={logout}
          >
            <IconLogout size={18} />
          </ActionIcon>
        </Group>
      </Group>
    </Box>
  );
}
