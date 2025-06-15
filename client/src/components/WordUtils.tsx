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
