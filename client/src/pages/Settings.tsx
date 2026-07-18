import { useEffect, useState } from 'react';
import { Stack, Title, Paper, Select, Switch, NumberInput, Text } from '@mantine/core';
import { useMantineColorScheme, useComputedColorScheme } from '@mantine/core';
import AppLayout from '../components/AppLayout';
import { getTtsEngine, setTtsEngine, type TtsEngine } from '../utils/speech';
import { useSettings } from '../utils/settingUtils';
import { getStudyableLists } from '../utils/listsApi';
import { StudyableList } from '../data/List';

export default function SettingsPage() {
  const [ttsEngine, setTtsEngineState] = useState<TtsEngine>(getTtsEngine());
  const { settings, setSettings } = useSettings();
  const { setColorScheme } = useMantineColorScheme();
  const scheme = useComputedColorScheme('dark');
  const [lists, setLists] = useState<StudyableList[]>([]);

  useEffect(() => { getStudyableLists().then(setLists).catch(() => {}); }, []);

  return (
    <AppLayout>
      <Title order={1} mb="lg">Settings</Title>
      <Stack gap="md" maw={460}>
        <Paper withBorder radius="md" p="md">
          <Select
            label="Active list to study"
            placeholder="None"
            clearable
            value={settings.activeListId ? String(settings.activeListId) : null}
            onChange={(v) => setSettings({ activeListId: v ? Number(v) : null })}
            data={lists.map((l) => ({
              value: String(l.id),
              label: `${l.title} (${l.sourceLang}→${l.targetLang})`,
            }))}
          />
        </Paper>

        <Paper withBorder radius="md" p="md">
          <Switch
            label="Dark mode"
            description="VS Code-style muted greys"
            checked={scheme === 'dark'}
            onChange={(e) => {
              const dark = e.currentTarget.checked;
              setColorScheme(dark ? 'dark' : 'light');
              setSettings({ darkMode: dark });
            }}
          />
        </Paper>

        <Paper withBorder radius="md" p="md">
          <Switch
            label="Check capitalization"
            description="When on, “berlin” is wrong for “Berlin”. Off: case is ignored."
            checked={settings.checkCapitalization}
            onChange={(e) => setSettings({ checkCapitalization: e.currentTarget.checked })}
          />
          <Switch
            mt="md"
            label="Accept base letters for special characters"
            description="When on, ö→o, ç→c, ø→o, ß→ss … so answers count without those keys."
            checked={settings.foldSpecialLetters}
            onChange={(e) => setSettings({ foldSpecialLetters: e.currentTarget.checked })}
          />
          <Switch
            mt="md"
            label="Speak words aloud"
            description="Reads cards and prompts out loud using your device's text-to-speech voices."
            checked={settings.speakWords}
            onChange={(e) => setSettings({ speakWords: e.currentTarget.checked })}
          />
          <Select
            mt="md"
            label="Voice engine (this device)"
            description="Neural downloads a ~60 MB voice per language once, then speaks offline with far better quality (recommended for Turkish)."
            data={[
              { value: 'system', label: 'System voices (instant)' },
              { value: 'neural', label: 'Neural voices (Piper, downloaded)' },
            ]}
            value={ttsEngine}
            onChange={(v) => { if (v) { setTtsEngineState(v as TtsEngine); setTtsEngine(v as TtsEngine); } }}
          />
        </Paper>

        <Paper withBorder radius="md" p="md">
          <NumberInput
            label="Words per day"
            description="Your DAILY word set size drawn once per day, same words all day"
            min={5} max={200} clampBehavior="blur"
            value={settings.wordsPerSession}
            onChange={(v) => typeof v === 'number' && setSettings({ wordsPerSession: v })}
          />
          <Text c="dimmed" fz="xs" mt={6}>Between 5 and 200.</Text>
        </Paper>
      </Stack>
    </AppLayout>
  );
}
