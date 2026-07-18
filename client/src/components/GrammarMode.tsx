import { useEffect, useMemo, useState } from 'react';
import { Stack, Paper, TextInput, Button, Text, Group, Alert, Badge, Loader, Center } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { isAnswerCorrect } from '../utils/wordUtils';
import { getGrammar, GrammarData, submitReview, ReviewResult } from '../utils/studyApi';

interface Props {
  listId: number;
  onReviewed: (result: ReviewResult, wordId: number, correct: boolean, mode: 'flip' | 'write') => void;
}

/**
 * Cloze mode: fill the ___ gap. Translations of every referenced word the
 * user has NOT met yet are shown above the sentence as helper chips once a
 * word is learned, its hint disappears. A correct fill feeds the gap word's
 * SRS (first referenced word) as a written review.
 */
export default function GrammarMode({ listId, onReviewed }: Props) {
  const [data, setData] = useState<GrammarData | null>(null);
  const [error, setError] = useState('');
  const [current, setCurrent] = useState(-1);
  const [input, setInput] = useState('');
  const [result, setResult] = useState<'ok' | 'wrong' | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getGrammar(listId)
      .then((d) => { setData(d); setCurrent(d.exercises.length ? Math.floor(Math.random() * d.exercises.length) : -1); })
      .catch((e) => setError(e?.message ?? 'Failed to load grammar'));
  }, [listId]);

  const wordById = useMemo(
    () => new Map((data?.words ?? []).map((w) => [w.id, w])),
    [data],
  );

  if (error) return <Alert color="red" maw={460} mx="auto" radius="md">{error}</Alert>;
  if (!data) return <Center mt="lg"><Loader /></Center>;
  if (data.exercises.length === 0) {
    return (
      <Alert icon={<IconInfoCircle size={18} />} color="blue" maw={520} mx="auto" radius="md"
        title="No grammar exercises yet">
        The list owner can add sentence exercises via the “Grammar” button on
        the list in your Library.
      </Alert>
    );
  }

  const exercise = data.exercises[Math.max(0, current)];
  const unlearnedRefs = exercise.wordItemIds
    .map((id) => wordById.get(id))
    .filter((w): w is NonNullable<typeof w> => !!w && !w.learned);
  const gapWord = exercise.wordItemIds.length ? wordById.get(exercise.wordItemIds[0]) : undefined;

  const next = () => {
    setInput(''); setResult(null); setBusy(false);
    if (data.exercises.length > 1) {
      let n = current;
      while (n === current) n = Math.floor(Math.random() * data.exercises.length);
      setCurrent(n);
    }
  };

  const check = async () => {
    if (busy) return;
    const correct = isAnswerCorrect(input, exercise.answers);
    setResult(correct ? 'ok' : 'wrong');
    setBusy(true);
    // Feed the gap word's SRS when the sentence is linked to a vocabulary word.
    if (gapWord) {
      try {
        onReviewed(await submitReview(gapWord.id, correct, listId, 'write'), gapWord.id, correct, 'write');
      } catch (e) { console.error(e); }
    }
    setTimeout(next, 1500);
  };

  return (
    <Stack align="center" gap="md" maw={520} mx="auto">
      {unlearnedRefs.length > 0 && (
        <Group gap={6} justify="center">
          {unlearnedRefs.map((w) => (
            <Badge key={w.id} variant="light" color="grape" size="lg" tt="none">
              {w.target.split('/')[0]} = {w.source.split('/')[0]}
            </Badge>
          ))}
        </Group>
      )}

      <Paper withBorder radius="lg" p="lg" w="100%">
        <div className="prompt-tile">{exercise.text}</div>
      </Paper>

      <TextInput
        w="100%" size="md" placeholder="Fill the gap…"
        value={input} disabled={busy}
        onChange={(e) => setInput(e.currentTarget.value)}
        onKeyDown={(e) => e.key === 'Enter' && check()}
        error={result === 'wrong'}
      />
      <Button fullWidth size="md" onClick={check} disabled={busy}>Check</Button>

      {result && (
        <Group justify="center" gap={6}>
          <Text fw={600} c={result === 'ok' ? 'teal' : 'red'}>
            {result === 'ok' ? '✓ Correct' : '✗ Not quite'}
          </Text>
          {result === 'wrong' && <Text c="dimmed">  {exercise.answers.split('/').join(' / ')}</Text>}
        </Group>
      )}
    </Stack>
  );
}
