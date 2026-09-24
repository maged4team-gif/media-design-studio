import 'server-only';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  getDriveCredentials,
  updateDriveRootFolder,
  resetCredentialsStoreCache,
} from './credentials-store';

/**
 * Google Drive API v3 Native Integration Client
 * Implements:
 * 1. OAuth 2.0 with drive.file scope, offline access, and HMAC-bound state protection.
 * 2. In-memory token management with automatic refresh (zero secret logging).
 * 3. Server-side credential persistence across application restarts (.data/google-drive.json).
 * 4. HMAC-signed upload session tickets with strict SSRF defense (binding admin, project, file, and Google Drive endpoints).
 * 5. Archive folder & project subfolder management.
 * 6. Resumable chunked upload protocol with interruption status checks.
 * 7. Pre-registration verification (file ID, size, parent folder).
 * 8. Private streaming proxy with HTTP 206 Range seeking and AbortSignal support.
 */

export interface GoogleDriveTokens {
  access_token: string;
  refresh_token?: string;
  expires_at: number; // timestamp in ms
  token_type: string;
  scope: string;
}

export interface StoredDriveConfig {
  refresh_token: string;
  root_folder_id?: string;
  updated_at?: string;
}

export interface UploadSessionTicket {
  ticketId: string;
  projectId: string;
  filename: string;
  fileSize: number;
  mimeType: string;
  sessionUrl: string;
  adminSessionHash: string;
  projectFolderId: string;
  expiresAt: number;
}

export interface DriveFileMetadata {
  id: string;
  name: string;
  mimeType: string;
  size?: number;
  parents?: string[];
  trashed?: boolean;
  hasThumbnail?: boolean;
  thumbnailLink?: string;
  durationSeconds?: number;
  width?: number;
  height?: number;
}

export interface StreamResult {
  status: number;
  headers: Record<string, string>;
  body: ReadableStream<Uint8Array> | null;
}

const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';

function getDriveDataDir(): string {
  if (process.env.DRIVE_STORAGE_FILE) {
    return path.dirname(process.env.DRIVE_STORAGE_FILE);
  }
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NODE_ENV === 'production') {
    const tmpDir = path.join(os.tmpdir(), '.data');
    try {
      if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
      return tmpDir;
    } catch {
      // Fallback
    }
  }
  const localDir = path.join(process.cwd(), '.data');
  try {
    if (!fs.existsSync(localDir)) fs.mkdirSync(localDir, { recursive: true });
    return localDir;
  } catch {
    const tmpDir = path.join(os.tmpdir(), '.data');
    try {
      if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
      return tmpDir;
    } catch {
      return os.tmpdir();
    }
  }
}

export const getDriveCredsFile = () => {
  if (process.env.DRIVE_STORAGE_FILE) {
    return process.env.DRIVE_STORAGE_FILE;
  }
  return path.join(getDriveDataDir(), 'google-drive.json');
};

// In-memory token cache (Zero persistence of plain secrets in logs)
let inMemoryAccessToken: string | null = null;
let inMemoryAccessTokenExpiry = 0;

export function resetAccessTokenCache(): void {
  inMemoryAccessToken = null;
  inMemoryAccessTokenExpiry = 0;
  resetCredentialsStoreCache();
}

/**
 * Sanitizes environment variables: trims whitespace, removes surrounding quotes and internal carriage returns.
 */
export function cleanEnvString(val: string | undefined): string {
  if (!val) return '';
  let s = val.trim();
  // Strip enclosing quotes
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }
  // Strip accidental newlines or trailing carriage returns
  if (s.includes('\r')) {
    s = s.replace(/\r/g, '');
  }
  if (s.includes('\n')) {
    s = s.split('\n')[0].trim();
  }
  return s.trim();
}

/**
 * Returns runtime environment variables strictly from process.env with sanitization.
 * Never loads from disk or stale fallbacks in production runtime.
 */
export function getRuntimeDriveConfig() {
  const clientId = cleanEnvString(process.env.GOOGLE_CLIENT_ID);
  const clientSecret = cleanEnvString(process.env.GOOGLE_CLIENT_SECRET);
  const refreshToken = cleanEnvString(process.env.GOOGLE_DRIVE_REFRESH_TOKEN);
  const rootFolderId = cleanEnvString(process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID);

  return { clientId, clientSecret, refreshToken, rootFolderId };
}

