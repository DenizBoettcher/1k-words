import { useEffect, useState } from 'react';
import { Group, Button } from '@mantine/core';
import { IconCheck, IconX } from '@tabler/icons-react';
import { EMPTY_WORD, WordEntry } from '../data/WordEntry';
import { getRandomIndex } from '../utils/homeUtils';
import { submitReview, ReviewResult } from '../utils/studyApi';

interface Props {
  words: WordEntry[];
  index: number;
  setIndex: (i: number) => void;
  onReviewed: (result: ReviewResult, wordId: number, correct: boolean) => void;
}

/** Flip-card mode. After flipping, "Knew it"/"Missed" feeds the scheduler. */
export default function VocabularyMode({ words, index, setIndex, onReviewed }: Props) {
  const [flipped, setFlipped] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (words.length && index === -1) setIndex(getRandomIndex(words, index));
  }, [words, index, setIndex]);

  const word = index >= 0 && index < words.length ? words[index] : EMPTY_WORD;

  const advance = () => {
    setFlipped(false);
    setTimeout(() => setIndex(getRandomIndex(words, index)), 300);
  };

  const grade = async (correct: boolean) => {
    if (busy || word.id === 0) return;
    setBusy(true);
    try {
      onReviewed(await submitReview(word.id, correct), word.id, correct);
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
      advance();
    }
  };

  return (
    <div>
      <div className="flip">
        <div
          className={`flip__inner ${flipped ? 'is-flipped' : ''}`}
          onClick={() => !flipped && setFlipped(true)}
        >
          <div className="flip__face flip__front">{word.targetLang.split('/').join(' / ')}</div>
          <div className="flip__face flip__back">{word.sourceLang.split('/').join(' / ')}</div>
        </div>
      </div>

      {!flipped ? (
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
