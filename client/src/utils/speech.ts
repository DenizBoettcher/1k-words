/**
 * Text-to-speech with two engines:
 *  - 'system': the browser/OS voices (Web Speech API) — instant, quality varies.
 *  - 'neural': Piper neural voices via the `piper-tts-web` package (files self-hosted
 *    via vite-plugin-static-copy, WASM/WebGPU) — downloads a voice per language once,
 *    caches it, then speaks offline with far better quality (Turkish!).
 * Engine choice persists per device in localStorage; neural falls back to
 * system on any error (unavailable model, first-load failure, etc.).
 *
 * Performance design (words repeat constantly in a vocab trainer):
 *  1. Generated audio is cached twice: an in-memory LRU of object URLs for
 *     instant replay, and Cache Storage so clips survive reloads — each word
 *     is synthesized ONCE ever per device.
 *  2. `prefetchSpeech()` lets the study modes synthesize the whole daily set
 *     in the background; by the time a card appears its audio is usually ready.
 *  3. All generations run serialized (the engine is not reentrant); foreground
 *     speak() requests pause the prefetch loop so they are never queued behind it.
 *  4. Every generate is wrapped in a timeout: a wedged engine can never block
 *     the chain forever — it throws, the engine is recreated, system voice
 *     takes over for that utterance.
 *
 * NOTE: this package's worker engines (PiperWebWorkerEngine / OnnxWebGPUWorker)
 * are broken at runtime ("Unknown type undefined" loop, promise never settles)
 * — do NOT use them. The main-thread PiperWebEngine is the known-good path and
 * gets multithreaded WASM via the COOP/COEP headers anyway.
 *
 * Package API notes (verified against the official piper-tts-web example):
 *  - `HuggingFaceVoiceProvider.list()` resolves to an OBJECT keyed by voice id.
 *  - `engine.generate(text, voiceId, speakerId)` takes the voice-id STRING.
 *  - The response shape is { file: Blob, phonemeData, ... }.
 */

export type TtsEngine = 'system' | 'neural';
const ENGINE_KEY = 'ttsEngine';

export function getTtsEngine(): TtsEngine {
  return (localStorage.getItem(ENGINE_KEY) as TtsEngine) ?? 'system';
}
export function setTtsEngine(engine: TtsEngine): void {
  localStorage.setItem(ENGINE_KEY, engine);
}

/* ---------- system engine ---------- */
let cachedVoices: SpeechSynthesisVoice[] = [];
function loadVoices(): SpeechSynthesisVoice[] {
  if (typeof speechSynthesis === 'undefined') return [];
  const voices = speechSynthesis.getVoices();
  if (voices.length > 0) cachedVoices = voices;
  return cachedVoices;
}
if (typeof speechSynthesis !== 'undefined') {
  loadVoices();
  speechSynthesis.onvoiceschanged = () => loadVoices();
}
function hasSystemVoiceFor(lang: string): boolean {
  const prefix = lang.toLowerCase().slice(0, 2);
  return loadVoices().some((v) => v.lang.toLowerCase().startsWith(prefix));
}

function systemSpeak(text: string, lang: string): void {
  if (typeof speechSynthesis === 'undefined') return;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  const prefix = lang.toLowerCase().slice(0, 2);
  const voice = loadVoices().find((v) => v.lang.toLowerCase().startsWith(prefix));
  if (voice) utterance.voice = voice;
  utterance.rate = 0.95;
  speechSynthesis.speak(utterance);
}

/* ---------- neural engine (Piper) ---------- */
// Best default Piper voice per language prefix. Extend as needed — the full
// catalog is visible in the admin panel ("Piper voices" section).
const NEURAL_VOICES: Record<string, string> = {
  tr: 'tr_TR-dfki-medium', // fahrettin is not in the provider's catalog snapshot
  de: 'de_DE-thorsten-medium',
  en: 'en_US-hfc_female-medium',
  es: 'es_ES-davefx-medium',
  fr: 'fr_FR-siwis-medium',
  it: 'it_IT-paola-medium', // riccardo only exists as x_low; paola is medium
  ru: 'ru_RU-irina-medium',
  pt: 'pt_BR-faber-medium',
  nl: 'nl_NL-mls-medium',
  pl: 'pl_PL-darkman-medium',
};

/** One catalog entry, normalized from the voices.json object map. */
export interface NeuralVoiceInfo {
  key: string;
  languageCode: string; // e.g. "de_DE"
  languageFamily: string; // e.g. "de"
  languageNameEnglish: string;
  languageNameNative: string;
  countryEnglish: string;
  quality: string;
  numSpeakers: number;
  isAppDefault: boolean; // one of NEURAL_VOICES above
}

