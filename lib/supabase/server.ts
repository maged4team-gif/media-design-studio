import 'server-only';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

function cleanEnvString(val: string | undefined): string {
  if (!val) return '';
  let s = val.trim();
  // Strip enclosing quotes
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }
  // Strip accidental multi-line or appended environment variables (e.g. key + " ADMIN_PASSWORD=...")
  if (s.includes('\n')) {
    s = s.split('\n')[0].trim();
  }
  if (s.includes(' ')) {
    s = s.split(' ')[0].trim();
  }
  return s;
}

export function isServerSupabaseConfigured(): boolean {
  // DATA_MODE is the sole decider for using Supabase data store across the application
  if (process.env.DATA_MODE !== 'supabase') {
    return false;
  }

  const supabaseUrl = cleanEnvString(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const serviceRoleKey = cleanEnvString(process.env.SUPABASE_SERVICE_ROLE_KEY);

  return Boolean(
    supabaseUrl &&
    serviceRoleKey &&
    (supabaseUrl.startsWith('http://') || supabaseUrl.startsWith('https://')) &&
    !supabaseUrl.includes('your-project') &&
    !serviceRoleKey.includes('your-service-role-key') &&
    serviceRoleKey.length >= 20
  );
}

let _testSupabaseClientOverride: SupabaseClient | null = null;

export function setTestSupabaseClient(client: any | null): void {
  _testSupabaseClientOverride = client;
}

export function getServerSupabase(): SupabaseClient | null {
  if (_testSupabaseClientOverride) {
    return _testSupabaseClientOverride;
  }

  if (!isServerSupabaseConfigured()) {
    return null;
  }
  const supabaseUrl = cleanEnvString(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const serviceRoleKey = cleanEnvString(process.env.SUPABASE_SERVICE_ROLE_KEY);

  try {
    return createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  } catch (err) {
    console.error('[Supabase Init Error]:', err);
    return null;
  }
}

