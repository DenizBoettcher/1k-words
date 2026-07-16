import { useEffect, useState } from 'react';
import { Stack, SegmentedControl, Paper, TextInput, Button, Text, Group } from '@mantine/core';
import { EMPTY_WORD, WordEntry } from '../data/WordEntry';
import { getWeightedRandomIndex } from '../utils/homeUtils';
import { isAnswerCorrect } from '../utils/wordUtils';
import { submitReview, ReviewResult } from '../utils/studyApi';

interface Props {
  words: WordEntry[];
  index: number;
  setIndex: (i: number) => void;
  sourceLang: string;
  targetLang: string;
  onReviewed: (result: ReviewResult, wordId: number, correct: boolean) => void;
}

export default function LearnMode({
  words, index, setIndex, sourceLang, targetLang, onReviewed,
}: Props) {
  const [direction, setDirection] = useState<'t2s' | 's2t'>('t2s');
  const [input, setInput] = useState('');
  const [result, setResult] = useState<'ok' | 'wrong' | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (words.length && index === -1) setIndex(getWeightedRandomIndex(words));
  }, [words, index, setIndex]);

  const word = index >= 0 && index < words.length ? words[index] : EMPTY_WORD;
  const prompt = direction === 't2s' ? word.targetLang : word.sourceLang;
  const expected = direction === 't2s' ? word.sourceLang : word.targetLang;

  const check = async () => {
    if (busy || word.id === 0) return;
    const correct = isAnswerCorrect(input, expected);
    setResult(correct ? 'ok' : 'wrong');
    setBusy(true);
    try {
      onReviewed(await submitReview(word.id, correct), word.id, correct);
    } catch (e) {
      console.error(e);
    }
    setTimeout(() => {
      setInput('');
      setResult(null);
      setBusy(false);
      setIndex(getWeightedRandomIndex(words, index));
    }, 1200);
  };

  return (
    <Stack align="center" gap="md" maw={460} mx="auto">
      <SegmentedControl
        value={direction}
        onChange={(v) => setDirection(v as 't2s' | 's2t')}
        data={[
          { value: 't2s', label: `${targetLang.toUpperCase()} → ${sourceLang.toUpperCase()}` },
          { value: 's2t', label: `${sourceLang.toUpperCase()} → ${targetLang.toUpperCase()}` },
        ]}
      />

      <Paper withBorder radius="lg" p="lg" w="100%">
        <div className="prompt-tile">{prompt.split('/').join(' / ')}</div>
      </Paper>

      <TextInput
        w="100%"
        size="md"
        placeholder="Type the translation…"
        value={input}
        disabled={busy}
        onChange={(e) => setInput(e.currentTarget.value)}
        onKeyDown={(e) => e.key === 'Enter' && check()}
        error={result === 'wrong'}
      />

      <Button fullWidth size="md" onClick={check} disabled={busy}>
        Check
      </Button>

      {result && (
        <Group justify="center" gap={6}>
          <Text fw={600} c={result === 'ok' ? 'teal' : 'red'}>
            {result === 'ok' ? '✓ Correct' : '✗ Not quite'}
          </Text>
          {result === 'wrong' && <Text c="dimmed">— {expected.split('/').join(' / ')}</Text>}
        </Group>
      )}
    </Stack>
  );
}
