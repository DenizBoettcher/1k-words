/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional override for the API origin (dev against a remote worker). */
  readonly VITE_API_URL?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
