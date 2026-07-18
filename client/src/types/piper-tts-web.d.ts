// piper-tts-web ships no type declarations minimal ambient types for our use.
// API verified against the package's official example (v1.1.2):
//  - HuggingFaceVoiceProvider.list() resolves to an OBJECT keyed by voice id.
//  - PiperWebEngine takes { voiceProvider } and generate() returns { file: Blob, phonemeData }.
declare module 'piper-tts-web' {
  export class PiperWebEngine {
    constructor(options?: { voiceProvider?: HuggingFaceVoiceProvider; onnxRuntime?: unknown });
    generate(text: string, voiceId: string, speakerId?: number): Promise<{ file: Blob; phonemeData?: unknown }>;
    expressions(phonemeData: unknown): Promise<unknown>;
  }
  export class HuggingFaceVoiceProvider {
    list(): Promise<Record<string, unknown>>;
  }
}
