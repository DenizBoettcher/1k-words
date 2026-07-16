import { Paper, Group, Text, Progress } from '@mantine/core';
import { LevelSummary } from '../data/LevelSummary';

/** Level (mastery-based) + XP with a progress bar toward the next level. */
export default function XpBar({ summary }: { summary: LevelSummary }) {
  const { level, masteredWords, encounteredWords, totalWords, xp, nextLevelAt, masteryPercent } = summary;

  const progressPct =
    nextLevelAt && totalWords > 0
      ? Math.min(100, (masteredWords / nextLevelAt) * 100)
      : level >= 100
        ? 100
        : 0;

  return (
    <Paper withBorder radius="md" p="md" maw={520} mx="auto" mb="xl" w="100%">
      <Group justify="space-between" align="baseline" mb={8}>
        <Text ff="'Space Grotesk', sans-serif" fw={700} fz="lg">
          Level {level}
        </Text>
        <Text ff="monospace" fw={700} c="yellow.7" fz="sm">
          {xp} XP
        </Text>
      </Group>
      <Progress value={progressPct} size="lg" radius="xl" color="brand" striped animated />
      <Text ff="monospace" fz="xs" c="dimmed" ta="center" mt={8}>
        seen {encounteredWords}/{totalWords} · mastered {masteredWords} ({masteryPercent}%)
        {nextLevelAt !== null ? ` · next level at ${nextLevelAt}` : ''}
      </Text>
    </Paper>
  );
}