/**
 * Loads stored Google Drive configuration from server disk if not present in process.env.
 * Ensures connection persistence across application restarts for local tests.
 */
export function loadStoredDriveConfig(): StoredDriveConfig | null {
  const candidateFiles = [
    process.env.DRIVE_STORAGE_FILE,
    getDriveCredsFile(),
    path.join(process.cwd(), '.data', 'google-drive.json'),
    path.join(os.tmpdir(), '.data', 'google-drive.json'),
  ].filter(Boolean) as string[];

  for (const credsFile of candidateFiles) {
    try {
      if (fs.existsSync(credsFile)) {
        const raw = fs.readFileSync(credsFile, 'utf8');
        const data = JSON.parse(raw);
        if (data?.refresh_token && typeof data.refresh_token === 'string') {
          if (!process.env.GOOGLE_DRIVE_REFRESH_TOKEN) {
            process.env.GOOGLE_DRIVE_REFRESH_TOKEN = data.refresh_token;
          }
          if (data.root_folder_id && !process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID) {
            process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID = data.root_folder_id;
          }
          return data;
        }
      }
    } catch {
      // ignore read errors across candidates
    }
  }
  return null;
}

/**
 * Saves Google Drive configuration safely to server disk
 */
export function saveStoredDriveConfig(config: { refresh_token: string; root_folder_id?: string }): void {
  // 1. Immediately update runtime environment variables in-memory
  process.env.GOOGLE_DRIVE_REFRESH_TOKEN = config.refresh_token;
  if (config.root_folder_id) {
    process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID = config.root_folder_id;
  }

  // 2. Persist to disk (handles read-only serverless filesystems like Vercel gracefully)
  try {
    const credsFile = getDriveCredsFile();
    const credsDir = path.dirname(credsFile);
    if (!fs.existsSync(credsDir)) {
      fs.mkdirSync(credsDir, { recursive: true });
    }
    const existing = { refresh_token: config.refresh_token };
    const updated: StoredDriveConfig = {
      ...existing,
      ...config,
      updated_at: new Date().toISOString(),
    };
    fs.writeFileSync(credsFile, JSON.stringify(updated, null, 2), 'utf8');
  } catch (err: any) {
    console.warn('Warning: Could not write Google Drive credentials to disk (read-only filesystem):', err?.message);
  }
}

/**
 * Validates whether Google Drive credentials are configured via Supabase persistent store or runtime environment
 */
export async function isDriveConfigured(): Promise<boolean> {
  const { clientId, clientSecret, refreshToken: envToken } = getRuntimeDriveConfig();
  if (clientId && clientSecret && envToken) {
    return true;
  }
  const stored = await getDriveCredentials();
  return Boolean(clientId && clientSecret && stored?.refreshToken);
}

export function isDriveConfiguredSync(): boolean {
  const { clientId, clientSecret, refreshToken } = getRuntimeDriveConfig();
  return Boolean(clientId && clientSecret && refreshToken);
}

/**
 * Generates an HMAC-signed upload session ticket.
 * Binds sessionUrl to admin session, project, and file size to prevent SSRF and tampering.
 */
