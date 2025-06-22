import { useRef, useState } from 'react';
import { RequestApi } from '../utils/apiUtils';

export default function WordImportButton({
  label = 'Import JSON',
  onDone,
}: {
  label?: string;
  onDone?: (count: number) => void;
}) {
  /* refs + state -------------------------------------------------------- */
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  /* helpers ------------------------------------------------------------- */
  function resetChooser() {
    if (inputRef.current) inputRef.current.value = '';
  }

  /* main upload logic --------------------------------------------------- */
  async function handleFile(file: File) {
    setBusy(true);
    setStatus('Uploading…');

    try {
      /* 1 ─ read & parse */
      const raw = JSON.parse(await file.text());

      /* 2 ─ ensure we send an array */
      const payload = Array.isArray(raw)
        ? raw
        : Array.isArray(raw.words)
          ? raw.words
          : (() => {
            throw new Error(
              'JSON must be an array or an object with a "words" property',
            );
          })();

      /* 3 ─ POST to server */
      const res = await RequestApi("importWords/json", {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      /* 4 ─ read response safely */
      const isJson =
        res.headers.get('content-type')?.startsWith('application/json') ?? false;
      const body = isJson ? await res.json() : await res.text();

      setStatus(`✅ Imported ${body.count} entries`);
      onDone?.(body.count);
    } catch (e: any) {
      setStatus(`❌ ${e.message ?? 'Upload failed'}`);
    } finally {
      setBusy(false);
      resetChooser();
    }
  }

  /* render -------------------------------------------------------------- */
  return (
    <div className="inline-flex flex-col items-start gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {busy ? 'Please wait…' : label}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />

      {status && <span className="text-xs">{status}</span>}
    </div>
  );
}
