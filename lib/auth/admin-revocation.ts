import 'server-only';
import fs from 'fs';
import path from 'path';
import { getServerSupabase, isServerSupabaseConfigured } from '@/lib/supabase/server';

/**
 * Server-side revocation for stateless admin session cookies.
 *
 * Every admin token carries `iat` (issued-at, ms). A single persisted timestamp
 * `sessions_valid_after` invalidates every token issued before it — this powers
 * "log out of all devices" and lets a leaked cookie be killed immediately.
 *
 * Storage: Supabase table `admin_security_state` (migration 012) when Supabase is
 * configured, otherwise a local `.data/admin-security.json` file (demo mode).
 * Reads are cached briefly because getAdminSession runs on every admin/media request;
 * a revocation therefore reaches other server instances within CACHE_TTL_MS.
 */

const CACHE_TTL_MS = 30 * 1000;
const ROW_ID = 'primary';

let cachedValidAfter = 0;
let cacheExpiresAt = 0;
let warnedMissingTable = false;

function getLocalStateFile(): string {
  const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NODE_ENV === 'production');
  const dir = isServerless ? path.join('/tmp', '.data') : path.join(process.cwd(), '.data');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'admin-security.json');
}

function isMissingTableError(error: { code?: string; message?: string } | null | undefined): boolean {
  return Boolean(error && (error.code === '42P01' || error.code === 'PGRST205' || error.message?.includes('admin_security_state')));
}

function getSupabaseOrThrowIfUnavailable() {
  const supabase = getServerSupabase();
  // Supabase is configured but temporarily marked unhealthy: do NOT fall back to the
  // local file (that would silently resurrect revoked sessions). Callers keep the
  // last known cut-off instead.
  if (!supabase && isServerSupabaseConfigured()) {
    throw new Error('Supabase is configured but currently unavailable');
  }
  return supabase;
}

async function loadValidAfter(): Promise<number> {
  const supabase = getSupabaseOrThrowIfUnavailable();
  if (supabase) {
    const { data, error } = await supabase
      .from('admin_security_state')
      .select('sessions_valid_after')
      .eq('id', ROW_ID)
      .maybeSingle();

    if (error) {
      if (isMissingTableError(error)) {
        if (!warnedMissingTable) {
          warnedMissingTable = true;
          console.warn('[Admin Sessions] Table admin_security_state is missing. Apply migration 012 to enable "log out of all devices".');
        }
        return 0;
      }
      throw new Error(error.message);
    }
    return data?.sessions_valid_after ? new Date(data.sessions_valid_after).getTime() : 0;
  }

  try {
    const file = getLocalStateFile();
    if (!fs.existsSync(file)) return 0;
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return typeof parsed.sessionsValidAfter === 'number' ? parsed.sessionsValidAfter : 0;
  } catch {
    return 0;
  }
}

/**
 * Returns the cut-off (ms since epoch): admin tokens issued before it are rejected.
 * On a transient read failure the last known value is kept (never silently reset).
 */
export async function getAdminSessionsValidAfter(): Promise<number> {
  if (cacheExpiresAt > Date.now()) return cachedValidAfter;
  try {
    cachedValidAfter = await loadValidAfter();
  } catch (err: any) {
    console.error('[Admin Sessions] Could not read revocation state, keeping last known value:', err?.message || err);
  }
  cacheExpiresAt = Date.now() + CACHE_TTL_MS;
  return cachedValidAfter;
}

/**
 * Invalidates every admin session issued up to now (all devices).
 * Throws MIGRATION_REQUIRED if the Supabase table has not been created yet.
 */
export async function revokeAllAdminSessions(): Promise<number> {
  const now = Date.now();
  const supabase = getSupabaseOrThrowIfUnavailable();

  if (supabase) {
    const { error } = await supabase
      .from('admin_security_state')
      .upsert({ id: ROW_ID, sessions_valid_after: new Date(now).toISOString(), updated_at: new Date(now).toISOString() }, { onConflict: 'id' });
    if (error) {
      if (isMissingTableError(error)) {
        throw new Error('MIGRATION_REQUIRED: جدول admin_security_state غير موجود. يرجى تطبيق Migration 012 في Supabase.');
      }
      throw new Error(`ADMIN_REVOKE_FAILED: ${error.message}`);
    }
  } else {
    fs.writeFileSync(getLocalStateFile(), JSON.stringify({ sessionsValidAfter: now }, null, 2), 'utf8');
  }

  cachedValidAfter = now;
  cacheExpiresAt = Date.now() + CACHE_TTL_MS;
  return now;
}

export function resetAdminRevocationCache(): void {
  cachedValidAfter = 0;
  cacheExpiresAt = 0;
}