export function createUploadSessionTicket(params: {
  projectId: string;
  filename: string;
  fileSize: number;
  mimeType: string;
  sessionUrl: string;
  adminSessionToken: string;
  projectFolderId: string;
}): string {
  const secret = process.env.SESSION_SECRET || 'dev-local-session-secret-salt-2027';

  // Strict SSRF check: Ensure sessionUrl strictly targets Google Drive Resumable Upload
  const parsed = new URL(params.sessionUrl);
  if (
    parsed.protocol !== 'https:' ||
    parsed.hostname !== 'www.googleapis.com' ||
    !parsed.pathname.startsWith('/upload/drive/v3/files')
  ) {
    throw new Error('SECURITY_VIOLATION: Invalid or untrusted upload session URL host.');
  }

  const ticket: UploadSessionTicket = {
    ticketId: crypto.randomUUID(),
    projectId: params.projectId,
    filename: params.filename,
    fileSize: params.fileSize,
    mimeType: params.mimeType,
    sessionUrl: params.sessionUrl,
    adminSessionHash: crypto.createHash('sha256').update(params.adminSessionToken).digest('hex'),
    projectFolderId: params.projectFolderId,
    expiresAt: Date.now() + 1000 * 60 * 60 * 6, // 6 hours validity
  };

  const payload = Buffer.from(JSON.stringify(ticket)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return `${payload}.${signature}`;
}

/**
 * Verifies an upload session ticket and ensures destination matches Google Drive API
 */
export function verifyUploadSessionTicket(
  ticketString: string,
  adminSessionToken: string
): UploadSessionTicket {
  const secret = process.env.SESSION_SECRET || 'dev-local-session-secret-salt-2027';
  const parts = ticketString.split('.');
  if (parts.length !== 2) {
    throw new Error('INVALID_TICKET: Malformed upload ticket format.');
  }

  const [payload, signature] = parts;
  const expectedSig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
    throw new Error('SECURITY_VIOLATION: Upload ticket signature mismatch.');
  }

  let ticket: UploadSessionTicket;
  try {
    ticket = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    throw new Error('INVALID_TICKET: Failed to decode upload ticket payload.');
  }

  if (ticket.expiresAt < Date.now()) {
    throw new Error('TICKET_EXPIRED: Upload session ticket has expired.');
  }

  const expectedAdminHash = crypto.createHash('sha256').update(adminSessionToken).digest('hex');
  if (ticket.adminSessionHash !== expectedAdminHash) {
    throw new Error('SECURITY_VIOLATION: Upload ticket belongs to a different admin session.');
  }

  // Strict SSRF check: Ensure sessionUrl belongs strictly to www.googleapis.com
  const parsed = new URL(ticket.sessionUrl);
  if (
    parsed.protocol !== 'https:' ||
    parsed.hostname !== 'www.googleapis.com' ||
    !parsed.pathname.startsWith('/upload/drive/v3/files')
  ) {
    throw new Error('SECURITY_VIOLATION: Untrusted target upload URL in ticket.');
  }

  return ticket;
}

/**
 * Verifies that current Drive credentials are functional by performing a live test API call
 */
export async function verifyDriveConnection(): Promise<{ ok: boolean; rootFolderId: string }> {
  const token = await getValidAccessToken();
  const rootFolderId = await ensureArchiveRootFolder();

  const res = await fetch(`${DRIVE_API_BASE}/files/${rootFolderId}?fields=id,name`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`DRIVE_VERIFY_FAILED: HTTP ${res.status} - ${err.error?.message || 'Drive root folder inaccessible'}`);
  }

  return { ok: true, rootFolderId };
}

/**
 * Generates an HMAC-signed anti-CSRF state bound to the admin session
 */
export function generateOAuthState(adminSessionToken: string): string {
  const secret = process.env.SESSION_SECRET || 'dev-local-session-secret-salt-2027';
  const timestamp = Date.now().toString();
  const nonce = crypto.randomBytes(16).toString('hex');
  const payload = `${timestamp}:${nonce}:${crypto.createHash('sha256').update(adminSessionToken).digest('hex')}`;
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return Buffer.from(`${payload}:${signature}`).toString('base64url');
}

/**
 * Validates incoming OAuth state against current admin session
 */
export function verifyOAuthState(state: string, adminSessionToken: string): boolean {
  try {
    const secret = process.env.SESSION_SECRET || 'dev-local-session-secret-salt-2027';
    const decoded = Buffer.from(state, 'base64url').toString('utf8');
    const parts = decoded.split(':');
    if (parts.length !== 4) return false;

    const [timestamp, nonce, sessionHash, signature] = parts;
    const now = Date.now();
    const stateAgeMs = now - parseInt(timestamp, 10);

    // State expires after 10 minutes
    if (isNaN(stateAgeMs) || stateAgeMs < 0 || stateAgeMs > 10 * 60 * 1000) {
      return false;
    }

    // Verify session token hash
    const expectedHash = crypto.createHash('sha256').update(adminSessionToken).digest('hex');
    if (sessionHash !== expectedHash) return false;

    // Verify HMAC signature
    const payload = `${timestamp}:${nonce}:${sessionHash}`;
    const expectedSig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig));
  } catch {
    return false;
  }
}

/**
 * Resolves the canonical OAuth redirect URI for Google Drive authentication.
 * Respects reverse proxies (Vercel / x-forwarded-host) and environment overrides.
 */
