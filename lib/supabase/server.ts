import 'server-only';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export function isServerSupabaseConfigured(): boolean {
  // DATA_MODE is the sole decider for using Supabase data store across the application
  if (process.env.DATA_MODE !== 'supabase') {
    return false;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  return Boolean(
    supabaseUrl.trim() &&
    serviceRoleKey.trim() &&
    (supabaseUrl.startsWith('http://') || supabaseUrl.startsWith('https://')) &&
    !supabaseUrl.includes('your-project') &&
    !serviceRoleKey.includes('your-service-role-key')
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
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
