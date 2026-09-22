import 'server-only';
import { cookies } from 'next/headers';
import crypto from 'crypto';

/**
 * Validates and retrieves required secrets with strict production enforcement
 */
const INSECURE_SESSION_SECRETS = new Set([
  'media-studio-broadcast-secret-salt-2027',
  'dev-local-only-insecure-secret-key-32-chars-minimum-length-needed',
  'your-strong-random-session-secret-min-32-chars',
  'change-this-to-a-secure-random-secret',
  'example-session-secret-replace-in-prod',
  '<generate-at-least-32-chars-cryptographic-random-secret>',
]);

const INSECURE_ADMIN_PASSWORDS = new Set([
  'admin2027',
  'admin',
  'password',
  '12345678',
  'admin123',
  'change-this-to-a-secure-admin-password',
  '<change-this-to-a-secure-admin-password>',
]);

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  const isProd = process.env.NODE_ENV === 'production';

  if (isProd) {
    if (!secret || secret.trim() === '') {
      throw new Error('CONFIG_FATAL: Required environment variable SESSION_SECRET is not set in production.');
    }
    if (secret.length < 32) {
      throw new Error('CONFIG_FATAL: SESSION_SECRET must be at least 32 characters in production for cryptographic safety.');
    }
    if (INSECURE_SESSION_SECRETS.has(secret.trim())) {
      throw new Error('CONFIG_FATAL: SESSION_SECRET cannot use an insecure default, example, or placeholder in production.');
    }
    return secret;
  }

  if (!secret || secret.trim() === '') {
    return 'dev-local-only-insecure-secret-key-32-chars-minimum-length-needed';
  }
  return secret;
}

function getAdminPassword(): string {
  const pass = process.env.ADMIN_PASSWORD;
  const isProd = process.env.NODE_ENV === 'production';

  if (isProd) {
    if (!pass || pass.trim() === '') {
      throw new Error('CONFIG_FATAL: Required environment variable ADMIN_PASSWORD is not set in production.');
    }
    if (pass.length < 10) {
      throw new Error('CONFIG_FATAL: ADMIN_PASSWORD must be at least 10 characters in production.');
    }
    if (INSECURE_ADMIN_PASSWORDS.has(pass.trim())) {
      throw new Error('CONFIG_FATAL: ADMIN_PASSWORD cannot use an insecure default, example, or placeholder in production.');
    }
    return pass;
  }

  if (!pass || pass.trim() === '') {
    return 'admin2027'; // Local development fallback only
  }
  return pass;
}

export interface ClientSessionData {
  linkId: string;
  slug: string;
  viewerName: string;
  sessionVersion: number;
  expiresAt: number;
}

export interface AdminSessionData {
  isAdmin: boolean;
  expiresAt: number;
}

/**
 * Constant-time comparison to prevent timing attacks
 */
export function timingSafeEqualString(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf-8');
  const bufB = Buffer.from(b, 'utf-8');
  if (bufA.length !== bufB.length) {
    // Perform dummy timing-safe equal to mitigate timing discrepancy
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Sign data with HMAC SHA-256
 */
function sign(data: string): string {
  return crypto.createHmac('sha256', getSessionSecret()).update(data).digest('base64url');
}

/**
 * Encodes payload into a signed cookie string
 */
export function createSignedToken(payload: object): string {
  const json = JSON.stringify(payload);
  const base64 = Buffer.from(json).toString('base64url');
  const signature = sign(base64);
  return `${base64}.${signature}`;
}

/**
 * Verifies and decodes a signed token with timing-safe signature comparison
 */
export function verifySignedToken<T>(token: string | undefined): T | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [base64, signature] = parts;

  const expectedSignature = sign(base64);
  if (!timingSafeEqualString(signature, expectedSignature)) {
    return null;
  }

  try {
    const json = Buffer.from(base64, 'base64url').toString('utf-8');
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

// -------------------------------------------------------------
// Client Viewer Session
// -------------------------------------------------------------

export async function setClientSession(
  linkId: string,
  slug: string,
  viewerName: string,
  sessionVersion: number = 1
) {
  const cookieStore = await cookies();
  const session: ClientSessionData = {
    linkId,
    slug,
    viewerName,
    sessionVersion,
    expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 7, // 7 days
  };
  const token = createSignedToken(session);

  cookieStore.set(`client_session_${slug}`, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function getClientSession(
  slug: string,
  cookieOrTokenOverride?: string
): Promise<ClientSessionData | null> {
  let token: string | undefined = cookieOrTokenOverride;

  if (!token) {
    try {
      const cookieStore = await cookies();
      token = cookieStore.get(`client_session_${slug}`)?.value;
    } catch {
      // Outside Next.js request context (e.g. CLI test or script without mock request store)
      return null;
    }
  } else if (token.includes('=')) {
    // Parse cookie header format: client_session_slug=...
    const match = token.match(new RegExp(`(?:^|;\\s*)client_session_${slug}=([^;]*)`));
    token = match ? decodeURIComponent(match[1]) : undefined;
  }

  if (!token) return null;

  const session = verifySignedToken<ClientSessionData>(token);
  if (!session) return null;

  // Explicit type and range validation
  if (
    typeof session.linkId !== 'string' ||
    typeof session.slug !== 'string' ||
    typeof session.viewerName !== 'string' ||
    typeof session.sessionVersion !== 'number' ||
    typeof session.expiresAt !== 'number'
  ) {
    return null;
  }

  // Verify slug match and expiry
  if (session.slug !== slug || session.expiresAt < Date.now()) {
    return null;
  }

  return session;
}

export async function clearClientSession(slug: string) {
  const cookieStore = await cookies();
  cookieStore.delete(`client_session_${slug}`);
}

// -------------------------------------------------------------
// Admin Session
// -------------------------------------------------------------

export async function setAdminSession() {
  const cookieStore = await cookies();
  const payload: AdminSessionData = {
    isAdmin: true,
    expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 14, // 14 days
  };
  const token = createSignedToken(payload);

  cookieStore.set('admin_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 14,
  });
}

export function extractCookieFromRequest(req: Request, cookieName: string): string | undefined {
  const cookieHeader = req.headers.get('cookie');
  if (!cookieHeader) return undefined;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${cookieName}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

export async function getAdminSession(cookieOrTokenOverride?: string): Promise<boolean> {
  let token: string | undefined = cookieOrTokenOverride;

  if (!token) {
    try {
      const cookieStore = await cookies();
      token = cookieStore.get('admin_session')?.value;
    } catch {
      return false;
    }
  }

  if (!token) return false;

  const session = verifySignedToken<AdminSessionData>(token);
  if (!session) return false;

  if (
    typeof session.isAdmin !== 'boolean' ||
    !session.isAdmin ||
    typeof session.expiresAt !== 'number' ||
    session.expiresAt < Date.now()
  ) {
    return false;
  }

  return true;
}

export async function clearAdminSession() {
  const cookieStore = await cookies();
  cookieStore.delete('admin_session');
}

export function verifyAdminPassword(password: string): boolean {
  const configuredPassword = getAdminPassword();
  return timingSafeEqualString(password, configuredPassword);
}