export function getOAuthRedirectUri(req: Request): string {
  const explicitAppUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL;
  if (explicitAppUrl) {
    return `${explicitAppUrl.replace(/\/+$/, '')}/api/admin/auth/google/callback`;
  }

  const forwardedHost = req.headers.get('x-forwarded-host');
  const forwardedProto = req.headers.get('x-forwarded-proto') || 'https';
  if (forwardedHost) {
    return `${forwardedProto}://${forwardedHost}/api/admin/auth/google/callback`;
  }

  const host = req.headers.get('host');
  if (host) {
    const proto = host.includes('localhost') || host.includes('127.0.0.1') ? 'http' : 'https';
    return `${proto}://${host}/api/admin/auth/google/callback`;
  }

  const urlObj = new URL(req.url);
  return `${urlObj.origin}/api/admin/auth/google/callback`;
}

/**
 * Generates Google OAuth 2.0 authorization URL
 */
export function getAuthorizationUrl(redirectUri: string, adminSessionToken: string): string {
  const { clientId } = getRuntimeDriveConfig();
  if (!clientId) {
    throw new Error('CONFIG_ERROR: GOOGLE_CLIENT_ID is not configured in environment.');
  }

  const state = generateOAuthState(adminSessionToken);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: DRIVE_FILE_SCOPE,
    access_type: 'offline',
    prompt: 'select_account consent', // Required to obtain refresh_token and allow choosing account
    state,
  });

  return `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`;
}

/**
 * Exchanges authorization code for tokens
 */
export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string
): Promise<{ refresh_token?: string; access_token: string; expires_in: number }> {
  const { clientId, clientSecret } = getRuntimeDriveConfig();

  if (!clientId || !clientSecret) {
    const missing = [!clientId && 'GOOGLE_CLIENT_ID', !clientSecret && 'GOOGLE_CLIENT_SECRET'].filter(Boolean).join(' and ');
    throw new Error(`CONFIG_ERROR: ${missing} not configured.`);
  }

  const res = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`OAUTH_EXCHANGE_FAILED: ${data.error_description || data.error || 'Failed to exchange code'}`);
  }

  // Do NOT populate in-memory access token cache here;
  // let getValidAccessToken() strictly test the newly stored refresh token.
  return {
    refresh_token: data.refresh_token,
    access_token: data.access_token,
    expires_in: data.expires_in,
  };
}

/**
 * Retrieves a valid access token using the stored refresh_token from Supabase persistent store.
 * Handles automatic renewal and invalid_grant errors.
 */
export async function getValidAccessToken(options?: { forceRefresh?: boolean }): Promise<string> {
  const now = Date.now();
  if (!options?.forceRefresh && inMemoryAccessToken && inMemoryAccessTokenExpiry > now) {
    return inMemoryAccessToken;
  }

  const { clientId, clientSecret, refreshToken: envRefreshToken } = getRuntimeDriveConfig();

  // Primary: Load decrypted credentials from Supabase persistent store
  const storedCreds = await getDriveCredentials();
  const refreshToken = storedCreds?.refreshToken || envRefreshToken;

  // Safe diagnostic logging (strictly Boolean, zero secret logging)
  console.log("Drive refresh token configured:", Boolean(refreshToken));
  console.log("Drive root folder configured:", Boolean(storedCreds?.rootFolderId || process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID));

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('CONFIG_ERROR: Google Drive credentials not fully configured.');
  }

  const res = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    if (data.error === 'invalid_grant') {
      throw new Error(
        'INVALID_GRANT: رمز Google Drive غير صالح أو تم إلغاؤه. أعد ربط Google Drive أو حدّث Refresh Token في بيئة التشغيل.'
      );
    }
    throw new Error(`TOKEN_REFRESH_FAILED: ${data.error_description || data.error || 'Failed to refresh token'}`);
  }

  inMemoryAccessToken = data.access_token;
  inMemoryAccessTokenExpiry = now + (data.expires_in - 300) * 1000;
  return data.access_token as string;
}

/**
 * Ensures the root studio archive folder exists in Google Drive and updates Supabase
 */
