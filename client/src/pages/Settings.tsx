/* src/pages/Settings.tsx */
import { useEffect, useState, useMemo } from 'react';
import { useSettings } from '../utils/settingUtils';
import WordImportButton from '../components/WordImportButton';
import { BaseUrl } from '../data/BaseUrl';
import { Lang } from '../data/Lang';
import { DEFAULT_SETTINGS, Settings } from '../data/Settings';
import { getAuthHeader } from '../utils/apiUtils';

export default function SettingsPage() {
  const { settings, setSettings } = useSettings();

  /* ---------- languages from server ---------- */
  const [langs, setLangs] = useState<Lang[]>([]);
  const [loadingLangs, setLoadingLangs] = useState(true);
  const [langError, setLangError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${BaseUrl}/api/words/lang`, {
          headers: getAuthHeader(),
        });
        if (!res.ok) throw new Error(await res.text());
        setLangs((await res.json()) as Lang[]);
      } catch (e: any) {
        setLangError(e.message ?? 'fetch error');
      } finally {
        setLoadingLangs(false);
      }
    })();
  }, []);

  /* ---------- local form state ---------- */
  const [form, setForm] = useState<Settings>(settings);

  /* keep form in sync when settings change from elsewhere */
  useEffect(() => setForm(settings), [settings]);

  /* ---------- derived: is dirty? ---------- */
  const dirty = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(settings),
    [form, settings],
  );

  /* ---------- handlers ---------- */
  const onSave = () => {
    if (!dirty) return;
    setSettings(form);                 // persists to backend (see util)
  };

  /* ---------- UI ---------- */
  const langOptions = langs.map((l) => (
    <option key={l.id} value={l.id}>
      {l.code.toUpperCase()} – {l.name}
    </option>
  ));

  return (
    <div className="mx-auto max-w-md space-y-6 p-8">
      <h1 className="text-2xl font-semibold">Settings</h1>

      {loadingLangs && <p>Loading languages…</p>}
      {langError && <p className="text-red-600">⚠ {langError}</p>}

      {!loadingLangs && !langError && (
        <>
          {/* Language pair ------------------------------------------------ */}
          <section className="space-y-2">
            <label className="block">
              <span className="text-sm font-medium">Source language</span>
              <select
                className="mt-1 w-full rounded border px-3 py-2"
                value={form.sourceLangId}
                onChange={(e) =>
                  setForm({ ...form, sourceLangId: Number(e.target.value) })
                }
              >
                {langOptions}
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-medium">Target language</span>
              <select
                className="mt-1 w-full rounded border px-3 py-2"
                value={form.targetLangId}
                onChange={(e) =>
                  setForm({ ...form, targetLangId: Number(e.target.value) })
                }
              >
                {langOptions}
              </select>
            </label>
          </section>

          {/* Dark mode ---------------------------------------------------- */}
          <section className="flex items-center gap-3">
            <input
              id="darkToggle"
              type="checkbox"
              checked={form.darkMode}
              onChange={(e) =>
                setForm({ ...form, darkMode: e.target.checked })
              }
            />
            <label htmlFor="darkToggle">Enable dark mode</label>
          </section>

          {/* Words per session ------------------------------------------- */}
          <section>
            <label className="block">
              <span className="text-sm font-medium">Words per study session</span>
              <input
                type="number"
                min={5}
                max={100}
                className="mt-1 w-full rounded border px-3 py-2"
                /* show empty string while the user is editing/clearing */
                value={form.wordsPerSession === 0 ? '' : form.wordsPerSession}
                onChange={(e) => {
                  const num = parseInt(e.target.value, 10);
                  setForm({
                    ...form,
                    /*  keep 0 as placeholder but never below min */
                    wordsPerSession: Number.isNaN(num) ? 0 : num,
                  });
                }}
                onBlur={() => {
                  /* enforce min/max after focus leaves the field */
                  setForm((prev) => ({
                    ...prev,
                    wordsPerSession: Math.min(
                      100,
                      Math.max(5, prev.wordsPerSession || DEFAULT_SETTINGS.wordsPerSession),
                    ),
                  }));
                }}
                placeholder={DEFAULT_SETTINGS.wordsPerSession.toString()}
              />
            </label>
          </section>

          {/* Save button -------------------------------------------------- */}
          <button
            type="button"
            disabled={!dirty}
            onClick={onSave}
            className={`mt-2 rounded px-4 py-2 text-sm font-medium text-white
              ${dirty ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-400'}`}
          >
            {dirty ? 'Save changes' : '✓ Saved'}
          </button>

          {/* Reset -------------------------------------------------------- */}
          <button
            className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white"
            onClick={() => setForm(DEFAULT_SETTINGS)}
          >
            Reset Settings
          </button>

          {/* Bulk import -------------------------------------------------- */}
          <section className="pt-6">
            <h2 className="mb-3 text-lg font-semibold">Bulk import</h2>
            <WordImportButton onDone={(n) => console.log(`${n} words added`)} />
          </section>
        </>
      )}
    </div>
  );
}