let piperModule: any | null = null;
let piperEngine: any | null = null;
let voiceCatalog: Record<string, any> | null = null;
let currentAudio: HTMLAudioElement | null = null;
let currentAudioUrl: string | null = null;

/** Where the piper-tts-web module is loaded from at RUNTIME.
 *  Why not a normal import: the package inlines its WASM as base64 inside one
 *  ~43 MiB JS file — bundling it (even as a lazy chunk) blows Cloudflare's
 *  25 MiB per-asset limit, and CDNs like jsdelivr 403 files over 20 MiB.
 *  So the file lives in an R2 bucket and is served by our Worker under
 *  /vendor/... on the SAME origin (see cloudflare-server/src/index.ts and the
 *  R2 setup notes in wrangler.jsonc.example).
 *  In Vite dev there is no Worker serving /vendor, so we import the file
 *  straight from node_modules via the /@fs dev-server escape hatch. */
const PIPER_VENDOR_URL = '/vendor/piper-tts-web-1.1.2.js';

async function getPiperModule(): Promise<any> {
  if (!piperModule) {
    // @vite-ignore keeps Rollup/Vite from resolving and bundling this import.
    piperModule = import.meta.env.DEV
      ? await import(/* @vite-ignore */ '/node_modules/piper-tts-web/dist/piper-tts-web.js')
      : await import(/* @vite-ignore */ PIPER_VENDOR_URL);
  }
  return piperModule;
}

/** Load (and cache) the raw voices.json object map from the HuggingFace provider. */
async function getVoiceCatalog(): Promise<Record<string, any>> {
  if (voiceCatalog) return voiceCatalog;
  const piper = await getPiperModule();
  const provider = new piper.HuggingFaceVoiceProvider();
  voiceCatalog = (await provider.list()) as Record<string, any>;
  console.log('piper voices loaded:', Object.keys(voiceCatalog).length, 'voices');
  return voiceCatalog;
}

/** Normalized, sorted catalog for the admin panel. */
export async function loadNeuralVoiceCatalog(): Promise<NeuralVoiceInfo[]> {
  const catalog = await getVoiceCatalog();
  const defaults = new Set(Object.values(NEURAL_VOICES));
  return Object.entries(catalog)
    .map(([key, voice]: [string, any]) => ({
      key,
      languageCode: voice?.language?.code ?? '',
      languageFamily: voice?.language?.family ?? '',
      languageNameEnglish: voice?.language?.name_english ?? '',
      languageNameNative: voice?.language?.name_native ?? '',
      countryEnglish: voice?.language?.country_english ?? '',
      quality: voice?.quality ?? '',
      numSpeakers: voice?.num_speakers ?? 1,
      isAppDefault: defaults.has(key),
    }))
    .sort((a, b) =>
      a.languageCode.localeCompare(b.languageCode) || a.key.localeCompare(b.key));
}

/** The default voice ids this app maps to language prefixes (for the admin panel). */
export function getConfiguredNeuralVoices(): Record<string, string> {
  return { ...NEURAL_VOICES };
}

/* ----- engine: main-thread PiperWebEngine (see NOTE above) ----- */

async function getEngine(): Promise<any> {
  if (piperEngine) return piperEngine;
  const piper = await getPiperModule();
  const provider = new piper.HuggingFaceVoiceProvider();
  piperEngine = new piper.PiperWebEngine({ voiceProvider: provider });
  return piperEngine;
}