export async function ensureArchiveRootFolder(): Promise<string> {
  const token = await getValidAccessToken();
  const storedCreds = await getDriveCredentials();
  const customRootId = storedCreds?.rootFolderId || process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;

  if (customRootId && customRootId.trim()) {
    try {
      const checkRes = await fetch(`${DRIVE_API_BASE}/files/${encodeURIComponent(customRootId.trim())}?fields=id,trashed`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (checkRes.ok) {
        const folderData = await checkRes.json();
        if (!folderData.trashed) {
          return folderData.id;
        }
      }
      // If folder not found in account (404) or trashed, clear invalid root ID
      delete process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
    } catch {
      // Ignore network errors and continue to discover/create
    }
  }

  // 1. Search for existing archive folder created by this app
  const query = "mimeType = 'application/vnd.google-apps.folder' and name = 'Media Studio Archive' and trashed = false";
  const searchRes = await fetch(`${DRIVE_API_BASE}/files?q=${encodeURIComponent(query)}&fields=files(id,name)`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (searchRes.ok) {
    const searchData = await searchRes.json();
    if (searchData.files && searchData.files.length > 0) {
      const foundId = searchData.files[0].id;
      await updateDriveRootFolder(foundId);
      process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID = foundId;
      return foundId;
    }
  }

  // 2. Create archive folder if not found
  const createRes = await fetch(`${DRIVE_API_BASE}/files`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: 'Media Studio Archive',
      mimeType: 'application/vnd.google-apps.folder',
      description: 'Main archive for Media Design Studio showcase assets',
    }),
  });

  if (!createRes.ok) {
    const errData = await createRes.json();
    throw new Error(`FOLDER_CREATION_FAILED: ${errData.error?.message || 'Could not create archive root folder'}`);
  }

  const newFolder = await createRes.json();
  await updateDriveRootFolder(newFolder.id);
  process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID = newFolder.id;
  return newFolder.id;
}

/**
 * Ensures a project subfolder exists inside the archive root folder
 */
export async function ensureProjectFolder(projectTitle: string, projectId: string, rootFolderId: string): Promise<string> {
  const token = await getValidAccessToken();
  const folderName = `${projectTitle.slice(0, 40)} [${projectId}]`;

  // Search inside root folder
  const query = `'${rootFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and name = '${folderName.replace(/'/g, "\\'")}' and trashed = false`;
  const searchRes = await fetch(`${DRIVE_API_BASE}/files?q=${encodeURIComponent(query)}&fields=files(id,name)`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (searchRes.ok) {
    const searchData = await searchRes.json();
    if (searchData.files && searchData.files.length > 0) {
      return searchData.files[0].id;
    }
  }

  // Create project subfolder
  const createRes = await fetch(`${DRIVE_API_BASE}/files`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [rootFolderId],
    }),
  });

  if (!createRes.ok) {
    const errData = await createRes.json();
    throw new Error(`PROJECT_FOLDER_CREATION_FAILED: ${errData.error?.message || 'Could not create project folder'}`);
  }

  const newFolder = await createRes.json();
  return newFolder.id;
}

/**
 * Initiates a Resumable Upload Session with Google Drive API
 * Returns session upload URL (NEVER logged or leaked to logs).
 */
export async function initiateResumableUpload(params: {
  filename: string;
  mimeType: string;
  parentFolderId: string;
  fileSize?: number;
}): Promise<string> {
  const token = await getValidAccessToken();

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json; charset=UTF-8',
    'X-Upload-Content-Type': params.mimeType,
  };

  if (params.fileSize && params.fileSize > 0) {
    headers['X-Upload-Content-Length'] = params.fileSize.toString();
  }

  const res = await fetch(`${DRIVE_UPLOAD_BASE}/files?uploadType=resumable`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: params.filename,
      parents: [params.parentFolderId],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`RESUMABLE_INIT_FAILED: ${err.error?.message || `HTTP ${res.status}`}`);
  }

  const sessionUrl = res.headers.get('location');
  if (!sessionUrl) {
    throw new Error('RESUMABLE_INIT_FAILED: Google Drive did not return a session location header.');
  }

  return sessionUrl;
}

/**
 * Uploads a buffer directly to Google Drive via multipart upload (ideal for covers and images < 10MB)
 */
