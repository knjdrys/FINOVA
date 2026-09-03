import { createClient, SupabaseClient } from '@supabase/supabase-js';

const metaEnv = (import.meta as any).env || {};
let rawUrl = (metaEnv.VITE_SUPABASE_URL || '').trim();

// Sanitize URL if user entered the full REST endpoint
if (rawUrl.endsWith('/rest/v1/')) {
  rawUrl = rawUrl.replace('/rest/v1/', '');
} else if (rawUrl.endsWith('/rest/v1')) {
  rawUrl = rawUrl.replace('/rest/v1', '');
}
if (rawUrl.endsWith('/')) {
  rawUrl = rawUrl.slice(0, -1);
}

const supabaseUrl = rawUrl;
const supabaseAnonKey = (metaEnv.VITE_SUPABASE_ANON_KEY || '').trim();

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  supabaseAnonKey &&
  supabaseUrl !== 'https://your-project-ref.supabase.co' &&
  !supabaseUrl.includes('your-project') &&
  !supabaseAnonKey.includes('your-anon-key')
);

// Supabase client instance (with offline fallback if not configured)
export const supabase: SupabaseClient = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : createClient('https://placeholder.supabase.co', 'placeholder-anon-key', {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
