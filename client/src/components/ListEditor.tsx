import { useEffect, useState } from 'react';
import {
  Modal, Stack, Group, Button, TextInput, Table, ActionIcon, Text, ScrollArea, Loader, Center, Divider, Badge,
} from '@mantine/core';
import { IconPlus, IconTrash, IconDeviceFloppy, IconUserPlus, IconX } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { getListDetail, addVersion, addMaintainer, removeMaintainer } from '../utils/listsApi';

interface Row { source: string; target: string; }

interface Props {
  listId: number | null;
  sourceLang: string;
  targetLang: string;
  opened: boolean;
  onClose: () => void;
  onSaved: () => void;
}

/** Owner edit: table of pairs → saved as a new version with a commit message. */
export default function ListEditor({ listId, sourceLang, targetLang, opened, onClose, onSaved }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [commit, setCommit] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [maintainers, setMaintainers] = useState<{ id: number; username: string }[]>([]);
  const [newMaintainer, setNewMaintainer] = useState('');

  useEffect(() => {
    if (!opened || !listId) return;
    setLoading(true);
    setCommit('');
    getListDetail(listId)
      .then((d) => {
        setRows(d.items.map((i) => ({ source: i.source, target: i.target })));
        setIsOwner(d.canManage);
        setMaintainers(d.maintainers);
      })
      .catch((e) => notifications.show({ color: 'red', message: e.message }))
      .finally(() => setLoading(false));
  }, [opened, listId]);

  const setRow = (i: number, patch: Partial<Row>) =>
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  const addRow = () => setRows((r) => [...r, { source: '', target: '' }]);
  const removeRow = (i: number) => setRows((r) => r.filter((_, idx) => idx !== i));

  const save = async () => {
    const items = rows
      .map((r) => ({ source: r.source.trim(), target: r.target.trim() }))
      .filter((r) => r.source && r.target);
    if (items.length === 0) {
      notifications.show({ color: 'red', message: 'Add at least one word pair.' });
      return;
    }
    if (!listId) return;
    setSaving(true);
    try {
      const res = await addVersion(listId, items, commit.trim() || 'Updated list');
      notifications.show({ color: 'teal', message: `Saved version 1.${res.version} (${res.itemCount} words)` });
      onSaved();
      onClose();
    } catch (e: any) {
      notifications.show({ color: 'red', message: e.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Edit list saves a new version" size="lg">
      {loading ? (
        <Center mih={200}><Loader color="brand" /></Center>
      ) : (
        <Stack>
          <Text c="dimmed" fz="sm">
            {rows.length} words. Editing creates a new version; people following this
            list will see an update they can accept.
          </Text>
          <ScrollArea.Autosize mah={360}>
            <Table stickyHeader>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{sourceLang.toUpperCase()}</Table.Th>
                  <Table.Th>{targetLang.toUpperCase()}</Table.Th>
                  <Table.Th w={40} />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {rows.map((r, i) => (
                  <Table.Tr key={i}>
                    <Table.Td>
                      <TextInput variant="unstyled" value={r.source}
                        onChange={(e) => setRow(i, { source: e.currentTarget.value })} />
                    </Table.Td>
                    <Table.Td>
                      <TextInput variant="unstyled" value={r.target}
                        onChange={(e) => setRow(i, { target: e.currentTarget.value })} />
                    </Table.Td>
                    <Table.Td>
                      <ActionIcon variant="subtle" color="red" onClick={() => removeRow(i)}>
                        <IconTrash size={16} />
                      </ActionIcon>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </ScrollArea.Autosize>

          <Button variant="light" leftSection={<IconPlus size={16} />} onClick={addRow} size="xs" w={140}>
            Add word
          </Button>

          <TextInput
            label="Version note (commit message)"
            placeholder="e.g. fixed typos, added 20 verbs"
            value={commit}
            onChange={(e) => setCommit(e.currentTarget.value)}
          />

          {isOwner && (
            <>
              <Divider label="Maintainers" labelPosition="left" />
              <Text fz="xs" c="dimmed" mt={-8}>
                Maintainers can edit this list (save new versions), like collaborators on Git.
              </Text>
              <Group gap="xs">
                {maintainers.map((m) => (
                  <Badge
                    key={m.id}
                    variant="light"
                    rightSection={
                      <ActionIcon
                        size="xs" variant="transparent" color="red"
                        onClick={async () => {
                          if (!listId) return;
                          await removeMaintainer(listId, m.id);
                          setMaintainers((cur) => cur.filter((x) => x.id !== m.id));
                        }}
                      >
                        <IconX size={10} />
                      </ActionIcon>
                    }
                  >
                    {m.username}
                  </Badge>
                ))}
                {maintainers.length === 0 && <Text fz="sm" c="dimmed">No maintainers yet.</Text>}
              </Group>
              <Group gap="xs">
                <TextInput
                  flex={1} size="xs" placeholder="Username…"
                  value={newMaintainer}
                  onChange={(e) => setNewMaintainer(e.currentTarget.value)}
                  onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
                />
                <Button
                  size="xs" variant="light" leftSection={<IconUserPlus size={14} />}
                  onClick={async () => {
                    if (!listId || !newMaintainer.trim()) return;
                    try {
                      const added = await addMaintainer(listId, newMaintainer.trim());
                      setMaintainers((cur) => [...cur, added]);
                      setNewMaintainer('');
                    } catch (e: any) {
                      notifications.show({ color: 'red', message: e.message });
                    }
                  }}
                >
                  Add
                </Button>
              </Group>
            </>
          )}

          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>Cancel</Button>
            <Button leftSection={<IconDeviceFloppy size={16} />} loading={saving} onClick={save}>
              Save as new version
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
