import crypto from 'crypto';

/**
 * Generates a clean, URL-safe random slug
 * Example: x7K29AbC
 */
export function generateSlug(length: number = 8): string {
  const charset = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz';
  let result = '';
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    result += charset[bytes[i] % charset.length];
  }
  return result;
}
