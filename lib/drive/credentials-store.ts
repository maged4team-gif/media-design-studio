import 'server-only';
import crypto from 'crypto';
import { getServerSupabase } from '@/lib/supabase/server';

export interface DriveCredentialsRecord {
  refreshToken: string;
  rootFolderId?: string;
  updatedAt?: string;
}

/**
 * Derives a strictly 32-byte (256-bit) encryption key from the environment.
 * Uses DRIVE_CREDENTIALS_ENCRYPTION_KEY, falling back to SESSION_SECRET.
 */
function getEncryptionKey(): Buffer {
  const rawKey =
    process.env.DRIVE_CREDENTIALS_ENCRYPTION_KEY ||
    process.env.SESSION_SECRET ||
    'fallback-secure-encryption-key-for-drive-studio-2027';

  return crypto.createHash('sha256').update(rawKey).digest();
}

/**
 * Encrypts plaintext using AES-256-GCM with a fresh random 96-bit IV.
 */
export function encrypt(text: string): { encrypted: string; iv: string; authTag: string } {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12); // Standard 96-bit IV for AES-GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return {
    encrypted,
    iv: iv.toString('hex'),
    authTag,
  };
}

/**
 * Decrypts AES-256-GCM ciphertext and validates the authentication tag.
 */
export function decrypt({
  encrypted,
  iv,
  authTag,
}: {
  encrypted: string;
  iv: string;
  authTag: string;
}): string {
  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(authTag, 'hex'));

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

// In-memory cache for warm Serverless invocations
let cachedCredentials: DriveCredentialsRecord | null = null;
let cachedCredentialsExpiry = 0;
const CREDENTIALS_CACHE_TTL_MS = 60 * 1000; // 60 seconds TTL

export function resetCredentialsStoreCache(): void {
  cachedCredentials = null;
  cachedCredentialsExpiry = 0;
}

/**
 * Saves Google Drive credentials encrypted into the persistent Supabase store.
 */
export async function saveDriveCredentials(params: {
  refreshToken: string;
  rootFolderId?: string;
}): Promise<void> {
  const trimmedToken = params.refreshToken.trim();
  const { encrypted, iv, authTag } = encrypt(trimmedToken);
  const now = new Date().toISOString();

  // Update in-memory cache immediately
  cachedCredentials = {
    refreshToken: trimmedToken,
    rootFolderId: params.rootFolderId,
    updatedAt: now,
  };
  cachedCredentialsExpiry = Date.now() + CREDENTIALS_CACHE_TTL_MS;

  const supabase = getServerSupabase();
  if (!supabase) {
    console.warn('[CredentialsStore] Supabase is not configured or offline; updated in-memory cache only.');
    return;
  }

  const payload: any = {
    id: 'primary',
    encrypted_refresh_token: encrypted,
    iv,
    auth_tag: authTag,
    updated_at: now,
  };

  if (params.rootFolderId) {
    payload.root_folder_id = params.rootFolderId;
  }

  const { error } = await supabase
    .from('google_drive_credentials')
    .upsert(payload, { onConflict: 'id' });

  if (error) {
    console.error('[CredentialsStore] Error saving credentials to Supabase:', error.message);
    if (error.code === '42P01' || error.message?.includes('does not exist')) {
      throw new Error(
        'MIGRATION_REQUIRED: جدول google_drive_credentials غير موجود في Supabase. يرجى تشغيل Migration 010 في SQL Editor.'
      );
    }
    throw new Error(`DB_CREDENTIALS_SAVE_FAILED: ${error.message}`);
  }
}

/**
 * Retrieves and decrypts Google Drive credentials from Supabase persistent store.
 */
export async function getDriveCredentials(): Promise<DriveCredentialsRecord | null> {
  if (cachedCredentials && cachedCredentialsExpiry > Date.now()) {
    return cachedCredentials;
  }

  const supabase = getServerSupabase();
  if (!supabase) {
    return cachedCredentials;
  }

  try {
    const { data, error } = await supabase
      .from('google_drive_credentials')
      .select('encrypted_refresh_token, iv, auth_tag, root_folder_id, updated_at')
      .eq('id', 'primary')
      .maybeSingle();

    if (error || !data) {
      if (error && error.code !== 'PGRST116') {
        console.warn('[CredentialsStore] Could not load from google_drive_credentials:', error.message);
      }
      return null;
    }

    const refreshToken = decrypt({
      encrypted: data.encrypted_refresh_token,
      iv: data.iv,
      authTag: data.auth_tag,
    });

    cachedCredentials = {
      refreshToken,
      rootFolderId: data.root_folder_id || undefined,
      updatedAt: data.updated_at,
    };
    cachedCredentialsExpiry = Date.now() + CREDENTIALS_CACHE_TTL_MS;

    return cachedCredentials;
  } catch (err: any) {
    console.error('[CredentialsStore] Decryption or fetch error:', err.message);
    return null;
  }
}

/**
 * Updates root_folder_id in the persistent Supabase credentials store.
 */
export async function updateDriveRootFolder(rootFolderId: string): Promise<void> {
  if (cachedCredentials) {
    cachedCredentials.rootFolderId = rootFolderId;
  }

  const supabase = getServerSupabase();
  if (!supabase) return;

  try {
    const { error } = await supabase
      .from('google_drive_credentials')
      .update({
        root_folder_id: rootFolderId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 'primary');

    if (error) {
      console.warn('[CredentialsStore] Could not update root_folder_id in Supabase:', error.message);
    }
  } catch (err: any) {
    console.warn('[CredentialsStore] Failed to update root folder id:', err?.message);
  }
}
