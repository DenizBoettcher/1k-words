import { useEffect, useMemo, useRef, useState } from 'react';
import { Stack, SegmentedControl, Paper, TextInput, Button, Text, Group, Alert, Badge, ActionIcon } from '@mantine/core';
import { IconInfoCircle, IconVolume } from '@tabler/icons-react';
import { EMPTY_WORD, WordEntry } from '../data/WordEntry';
import { getWeightedRandomIndex } from '../utils/homeUtils';
import { isAnswerCorrect } from '../utils/wordUtils';
import { submitReview, ReviewResult } from '../utils/studyApi';
import { useSettings } from '../utils/settingUtils';
import { speak, prefetchSpeech } from '../utils/speech';

interface Props {
  words: WordEntry[];
  listId: number;
  index: number;
  setIndex: (i: number) => void;
  sourceLang: string;
  targetLang: string;
  onReviewed: (result: ReviewResult, wordId: number, correct: boolean, mode: 'flip' | 'write') => void;
}

const REASON_COLORS: Record<string, string> = { due: 'orange', review: 'blue', new: 'teal' };

/**
 * Written-answer mode. Only words the user has already MET as a flash card
 * qualify (history.flips > 0) typing a word you've never seen makes no
 * sense. Within the pool, the least-known words are drawn most often.
 */
export default function LearnMode({
  words, listId, index, setIndex, sourceLang, targetLang, onReviewed,
}: Props) {
  const [direction, setDirection] = useState<'t2s' | 's2t'>('t2s');
  const [input, setInput] = useState('');
  const [result, setResult] = useState<'ok' | 'wrong' | null>(null);
  const [busy, setBusy] = useState(false);
  const { settings } = useSettings();
  const spokenForId = useRef<number>(0);

  // Eligible pool: seen at least once as a flash card.
  const eligibleIndices = useMemo(
    () => words.map((w, i) => (w.history.flips > 0 ? i : -1)).filter((i) => i >= 0),
    [words],
  );

  useEffect(() => {
    const currentEligible = index >= 0 && eligibleIndices.includes(index);
    if (eligibleIndices.length && !currentEligible) {
      setIndex(getWeightedRandomIndex(words, index, eligibleIndices));
    }
  }, [words, index, setIndex, eligibleIndices]);

  const word = index >= 0 && index < words.length && eligibleIndices.includes(index)
    ? words[index]
    : EMPTY_WORD;
  const prompt = direction === 't2s' ? word.targetLang : word.sourceLang;
  const expected = direction === 't2s' ? word.sourceLang : word.targetLang;
  const promptLang = direction === 't2s' ? targetLang : sourceLang;
  const expectedLang = direction === 't2s' ? sourceLang : targetLang;

  // Warm the neural-TTS cache: prompts of the whole eligible pool, plus the
  // expected side (spoken after a wrong answer).
  useEffect(() => {
    if (!settings.speakWords) return;
    const eligibleWords = eligibleIndices.map((i) => words[i]);
    prefetchSpeech(
      eligibleWords.map((w) => (direction === 't2s' ? w.targetLang : w.sourceLang).split('/')[0]),
      promptLang,
    );
    prefetchSpeech(
      eligibleWords.map((w) => (direction === 't2s' ? w.sourceLang : w.targetLang).split('/')[0]),
      expectedLang,
    );
  }, [words, eligibleIndices, direction, promptLang, expectedLang, settings.speakWords]);

  // Speak the prompt automatically when a new word appears (if enabled).
  useEffect(() => {
    if (!settings.speakWords || word.id === 0 || spokenForId.current === word.id) return;
    spokenForId.current = word.id;
    speak(prompt.split('/')[0], promptLang);
  }, [word.id, prompt, promptLang, settings.speakWords]);

  if (eligibleIndices.length === 0) {
    return (
      <Alert icon={<IconInfoCircle size={18} />} color="blue" maw={460} mx="auto" radius="md"
        title="Flash cards first">
        Today's words are all still unseen flip through them in Vocabulary mode
        first, then come back here to practice writing them.
      </Alert>
    );
  }

  const check = async () => {
    if (busy || word.id === 0) return;
    const correct = isAnswerCorrect(input, expected);
    setResult(correct ? 'ok' : 'wrong');
    setBusy(true);
    if (settings.speakWords) speak(expected.split('/')[0], expectedLang); // hear the right answer
    try {
      onReviewed(await submitReview(word.id, correct, listId, 'write'), word.id, correct, 'write');
    } catch (e) {
      console.error(e);
    }
    setTimeout(() => {
      setInput('');
      setResult(null);
      setBusy(false);
      setIndex(getWeightedRandomIndex(words, index, eligibleIndices));
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

      <Group gap="xs">
        {word.reason === 'new' && word.history.counter === 0 && (
          <Badge size="sm" variant="light" color="teal">new</Badge>
        )}
        <ActionIcon variant="subtle" color="gray" title="Speak"
          onClick={() => speak(prompt.split('/')[0], promptLang)}>
          <IconVolume size={18} />
        </ActionIcon>
      </Group>

      <Paper withBorder radius="lg" p="lg" w="100%" style={{ minHeight: 112, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
          {result === 'wrong' && <Text c="dimmed">  {expected.split('/').join(' / ')}</Text>}
        </Group>
      )}
    </Stack>
  );
}