export async function uploadBufferToDrive(params: {
  filename: string;
  mimeType: string;
  parentFolderId: string;
  buffer: Buffer;
  makePublic?: boolean;
}): Promise<{ fileId: string; viewUrl: string; thumbnailUrl: string }> {
  const token = await getValidAccessToken();
  const boundary = '-------' + crypto.randomUUID();
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const metadata = JSON.stringify({
    name: params.filename,
    parents: [params.parentFolderId],
  });

  const multipartBody = Buffer.concat([
    Buffer.from(
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      metadata +
      delimiter +
      `Content-Type: ${params.mimeType}\r\n\r\n`
    ),
    params.buffer,
    Buffer.from(closeDelimiter),
  ]);

  const res = await fetch(`${DRIVE_UPLOAD_BASE}/files?uploadType=multipart&fields=id,name,thumbnailLink,webViewLink`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
      'Content-Length': multipartBody.length.toString(),
    },
    body: multipartBody,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`DRIVE_UPLOAD_FAILED: ${err.error?.message || `HTTP ${res.status}`}`);
  }

  const fileData = await res.json();
  const fileId = fileData.id;

  if (params.makePublic) {
    try {
      await fetch(`${DRIVE_API_BASE}/files/${fileId}/permissions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ role: 'reader', type: 'anyone' }),
      });
    } catch {
      // Non-fatal if permission cannot be altered
    }
  }

  return {
    fileId,
    viewUrl: `https://lh3.googleusercontent.com/d/${fileId}`,
    thumbnailUrl: fileData.thumbnailLink || `https://drive.google.com/thumbnail?id=${fileId}&sz=w1200`,
  };
}

export interface UploadChunkResult {
  complete: boolean;
  fileId?: string;
  status: number;
  nextByteOffset?: number;
}

export interface DriveUploadStatusResult {
  complete: boolean;
  nextByteOffset: number;
  fileId?: string;
}

/**
 * Uploads a chunk to the resumable upload session URL
 * Content-Range header format: `bytes START-END/TOTAL` or `bytes START-END/*`
 */
export async function uploadChunk(
  sessionUrl: string,
  chunk: Uint8Array | Buffer,
  contentRange: string
): Promise<UploadChunkResult> {
  const res = await fetch(sessionUrl, {
    method: 'PUT',
    headers: {
      'Content-Range': contentRange,
      'Content-Length': chunk.length.toString(),
    },
    body: chunk as unknown as BodyInit,
  });

  if (res.status === 200 || res.status === 201) {
    const data = await res.json();
    return { complete: true, fileId: data.id, status: res.status };
  }

  if (res.status === 308) {
    // Resume Incomplete - extract confirmed range from Drive
    const rangeHeader = res.headers.get('range');
    let nextByteOffset = 0;
    if (rangeHeader) {
      const match = rangeHeader.match(/bytes=0-(\d+)/);
      if (match) {
        nextByteOffset = parseInt(match[1], 10) + 1;
      }
    }
    return { complete: false, status: 308, nextByteOffset };
  }

  const errData = await res.json().catch(() => ({}));
  throw new Error(`CHUNK_UPLOAD_FAILED: HTTP ${res.status} - ${errData.error?.message || 'Upload error'}`);
}

/**
 * Queries the upload status when resuming an interrupted upload or when chunk response was lost.
 * Returns { complete, nextByteOffset, fileId }
 */
export async function getUploadResumeStatus(
  sessionUrl: string,
  totalSize: number
): Promise<DriveUploadStatusResult> {
  const res = await fetch(sessionUrl, {
    method: 'PUT',
    headers: {
      'Content-Range': `bytes */${totalSize}`,
      'Content-Length': '0',
    },
  });

  if (res.status === 200 || res.status === 201) {
    const fileData = await res.json().catch(() => ({}));
    if (!fileData?.id) {
      throw new Error('STATUS_QUERY_ERROR: Drive reported upload complete but did not return file ID.');
    }
    return {
      complete: true,
      nextByteOffset: totalSize,
      fileId: fileData.id,
    };
  }

  if (res.status === 308) {
    const range = res.headers.get('range');
    let nextByteOffset = 0;
    if (range) {
      const match = range.match(/bytes=0-(\d+)/);
      if (match) {
        nextByteOffset = parseInt(match[1], 10) + 1;
      }
    }
    return {
      complete: false,
      nextByteOffset,
    };
  }

  const errText = await res.text().catch(() => '');
  throw new Error(`RESUME_STATUS_QUERY_FAILED: HTTP ${res.status} - ${errText}`);
}

/**
 * Backwards-compatible helper returning the confirmed nextByteOffset
 */
export async function getUploadResumeOffset(sessionUrl: string, totalSize: number): Promise<number> {
  const status = await getUploadResumeStatus(sessionUrl, totalSize);
  return status.nextByteOffset;
}

/**
 * Retrieves file metadata from Google Drive to verify ID, size, and parent before registration
 */
export async function getFileMetadata(fileId: string): Promise<DriveFileMetadata | null> {
  const token = await getValidAccessToken();

  const res = await fetch(
    `${DRIVE_API_BASE}/files/${fileId}?fields=id,name,mimeType,size,parents,trashed,thumbnailLink,hasThumbnail,videoMediaMetadata,imageMediaMetadata`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (res.status === 404) return null;

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`METADATA_FETCH_FAILED: ${err.error?.message || `HTTP ${res.status}`}`);
  }

  const data = await res.json();
  const durationSeconds = data.videoMediaMetadata?.durationMillis
    ? Math.round(parseInt(data.videoMediaMetadata.durationMillis, 10) / 1000)
    : undefined;
  const width = data.videoMediaMetadata?.width || data.imageMediaMetadata?.width;
  const height = data.videoMediaMetadata?.height || data.imageMediaMetadata?.height;

  return {
    id: data.id,
    name: data.name,
    mimeType: data.mimeType,
    size: data.size ? parseInt(data.size, 10) : undefined,
    parents: data.parents,
    trashed: data.trashed,
    hasThumbnail: data.hasThumbnail,
    thumbnailLink: data.thumbnailLink,
    durationSeconds,
    width,
    height,
  };
}

