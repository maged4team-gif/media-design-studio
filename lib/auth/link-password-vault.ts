import crypto from 'crypto';
import { getAppSecret } from '@/lib/auth/secret';

/**
 * Reversible at-rest encryption for client access-link passwords.
 *
 * Client logins are verified ONLY against the bcrypt `password_hash`.
 * This vault exists solely so the studio admin can still view/copy/share a
 * link's password from the admin panel, without the database (or the local
 * demo JSON files) ever holding it in plain text.
 *
 * Format: `enc:v1:<iv hex>:<auth tag hex>:<ciphertext hex>` (AES-256-GCM).
 * Key: LINK_PASSWORD_ENCRYPTION_KEY if set, else SESSION_SECRET, domain-separated.
 * Rotating that key makes stored values unreadable (admin sees no password and
 * can set a new one); logins keep working because they use the bcrypt hash.
 */

const PREFIX = 'enc:v1:';

function getVaultKey(): Buffer {
  const base = process.env.LINK_PASSWORD_ENCRYPTION_KEY?.trim() || getAppSecret();
  return crypto.createHash('sha256').update(`link-password-vault:v1:${base}`).digest();
}

export function isSealedLinkPassword(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

export function sealLinkPassword(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getVaultKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('hex')}:${tag.toString('hex')}:${ciphertext.toString('hex')}`;
}

/**
 * Seals a value unless it is empty or already sealed.
 */
export function sealIfNeeded(value: string | null | undefined): string | null {
  if (!value) return null;
  return isSealedLinkPassword(value) ? value : sealLinkPassword(value);
}

/**
 * Returns the readable password for admin display.
 * - Sealed values are decrypted (null if the key changed or data is corrupt).
 * - Legacy plain-text values (written before this vault existed) are returned
 *   as-is so they can be shown once and re-sealed by the caller.
 */
export function revealLinkPassword(stored: string | null | undefined): string | null {
  if (!stored) return null;
  if (!isSealedLinkPassword(stored)) return stored;

  try {
    const [ivHex, tagHex, dataHex] = stored.slice(PREFIX.length).split(':');
    const decipher = crypto.createDecipheriv('aes-256-gcm', getVaultKey(), Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
