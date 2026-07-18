import { useEffect, useState } from 'react';
import {
  Stack, Title, Text, Group, Avatar, Paper, SimpleGrid, Progress, Button, Loader, Center, Tooltip,
} from '@mantine/core';
import { IconSettings } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '../components/AppLayout';
import { getUsername } from '../utils/authUtils';
import { getSummary, getActivity, ActivityDay } from '../utils/studyApi';
import { AccountSummary } from '../data/LevelSummary';

/** GitHub-style activity heatmap: last 18 weeks, one cell per day. */
function ActivityHeatmap({ days }: { days: ActivityDay[] }) {
  const byDay = new Map(days.map((d) => [d.day, d.count]));
  const today = new Date();
  const cells: { day: string; count: number }[] = [];
  for (let i = 18 * 7 - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = d.toLocaleDateString('en-CA');
    cells.push({ day: key, count: byDay.get(key) ?? 0 });
  }
  const max = Math.max(1, ...cells.map((c) => c.count));
  const color = (count: number) => {
    if (count === 0) return 'var(--mantine-color-dark-5)';
    const step = Math.ceil((count / max) * 4);
    return [`#0e4429`, `#006d32`, `#26a641`, `#39d353`][step - 1];
  };
  return (
    <div style={{ display: 'grid', gridTemplateRows: 'repeat(7, 12px)', gridAutoFlow: 'column', gap: 3 }}>
      {cells.map((c) => (
        <Tooltip key={c.day} label={`${c.day}: ${c.count} reviews`} withArrow>
          <div style={{ width: 12, height: 12, borderRadius: 3, background: color(c.count) }} />
        </Tooltip>
      ))}
    </div>
  );
}

export default function Profile() {
  const nav = useNavigate();
  const [account, setAccount] = useState<AccountSummary | null>(null);
  const [activity, setActivity] = useState<ActivityDay[] | null>(null);

  useEffect(() => {
    getSummary().then((s: any) => setAccount(s.account ?? null)).catch(console.error);
    getActivity().then((a) => setActivity(a.days)).catch(() => setActivity([]));
  }, []);

  const username = getUsername() ?? 'you';
  const totalReviews = (activity ?? []).reduce((sum, d) => sum + d.count, 0);

  return (
    <AppLayout>
      <Stack gap="lg" maw={860} mx="auto">
        <Group>
          <Avatar size={72} radius="xl" color="brand">{username.slice(0, 2).toUpperCase()}</Avatar>
          <div>
            <Title order={2}>{username}</Title>
            {account && (
              <Text c="dimmed">
                Account level {account.level} · {account.lists} lists · {account.xp} XP
              </Text>
            )}
          </div>
          <Button ml="auto" variant="light" leftSection={<IconSettings size={16} />}
            onClick={() => nav('/settings')}>
            Settings
          </Button>
        </Group>

        <Paper withBorder radius="md" p="md">
          <Title order={4} mb="xs">Activity</Title>
          {activity === null ? <Center><Loader size="sm" /></Center> : (
            <>
              <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
                <ActivityHeatmap days={activity} />
              </div>
              <Text c="dimmed" fz="xs" mt={6}>{totalReviews} reviews in the last 18 weeks</Text>
            </>
          )}
        </Paper>

        <Title order={4} mb={-8}>Your lists</Title>
        {!account ? <Center><Loader /></Center> : (
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            {(account.perList ?? []).map((l) => (
              <Paper key={l.listId} withBorder radius="md" p="md">
                <Group justify="space-between" mb={4}>
                  <Text fw={600} lineClamp={1}>{l.title}</Text>
                  <Text ff="monospace" fz="sm" c="brand.5" fw={700}>
                    {l.sourceLang.toUpperCase()}→{l.targetLang.toUpperCase()} {l.masteryPercent}%
                  </Text>
                </Group>
                <Progress value={l.masteryPercent} size="md" radius="xl" />
                <Text c="dimmed" fz="xs" mt={6}>
                  level {l.level} · seen {l.encounteredWords}/{l.totalWords} · mastered {l.masteredWords}
                </Text>
              </Paper>
            ))}
          </SimpleGrid>
        )}
      </Stack>
    </AppLayout>
  );
}
