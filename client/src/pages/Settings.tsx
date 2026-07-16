import { useEffect, useState } from 'react';
import { Stack, Title, Paper, Select, Switch, NumberInput, Text } from '@mantine/core';
import { useMantineColorScheme, useComputedColorScheme } from '@mantine/core';
import AppLayout from '../components/AppLayout';
import { useSettings } from '../utils/settingUtils';
import { getStudyableLists } from '../utils/listsApi';
import { StudyableList } from '../data/List';

export default function SettingsPage() {
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
        </Paper>

        <Paper withBorder radius="md" p="md">
          <NumberInput
            label="Words per study session"
            description="How many cards you get each round"
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