/**
 * Fetches and streams a high-resolution thumbnail directly from Google Drive.
 * Requests without a Referer header to bypass Google's 429/403 referer-checking restrictions.
 */
export async function getDriveThumbnailStream(
  thumbnailLinkOrFileId: string,
  signal?: AbortSignal,
  fallbackDriveFileId?: string
): Promise<{ status: number; headers: Record<string, string>; body: ReadableStream<Uint8Array> | null } | null> {
  let thumbUrl = thumbnailLinkOrFileId;
  if (!thumbUrl.startsWith('http')) {
    const meta = await getFileMetadata(thumbUrl);
    if (!meta?.thumbnailLink) return null;
    thumbUrl = meta.thumbnailLink;
  }

  // Request higher resolution thumbnail (s800 instead of s220)
  const highResUrl = thumbUrl.replace(/=s\d+$/, '=s800');

  try {
    const res = await fetch(highResUrl, {
      headers: { Accept: 'image/*' },
      signal,
    });

    if (res.ok && res.body) {
      return {
        status: res.status,
        headers: {
          'Content-Type': res.headers.get('content-type') || 'image/jpeg',
          'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
        },
        body: res.body,
      };
    }

    // Fallback to original thumbnail URL if high-res fails
    const fallbackRes = await fetch(thumbUrl, {
      headers: { Accept: 'image/*' },
      signal,
    });

    if (fallbackRes.ok && fallbackRes.body) {
      return {
        status: fallbackRes.status,
        headers: {
          'Content-Type': fallbackRes.headers.get('content-type') || 'image/jpeg',
          'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
        },
        body: fallbackRes.body,
      };
    }

    // If HTTP fetch failed (e.g. 403 expired token) and fallbackDriveFileId is provided, refresh metadata
    if (fallbackDriveFileId && thumbUrl.startsWith('http')) {
      const freshMeta = await getFileMetadata(fallbackDriveFileId);
      if (freshMeta?.thumbnailLink && freshMeta.thumbnailLink !== thumbUrl) {
        return getDriveThumbnailStream(freshMeta.thumbnailLink, signal);
      }
    }
  } catch (err: any) {
    console.error('getDriveThumbnailStream error:', err?.message);
    if (fallbackDriveFileId && thumbUrl.startsWith('http')) {
      try {
        const freshMeta = await getFileMetadata(fallbackDriveFileId);
        if (freshMeta?.thumbnailLink && freshMeta.thumbnailLink !== thumbUrl) {
          return getDriveThumbnailStream(freshMeta.thumbnailLink, signal);
        }
      } catch {
        // ignore
      }
    }
  }

  return null;
}

/**
 * Streams a private file from Google Drive with HTTP 206 Partial Content Range support
 * Handles 200, 206, 416 responses accurately, and cancels request on client abort.
 */
