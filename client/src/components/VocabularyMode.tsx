import React, { useEffect, useState } from 'react';
import { EMPTY_WORD, WordEntry } from '../data/WordEntry';
import { getRandomIndex, updateArrayInMemory } from '../utils/homeUtils';
import { updateWordOnServer } from '../utils/WordUtils';
import ProgressBar from './ProgressBar';
import { registerVocabWord, getVocabCoverage } from '../utils/ProgressBarUtils';

interface Props {
  sequenzeWords: WordEntry[];
  index: number;
  setIndex: (i: number) => void;
}

const VocabularyMode: React.FC<Props> = ({ sequenzeWords, index, setIndex }) => {
  const [flipped, setFlipped] = useState(false);

  useEffect(() => {
    if (sequenzeWords.length && index === -1) {
      setIndex(getRandomIndex(sequenzeWords, index));
      registerVocabWord(sequenzeWords[index])
    }
  }, [sequenzeWords, index, setIndex]);

  const currentWord =
    index >= 0 && index < sequenzeWords.length
      ? sequenzeWords[index]
      : EMPTY_WORD;

  const { covered, minHits } = getVocabCoverage(sequenzeWords.length);

  const handleCardClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    window.getSelection()?.removeAllRanges();

    if (!flipped) {
      setFlipped(true); // show translation
    } else {
      setFlipped(false); // flip back
      updateWord();
      // delay change until flip animation finishes
      setTimeout(() => {
        nextWord()
      }, 600);
    }
  };

  const nextWord = () => {
    registerVocabWord(sequenzeWords[index]);
    setIndex(getRandomIndex(sequenzeWords, index));
  };

  /** wrapper that updates local caches + server */
  const updateWord = async () => {
    const wordId = currentWord.id;
    const edited = {
      ...sequenzeWords[index],
      history: {
        ...sequenzeWords[index].history,
        counter: sequenzeWords[index].history.counter + 1
      }
    };

    updateArrayInMemory(sequenzeWords, wordId, edited);
    await updateWordOnServer({ wordId: wordId, incrementCounter: true });
  };

  return (
    <>
      <div className="card-container">
        <ProgressBar
          covered={covered}
          total={sequenzeWords.length}
          minHits={minHits}
          targetReps={3}
        />
        <div
          className={`card ${flipped ? 'flipped' : ''}`}
          onClick={handleCardClick}
          draggable="false"
        >
          <div className="card-face card-front">{currentWord.targetLang}</div>
          <div className="card-face card-back">{currentWord.sourceLang}</div>
        </div>
      </div>
    </>
  );
};

export default VocabularyMode;
