import { ApiUrl } from "../data/ApiUrl";
import { UpdateWordBody } from "../data/UpdateWordBody";
import { WordEntry } from "../data/WordEntry";
import { getAuthHeader } from "./apiUtils";

export async function getWords(
  sourceLang : number,
  targetLang : number
): Promise<WordEntry[]> {
  const resp = await fetch(`${ApiUrl}/api/words/lang/${sourceLang},${targetLang}`, {
    method: "GET",
    headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
  });
  if (!resp.ok) {
    throw new Error(`getWords failed: ${resp.status} ${resp.statusText}`);
  }
var y = (await resp.json())
console.log(y)
  var x = y as WordEntry[]
  console.log(x)

  return x;
}

export async function updateWordOnServer(
  body: UpdateWordBody,
): Promise<WordEntry> {
  const resp = await fetch(`${ApiUrl}/api/words/update`, {
    method: "POST",
    headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
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

const charMap: Record<string, string> = {
  // Turkish specials
  ç: "c",
  ğ: "g",
  ş: "s",
  ı: "i",
  İ: "i",
  â: "a",
  î: "i",
  û: "u",

  // German special
  ß: "ss",

  // add more edge-cases if needed
};

export const normalize = (str: string): string =>
  str
    .trim()
    .toLowerCase()
    .split("")
    .map((ch) => charMap[ch] ?? ch)
    .join("");

export const isAnswerCorrect = (
  input: string,
  correctRaw: string
): boolean => {
  const accepted = correctRaw.split("/").map(normalize);
  return accepted.includes(normalize(input));
};
