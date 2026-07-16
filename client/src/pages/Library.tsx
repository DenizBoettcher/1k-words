import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Title, Text, Paper, Group, Button, FileButton, Switch, Badge, Card, SimpleGrid,
  TextInput, Box, Alert, Select, ActionIcon, Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { modals } from '@mantine/modals';
import {
  IconUpload, IconDownload, IconTrash, IconWorld, IconLock, IconPencil,
  IconGitFork, IconPlayerPlay, IconArrowUp, IconStar, IconStarFilled, IconHelp, IconUsers, IconEye,
} from '@tabler/icons-react';
import AppLayout from '../components/AppLayout';
import ListEditor from '../components/ListEditor';
import UpdateModal from '../components/UpdateModal';
import { OwnedList, FollowedList, PublicList } from '../data/List';
import UploadHelp from '../components/UploadHelp';
import {
  getMyLists, getFollowing, getPublicLists, deleteList, patchList, followList, unfollowList,
  forkList, likeList, unlikeList, downloadListJson, uploadList, UploadBody, PublicSort,
} from '../utils/listsApi';
import { setSettings } from '../utils/settingUtils';
import { isAdmin } from '../utils/authUtils';

const MAX_ITEMS = 2000;
const MAX_LISTS = 4;

async function parseFile(file: File, isPublic: boolean): Promise<UploadBody> {
  const raw = JSON.parse(await file.text());
  const titleFromName = file.name.replace(/\.json$/i, '');
  const joinVal = (v: unknown) =>
    (Array.isArray(v) ? v : [v]).map((x) => String(x).trim()).filter(Boolean).join('/');
  if (raw && Array.isArray(raw.items) && raw.sourceLang && raw.targetLang) {
    return {
      title: raw.title ?? titleFromName, sourceLang: raw.sourceLang, targetLang: raw.targetLang,
      isPublic, description: raw.description ?? '',
      items: raw.items.map((it: any) => ({ source: joinVal(it.source), target: joinVal(it.target) })),
    };
  }
  const arr: any[] = Array.isArray(raw) ? raw : raw?.words;
  if (!Array.isArray(arr) || arr.length === 0)
    throw new Error('JSON must be a list of {lang: word} pairs or a structured list.');
  const codes = Array.from(new Set(arr.flatMap((e) => Object.keys(e).map((k) => k.toLowerCase()))));
  if (codes.length < 2) throw new Error('Need two language codes in the file.');
  const [sourceLang, targetLang] = codes;
  const joinAlt = (v: unknown) =>
    (Array.isArray(v) ? v : [v]).map((x) => String(x).trim()).filter(Boolean).join('/');
  const items = arr.map((e) => {
    const low: Record<string, string> = {};
    Object.entries(e).forEach(([k, v]) => (low[k.toLowerCase()] = joinAlt(v)));
    return { source: low[sourceLang], target: low[targetLang] };
  }).filter((p) => p.source && p.target);
  return { title: raw?.title ?? titleFromName, sourceLang, targetLang, isPublic, items };
}

