/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PR_NUMBER?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
