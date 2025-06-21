import { useSettings } from '../utils/settingUtils';
import { DEFAULT_SETTINGS } from '../data/Settings';

export default function SettingsPage() {
  const { settings, setSettings } = useSettings();

  return (
    <div className="mx-auto max-w-md space-y-6 p-8">
      <h1 className="text-2xl font-semibold">Settings</h1>

      {/* Language pair ----------------------------------- */}
      <section className="space-y-2">
        <label className="block">
          <span className="text-sm font-medium">Source language ID</span>
          <input
            type="number"
            className="mt-1 w-full rounded border px-3 py-2"
            value={settings.sourceLangId}
            onChange={(e) => setSettings({ sourceLangId: Number(e.target.value) })}
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium">Target language ID</span>
          <input
            type="number"
            className="mt-1 w-full rounded border px-3 py-2"
            value={settings.targetLangId}
            onChange={(e) => setSettings({ targetLangId: Number(e.target.value) })}
          />
        </label>
      </section>

      {/* Dark-mode toggle -------------------------------- */}
      <section className="flex items-center gap-3">
        <input
          id="darkToggle"
          type="checkbox"
          checked={settings.darkMode}
          onChange={(e) => setSettings({ darkMode: e.target.checked })}
        />
        <label htmlFor="darkToggle">Enable dark mode</label>
      </section>

      {/* Words-per-session ------------------------------- */}
      <section>
        <label className="block">
          <span className="text-sm font-medium">Words per study session</span>
          <input
            type="number"
            min={5}
            max={100}
            className="mt-1 w-full rounded border px-3 py-2"
            value={settings.wordsPerSession}
            onChange={(e) => setSettings({ wordsPerSession: Number(e.target.value) })}
          />
        </label>
      </section>

      {/* Reset button ------------------------------------- */}
      <button
        className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white"
        onClick={() => setSettings(DEFAULT_SETTINGS)}
      >
        Reset to defaults
      </button>
    </div>
  );
}