/** Drop the engine so the next generate builds a fresh one. */
function resetEngine(): void {
  piperEngine = null;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

/** First generate per voice includes the model download — allow much longer. */
const readyVoices = new Set<string>();
const FIRST_GENERATE_TIMEOUT_MS = 180_000;
const GENERATE_TIMEOUT_MS = 25_000;

/* ----- serialized generation with foreground priority ----- */

let generationChain: Promise<void> = Promise.resolve();
let foregroundWaiting = 0;

function runExclusive<T>(taskFn: () => Promise<T>): Promise<T> {
  const result = generationChain.then(taskFn, taskFn);
  generationChain = result.then(() => undefined, () => undefined);
  return result;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/* ----- audio caches: in-memory LRU (object URLs) + Cache Storage (blobs) ----- */

const AUDIO_CACHE_NAME = 'piper-tts-audio-v1';
const MEMORY_CACHE_MAX = 500;
const memoryCache = new Map<string, string>(); // `${voiceId}|${text}` -> object URL

const memoryKey = (voiceId: string, text: string) => `${voiceId}|${text}`;
const storageKey = (voiceId: string, text: string) =>
  `/__tts-cache/${encodeURIComponent(voiceId)}/${encodeURIComponent(text)}`;

function touchMemoryEntry(key: string): string | null {
  const existing = memoryCache.get(key);
  if (!existing) return null;
  memoryCache.delete(key);
  memoryCache.set(key, existing); // move to the fresh end of the LRU
  return existing;
}

function rememberInMemory(key: string, blob: Blob): string {
  const touched = touchMemoryEntry(key);
  if (touched) return touched;
  const url = URL.createObjectURL(blob);
  memoryCache.set(key, url);
  if (memoryCache.size > MEMORY_CACHE_MAX) {
    const [oldestKey, oldestUrl] = memoryCache.entries().next().value as [string, string];
    memoryCache.delete(oldestKey);
    if (oldestUrl !== currentAudioUrl) URL.revokeObjectURL(oldestUrl);
  }
  return url;
}

async function readStorageCache(voiceId: string, text: string): Promise<Blob | null> {
  if (typeof caches === 'undefined') return null;
  try {
    const cache = await caches.open(AUDIO_CACHE_NAME);
    const hit = await cache.match(storageKey(voiceId, text));
    return hit ? await hit.blob() : null;
  } catch { return null; }
}

async function writeStorageCache(voiceId: string, text: string, blob: Blob): Promise<void> {
  if (typeof caches === 'undefined') return;
  try {
    const cache = await caches.open(AUDIO_CACHE_NAME);
    await cache.put(storageKey(voiceId, text), new Response(blob, {
      headers: { 'Content-Type': 'audio/wav' },
    }));
  } catch { /* private mode / quota — memory cache still works */ }
}

/** True if a clip is already available without synthesis (memory or storage). */
async function isCached(voiceId: string, text: string): Promise<boolean> {
  if (memoryCache.has(memoryKey(voiceId, text))) return true;
  return (await readStorageCache(voiceId, text)) !== null;
}

/* ----- generation pipeline: caches → engine (serialized) ----- */

/** In-flight generations keyed like the memory cache. A foreground speak()
 *  for a word the prefetcher is ALREADY synthesizing attaches to that promise
 *  instead of queueing a duplicate generation behind it. */
const inFlightGenerations = new Map<string, Promise<Blob>>();

function generateShared(text: string, voiceId: string): Promise<Blob> {
  const key = memoryKey(voiceId, text);
  const existing = inFlightGenerations.get(key);
  if (existing) return existing;
  const generation = runExclusive(() => generateWithEngine(text, voiceId));
  inFlightGenerations.set(key, generation);
  generation.then(
    () => inFlightGenerations.delete(key),
    () => inFlightGenerations.delete(key),
  );
  return generation;
}

async function generateWithEngine(text: string, voiceId: string): Promise<Blob> {
  const timeoutMs = readyVoices.has(voiceId) ? GENERATE_TIMEOUT_MS : FIRST_GENERATE_TIMEOUT_MS;
  const attempt = async (): Promise<Blob> => {
    const engine = await getEngine();
    const response: any = await withTimeout(
      engine.generate(text, voiceId, 0), timeoutMs, `piper generate("${text}")`);
    const blob: Blob | null =
      response?.file instanceof Blob ? response.file
      : response instanceof Blob ? response
      : null;
    if (!blob) throw new Error('piper result shape unknown');
    readyVoices.add(voiceId);
    return blob;
  };
  try {
    return await attempt();
  } catch (error) {
    // A wedged/broken engine instance must not poison later calls — rebuild
    // once and retry; if that fails too, the caller falls back to system voice.
    console.warn('piper generate failed, recreating engine and retrying once', error);
    resetEngine();
    return attempt();
  }
}

/** Resolve a playable object URL for (text, voiceId), synthesizing if needed.
 *  Priority handling lives in the caller (neuralSpeak raises foregroundWaiting). */
async function getAudioUrl(text: string, voiceId: string, _foreground: boolean): Promise<string> {
  const key = memoryKey(voiceId, text);
  const inMemory = touchMemoryEntry(key);
  if (inMemory) return inMemory;

  const stored = await readStorageCache(voiceId, text);
  if (stored) return rememberInMemory(key, stored);

  const blob = await generateShared(text, voiceId);
  void writeStorageCache(voiceId, text, blob);
  return rememberInMemory(key, blob);
}

async function neuralSpeak(text: string, lang: string): Promise<boolean> {
  const voiceId = NEURAL_VOICES[lang.toLowerCase().slice(0, 2)];
  if (!voiceId) return false;
  // Raise the priority flag BEFORE any await — otherwise the prefetch pump can
  // grab the generation chain (incl. a cold-start model download) first and
  // the user's word queues behind it.
  foregroundWaiting += 1;
  try {
    const catalog = await getVoiceCatalog();
    if (!catalog[voiceId]) {
      console.warn(`piper: voice "${voiceId}" not in catalog — falling back to system`);
      return false;
    }

    // Cold start (engine/model not warmed for this voice yet) and nothing
    // cached: don't sit in silence for seconds. Speak the system voice NOW if
    // the OS has one for this language, and warm the neural clip in the
    // background — the next occurrence plays neural instantly.
    if (!readyVoices.has(voiceId) && !(await isCached(voiceId, text))) {
      enqueuePrefetchItem(text, voiceId, true);
      if (hasSystemVoiceFor(lang)) return false; // caller plays system voice
      // No usable system voice (e.g. Turkish on many devices) — waiting for
      // neural is still the better experience than a mangled default voice.
    }

    const url = await getAudioUrl(text, voiceId, false);
    currentAudio?.pause();
    currentAudio = new Audio(url);
    currentAudioUrl = url;
    // Browsers block autoplay before the first user interaction — the clip is
    // generated and cached anyway, so the next occurrence plays fine.
    currentAudio.play().catch((error) =>
      console.warn('audio playback blocked (autoplay policy?)', error?.name ?? error));
    return true;
  } catch (error) {
    console.warn('neural TTS failed, falling back to system voice', error);
    return false;
  } finally {
    foregroundWaiting -= 1;
  }
}

/* ----- background prefetch (daily-set warm-up) ----- */

const prefetchQueue: Array<{ text: string; voiceId: string }> = [];
const queuedKeys = new Set<string>();
let prefetchRunning = false;

/** Add one item; `urgent` puts it at the FRONT (cold-start foreground words). */
function enqueuePrefetchItem(text: string, voiceId: string, urgent = false): void {
  const key = memoryKey(voiceId, text);
  if (memoryCache.has(key) || queuedKeys.has(key)) return;
  queuedKeys.add(key);
  if (urgent) prefetchQueue.unshift({ text, voiceId });
  else prefetchQueue.push({ text, voiceId });
  void pumpPrefetchQueue();
}

async function pumpPrefetchQueue(): Promise<void> {
  if (prefetchRunning) return;
  prefetchRunning = true;
  try {
    // Grace delay: a card mounting right now auto-speaks within a frame or
    // two — let that foreground request claim the engine first instead of
    // starting a cold-start generation it would have to wait behind.
    await sleep(600);
    while (prefetchQueue.length > 0) {
      if (getTtsEngine() !== 'neural') { prefetchQueue.length = 0; break; }
      // Foreground speak() requests take priority — pause instead of competing.
      if (foregroundWaiting > 0) { await sleep(120); continue; }
      const item = prefetchQueue.shift()!;
      queuedKeys.delete(memoryKey(item.voiceId, item.text));
      try {
        if (await isCached(item.voiceId, item.text)) continue;
        const blob = await generateShared(item.text, item.voiceId);
        void writeStorageCache(item.voiceId, item.text, blob);
        rememberInMemory(memoryKey(item.voiceId, item.text), blob);
      } catch (error) {
        console.warn('prefetch failed for', item.text, error);
      }
      await sleep(30); // breathe between items; keeps the tab responsive
    }
  } finally {
    prefetchRunning = false;
  }
}

/**
 * Warm the audio cache for a set of texts in one language, in the background.
 * No-op unless the neural engine is active. Safe to call repeatedly — items
 * already cached or queued are skipped. Study modes call this with the daily
 * set so cards speak instantly by the time they appear.
 */
export function prefetchSpeech(texts: string[], lang: string): void {
  if (getTtsEngine() !== 'neural') return;
  const voiceId = NEURAL_VOICES[lang.toLowerCase().slice(0, 2)];
  if (!voiceId) return;
  for (const raw of texts) {
    const text = raw.trim();
    if (text) enqueuePrefetchItem(text, voiceId);
  }
}

/* ----- eager warm-up: load module, catalog and engine while the app boots,
 * so the first word only pays for model download + synthesis, not setup. ----- */
if (typeof window !== 'undefined') {
  const warmUp = () => {
    if (getTtsEngine() !== 'neural') return;
    void getVoiceCatalog().catch(() => {});
    void getEngine().catch(() => {});
  };
  const scheduleIdle: (fn: () => void) => void =
    (window as any).requestIdleCallback ?? ((fn: () => void) => setTimeout(fn, 1200));
  scheduleIdle(warmUp);
}

/* ---------- public API ---------- */
export function speechAvailable(): boolean {
  return typeof speechSynthesis !== 'undefined';
}

export function speak(text: string, lang: string): void {
  const clean = text.trim();
  if (!clean) return;
  if (getTtsEngine() === 'neural') {
    void neuralSpeak(clean, lang).then((ok) => { if (!ok) systemSpeak(clean, lang); });
    return;
  }
  systemSpeak(clean, lang);
}

export function stopSpeaking(): void {
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
  currentAudio?.pause();
}
