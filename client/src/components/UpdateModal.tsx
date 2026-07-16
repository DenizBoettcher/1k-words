import { useEffect, useState } from 'react';
import {
  Modal, Stack, Group, Button, Select, Text, Badge, Divider, ScrollArea, Loader, Center, List, ThemeIcon,
} from '@mantine/core';
import { IconArrowUp, IconPlus, IconMinus, IconPencil } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { getListDetail, getDiff, setFollowVersion } from '../utils/listsApi';
import { VersionMeta, VersionDiff } from '../data/List';

interface Props {
  listId: number | null;
  followedVersion: number;
  opened: boolean;
  onClose: () => void;
  onUpdated: () => void;
}

/** Followed-list update: pick a version, preview the diff, then follow it. */
export default function UpdateModal({ listId, followedVersion, opened, onClose, onUpdated }: Props) {
  const [versions, setVersions] = useState<VersionMeta[]>([]);
  const [target, setTarget] = useState<number>(followedVersion);
  const [diff, setDiff] = useState<VersionDiff | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!opened || !listId) return;
    setLoading(true);
    getListDetail(listId)
      .then((d) => {
        setVersions(d.versions);
        const latest = d.versions[0]?.version ?? followedVersion;
        setTarget(latest);
      })
      .catch((e) => notifications.show({ color: 'red', message: e.message }))
      .finally(() => setLoading(false));
  }, [opened, listId]);

  useEffect(() => {
    if (!listId || !opened || target === followedVersion) { setDiff(null); return; }
    getDiff(listId, followedVersion, target).then(setDiff).catch(() => setDiff(null));
  }, [listId, opened, target, followedVersion]);

  const apply = async () => {
    if (!listId) return;
    setBusy(true);
    try {
      await setFollowVersion(listId, target);
      notifications.show({ color: 'teal', message: `Now following version 1.${target}` });
      onUpdated();
      onClose();
    } catch (e: any) {
      notifications.show({ color: 'red', message: e.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Update list version" size="md">
      {loading ? (
        <Center mih={160}><Loader color="brand" /></Center>
      ) : (
        <Stack>
          <Group>
            <Text fz="sm" c="dimmed">Following</Text>
            <Badge variant="light" color="gray">1.{followedVersion}</Badge>
            <IconArrowUp size={16} />
            <Select
              w={120}
              value={String(target)}
              onChange={(v) => setTarget(Number(v))}
              data={versions.map((v) => ({ value: String(v.version), label: `1.${v.version}` }))}
              allowDeselect={false}
            />
          </Group>

          {versions.find((v) => v.version === target)?.commitMessage && (
            <Text fz="sm" fs="italic" c="dimmed">
              “{versions.find((v) => v.version === target)?.commitMessage}”
            </Text>
          )}

          <Divider label="Changes" />
          {target === followedVersion ? (
            <Text fz="sm" c="dimmed">That's the version you already follow.</Text>
          ) : !diff ? (
            <Center mih={60}><Loader size="sm" color="brand" /></Center>
          ) : (
            <ScrollArea.Autosize mah={260}>
              <List spacing={4} fz="sm" center>
                {diff.added.map((d, i) => (
                  <List.Item key={`a${i}`} icon={<ThemeIcon size={16} radius="xl" color="teal"><IconPlus size={10} /></ThemeIcon>}>
                    {d.source} → {d.target}
                  </List.Item>
                ))}
                {diff.changed.map((d, i) => (
                  <List.Item key={`c${i}`} icon={<ThemeIcon size={16} radius="xl" color="yellow"><IconPencil size={10} /></ThemeIcon>}>
                    {d.source}: {d.from} → {d.to}
                  </List.Item>
                ))}
                {diff.removed.map((d, i) => (
                  <List.Item key={`r${i}`} icon={<ThemeIcon size={16} radius="xl" color="red"><IconMinus size={10} /></ThemeIcon>}>
                    {d.source} → {d.target}
                  </List.Item>
                ))}
                {diff.added.length + diff.changed.length + diff.removed.length === 0 && (
                  <Text fz="sm" c="dimmed">No word differences between these versions.</Text>
                )}
              </List>
            </ScrollArea.Autosize>
          )}

          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>Cancel</Button>
            <Button loading={busy} disabled={target === followedVersion} onClick={apply}>
              Follow 1.{target}
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
