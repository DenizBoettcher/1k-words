import { Paper, Group, Text, Progress } from '@mantine/core';
import { LevelSummary } from '../data/LevelSummary';

/** Level (mastery-based) + XP with a progress bar toward the next level. */
export default function XpBar({ summary }: { summary: LevelSummary }) {
  const { xpLevel, xpIntoLevel, xpForNext, masteredWords, encounteredWords, totalWords, xp, masteryPercent, account } = summary;

  const progressPct = Math.min(100, (xpIntoLevel / Math.max(1, xpForNext)) * 100);

  return (
    <Paper withBorder radius="md" p="md" maw={520} mx="auto" mb="xl" w="100%">
      <Group justify="space-between" align="baseline" mb={8}>
        <Text ff="'Space Grotesk', sans-serif" fw={700} fz="lg">
          Level {xpLevel}
        </Text>
        <Text ff="monospace" fw={700} c="yellow.7" fz="sm">
          {xp} XP
        </Text>
      </Group>
      <Progress value={progressPct} size="lg" radius="xl" color="brand" striped animated />
      <Text ff="monospace" fz="xs" c="dimmed" ta="center" mt={8}>
        {xpIntoLevel}/{xpForNext} XP to next level · seen {encounteredWords}/{totalWords} · mastered {masteredWords} ({masteryPercent}%)
      </Text>
      {account && (
        <Text ff="monospace" fz="xs" ta="center" mt={4}>
          <Text span c="brand.5" fw={700} inherit>Account level {account.level}</Text>
          <Text span c="dimmed" inherit> · {account.lists} {account.lists === 1 ? 'list' : 'lists'}</Text>
        </Text>
      )}
    </Paper>
  );
}
