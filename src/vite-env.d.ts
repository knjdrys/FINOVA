/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase project URL. Undefined when running without a backend. */
  readonly VITE_SUPABASE_URL?: string;
  /** Supabase anon (public) key. Undefined when running without a backend. */
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