export async function streamFile(
  fileId: string,
  rangeHeader?: string | null,
  signal?: AbortSignal
): Promise<StreamResult> {
  const token = await getValidAccessToken();

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };

  if (rangeHeader) {
    headers['Range'] = rangeHeader;
  }

  const res = await fetch(`${DRIVE_API_BASE}/files/${fileId}?alt=media`, {
    headers,
    signal,
  });

  if (!res.ok && res.status !== 416) {
    const errorText = await res.text().catch(() => '');
    throw new Error(`DRIVE_STREAM_ERROR: HTTP ${res.status} - ${errorText}`);
  }

  const responseHeaders: Record<string, string> = {
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, no-store',
  };

  const contentType = res.headers.get('content-type');
  if (contentType) responseHeaders['Content-Type'] = contentType;

  const contentRange = res.headers.get('content-range');
  if (contentRange) responseHeaders['Content-Range'] = contentRange;

  const contentLength = res.headers.get('content-length');
  if (contentLength) responseHeaders['Content-Length'] = contentLength;

  return {
    status: res.status,
    headers: responseHeaders,
    body: res.body,
  };
}

/**
 * Safely deletes a file or folder from Google Drive by its ID.
 * Tolerant to:
 * - 404 Not Found (item already deleted or does not exist) -> treated as success / no-op
 * - Network/Token errors -> caught and logged, returns { success: false, error } without throwing
 * 
 * Safety Guards:
 * - NEVER deletes the root archive folder ('Media Studio Archive' or GOOGLE_DRIVE_ROOT_FOLDER_ID)
 * - Checks folder name if isFolder is true to ensure it is not 'Media Studio Archive'
 */
export async function deleteDriveFileOrFolder(
  fileOrFolderId: string | null | undefined,
  options?: {
    isFolder?: boolean;
    safeRootFolderId?: string;
  }
): Promise<{ success: boolean; notFound?: boolean; error?: string }> {
  if (!fileOrFolderId || typeof fileOrFolderId !== 'string' || !fileOrFolderId.trim()) {
    return { success: true, notFound: true };
  }

  const cleanId = fileOrFolderId.trim();

  // Root folder protection
  try {
    const storedCreds = await getDriveCredentials().catch(() => null);
    const rootId = (
      options?.safeRootFolderId ||
      storedCreds?.rootFolderId ||
      process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID ||
      ''
    ).trim();

    if (rootId && cleanId === rootId) {
      console.warn(`[Drive Guard] Blocked attempt to delete root archive folder: ${cleanId}`);
      return { success: false, error: 'Cannot delete root archive folder' };
    }
  } catch {
    // Proceed with check
  }

  try {
    const token = await getValidAccessToken();

    // Extra guard if isFolder: verify it's not named 'Media Studio Archive'
    if (options?.isFolder) {
      try {
        const metaRes = await fetch(`${DRIVE_API_BASE}/files/${encodeURIComponent(cleanId)}?fields=id,name,mimeType`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (metaRes.status === 404) {
          return { success: true, notFound: true };
        }
        if (metaRes.ok) {
          const meta = await metaRes.json();
          if (meta.name === 'Media Studio Archive') {
            console.warn(`[Drive Guard] Blocked attempt to delete folder named 'Media Studio Archive': ${cleanId}`);
            return { success: false, error: 'Cannot delete root archive folder' };
          }
        }
      } catch {
        // If meta check fails, continue
      }
    }

    const res = await fetch(`${DRIVE_API_BASE}/files/${encodeURIComponent(cleanId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.status === 204 || res.status === 200) {
      return { success: true };
    }

    if (res.status === 404) {
      // Item does not exist on Drive (treated as successfully deleted)
      return { success: true, notFound: true };
    }

    const errData = await res.json().catch(() => ({}));
    const errMsg = errData.error?.message || `HTTP ${res.status}`;
    console.warn(`[Drive Warning] deleteDriveFileOrFolder (${cleanId}) returned ${res.status}: ${errMsg}`);
    return { success: false, error: errMsg };
  } catch (err: any) {
    console.warn(`[Drive Exception] deleteDriveFileOrFolder (${cleanId}):`, err?.message || err);
    return { success: false, error: err?.message || 'Drive delete request failed' };
  }
}

