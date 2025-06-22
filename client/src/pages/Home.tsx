// App.tsx  (refactored)
import React, { useEffect, useState } from 'react';
import { WordEntry } from '../data/WordEntry';
import VocabularyMode from '../components/VocabularyMode';
import LearnMode from '../components/LearnMode';
import { getWords } from '../utils/wordUtils';
import { getRandomRange } from '../utils/homeUtils';
import GearButton from '../components/GearButton';
import { settings } from '../utils/settingUtils';

type Mode = 'vocabulary' | 'learn';

const App: React.FC = () => {
  const [words, setWords] = useState<WordEntry[]>([]);
  const [sequenzeWords, setSequenzeWords] = useState<WordEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>('vocabulary');
  const [lastIndex, setLastIndex] = useState<{ vocabulary: number; learn: number }>({
    vocabulary: -1,
    learn: -1,
  });

  useEffect(() => {
    getWords(settings.sourceLangId, settings.targetLangId)
      .then(fetched => {
        if(fetched.length === 0)
          return;
        setWords(fetched);
        setSequenzeWords(getRandomRange(fetched));
      })
      .catch(err => alert(err.message))
      .finally(() => setLoading(false));
  }, []);

  const updateIndex = (m: Mode, newIndex: number) =>
    setLastIndex(prev => ({ ...prev, [m]: newIndex }));

  if (loading) return <p>Loading…</p>;

  return (
    <>
      <header className="flex items-center justify-end gap-4 p-4">
        {/* other header buttons */}
        <GearButton size={24} className="text-gray-600 dark:text-gray-300" />
      </header>

      <div className="app">
        <h1>Vocabulary Trainer</h1>

        <div className="button-row">
          <button onClick={() => setMode('vocabulary')}>Vocabulary</button>
          <button onClick={() => setMode('learn')}>Learn</button>
        </div>

        {mode === 'vocabulary' && (
          <VocabularyMode
            sequenzeWords={sequenzeWords}
            index={lastIndex.vocabulary}
            setIndex={i => updateIndex('vocabulary', i)}
          />
        )}

        {mode === 'learn' && (
          <LearnMode
            words={words}
            index={lastIndex.learn}
            setIndex={i => updateIndex('learn', i)}
          />
        )}


      </div>
      
    </>
  );
};

export default App;