export default function Library() {
  const nav = useNavigate();
  const [mine, setMine] = useState<OwnedList[]>([]);
  const [following, setFollowing] = useState<FollowedList[]>([]);
  const [pub, setPub] = useState<PublicList[]>([]);
  const [query, setQuery] = useState('');
  const [uploadPublic, setUploadPublic] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sort, setSort] = useState<PublicSort>('stars');
  const [helpOpen, setHelpOpen] = useState(false);
  const [editor, setEditor] = useState<OwnedList | null>(null);
  const [updater, setUpdater] = useState<FollowedList | null>(null);

  const admin = isAdmin();
  const ownedOriginals = mine.filter((l) => !l.isFork).length;
  const atCap = !admin && ownedOriginals >= MAX_LISTS;

  const reload = async () => {
    try {
      const [m, f, p] = await Promise.all([getMyLists(), getFollowing(), getPublicLists(query, sort)]);
      setMine(m); setFollowing(f); setPub(p);
    } catch (e: any) {
      notifications.show({ color: 'red', message: e.message });
    }
  };
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [sort]);

  const study = async (listId: number) => {
    await setSettings({ activeListId: listId });
    nav('/');
  };

  const onUpload = async (file: File | null) => {
    if (!file) return;
    setBusy(true);
    try {
      const body = await parseFile(file, uploadPublic);
      if (!admin && body.items.length > MAX_ITEMS)
        throw new Error(`List has ${body.items.length} words; limit is ${MAX_ITEMS}.`);
      const res = await uploadList(body);
      notifications.show({ color: 'teal', message: `Imported “${body.title}” (${res.itemCount} words)` });
      await reload();
    } catch (e: any) {
      notifications.show({ color: 'red', message: e.message });
    } finally {
      setBusy(false);
    }
  };

  const onDelete = (l: OwnedList) =>
    modals.openConfirmModal({
      title: `Delete “${l.title}”?`,
      children: <Text size="sm">All versions and your progress on this list are removed. This can't be undone.</Text>,
      labels: { confirm: 'Delete', cancel: 'Cancel' }, confirmProps: { color: 'red' },
      onConfirm: async () => { await deleteList(l.id); await reload(); },
    });

  const onFork = async (p: PublicList) => {
    try {
      await forkList(p.id);
      notifications.show({ color: 'teal', message: `Forked “${p.title}” into your library` });
      await reload();
    } catch (e: any) { notifications.show({ color: 'red', message: e.message }); }
  };

  const onFollow = async (p: PublicList) => {
    try { await followList(p.id); notifications.show({ color: 'teal', message: `Following “${p.title}”` }); await reload(); }
    catch (e: any) { notifications.show({ color: 'red', message: e.message }); }
  };

  const toggleLike = async (p: PublicList) => {
    try {
      if (p.liked) await unlikeList(p.id); else await likeList(p.id);
      await reload();
    } catch (e: any) { notifications.show({ color: 'red', message: e.message }); }
  };

  return (
    <AppLayout>
      <Group justify="space-between" align="flex-end" mb="md">
        <Title order={1}>Your Library</Title>
        <Text c="dimmed" fz="sm">
          {admin ? 'Admin — unlimited lists' : `${ownedOriginals}/${MAX_LISTS} uploaded lists · forks & follows are free`}
        </Text>
      </Group>

      {/* Upload */}
      <Paper withBorder radius="md" p="md" mb="xl">
        <Group justify="space-between" wrap="wrap">
          <div>
            <Text fw={600}>Upload a list (JSON)</Text>
            <Switch mt={8} label="Make public — others can find & follow it"
              checked={uploadPublic} onChange={(e) => setUploadPublic(e.currentTarget.checked)} />
          </div>
          <Group gap="xs">
            <Tooltip label="How do I create such a JSON?">
              <ActionIcon variant="light" color="gray" size="lg" onClick={() => setHelpOpen(true)}>
                <IconHelp size={18} />
              </ActionIcon>
            </Tooltip>
            <FileButton onChange={onUpload} accept="application/json,.json">
              {(props) => (
                <Button {...props} loading={busy} disabled={atCap} leftSection={<IconUpload size={16} />}>
                  {atCap ? 'List limit reached' : 'Choose JSON file'}
                </Button>
              )}
            </FileButton>
          </Group>
        </Group>
      </Paper>

      {/* My lists */}
      <Title order={2} mb="sm">My lists</Title>
      {mine.length === 0 && <Text c="dimmed">Nothing yet — upload a list above.</Text>}
      <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md" mb="xl">
        {mine.map((l) => (
          <Card key={l.id} withBorder radius="md" padding="md">
            <Group gap={6} mb={2}>
              <Text fw={600} ff="'Space Grotesk', sans-serif">{l.title}</Text>
              <Badge size="xs" variant="light" color="brand">{l.versionLabel}</Badge>
              {l.isFork && <Badge size="xs" variant="light" color="grape">fork</Badge>}
              {l.isSystem && <Badge size="xs" variant="light" color="cyan">official</Badge>}
              {!l.isOwner && <Badge size="xs" variant="light" color="yellow">maintainer</Badge>}
              {l.isPublic && !l.isSystem && <Badge size="xs" variant="light" color="teal">public</Badge>}
            </Group>
            <Text c="dimmed" fz="sm">
              {l.sourceLang.toUpperCase()} → {l.targetLang.toUpperCase()} · {l.itemCount} words
              {l.isPublic && <> · ★ {l.likes} · <IconUsers size={12} style={{ verticalAlign: -1 }} /> {l.followers}</>}
            </Text>
            {l.isFork && l.originTitle && (
              <Text c="dimmed" fz="xs">
                forked from “{l.originTitle}” 1.{l.originVersion}
              </Text>
            )}
            <Group gap="xs" mt="md">
              <Button size="xs" leftSection={<IconPlayerPlay size={14} />} onClick={() => study(l.id)}>Study</Button>
              <Button size="xs" variant="light" leftSection={<IconPencil size={14} />} onClick={() => setEditor(l)}>Edit</Button>
              <Button size="xs" variant="light" color="gray" leftSection={<IconDownload size={14} />}
                onClick={() => downloadListJson(l.id, l.title)}>JSON</Button>
              {l.isOwner && !l.isSystem && (
                <Button size="xs" variant="light" color="gray"
                  leftSection={l.isPublic ? <IconLock size={14} /> : <IconWorld size={14} />}
                  onClick={async () => { await patchList(l.id, { isPublic: !l.isPublic }); await reload(); }}>
                  {l.isPublic ? 'Private' : 'Public'}
                </Button>
              )}
              {l.isOwner && (
                <Button size="xs" variant="subtle" color="red" leftSection={<IconTrash size={14} />}
                  onClick={() => onDelete(l)}>Delete</Button>
              )}
            </Group>
          </Card>
        ))}
      </SimpleGrid>

      {/* Following */}
      {following.length > 0 && (
        <>
          <Title order={2} mb="sm">Following</Title>
          <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md" mb="xl">
            {following.map((l) => (
              <Card key={l.id} withBorder radius="md" padding="md">
                <Group gap={6} mb={2}>
                  <Text fw={600} ff="'Space Grotesk', sans-serif">{l.title}</Text>
                  <Badge size="xs" variant="light" color="gray">{l.followedLabel}</Badge>
                </Group>
                <Text c="dimmed" fz="sm">
                  {l.sourceLang.toUpperCase()} → {l.targetLang.toUpperCase()} · {l.itemCount} words · by {l.author}
                </Text>
                {l.updateAvailable && (
                  <Alert mt="xs" p="xs" color="brand" variant="light" icon={<IconArrowUp size={16} />}>
                    Update {l.followedLabel} → {l.latestLabel}
                  </Alert>
                )}
                <Group gap="xs" mt="md">
                  <Button size="xs" leftSection={<IconPlayerPlay size={14} />} onClick={() => study(l.id)}>Study</Button>
                  {l.updateAvailable && (
                    <Button size="xs" variant="light" leftSection={<IconArrowUp size={14} />} onClick={() => setUpdater(l)}>
                      Update
                    </Button>
                  )}
                  <Button size="xs" variant="light" color="gray" leftSection={<IconDownload size={14} />}
                    onClick={() => downloadListJson(l.id, l.title, l.followedVersion)}>JSON</Button>
                  <Button size="xs" variant="subtle" color="red"
                    onClick={async () => { await unfollowList(l.id); await reload(); }}>Unfollow</Button>
                </Group>
              </Card>
            ))}
          </SimpleGrid>
        </>
      )}

      {/* Browse */}
      <Title order={2} mb="sm">Browse shared lists</Title>
      <Group mb="md">
        <TextInput flex={1} placeholder="Search titles…" value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          onKeyDown={(e) => e.key === 'Enter' && reload()} />
        <Select
          w={150}
          value={sort}
          onChange={(v) => setSort((v as PublicSort) ?? 'stars')}
          allowDeselect={false}
          data={[
            { value: 'stars', label: '★ Stars' },
            { value: 'followers', label: 'Followers' },
            { value: 'popular', label: 'Popular' },
          ]}
        />
        <Button variant="default" onClick={reload}>Search</Button>
      </Group>
      <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
        {pub.filter((p) => !p.isOwn).map((p) => (
          <Card key={p.id} withBorder radius="md" padding="md">
            <Group gap={6} mb={2}>
              <Text fw={600} ff="'Space Grotesk', sans-serif">{p.title}</Text>
              <Badge size="xs" variant="light" color="brand">{p.versionLabel}</Badge>
              {p.isSystem && <Badge size="xs" variant="light" color="cyan">official</Badge>}
            </Group>
            <Text c="dimmed" fz="sm">
              {p.sourceLang.toUpperCase()} → {p.targetLang.toUpperCase()} · {p.itemCount} words · by {p.author}
            </Text>
            <Group gap={10} mt={4}>
              <Tooltip label={p.liked ? 'Unstar' : 'Star this list'}>
                <Group gap={4} style={{ cursor: 'pointer' }} onClick={() => toggleLike(p)}>
                  {p.liked
                    ? <IconStarFilled size={15} style={{ color: 'var(--mantine-color-yellow-6)' }} />
                    : <IconStar size={15} style={{ color: 'var(--mantine-color-dimmed)' }} />}
                  <Text fz="sm" c={p.liked ? 'yellow.7' : 'dimmed'}>{p.likes}</Text>
                </Group>
              </Tooltip>
              <Group gap={4}>
                <IconEye size={15} style={{ color: 'var(--mantine-color-dimmed)' }} />
                <Text fz="sm" c="dimmed">{p.followers}</Text>
              </Group>
            </Group>
            <Group gap="xs" mt="md">
              <Button size="xs" variant={p.following ? 'light' : 'filled'}
                disabled={p.following} onClick={() => onFollow(p)}>
                {p.following ? 'Following' : 'Follow'}
              </Button>
              {!p.isSystem && (
                <Button size="xs" variant="light" color="grape" leftSection={<IconGitFork size={14} />}
                  onClick={() => onFork(p)}>Fork</Button>
              )}
              <Button size="xs" variant="light" color="gray" leftSection={<IconDownload size={14} />}
                onClick={() => downloadListJson(p.id, p.title)}>JSON</Button>
            </Group>
          </Card>
        ))}
      </SimpleGrid>
      <Box h={40} />

      <UploadHelp opened={helpOpen} onClose={() => setHelpOpen(false)} />
      <ListEditor
        listId={editor?.id ?? null}
        sourceLang={editor?.sourceLang ?? ''}
        targetLang={editor?.targetLang ?? ''}
        opened={!!editor}
        onClose={() => setEditor(null)}
        onSaved={reload}
      />
      <UpdateModal
        listId={updater?.id ?? null}
        followedVersion={updater?.followedVersion ?? 0}
        opened={!!updater}
        onClose={() => setUpdater(null)}
        onUpdated={reload}
      />
    </AppLayout>
  );
}
