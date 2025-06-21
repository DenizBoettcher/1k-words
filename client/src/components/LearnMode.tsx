import React, { useEffect, useState } from 'react';
import { EMPTY_WORD, WordEntry } from '../data/WordEntry';
import { getWeightedRandomIndex, updateArrayInMemory } from '../utils/homeUtils';
import { isAnswerCorrect } from '../utils/WordUtils';
import { updateWordOnServer } from '../utils/WordUtils';

interface Props {
  words: WordEntry[];
  index: number;
  setIndex: (i: number) => void;
}

const LearnMode: React.FC<Props> = ({ words, index, setIndex }) => {
  const [direction, setDirection] = useState<'tr-de' | 'de-tr'>('tr-de');
  const [input, setInput] = useState('');
  const [feedback, setFeedback] = useState('');
  const [showCorrect, setShowCorrect] = useState(false);

  useEffect(() => {
    if (words.length && index === -1) {
      setIndex(getWeightedRandomIndex(words));
    }
  }, [words, index, setIndex]);

  const currentWord =
    index >= 0 && index < words.length
      ? words[index]
      : EMPTY_WORD;

  const checkAnswer = () => {
    const correctRaw = direction === 'tr-de' ? currentWord.sourceLang : currentWord.targetLang;
    const correct = isAnswerCorrect(input, correctRaw);

    setFeedback(correct ? '✅ Correct!' : '❌ Wrong!');
    setShowCorrect(!correct);
    updateWord(correct);

    setTimeout(() => {
      setInput('');
      setFeedback('');
      setShowCorrect(false);
      setIndex(getWeightedRandomIndex(words));
    }, 1500);
  };

  /** wrapper that updates local caches + server */
  const updateWord = async (learnResult: boolean) => {
    const wordId = words[index].id;
    const edited = {
      ...words[index],
      history: {
        ...words[index].history,
        learn: [...words[index].history.learn, learnResult]
      }
    };

    updateArrayInMemory(words, wordId, edited);
    await updateWordOnServer({ wordId: wordId, learnResult: learnResult });
  };

  return (
    <>
      <div className="flash-app">
        {/* --- toggle ------------------------------------------------ */}
        <div className="toggle-row" style={{ marginTop: 33 }}>
          {[
            { val: 'tr-de', label: 'Türkisch ➜ Deutsch' },
            { val: 'de-tr', label: 'Deutsch ➜ Türkisch' },
          ].map(({ val, label }) => (
            <label key={val}>
              <input
                type="radio"
                value={val}
                checked={direction === val}
                onChange={() => setDirection(val as 'tr-de' | 'de-tr')}
              />
              <span>{label}</span>  {/* span lets us style text separately */}
            </label>
          ))}
        </div>

        {/* --- card -------------------------------------------------- */}
        <div className="card-container learn-card">
          <div className="card-static">
            {direction === 'tr-de' ? currentWord.targetLang : currentWord.sourceLang}
          </div>

          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && checkAnswer()}
            placeholder="Übersetzung…"
          />

          <button onClick={checkAnswer}>Check</button>

          {feedback && (
            <p className={`feedback ${feedback.includes('✅') ? 'ok' : 'error'}`}>
              {feedback}
            </p>
          )}

          {showCorrect && (
            <p className="correct-answer">
              Correct:&nbsp;
              {direction === 'tr-de' ? currentWord.sourceLang : currentWord.targetLang}
            </p>
          )}
        </div>
      </div>
    </>

  );
};

export default LearnMode;
