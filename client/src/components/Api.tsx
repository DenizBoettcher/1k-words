import { WordEntry } from "../data/WordEntry";

export type UpdateWordBody = {
  id: string;                 // required
  lang?: string;              // optional, defaults to "turkish" on the server
  incrementCounter?: boolean; // true to ++counter
  learnResult?: boolean;      // true / false to push into history.learn
};

export async function getWords(
  lang = "turkish",
  baseUrl = "http://localhost:4000"
): Promise<WordEntry[]> {
  const resp = await fetch(`${baseUrl}/words?lang=${lang}`);
  if (!resp.ok) {
    throw new Error(`getWords failed: ${resp.status} ${resp.statusText}`);
  }
  return (await resp.json()) as WordEntry[];
}

export async function updateWordOnServer(
  body: UpdateWordBody,
  baseUrl = "http://localhost:4000"
): Promise<WordEntry> {
  const resp = await fetch(`${baseUrl}/update-word`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    // Extract JSON error message if the server provided one
    let msg = `${resp.status} ${resp.statusText}`;
    try {
      const errJson = await resp.json();
      if (errJson?.error) msg = errJson.error;
    } catch {
      /* ignore – response wasn’t JSON */
    }
    throw new Error(`updateWord failed: ${msg}`);
  }

  const { updated } = (await resp.json()) as { updated: WordEntry };
  return updated;
}
