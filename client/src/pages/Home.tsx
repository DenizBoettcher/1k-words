import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Stack, Group, Select, SegmentedControl, Button, Text, Center, Loader, Alert,
} from '@mantine/core';
import { IconLibrary } from '@tabler/icons-react';
import AppLayout from '../components/AppLayout';
import { WordEntry } from '../data/WordEntry';
import { LevelSummary, EMPTY_SUMMARY } from '../data/LevelSummary';
import VocabularyMode from '../components/VocabularyMode';
import LearnMode from '../components/LearnMode';
import SpeakMode from '../components/SpeakMode';
import GrammarMode from '../components/GrammarMode';
import XpBar from '../components/XpBar';
import { getStudyBatch, getSummary, ReviewResult } from '../utils/studyApi';
import { useSettings, ensureSettingsLoaded } from '../utils/settingUtils';
import { getStudyableLists } from '../utils/listsApi';
import { StudyableList } from '../data/List';

type Mode = 'vocabulary' | 'learn' | 'speak' | 'grammar';

export default function Home() {
  const { settings } = useSettings();
  const [lists, setLists] = useState<StudyableList[]>([]);
  const [activeList, setActiveList] = useState<StudyableList | null>(null);
  const [words, setWords] = useState<WordEntry[]>([]);
  const [summary, setSummary] = useState<LevelSummary>(EMPTY_SUMMARY);
  const [mode, setMode] = useState<Mode>('vocabulary');
  const [index, setIndexState] = useState({ vocabulary: -1, learn: -1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const setIndex = (m: Mode, i: number) => setIndexState((p) => ({ ...p, [m]: i }));

  useEffect(() => {
    (async () => {
      await ensureSettingsLoaded();
      try {
        const [studyable, s] = await Promise.all([getStudyableLists(), getSummary()]);
        setLists(studyable);
        setSummary(s);
      } catch (e: any) {
        setError(e.message);
      }
    })();
  }, []);

  useEffect(() => {
    if (lists.length === 0) { setLoading(false); return; }
    setActiveList(lists.find((l) => l.id === settings.activeListId) ?? lists[0]);
  }, [lists, settings.activeListId]);

  const loadBatch = useCallback(async (listId: number) => {
    setLoading(true);
    try {
      const batch = await getStudyBatch(listId);
      setWords(batch.words);
      setSummary(batch.summary);
      setIndexState({ vocabulary: -1, learn: -1 });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (activeList) loadBatch(activeList.id); }, [activeList, loadBatch]);

  const onReviewed = (r: ReviewResult, wordId: number, correct: boolean, mode: 'flip' | 'write') => {
    setSummary(r.summary);
    // Keep the in-session weighting honest: record the result locally so a
    // just-answered word is immediately re-weighted (not only after the next
    // batch load).
    setWords((current) =>
      current.map((w) =>
        w.id === wordId
          ? {
              ...w,
              history: {
                counter: w.history.counter + 1,
                flips: w.history.flips + (mode === 'flip' ? 1 : 0),
                writes: w.history.writes + (mode === 'write' ? 1 : 0),
                learn: [...(w.history.learn ?? []), correct].slice(-20),
              },
            }
          : w,
      ),
    );
  };

  return (
    <AppLayout>
      {error ? (
        <Alert color="red" title="Something went wrong">{error}</Alert>
      ) : lists.length === 0 ? (
        <Center mih={280}>
          <Stack align="center">
            <Text c="dimmed">You don't have any word lists yet.</Text>
            <Button component={Link} to="/library" leftSection={<IconLibrary size={16} />}>
              Go to your Library
            </Button>
          </Stack>
        </Center>
      ) : (
        <Stack align="center">
          <XpBar summary={summary} />

          <Select
            label="Studying"
            w={320}
            allowDeselect={false}
            value={activeList ? String(activeList.id) : null}
            onChange={(v) => setActiveList(lists.find((l) => l.id === Number(v)) ?? null)}
            data={lists.map((l) => ({
              value: String(l.id),
              label: `${l.title} (${l.sourceLang}→${l.targetLang}, ${l.itemCount})`,
            }))}
          />

          <SegmentedControl
            value={mode}
            onChange={(v) => setMode(v as Mode)}
            data={[
              { value: 'vocabulary', label: 'Cards' },
              { value: 'learn', label: 'Write' },
              { value: 'speak', label: 'Speak' },
              { value: 'grammar', label: 'Grammar' },
            ]}
          />

          {loading ? (
            <Center mih={200}><Loader color="brand" /></Center>
          ) : words.length === 0 ? (
            <Text c="dimmed" mt="xl">No words due right now nicely done. Try another list.</Text>
          ) : mode === 'vocabulary' ? (
            <VocabularyMode
              words={words} listId={activeList?.id ?? 0}
              langSource={activeList?.sourceLang ?? 'en'}
              langTarget={activeList?.targetLang ?? 'en'}
              index={index.vocabulary}
              setIndex={(i) => setIndex('vocabulary', i)} onReviewed={onReviewed}
            />
          ) : mode === 'learn' ? (
            <LearnMode
              words={words} listId={activeList?.id ?? 0} index={index.learn}
              setIndex={(i) => setIndex('learn', i)}
              sourceLang={activeList?.sourceLang ?? 'src'}
              targetLang={activeList?.targetLang ?? 'tgt'}
              onReviewed={onReviewed}
            />
          ) : mode === 'speak' ? (
            <SpeakMode
              words={words} listId={activeList?.id ?? 0}
              langTarget={activeList?.targetLang ?? 'en'}
              index={index.learn}
              setIndex={(i) => setIndex('learn', i)}
              onReviewed={onReviewed}
            />
          ) : (
            <GrammarMode listId={activeList?.id ?? 0} onReviewed={onReviewed} />
          )}
        </Stack>
      )}
    </AppLayout>
  );
}
