import { useEffect, useRef, useState } from 'react';
import { Group, Button, Badge, ActionIcon } from '@mantine/core';
import { IconCheck, IconX, IconVolume } from '@tabler/icons-react';
import { EMPTY_WORD, WordEntry } from '../data/WordEntry';
import { getRandomIndex } from '../utils/homeUtils';
import { submitReview, ReviewResult } from '../utils/studyApi';
import { useSettings } from '../utils/settingUtils';
import { speak, prefetchSpeech } from '../utils/speech';

interface Props {
  words: WordEntry[];
  listId: number;
  langSource: string;
  langTarget: string;
  index: number;
  setIndex: (i: number) => void;
  onReviewed: (result: ReviewResult, wordId: number, correct: boolean, mode: 'flip' | 'write') => void;
}

const REASON_COLORS: Record<string, string> = { due: 'orange', review: 'blue', new: 'teal' };

/** Flip-card mode. After flipping, "Knew it"/"Missed" feeds the scheduler. */
export default function VocabularyMode({
  words, listId, langSource, langTarget, index, setIndex, onReviewed,
}: Props) {
  const [flipped, setFlipped] = useState(false);
  const [hasFlippedOnce, setHasFlippedOnce] = useState(false);
  const [busy, setBusy] = useState(false);
  const { settings } = useSettings();
  const spokenForId = useRef<number>(0);

  useEffect(() => {
    if (words.length && index === -1) setIndex(getRandomIndex(words, index));
  }, [words, index, setIndex]);

  const word = index >= 0 && index < words.length ? words[index] : EMPTY_WORD;
  const frontText = word.targetLang.split('/')[0];
  const backText = word.sourceLang.split('/')[0];

  // Warm the neural-TTS cache for the whole daily set so cards speak instantly.
  useEffect(() => {
    if (!settings.speakWords) return;
    prefetchSpeech(words.map((w) => w.targetLang.split('/')[0]), langTarget);
    prefetchSpeech(words.map((w) => w.sourceLang.split('/')[0]), langSource);
  }, [words, langSource, langTarget, settings.speakWords]);

  // Speak the front of each new card automatically (if enabled).
  useEffect(() => {
    if (!settings.speakWords || word.id === 0 || spokenForId.current === word.id) return;
    spokenForId.current = word.id;
    speak(frontText, langTarget);
  }, [word.id, frontText, langTarget, settings.speakWords]);

  // Multi-flip: tap toggles as often as you like; TTS only on the FIRST
  // reveal (the speaker button repeats on demand).
  const flip = () => {
    const next = !flipped;
    setFlipped(next);
    if (next && !hasFlippedOnce) {
      setHasFlippedOnce(true);
      if (settings.speakWords) speak(backText, langSource);
    }
  };

  const speakVisible = () => {
    if (flipped) speak(backText, langSource);
    else speak(frontText, langTarget);
  };

  const advance = () => {
    setFlipped(false);
    setHasFlippedOnce(false);
    setTimeout(() => setIndex(getRandomIndex(words, index)), 300);
  };

  const grade = async (correct: boolean) => {
    if (busy || word.id === 0) return;
    setBusy(true);
    try {
      onReviewed(await submitReview(word.id, correct, listId, 'flip'), word.id, correct, 'flip');
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
      advance();
    }
  };

  return (
    <div>
      <Group justify="center" gap="xs" mb={6}>
        {word.reason === 'new' && word.history.counter === 0 && (
          <Badge size="sm" variant="light" color="teal">new</Badge>
        )}
        <ActionIcon variant="subtle" color="gray" onClick={speakVisible} title="Speak">
          <IconVolume size={18} />
        </ActionIcon>
      </Group>

      <div className="flip">
        <div
          className={`flip__inner ${flipped ? 'is-flipped' : ''}`}
          onClick={flip}
        >
          <div className="flip__face flip__front">{word.targetLang.split('/').join(' / ')}</div>
          <div className="flip__face flip__back">{word.sourceLang.split('/').join(' / ')}</div>
        </div>
      </div>

      {!hasFlippedOnce ? (
        <p style={{ textAlign: 'center', color: 'var(--mantine-color-dimmed)', marginTop: 14 }}>
          Tap the card to reveal
        </p>
      ) : (
        <Group justify="center" mt="lg">
          <Button color="red" variant="light" leftSection={<IconX size={18} />}
            disabled={busy} onClick={() => grade(false)}>
            Missed
          </Button>
          <Button color="teal" leftSection={<IconCheck size={18} />}
            disabled={busy} onClick={() => grade(true)}>
            Knew it
          </Button>
        </Group>
      )}
    </div>
  );
}
