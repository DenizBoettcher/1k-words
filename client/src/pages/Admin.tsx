import { useEffect, useMemo, useState } from 'react';
import {
  Title, Table, Badge, Button, Group, Alert, Text, Select, Stack, Paper,
  TextInput, Loader,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { modals } from '@mantine/modals';
import { IconTrash, IconDownload, IconSearch } from '@tabler/icons-react';
import AppLayout from '../components/AppLayout';
import { getUsers, setRole, deleteUser, AdminUser, AdminRole } from '../utils/adminApi';
import { loadNeuralVoiceCatalog, getConfiguredNeuralVoices, NeuralVoiceInfo } from '../utils/speech';

const ROLE_OPTIONS: AdminRole[] = ['USER', 'MAINTAINER', 'ADMIN'];
const ROLE_COLORS: Record<string, string> = { ADMIN: 'brand', MAINTAINER: 'teal', USER: 'gray' };

export default function Admin() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = () => getUsers().then(setUsers).catch((e) => setError(e.message));
  useEffect(() => { reload(); }, []);

  const changeRole = async (targetUser: AdminUser, role: AdminRole) => {
    if (role === targetUser.role) return;
    try {
      await setRole(targetUser.id, role);
      notifications.show({ color: 'teal', message: `${targetUser.username} is now ${role}` });
      reload();
    } catch (e: any) {
      notifications.show({ color: 'red', message: e.message });
    }
  };

  const remove = (targetUser: AdminUser) =>
    modals.openConfirmModal({
      title: `Delete ${targetUser.email}?`,
      children: <Text size="sm">This removes the account and all of their lists. This can't be undone.</Text>,
      labels: { confirm: 'Delete', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        try { await deleteUser(targetUser.id); reload(); }
        catch (e: any) { notifications.show({ color: 'red', message: e.message }); }
      },
    });

  return (
    <AppLayout>
      <Title order={1} mb="lg">Admin</Title>
      {error && <Alert color="red" mb="md">{error}</Alert>}

      <Title order={3} mb="sm">Users</Title>
      <Text c="dimmed" fz="sm" mb="md">
        USER = normal limits · MAINTAINER = no upload limits, may edit system lists · ADMIN = everything incl. user management.
      </Text>
      <Table.ScrollContainer minWidth={640}>
        <Table verticalSpacing="sm" highlightOnHover withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>User</Table.Th>
              <Table.Th>Email</Table.Th>
              <Table.Th>Role</Table.Th>
              <Table.Th>Lists</Table.Th>
              <Table.Th>XP</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {users.map((listedUser) => (
              <Table.Tr key={listedUser.id}>
                <Table.Td fw={600}>{listedUser.username}</Table.Td>
                <Table.Td c="dimmed">{listedUser.email}</Table.Td>
                <Table.Td>
                  <Badge variant="light" color={ROLE_COLORS[listedUser.role] ?? 'gray'}>
                    {listedUser.role}
                  </Badge>
                </Table.Td>
                <Table.Td>{listedUser.listCount}</Table.Td>
                <Table.Td ff="monospace">{listedUser.xp}</Table.Td>
                <Table.Td>
                  <Group gap="xs" justify="flex-end" wrap="nowrap">
                    <Select
                      size="xs" w={140} allowDeselect={false}
                      data={ROLE_OPTIONS}
                      value={listedUser.role}
                      onChange={(v) => v && changeRole(listedUser, v as AdminRole)}
                    />
                    <Button size="xs" variant="subtle" color="red"
                      leftSection={<IconTrash size={14} />} onClick={() => remove(listedUser)}>Delete</Button>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>

      <PiperVoicesSection />
    </AppLayout>
  );
}

/* ---------- Piper voice catalog ---------- */

function PiperVoicesSection() {
  const [voices, setVoices] = useState<NeuralVoiceInfo[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  const configuredVoices = getConfiguredNeuralVoices();

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setVoices(await loadNeuralVoiceCatalog());
    } catch (e: any) {
      setLoadError(e?.message ?? 'Failed to load the voice catalog');
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    if (!voices) return [];
    const needle = filter.trim().toLowerCase();
    if (!needle) return voices;
    return voices.filter((voice) =>
      voice.key.toLowerCase().includes(needle)
      || voice.languageCode.toLowerCase().includes(needle)
      || voice.languageNameEnglish.toLowerCase().includes(needle)
      || voice.languageNameNative.toLowerCase().includes(needle)
      || voice.countryEnglish.toLowerCase().includes(needle));
  }, [voices, filter]);

  const languageCount = useMemo(
    () => (voices ? new Set(voices.map((voice) => voice.languageCode)).size : 0),
    [voices],
  );

  // Config check: which of our per-language defaults exist in the catalog?
  const missingDefaults = useMemo(() => {
    if (!voices) return [];
    const known = new Set(voices.map((voice) => voice.key));
    return Object.entries(configuredVoices).filter(([, id]) => !known.has(id));
  }, [voices, configuredVoices]);

  return (
    <Stack mt="xl" gap="sm">
      <Title order={3}>Piper voices (neural TTS)</Title>
      <Text c="dimmed" fz="sm">
        Loads the live voice catalog from the HuggingFace provider the same source the
        neural engine uses at runtime. Rows marked <Badge component="span" size="xs" variant="light" color="brand">default</Badge> are
        the voices this app currently maps to a language.
      </Text>

      {!voices && (
        <Group>
          <Button leftSection={<IconDownload size={16} />} onClick={load} loading={loading}>
            Load voice catalog
          </Button>
        </Group>
      )}
      {loadError && <Alert color="red">{loadError}</Alert>}
      {loading && !voices && <Loader size="sm" />}

      {voices && (
        <>
          <Paper withBorder radius="md" p="sm">
            <Group gap="lg">
              <Text fz="sm"><b>{voices.length}</b> voices</Text>
              <Text fz="sm"><b>{languageCount}</b> locales</Text>
              <Button size="compact-xs" variant="light" onClick={load} loading={loading}>Reload</Button>
            </Group>
            {missingDefaults.length > 0 && (
              <Alert color="yellow" mt="sm">
                Configured default voices missing from the catalog:{' '}
                {missingDefaults.map(([lang, id]) => `${lang} → ${id}`).join(', ')}
              </Alert>
            )}
          </Paper>

          <TextInput
            placeholder="Filter by key, language, country…"
            leftSection={<IconSearch size={14} />}
            value={filter}
            onChange={(e) => setFilter(e.currentTarget.value)}
            maw={360}
          />

          <Table.ScrollContainer minWidth={760}>
            <Table verticalSpacing={6} fz="sm" highlightOnHover withTableBorder stickyHeader>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Voice key</Table.Th>
                  <Table.Th>Locale</Table.Th>
                  <Table.Th>Language</Table.Th>
                  <Table.Th>Native</Table.Th>
                  <Table.Th>Country</Table.Th>
                  <Table.Th>Quality</Table.Th>
                  <Table.Th>Speakers</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {filtered.map((voice) => (
                  <Table.Tr key={voice.key}>
                    <Table.Td ff="monospace">
                      <Group gap={6} wrap="nowrap">
                        {voice.key}
                        {voice.isAppDefault && <Badge size="xs" variant="light" color="brand">default</Badge>}
                      </Group>
                    </Table.Td>
                    <Table.Td ff="monospace">{voice.languageCode}</Table.Td>
                    <Table.Td>{voice.languageNameEnglish}</Table.Td>
                    <Table.Td>{voice.languageNameNative}</Table.Td>
                    <Table.Td c="dimmed">{voice.countryEnglish}</Table.Td>
                    <Table.Td>
                      <Badge size="xs" variant="outline" color={voice.quality === 'high' ? 'teal' : voice.quality === 'medium' ? 'blue' : 'gray'}>
                        {voice.quality || ' '}
                      </Badge>
                    </Table.Td>
                    <Table.Td ta="center">{voice.numSpeakers}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
          {filtered.length === 0 && <Text c="dimmed" fz="sm">No voices match the filter.</Text>}
        </>
      )}
    </Stack>
  );
}
