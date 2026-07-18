import { useEffect, useMemo, useRef, useState } from 'react';
import { Stack, Paper, Button, Text, Group, Badge, Alert } from '@mantine/core';
import { IconMicrophone, IconPlayerStopFilled, IconInfoCircle } from '@tabler/icons-react';
import { EMPTY_WORD, WordEntry } from '../data/WordEntry';
import { getWeightedRandomIndex } from '../utils/homeUtils';
import { soundsLike } from '../utils/similarity';
import { submitReview, ReviewResult } from '../utils/studyApi';
import { useSettings } from '../utils/settingUtils';
import { speak, prefetchSpeech } from '../utils/speech';

interface Props {
  words: WordEntry[];
  listId: number;
  langTarget: string;
  index: number;
  setIndex: (i: number) => void;
  onReviewed: (result: ReviewResult, wordId: number, correct: boolean, mode: 'flip' | 'write') => void;
}

const REASON_COLORS: Record<string, string> = { due: 'orange', review: 'blue', new: 'teal' };

/** Pronunciation practice: read the word aloud; the browser's built-in
 *  SpeechRecognition (Google's engine on Android/Chrome) checks it. */
export default function SpeakMode({ words, listId, langTarget, index, setIndex, onReviewed }: Props) {
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState('');
  const [result, setResult] = useState<'ok' | 'wrong' | null>(null);
  const [busy, setBusy] = useState(false);
  const recognitionRef = useRef<any>(null);
  const { settings } = useSettings();

  const SpeechRecognitionImpl = useMemo(
    () => (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition ?? null,
    [],
  );

  useEffect(() => {
    if (words.length && index === -1) setIndex(getWeightedRandomIndex(words));
  }, [words, index, setIndex]);

  // Warm the neural-TTS cache (the correct pronunciation plays after a miss).
  useEffect(() => {
    if (!settings.speakWords) return;
    prefetchSpeech(words.map((w) => w.targetLang.split('/')[0]), langTarget);
  }, [words, langTarget, settings.speakWords]);

  const word = index >= 0 && index < words.length ? words[index] : EMPTY_WORD;

  if (!SpeechRecognitionImpl) {
    return (
      <Alert icon={<IconInfoCircle size={18} />} color="yellow" maw={460} mx="auto" radius="md"
        title="Speech recognition unavailable">
        Your browser doesn't support speech recognition. Chrome, Edge and the
        Android app work best.
      </Alert>
    );
  }

  const finish = async (spoken: string) => {
    const correct = soundsLike(spoken, word.targetLang);
    setHeard(spoken);
    setResult(correct ? 'ok' : 'wrong');
    setBusy(true);
    if (!correct && settings.speakWords) speak(word.targetLang.split('/')[0], langTarget);
    try {
      onReviewed(
        await submitReview(word.id, correct, listId, 'speak' as any),
        word.id, correct, 'flip',
      );
    } catch (e) { console.error(e); }
    setTimeout(() => {
      setHeard(''); setResult(null); setBusy(false);
      setIndex(getWeightedRandomIndex(words, index));
    }, 1600);
  };

  const startListening = () => {
    if (listening || busy || word.id === 0) return;
    const recognition = new SpeechRecognitionImpl();
    recognitionRef.current = recognition;
    recognition.lang = langTarget;
    recognition.interimResults = false;
    recognition.maxAlternatives = 3;
    recognition.onresult = (event: any) => {
      const alternatives: string[] = Array.from(event.results[0]).map((r: any) => r.transcript);
      const best = alternatives.find((a) => soundsLike(a, word.targetLang)) ?? alternatives[0] ?? '';
      setListening(false);
      void finish(best);
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    setListening(true);
    recognition.start();
  };

  const stopListening = () => recognitionRef.current?.stop();

  return (
    <Stack align="center" gap="md" maw={460} mx="auto">
      <Group gap="xs">
        {word.reason === 'new' && word.history.counter === 0 && (
          <Badge size="sm" variant="light" color="teal">new</Badge>
        )}
      </Group>

      <Paper withBorder radius="lg" p="lg" w="100%"
        style={{ minHeight: 128, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        {/* The word to SPEAK is highlighted; below it just the translation. */}
        <div className="prompt-tile" style={{ color: 'var(--mantine-color-brand-5)', fontWeight: 700 }}>
          {word.targetLang.split('/').join(' / ')}
        </div>
        <Text c="dimmed" fz="md">{word.sourceLang.split('/').join(' / ')}</Text>
      </Paper>
      <Text c="dimmed" fz="sm">Say the highlighted word out loud</Text>

      {!listening ? (
        <Button size="lg" radius="xl" leftSection={<IconMicrophone size={20} />}
          disabled={busy} onClick={startListening}>
          Hold on speak
        </Button>
      ) : (
        <Button size="lg" radius="xl" color="red" leftSection={<IconPlayerStopFilled size={20} />}
          onClick={stopListening}>
          Listening…
        </Button>
      )}

      {result && (
        <Group justify="center" gap={6}>
          <Text fw={600} c={result === 'ok' ? 'teal' : 'red'}>
            {result === 'ok' ? '✓ Sounded right' : '✗ Not quite'}
          </Text>
          {heard && <Text c="dimmed">  heard “{heard}”</Text>}
        </Group>
      )}
    </Stack>
  );
}
