/**
 * Single source of truth for the application signing secret (SESSION_SECRET).
 *
 * - Production: SESSION_SECRET is mandatory (>= 16 chars, 32+ recommended).
 *   A missing or short secret throws CONFIG_ERROR instead of silently falling
 *   back to a value that is public in the source code (which would let anyone
 *   forge admin sessions, upload tickets and OAuth state).
 * - Development / tests: a clearly-labelled insecure fallback is used, with a
 *   one-time warning, so local work keeps running without configuration.
 */

const MIN_SECRET_LENGTH = 16;
const DEV_ONLY_FALLBACK = 'insecure-dev-only-session-secret-never-use-in-production';

let warnedAboutFallback = false;

export function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Returns the raw configured SESSION_SECRET if it is long enough, otherwise null.
 */
export function getConfiguredSessionSecret(): string | null {
  const secret = process.env.SESSION_SECRET?.trim();
  return secret && secret.length >= MIN_SECRET_LENGTH ? secret : null;
}

export function getAppSecret(): string {
  const configured = getConfiguredSessionSecret();
  if (configured) return configured;

  if (isProductionRuntime()) {
    throw new Error(
      `CONFIG_ERROR: SESSION_SECRET must be set to a random value of at least ${MIN_SECRET_LENGTH} characters (32+ recommended) in production.`
    );
  }

  if (!warnedAboutFallback) {
    warnedAboutFallback = true;
    console.warn(
      '[Security Warning] SESSION_SECRET is missing or shorter than 16 characters. Using an insecure development-only fallback secret.'
    );
  }
  return DEV_ONLY_FALLBACK;
}
