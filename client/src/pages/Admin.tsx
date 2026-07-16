import { useEffect, useState } from 'react';
import { Title, Table, Badge, Button, Group, Alert, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { modals } from '@mantine/modals';
import { IconArrowUp, IconArrowDown, IconTrash } from '@tabler/icons-react';
import AppLayout from '../components/AppLayout';
import { getUsers, setRole, deleteUser, AdminUser } from '../utils/adminApi';

export default function Admin() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = () => getUsers().then(setUsers).catch((e) => setError(e.message));
  useEffect(() => { reload(); }, []);

  const toggleRole = async (u: AdminUser) => {
    await setRole(u.id, u.role === 'ADMIN' ? 'USER' : 'ADMIN');
    reload();
  };

  const remove = (u: AdminUser) =>
    modals.openConfirmModal({
      title: `Delete ${u.email}?`,
      children: <Text size="sm">This removes the account and all of their lists. This can't be undone.</Text>,
      labels: { confirm: 'Delete', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        try { await deleteUser(u.id); reload(); }
        catch (e: any) { notifications.show({ color: 'red', message: e.message }); }
      },
    });

  return (
    <AppLayout>
      <Title order={1} mb="lg">Admin — users</Title>
      {error && <Alert color="red" mb="md">{error}</Alert>}
      <Table.ScrollContainer minWidth={560}>
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
            {users.map((u) => (
              <Table.Tr key={u.id}>
                <Table.Td fw={600}>{u.username}</Table.Td>
                <Table.Td c="dimmed">{u.email}</Table.Td>
                <Table.Td>
                  <Badge variant="light" color={u.role === 'ADMIN' ? 'brand' : 'gray'}>{u.role}</Badge>
                </Table.Td>
                <Table.Td>{u.listCount}</Table.Td>
                <Table.Td ff="monospace">{u.xp}</Table.Td>
                <Table.Td>
                  <Group gap="xs" justify="flex-end">
                    <Button size="xs" variant="light" color="gray"
                      leftSection={u.role === 'ADMIN' ? <IconArrowDown size={14} /> : <IconArrowUp size={14} />}
                      onClick={() => toggleRole(u)}>
                      {u.role === 'ADMIN' ? 'Demote' : 'Promote'}
                    </Button>
                    <Button size="xs" variant="subtle" color="red"
                      leftSection={<IconTrash size={14} />} onClick={() => remove(u)}>Delete</Button>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </AppLayout>
  );
}
