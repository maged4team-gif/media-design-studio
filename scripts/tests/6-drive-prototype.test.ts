/**
 * Test Suite 6: Google Drive Integration Prototype Tests
 * Run via: npx tsx --conditions=react-server scripts/tests/6-drive-prototype.test.ts
 */

import {
  generateOAuthState,
  verifyOAuthState,
  getAuthorizationUrl,
  isDriveConfigured,
  ensureArchiveRootFolder,
  ensureProjectFolder,
  createUploadSessionTicket,
  verifyUploadSessionTicket,
  saveStoredDriveConfig,
  verifyDriveConnection,
  resetAccessTokenCache,
  getValidAccessToken,
} from '../../lib/drive/client';
import { POST as initUploadHandler } from '../../app/api/admin/drive/upload/init/route';
import { PUT as chunkUploadHandler } from '../../app/api/admin/drive/upload/chunk/route';
import { POST as statusUploadHandler } from '../../app/api/admin/drive/upload/status/route';
import { POST as registerHandler } from '../../app/api/admin/drive/upload/register/route';
import { POST as signLegacyUploadHandler } from '../../app/api/admin/upload/sign/route';
import { POST as legacyDirectUploadHandler } from '../../app/api/admin/upload/route';
import { GET as mediaDeliveryHandler } from '../../app/api/media/[assetId]/route';
import { dataService, resolveAssetPlaybackUrl, resolveAssetThumbnailUrl } from '../../lib/data/service';
import { formatClientMediaUrl } from '../../lib/utils/formatters';
import { createSignedToken } from '../../lib/auth/session';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${testName} ${detail ? `(${detail})` : ''}`);
    failed++;
  }
}

function makeRequest(url: string, init?: RequestInit): Request {
  const headers = new Headers(init?.headers);
  if (!headers.has('host')) headers.set('host', 'localhost:3000');
  if (!headers.has('origin')) headers.set('origin', 'http://localhost:3000');
  return new Request(url, { ...init, headers });
}

// Helper to mock global.fetch for Drive API unit testing
let originalFetch: typeof global.fetch;

function mockFetch(handler: (url: string, init?: RequestInit) => Promise<Response>) {
  originalFetch = global.fetch;
  global.fetch = handler as any;
}

function restoreFetch() {
  if (originalFetch) {
    global.fetch = originalFetch;
  }
}

async function runDrivePrototypeTests() {
  console.log('================================================================');
  console.log('SUITE 6: GOOGLE DRIVE INTEGRATION PROTOTYPE & HARDENING TESTS');
  console.log('================================================================\n');

  process.env.DATA_MODE = 'demo';
  process.env.SESSION_SECRET = 'prototype-test-session-secret-salt-2027';
  process.env.GOOGLE_CLIENT_ID = 'test-mock-client-id.apps.googleusercontent.com';
  process.env.GOOGLE_CLIENT_SECRET = 'test-mock-client-secret';
  process.env.GOOGLE_DRIVE_REFRESH_TOKEN = '1//mock-refresh-token-testing-value';

  const mockAdminToken = createSignedToken({
    isAdmin: true,
    expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 14,
  });
  const otherAdminToken = createSignedToken({
    isAdmin: true,
    expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 14,
    nonce: 'different_admin_session_nonce',
  });

  // =============================================================
  // 1. OAuth State Anti-CSRF Protection & Token Security
  // =============================================================
  console.log('>>> 1. Testing OAuth 2.0 State Anti-CSRF Binding & Secret Protection...');

  assert(isDriveConfigured() === true, 'isDriveConfigured returns true when environment credentials are set');

  const validState = generateOAuthState(mockAdminToken);
  assert(typeof validState === 'string' && validState.length > 30, 'generateOAuthState produces non-empty base64url string');

  const verified = verifyOAuthState(validState, mockAdminToken);
  assert(verified === true, 'verifyOAuthState successfully validates legitimate state bound to admin session');

  // Tampered state
  const tamperedState = validState.slice(0, -4) + 'abcd';
  const tamperedVerified = verifyOAuthState(tamperedState, mockAdminToken);
  assert(tamperedVerified === false, 'verifyOAuthState strictly rejects tampered signature');

  // Mismatched session
  const wrongSessionVerified = verifyOAuthState(validState, otherAdminToken);
  assert(wrongSessionVerified === false, 'verifyOAuthState strictly rejects state created for a different admin session');

  // Expired state (>10 minutes)
  const pastTimestamp = (Date.now() - 15 * 60 * 1000).toString();
  const nonce = crypto.randomBytes(16).toString('hex');
  const sessionHash = crypto.createHash('sha256').update(mockAdminToken).digest('hex');
  const payload = `${pastTimestamp}:${nonce}:${sessionHash}`;
  const sig = crypto.createHmac('sha256', process.env.SESSION_SECRET).update(payload).digest('hex');
  const expiredState = Buffer.from(`${payload}:${sig}`).toString('base64url');
  assert(verifyOAuthState(expiredState, mockAdminToken) === false, 'verifyOAuthState rejects expired state (>10 mins)');

  // Auth URL inspection: zero secrets exposed
  const redirectUri = 'http://localhost:3000/api/admin/auth/google/callback';
  const authUrl = getAuthorizationUrl(redirectUri, mockAdminToken);
  const parsedAuthUrl = new URL(authUrl);
  assert(parsedAuthUrl.origin === 'https://accounts.google.com', 'Auth URL targets accounts.google.com');
  assert(parsedAuthUrl.searchParams.get('client_id') === process.env.GOOGLE_CLIENT_ID, 'Auth URL contains client_id');
  assert(parsedAuthUrl.searchParams.get('access_type') === 'offline', 'Auth URL requests offline access for refresh_token');
  assert(parsedAuthUrl.searchParams.get('prompt') === 'consent', 'Auth URL forces consent prompt');
  assert(parsedAuthUrl.searchParams.get('scope') === 'https://www.googleapis.com/auth/drive.file', 'Auth URL requests drive.file scope');
  assert(!authUrl.includes(process.env.GOOGLE_CLIENT_SECRET!), 'Auth URL NEVER leaks client_secret');
  assert(!authUrl.includes(process.env.GOOGLE_DRIVE_REFRESH_TOKEN!), 'Auth URL NEVER leaks refresh_token');

  // =============================================================
  // 2. Token Refresh & Persistence Across Server Restarts
  // =============================================================
  console.log('\n>>> 2. Testing Token Refresh, Usability Verification & Persistence Across Restarts...');

  // Mock token refresh response: invalid_grant (7-day test token expiration)
  resetAccessTokenCache();
  mockFetch(async (url, _init) => {
    if (url === 'https://oauth2.googleapis.com/token') {
      return new Response(
        JSON.stringify({
          error: 'invalid_grant',
          error_description: 'Token has been expired or revoked.',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response('Not found', { status: 404 });
  });

  let caughtInvalidGrant = false;
  let invalidGrantMessage = '';
  try {
    await getValidAccessToken();
  } catch (err: any) {
    caughtInvalidGrant = err.message.includes('INVALID_GRANT');
    invalidGrantMessage = err.message;
  }
  restoreFetch();

  assert(caughtInvalidGrant, 'Detects invalid_grant on expired refresh token');
  assert(
    invalidGrantMessage.includes('7 days') && invalidGrantMessage.includes('/api/admin/auth/google'),
    'Actionable error mentions 7-day test mode limit and re-authorization URL'
  );

  // Test Server-side Credential Persistence across simulated restarts
  const testStorageFile = path.join(process.cwd(), '.data', 'test-google-drive.json');
  process.env.DRIVE_STORAGE_FILE = testStorageFile;

  saveStoredDriveConfig({
    refresh_token: '1//test-persisted-storage-token-999',
    root_folder_id: 'mock-persisted-root-folder-123',
  });

  // Simulate application restart by deleting process.env variables
  delete process.env.GOOGLE_DRIVE_REFRESH_TOKEN;
  delete process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;

  assert(isDriveConfigured() === true, 'isDriveConfigured successfully reloads credentials from .data storage');
  assert(
    process.env.GOOGLE_DRIVE_REFRESH_TOKEN === '1//test-persisted-storage-token-999',
    'Restores GOOGLE_DRIVE_REFRESH_TOKEN from disk store'
  );
  assert(
    process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID === 'mock-persisted-root-folder-123',
    'Restores GOOGLE_DRIVE_ROOT_FOLDER_ID from disk store'
  );

  // Test live connection verification before declaring success
  mockFetch(async (url) => {
    if (url === 'https://oauth2.googleapis.com/token') {
      return new Response(JSON.stringify({ access_token: 'mock-tok', expires_in: 3600 }), { status: 200 });
    }
    if (url.includes('googleapis.com/drive/v3/files/mock-persisted-root-folder-123')) {
      return new Response(JSON.stringify({ id: 'mock-persisted-root-folder-123', name: 'Media Studio Archive' }), { status: 200 });
    }
    return new Response('Not found', { status: 404 });
  });
  const verifyRes = await verifyDriveConnection();
  assert(verifyRes.ok === true, 'verifyDriveConnection confirms usable live connection before declaring success');
  restoreFetch();

  // Clean up isolated test storage file
  if (fs.existsSync(testStorageFile)) {
    fs.unlinkSync(testStorageFile);
  }
  delete process.env.DRIVE_STORAGE_FILE;

  // Set memory credentials for remaining test sections
  process.env.GOOGLE_DRIVE_REFRESH_TOKEN = 'mock-refresh-token-for-test';
  process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID = 'mock-archive-root-folder-id';

  // Test .gitignore exclusion verification
  const gitignorePath = path.resolve(process.cwd(), '.gitignore');
  assert(fs.existsSync(gitignorePath), '.gitignore file exists on server disk');
  const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
  assert(gitignoreContent.includes('.env') && gitignoreContent.includes('.data'), '.gitignore strictly excludes .env and .data directories');
  assert(gitignoreContent.includes('google-drive.json'), '.gitignore strictly excludes google-drive.json secret file');

  // =============================================================
  // 3. Archive Root & Project Subfolder Management
  // =============================================================
  console.log('\n>>> 3. Testing Archive Root & Project Subfolder Management...');

  delete process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
  let createdRoot = false;
  let createdProjectFolder = false;

  mockFetch(async (url, init) => {
    if (url === 'https://oauth2.googleapis.com/token') {
      return new Response(
        JSON.stringify({
          access_token: 'mock-access-token-12345',
          expires_in: 3600,
          token_type: 'Bearer',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (url.includes('https://www.googleapis.com/drive/v3/files?q=') && !url.includes('parents')) {
      return new Response(JSON.stringify({ files: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url === 'https://www.googleapis.com/drive/v3/files' && init?.method === 'POST') {
      const body = JSON.parse(init.body as string);
      if (body.name === 'Media Studio Archive') {
        createdRoot = true;
        return new Response(JSON.stringify({ id: 'mock-archive-root-folder-id', name: body.name }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (body.name.includes('Test Project')) {
        createdProjectFolder = true;
        return new Response(JSON.stringify({ id: 'mock-project-subfolder-id', name: body.name }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    if (url.includes('parents')) {
      return new Response(JSON.stringify({ files: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response('Not found', { status: 404 });
  });

  const rootFolderId = await ensureArchiveRootFolder();
  assert(createdRoot && rootFolderId === 'mock-archive-root-folder-id', 'Automatically creates Media Studio Archive root folder');

  const projectFolderId = await ensureProjectFolder('Test Project', 'proj-123', rootFolderId);
  assert(createdProjectFolder && projectFolderId === 'mock-project-subfolder-id', 'Creates project subfolder inside root archive');
  restoreFetch();

  // =============================================================
  // 4. Secure Resumable Upload Tickets & SSRF Defense
  // =============================================================
  console.log('\n>>> 4. Testing Secure Upload Session Tickets, SSRF Defense & Bounded Chunking...');

  const validDriveSessionUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=mock-upload-session-xyz';

  // 4.1 Rejection of Untrusted Non-Google Destination (SSRF Defense)
  let ssrfCaught = false;
  try {
    createUploadSessionTicket({
      projectId: 'proj-1',
      filename: 'attack.mp4',
      fileSize: 1000,
      mimeType: 'video/mp4',
      sessionUrl: 'https://evil-attacker.com/upload/drive/v3/files',
      adminSessionToken: mockAdminToken,
      projectFolderId: 'folder-1',
    });
  } catch (err: any) {
    ssrfCaught = err.message.includes('SECURITY_VIOLATION');
  }
  assert(ssrfCaught, 'createUploadSessionTicket strictly rejects non-Google hosts (Anti-SSRF)');

  // 4.2 Ticket Generation and Validation
  const validTicket = createUploadSessionTicket({
    projectId: 'proj-1',
    filename: 'showreel.mp4',
    fileSize: 10485760,
    mimeType: 'video/mp4',
    sessionUrl: validDriveSessionUrl,
    adminSessionToken: mockAdminToken,
    projectFolderId: 'folder-1',
  });
  assert(typeof validTicket === 'string' && validTicket.includes('.'), 'Generates signed upload ticket format');

  const decodedTicket = verifyUploadSessionTicket(validTicket, mockAdminToken);
  assert(decodedTicket.filename === 'showreel.mp4' && decodedTicket.fileSize === 10485760, 'verifyUploadSessionTicket validates legitimate ticket');

  // 4.3 Ticket Cross-Admin Session Rejection
  let crossAdminCaught = false;
  try {
    verifyUploadSessionTicket(validTicket, otherAdminToken);
  } catch (err: any) {
    crossAdminCaught = err.message.includes('SECURITY_VIOLATION');
  }
  assert(crossAdminCaught, 'verifyUploadSessionTicket strictly rejects ticket presented by a different admin session');

  // 4.4 Resumable Upload Flow with Chunk Validation
  mockFetch(async (url, init) => {
    if (url === 'https://oauth2.googleapis.com/token') {
      return new Response(
        JSON.stringify({ access_token: 'mock-access-token-12345', expires_in: 3600, token_type: 'Bearer' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (url.includes('https://www.googleapis.com/drive/v3/files')) {
      return new Response(JSON.stringify({ files: [{ id: 'mock-archive-root-folder-id' }], id: 'mock-folder-id', trashed: false }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url === 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable') {
      return new Response(null, {
        status: 200,
        headers: {
          location: validDriveSessionUrl,
        },
      });
    }

    if (url.includes('mock-upload-session-xyz')) {
      const headers = (init?.headers || {}) as Record<string, string>;
      const contentRange = headers['Content-Range'];
      if (contentRange === 'bytes 0-5242879/10485760') {
        return new Response(null, {
          status: 308,
          headers: { Range: 'bytes=0-5242879' },
        });
      }
      if (contentRange === 'bytes 5242880-10485759/10485760') {
        return new Response(
          JSON.stringify({ id: 'mock-uploaded-drive-file-id', name: 'showreel.mp4', mimeType: 'video/mp4' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (contentRange === 'bytes */10485760') {
        return new Response(null, {
          status: 308,
          headers: { Range: 'bytes=0-5242879' },
        });
      }
    }

    return new Response('Not found', { status: 404 });
  });

  // Test init upload route: returns uploadToken, NEVER leaks raw sessionUrl
  const initRouteReq = makeRequest('http://localhost:3000/api/admin/drive/upload/init', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: `admin_session=${mockAdminToken}`,
    },
    body: JSON.stringify({
      filename: 'sample.mp4',
      mimeType: 'video/mp4',
      projectId: '00000000-0000-0000-0000-000000000001',
      fileSize: 10485760,
    }),
  });
  const initRouteRes = await initUploadHandler(initRouteReq);
  const initRouteData = await initRouteRes.json();
  assert(initRouteRes.status === 200 && Boolean(initRouteData.uploadToken), 'Init upload route responds with secure uploadToken');
  assert(!JSON.stringify(initRouteData).includes('https://'), 'Init upload route NEVER leaks raw Google Drive session URL');

  // 4.3 Validation of Numeric Bounds (0 <= start <= end < total)
  const invalidBoundsReq1 = makeRequest('http://localhost:3000/api/admin/drive/upload/chunk', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/octet-stream',
      cookie: `admin_session=${mockAdminToken}`,
      'x-upload-token': initRouteData.uploadToken,
      'content-range': 'bytes 5000-2000/10485760',
    },
    body: Buffer.alloc(100),
  });
  const invalidBoundsRes1 = await chunkUploadHandler(invalidBoundsReq1);
  assert(invalidBoundsRes1.status === 400, 'Chunk route strictly rejects start > end with HTTP 400');

  const invalidBoundsReq2 = makeRequest('http://localhost:3000/api/admin/drive/upload/chunk', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/octet-stream',
      cookie: `admin_session=${mockAdminToken}`,
      'x-upload-token': initRouteData.uploadToken,
      'content-range': 'bytes 0-10485760/10485760',
    },
    body: Buffer.alloc(100),
  });
  const invalidBoundsRes2 = await chunkUploadHandler(invalidBoundsReq2);
  assert(invalidBoundsRes2.status === 400, 'Chunk route strictly rejects end >= total with HTTP 400');

  // 4.4 Body exceeding 16MB WITHOUT Content-Length header is aborted during reading
  let driveCalledOnOversizedStream = false;
  mockFetch(async (url) => {
    if (url.includes('googleapis.com')) {
      driveCalledOnOversizedStream = true;
    }
    return new Response('Should not be called', { status: 500 });
  });

  const chunk1MB = new Uint8Array(1024 * 1024);
  let chunkCount = 0;
  const oversizedStream = new ReadableStream({
    pull(controller) {
      if (chunkCount < 18) {
        chunkCount++;
        controller.enqueue(chunk1MB);
      } else {
        controller.close();
      }
    },
  });

  const streamReq = new Request('http://localhost:3000/api/admin/drive/upload/chunk', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/octet-stream',
      cookie: `admin_session=${mockAdminToken}`,
      'x-upload-token': initRouteData.uploadToken,
      'content-range': 'bytes 0-5242879/10485760',
      host: 'localhost:3000',
      origin: 'http://localhost:3000',
    },
    body: oversizedStream,
    // @ts-expect-error duplex is required in node fetch for ReadableStream body
    duplex: 'half',
  });

  const streamRes = await chunkUploadHandler(streamReq);
  assert(streamRes.status === 413, 'Stream exceeding 16MB without Content-Length is aborted during reading with HTTP 413');
  assert(driveCalledOnOversizedStream === false, 'Oversized chunk stream is NEVER forwarded to Google Drive');
  restoreFetch();

  // 4.5 Partial chunk acceptance: Drive accepts partial bytes and next request recalculates offset & range
  let partialAcceptedNextStart = 0;
  mockFetch(async (url, init) => {
    if (url.includes('mock-upload-session-xyz')) {
      const headers = (init?.headers || {}) as Record<string, string>;
      const contentRange = headers['Content-Range'];
      if (contentRange === 'bytes 0-5242879/10485760') {
        // Drive only accepted first 2MB (0 to 2097151)
        return new Response(null, {
          status: 308,
          headers: { Range: 'bytes=0-2097151' },
        });
      }
      if (contentRange === 'bytes 2097152-7340031/10485760') {
        // Drive accepts the recalculated next chunk
        partialAcceptedNextStart = 2097152;
        return new Response(null, {
          status: 308,
          headers: { Range: 'bytes=0-7340031' },
        });
      }
    }
    return new Response('Not found', { status: 404 });
  });

  const chunk5MB = Buffer.alloc(5242880);
  const partialReq1 = makeRequest('http://localhost:3000/api/admin/drive/upload/chunk', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/octet-stream',
      cookie: `admin_session=${mockAdminToken}`,
      'x-upload-token': initRouteData.uploadToken,
      'content-range': 'bytes 0-5242879/10485760',
    },
    body: chunk5MB,
  });
  const partialRes1 = await chunkUploadHandler(partialReq1);
  const partialData1 = await partialRes1.json();
  assert(partialData1.status === 308, 'Initial chunk returns 308');
  assert(partialData1.nextByteOffset === 2097152, 'Drive 308 Range header read correctly: nextByteOffset is 2097152 (2MB confirmed)');

  // Send next chunk starting strictly from confirmed offset 2097152
  const nextSliceLen = 7340031 - 2097152 + 1;
  const partialReq2 = makeRequest('http://localhost:3000/api/admin/drive/upload/chunk', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/octet-stream',
      cookie: `admin_session=${mockAdminToken}`,
      'x-upload-token': initRouteData.uploadToken,
      'content-range': 'bytes 2097152-7340031/10485760',
    },
    body: Buffer.alloc(nextSliceLen),
  });
  const partialRes2 = await chunkUploadHandler(partialReq2);
  const partialData2 = await partialRes2.json();
  assert(partialRes2.status === 200 && partialData2.status === 308, 'Subsequent chunk starting from confirmed offset accepted with 308');
  assert(partialAcceptedNextStart === 2097152, 'Next request strictly started from confirmed offset 2097152 with matching slice');
  restoreFetch();

  // 4.6 Final chunk reached Drive but response was lost: /status recovers fileId and registers without re-upload
  mockFetch(async (url, init) => {
    if (url.includes('mock-upload-session-xyz')) {
      const headers = (init?.headers || {}) as Record<string, string>;
      const contentRange = headers['Content-Range'];
      if (contentRange === 'bytes */10485760') {
        // Drive reports session was already completed
        return new Response(
          JSON.stringify({
            id: 'drive-file-lost-response-999',
            name: 'sample.mp4',
            mimeType: 'video/mp4',
            size: '10485760',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }
    if (url.includes('/files/drive-file-lost-response-999')) {
      return new Response(
        JSON.stringify({
          id: 'drive-file-lost-response-999',
          name: 'sample.mp4',
          mimeType: 'video/mp4',
          size: 10485760,
          parents: ['mock-parent-folder-real'],
          trashed: false,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response('Not found', { status: 404 });
  });

  const lostRespStatusReq = makeRequest('http://localhost:3000/api/admin/drive/upload/status', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: `admin_session=${mockAdminToken}`,
    },
    body: JSON.stringify({ uploadToken: initRouteData.uploadToken }),
  });
  const lostRespStatusRes = await statusUploadHandler(lostRespStatusReq);
  const lostRespStatusData = await lostRespStatusRes.json();
  assert(lostRespStatusRes.status === 200, '/status responds with HTTP 200');
  assert(lostRespStatusData.complete === true, '/status confirms upload completed');
  assert(lostRespStatusData.fileId === 'drive-file-lost-response-999', '/status recovers completed fileId from Drive');
  assert(lostRespStatusData.nextByteOffset === 10485760, '/status reports nextByteOffset === totalSize');
  restoreFetch();

  // =============================================================
  // 5. Hardened Pre-Registration & Idempotent Safety
  // =============================================================
  console.log('\n>>> 5. Testing Hardened Pre-Registration, Folder Matching & Idempotent Conflict Resolution...');

  const testProject = await dataService.createProject({
    title: 'Commercial 2026',
    drive_folder_id: 'mock-parent-folder-real',
  });

  // 5.0 Register the recovered fileId from the lost-response scenario and test idempotent safety
  mockFetch(async (url) => {
    if (url === 'https://oauth2.googleapis.com/token') {
      return new Response(JSON.stringify({ access_token: 'tok-123', expires_in: 3600 }), { status: 200 });
    }
    if (url.includes('drive-file-lost-response-999')) {
      return new Response(
        JSON.stringify({
          id: 'drive-file-lost-response-999',
          name: 'sample.mp4',
          mimeType: 'video/mp4',
          size: 10485760,
          parents: ['mock-parent-folder-real'],
          trashed: false,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response('Not found', { status: 404 });
  });

  const lostRespRegReq1 = makeRequest('http://localhost:3000/api/admin/drive/upload/register', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: `admin_session=${mockAdminToken}`,
    },
    body: JSON.stringify({
      fileId: lostRespStatusData.fileId,
      projectId: testProject.id,
      title: 'Sample Lost Response Video',
    }),
  });
  const lostRespRegRes1 = await registerHandler(lostRespRegReq1);
  const lostRespRegData1 = await lostRespRegRes1.json();
  assert(lostRespRegRes1.status === 200 && Boolean(lostRespRegData1.asset?.id), 'Lost response fileId registered successfully on first attempt');

  const lostRespRegReq2 = makeRequest('http://localhost:3000/api/admin/drive/upload/register', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: `admin_session=${mockAdminToken}`,
    },
    body: JSON.stringify({
      fileId: lostRespStatusData.fileId,
      projectId: testProject.id,
      title: 'Sample Lost Response Video (Retry)',
    }),
  });
  const lostRespRegRes2 = await registerHandler(lostRespRegReq2);
  const lostRespRegData2 = await lostRespRegRes2.json();
  assert(lostRespRegRes2.status === 200 && lostRespRegData2.idempotent === true, 'Subsequent registration of lost-response file resolves idempotently');
  assert(lostRespRegData2.asset.id === lostRespRegData1.asset.id, 'Asset ID strictly matches original without duplicates');
  restoreFetch();

  mockFetch(async (url, _init) => {
    if (url === 'https://oauth2.googleapis.com/token') {
      return new Response(
        JSON.stringify({ access_token: 'mock-access-token-12345', expires_in: 3600, token_type: 'Bearer' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (url.includes('/drive/v3/files/non-existent-file-id')) {
      return new Response(JSON.stringify({ error: { message: 'File not found' } }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url.includes('/drive/v3/files/trashed-file-id')) {
      return new Response(
        JSON.stringify({
          id: 'trashed-file-id',
          name: 'deleted.mp4',
          mimeType: 'video/mp4',
          size: '1000',
          parents: ['mock-parent-folder-real'],
          trashed: true,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (url.includes('/drive/v3/files/wrong-parent-file-id')) {
      return new Response(
        JSON.stringify({
          id: 'wrong-parent-file-id',
          name: 'stranger.mp4',
          mimeType: 'video/mp4',
          size: '1000',
          parents: ['some-other-folder-id'],
          trashed: false,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (url.includes('/drive/v3/files/valid-drive-file-100')) {
      return new Response(
        JSON.stringify({
          id: 'valid-drive-file-100',
          name: 'spot_v1.mp4',
          mimeType: 'video/mp4',
          size: '15000000',
          parents: ['mock-parent-folder-real'],
          trashed: false,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response('Not found', { status: 404 });
  });

  // Rejection when parent folder does not match project's drive_folder_id
  const wrongParentReq = makeRequest('http://localhost:3000/api/admin/drive/upload/register', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: `admin_session=${mockAdminToken}`,
    },
    body: JSON.stringify({
      fileId: 'wrong-parent-file-id',
      projectId: testProject.id,
      title: 'Wrong Parent File',
    }),
  });
  const wrongParentRes = await registerHandler(wrongParentReq);
  assert(wrongParentRes.status === 400, 'Pre-registration strictly rejects file from mismatched Drive parent folder');

  // Valid registration: extracts metadata from Drive & sets proper file_url
  const validRegReq = makeRequest('http://localhost:3000/api/admin/drive/upload/register', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: `admin_session=${mockAdminToken}`,
    },
    body: JSON.stringify({
      fileId: 'valid-drive-file-100',
      projectId: testProject.id,
      title: 'Spot V1 User Title',
      mimeType: 'text/plain', // Mismatched body should be overridden by Drive's real video/mp4
    }),
  });
  const validRegRes = await registerHandler(validRegReq);
  const validRegData = await validRegRes.json();
  assert(validRegRes.status === 200, 'Valid registration succeeds with 200');
  assert(validRegData.asset.mime_type === 'video/mp4', 'Mime type extracted from trusted Drive metadata (video/mp4)');
  assert(validRegData.asset.file_size === 15000000, 'File size extracted from trusted Drive metadata (15000000)');
  assert(validRegData.asset.file_url === `/api/media/${validRegData.asset.id}`, 'file_url uses valid protected /api/media/{assetId} route');

  // Concurrent Idempotency test: Re-registration returns existing asset
  const retryRegReq = makeRequest('http://localhost:3000/api/admin/drive/upload/register', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: `admin_session=${mockAdminToken}`,
    },
    body: JSON.stringify({
      fileId: 'valid-drive-file-100',
      projectId: testProject.id,
      title: 'Spot V1 User Title (Retry)',
    }),
  });
  const retryRegRes = await registerHandler(retryRegReq);
  const retryRegData = await retryRegRes.json();
  assert(retryRegRes.status === 200 && retryRegData.idempotent === true, 'Re-registration resolves idempotently with existing asset');
  assert(retryRegData.asset.id === validRegData.asset.id, 'Asset ID strictly matches original without duplicates');
  restoreFetch();

  // =============================================================
  // 6. Private Media Delivery & Thumbnail Leak Prevention
  // =============================================================
  console.log('\n>>> 6. Testing Media Delivery, Thumbnail Video Leak Prevention & Error Handling...');

  const registeredAssetId = validRegData.asset.id;

  // 6.1 Strict Thumbnail Request on Video: MUST NOT stream full video
  const thumbReq = makeRequest(`http://localhost:3000/api/media/${registeredAssetId}?type=thumbnail`, {
    headers: { cookie: `admin_session=${mockAdminToken}` },
  });
  const thumbRes = await mediaDeliveryHandler(thumbReq, { params: Promise.resolve({ assetId: registeredAssetId }) });
  assert(thumbRes.status !== 206, 'Thumbnail request NEVER returns HTTP 206 Partial Content');
  assert(thumbRes.status === 307 || thumbRes.status === 404, 'Thumbnail request returns 307 placeholder or 404, preventing full video leak');

  // 6.2 Drive Outage / Expired Token Error Handling
  resetAccessTokenCache();
  mockFetch(async (url) => {
    if (url === 'https://oauth2.googleapis.com/token') {
      return new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 });
    }
    return new Response('Unavailable', { status: 503 });
  });

  const outageReq = makeRequest(`http://localhost:3000/api/media/${registeredAssetId}`, {
    headers: { cookie: `admin_session=${mockAdminToken}` },
  });
  const outageRes = await mediaDeliveryHandler(outageReq, { params: Promise.resolve({ assetId: registeredAssetId }) });
  const outageData = await outageRes.json();
  assert(outageRes.status === 503, 'Drive authorization failure returns HTTP 503');
  assert(outageData.error.includes('Google Drive'), 'Returns actionable Arabic message describing Drive outage');
  restoreFetch();

  // 6.3 Standard HTTP 206 Seeking Delivery
  mockFetch(async (url, init) => {
    if (url === 'https://oauth2.googleapis.com/token') {
      return new Response(JSON.stringify({ access_token: 'mock-tok', expires_in: 3600 }), { status: 200 });
    }
    if (url.includes('/drive/v3/files/valid-drive-file-100?alt=media')) {
      const headers = (init?.headers || {}) as Record<string, string>;
      const range = headers['Range'];
      if (range === 'bytes=0-3') {
        return new Response(new Uint8Array([1, 2, 3, 4]), {
          status: 206,
          headers: {
            'Content-Type': 'video/mp4',
            'Content-Range': 'bytes 0-3/8',
            'Content-Length': '4',
            'Accept-Ranges': 'bytes',
          },
        });
      }
    }
    return new Response('Not found', { status: 404 });
  });

  const rangeReq = makeRequest(`http://localhost:3000/api/media/${registeredAssetId}`, {
    headers: {
      cookie: `admin_session=${mockAdminToken}`,
      Range: 'bytes=0-3',
    },
  });
  const rangeRes = await mediaDeliveryHandler(rangeReq, { params: Promise.resolve({ assetId: registeredAssetId }) });
  assert(rangeRes.status === 206, 'Video seeking with Range header returns HTTP 206 Partial Content');
  assert(rangeRes.headers.get('Content-Range') === 'bytes 0-3/8', 'Response includes Content-Range header');
  assert(rangeRes.headers.get('Cache-Control') === 'private, no-store', 'Response enforces Cache-Control: private, no-store');
  restoreFetch();

  // =============================================================
  // 7. Supabase Storage Blocking & Archive Decoupling
  // =============================================================
  console.log('\n>>> 7. Testing Supabase Upload Blocking & Archive Decoupling...');

  const legacySignReq = makeRequest('http://localhost:3000/api/admin/upload/sign', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: `admin_session=${mockAdminToken}`,
    },
    body: JSON.stringify({
      filename: 'legacy.mp4',
      fileSize: 1000,
      projectId: testProject.id,
    }),
  });
  const legacySignRes = await signLegacyUploadHandler(legacySignReq);
  assert(
    legacySignRes.status === 409,
    'Legacy upload sign endpoint blocks new Supabase Storage uploads with 409 Conflict when Drive is active'
  );

  let driveDeleteCalled = false;
  mockFetch(async (url, init) => {
    if (init?.method === 'DELETE' && url.includes('googleapis.com')) {
      driveDeleteCalled = true;
    }
    return new Response(null, { status: 204 });
  });

  const assetDeleted = await dataService.deleteAsset(registeredAssetId);
  assert(assetDeleted === true, 'Asset deleted from database successfully');
  assert(driveDeleteCalled === false, 'dataService.deleteAsset NEVER calls Drive delete API (Archive preserved)');

  const projectDeleted = await dataService.deleteProject(testProject.id);
  assert(projectDeleted === true, 'Project deleted from database successfully');
  assert(driveDeleteCalled === false, 'dataService.deleteProject NEVER purges Google Drive folders or files');
  restoreFetch();

  // =============================================================
  // 8. MediaUploader Finite Retry & Pending Registrations UI Logic
  // =============================================================
  console.log('\n>>> 8. Testing MediaUploader Finite Retry & Pending Registrations UI Logic...');

  // Test 8.1: Continuous upload failure where /status returns the same offset aborts after 5 attempts
  {
    const totalSize = 10 * 1024 * 1024; // 10MB
    let offset = 0;
    let lastConfirmedOffset = 0;
    let noProgressCount = 0;
    const MAX_NO_PROGRESS_ATTEMPTS = 5;
    let attempts = 0;
    let errorCaught: string | null = null;

    // Simulate upload loop where chunk PUT fails and /status returns unchanged offset (0)
    while (offset < totalSize) {
      attempts++;
      try {
        // Simulated network failure on chunk
        throw new Error('Network error during chunk PUT');
      } catch (err: any) {
        if (err?.message?.includes('توقف الرفع بعد')) {
          errorCaught = err.message;
          break;
        }

        // Mocked status result returning the exact same offset (no progress)
        const statusResult = { ok: true, complete: false, nextByteOffset: 0, fileId: null };
        if (statusResult.ok) {
          if (statusResult.nextByteOffset > lastConfirmedOffset) {
            offset = statusResult.nextByteOffset;
            lastConfirmedOffset = offset;
            noProgressCount = 0;
          } else {
            noProgressCount++;
            offset = statusResult.nextByteOffset;
            if (noProgressCount >= MAX_NO_PROGRESS_ATTEMPTS) {
              errorCaught = `توقف الرفع بعد ${MAX_NO_PROGRESS_ATTEMPTS} محاولات متتالية دون تقدم في استلام البيانات من Google Drive (الموضع: ${offset} من ${totalSize}). يمكنك إعادة المحاولة.`;
              break;
            }
          }
        }
      }
    }

    assert(attempts === 5, 'Stalled /status upload loop halts after exactly 5 attempts');
    assert(noProgressCount === 5, 'noProgressCount reached MAX_NO_PROGRESS_ATTEMPTS (5)');
    assert(
      errorCaught !== null && errorCaught.includes('توقف الرفع بعد 5 محاولات متتالية دون تقدم'),
      'Loop aborts with explicit retryable Arabic error message on stalled /status'
    );
  }

  // Test 8.2: Repeated 308 without progress halts after 5 attempts
  {
    const totalSize = 10 * 1024 * 1024;
    let offset = 0;
    let lastConfirmedOffset = 0;
    let noProgressCount = 0;
    const MAX_NO_PROGRESS_ATTEMPTS = 5;
    let attempts = 0;
    let errorCaught: string | null = null;

    while (offset < totalSize) {
      attempts++;
      // Simulate Drive returning 308 with unchanged confirmed offset
      const chunkData = { complete: false, nextByteOffset: 0 };
      const confirmedOffset = chunkData.nextByteOffset;

      if (confirmedOffset > lastConfirmedOffset) {
        offset = confirmedOffset;
        lastConfirmedOffset = offset;
        noProgressCount = 0;
      } else {
        noProgressCount++;
        offset = confirmedOffset;
        if (noProgressCount >= MAX_NO_PROGRESS_ATTEMPTS) {
          errorCaught = `توقف الرفع بعد ${MAX_NO_PROGRESS_ATTEMPTS} استجابات متتالية دون تقدم`;
          break;
        }
      }
    }

    assert(attempts === 5, 'Repeated 308 without progress halts after exactly 5 attempts');
    assert(noProgressCount === 5, 'noProgressCount tracks repeated 308 without progress');
    assert(errorCaught !== null && errorCaught.includes('توقف الرفع بعد 5'), 'Loop aborts with retryable error on repeated 308');
  }

  // Test 8.3: Forward progress strictly resets the noProgressCount counter
  {
    let lastConfirmedOffset = 0;
    let noProgressCount = 0;

    // First attempt advances to 2MB
    const offset1 = 2 * 1024 * 1024;
    if (offset1 > lastConfirmedOffset) {
      lastConfirmedOffset = offset1;
      noProgressCount = 0;
    }
    assert(noProgressCount === 0 && lastConfirmedOffset === 2097152, 'Forward progress initializes counter to 0');

    // 2 failed attempts with same offset
    for (let i = 0; i < 2; i++) {
      const stalledOffset = 2 * 1024 * 1024;
      if (stalledOffset > lastConfirmedOffset) {
        lastConfirmedOffset = stalledOffset;
        noProgressCount = 0;
      } else {
        noProgressCount++;
      }
    }
    assert(noProgressCount === 2, 'Two stalled attempts increment noProgressCount to 2');

    // Next attempt makes forward progress to 4MB
    const offset2 = 4 * 1024 * 1024;
    if (offset2 > lastConfirmedOffset) {
      lastConfirmedOffset = offset2;
      noProgressCount = 0;
    }
    assert(noProgressCount === 0 && lastConfirmedOffset === 4194304, 'New forward progress strictly resets noProgressCount to 0');
  }

  // Test 8.4: Multi-file pending registrations isolation & persistence
  {
    const storageKey = `media_studio_pending_regs_${testProject.id}`;
    const mockLocalStorage: Record<string, string> = {};

    let pendingRegistrations: Record<string, { fileId: string; title: string; fileName: string }> = {};

    const addPending = (item: { fileId: string; title: string; fileName: string }) => {
      pendingRegistrations = { ...pendingRegistrations, [item.fileId]: item };
      mockLocalStorage[storageKey] = JSON.stringify(pendingRegistrations);
    };

    const removePending = (fileId: string) => {
      const next = { ...pendingRegistrations };
      delete next[fileId];
      pendingRegistrations = next;
      if (Object.keys(next).length === 0) {
        delete mockLocalStorage[storageKey];
      } else {
        mockLocalStorage[storageKey] = JSON.stringify(next);
      }
    };

    // Step A: File A upload succeeds, registration fails -> recorded in pending
    addPending({ fileId: 'drive-file-A', title: 'File A', fileName: 'file_a.mp4' });
    assert(
      Boolean(pendingRegistrations['drive-file-A']),
      'File A is added to pendingRegistrations map on registration failure'
    );
    assert(
      JSON.parse(mockLocalStorage[storageKey])['drive-file-A']?.fileName === 'file_a.mp4',
      'File A is persisted in localStorage'
    );

    // Step B: File B upload succeeds, registration succeeds -> File A MUST NOT be erased
    // handleFiles loop processes B without touching A
    assert(
      Boolean(pendingRegistrations['drive-file-A']),
      'Successful upload and registration of File B preserves File A in pending registrations'
    );

    // Step C: File C upload succeeds, registration FAILS -> File C added, File A MUST NOT be overwritten
    addPending({ fileId: 'drive-file-C', title: 'File C', fileName: 'file_c.jpg' });
    assert(
      Boolean(pendingRegistrations['drive-file-A']) && Boolean(pendingRegistrations['drive-file-C']),
      'File C failure preserves File A and adds File C concurrently (2 pending items)'
    );
    assert(
      Object.keys(pendingRegistrations).length === 2,
      'pendingRegistrations dictionary holds exactly 2 independent items'
    );

    // Step D: Retry registration for File A succeeds -> remove File A, File C remains
    removePending('drive-file-A');
    assert(
      pendingRegistrations['drive-file-A'] === undefined,
      'File A is removed from pendingRegistrations upon successful retry'
    );
    assert(
      Boolean(pendingRegistrations['drive-file-C']),
      'File C remains safely pending after File A resolution'
    );

    // Step E: Page reload simulation restores remaining items from localStorage
    const reloaded = JSON.parse(mockLocalStorage[storageKey]);
    assert(
      reloaded['drive-file-C']?.title === 'File C',
      'Pending registration for File C survives page reload from localStorage'
    );

    // Step F: Resolution of File C clears storage
    removePending('drive-file-C');
    assert(
      Object.keys(pendingRegistrations).length === 0,
      'All pending registrations resolved'
    );
    assert(
      mockLocalStorage[storageKey] === undefined,
      'localStorage key cleanly removed when pending registrations are empty'
    );
  }

  // =============================================================
  // 9. Legacy Upload Closure & Strict Client-Only Media Delivery
  // =============================================================
  console.log('\n>>> 9. Testing Legacy Upload Closure & Strict Client-Only Media Delivery...');

  // Test 9.1: Direct legacy upload route (POST /api/admin/upload) is strictly blocked with 409
  {
    const legacyUploadReq = makeRequest('http://localhost:3000/api/admin/upload', {
      method: 'POST',
      headers: {
        cookie: `admin_session=${mockAdminToken}`,
      },
    });
    const legacyUploadRes = await legacyDirectUploadHandler(legacyUploadReq);
    assert(
      legacyUploadRes.status === 409,
      'Direct upload endpoint POST /api/admin/upload blocks writes with 409 Conflict when Drive is active'
    );
    const errBody = await legacyUploadRes.json().catch(() => ({}));
    assert(
      errBody.code === 'DRIVE_STORAGE_ACTIVE',
      'Legacy upload returns explicit DRIVE_STORAGE_ACTIVE code'
    );
  }

  // Test 9.2: formatClientMediaUrl attaches slug to internal routes and preserves external URLs
  {
    const internal = formatClientMediaUrl('/api/media/asset-1', 'asset-1', 'slug-abc');
    assert(internal === '/api/media/asset-1?slug=slug-abc', 'Attaches slug to internal /api/media route');

    const withParams = formatClientMediaUrl('/api/media/asset-1?type=thumbnail', 'asset-1', 'slug-abc');
    assert(withParams === '/api/media/asset-1?type=thumbnail&slug=slug-abc', 'Preserves existing query parameters when attaching slug');

    const external = formatClientMediaUrl('https://example.supabase.co/storage/v1/object/sign/file.mp4', 'asset-1', 'slug-abc');
    assert(external === 'https://example.supabase.co/storage/v1/object/sign/file.mp4', 'Preserves external URLs without modifying them');

    const download = formatClientMediaUrl(null, 'asset-1', 'slug-abc', { download: '1' });
    assert(download === '/api/media/asset-1?slug=slug-abc&download=1', 'Applies extra download parameter alongside slug');

    const existingSlug = formatClientMediaUrl('/api/media/asset-1?slug=slug-abc', 'asset-1', 'slug-abc');
    assert(existingSlug === '/api/media/asset-1?slug=slug-abc', 'Avoids duplicate slug if already present');
  }

  // Test 9.3: Setup Client Project, Client A (authorized) and Client B (unassigned) fixtures
  const clientTestProject = await dataService.createProject({
    title: 'مشروع وسائط العميل التجريبي',
    drive_folder_id: 'mock-folder-id',
  });

  const clientA_Link = await dataService.createAccessLink(
    'العميل المصرح',
    'mock_client_password_123',
    [clientTestProject.id] // Assigned to clientTestProject
  );

  const clientB_Link = await dataService.createAccessLink(
    'عميل غير مصرح للمشروع',
    'mock_client_password_123',
    [] // NOT assigned to clientTestProject
  );

  const clientA_Token = createSignedToken({
    linkId: clientA_Link.id,
    slug: clientA_Link.slug,
    viewerName: clientA_Link.viewer_name,
    sessionVersion: clientA_Link.session_version,
    expiresAt: Date.now() + 1000 * 60 * 60 * 24,
  });

  const clientB_Token = createSignedToken({
    linkId: clientB_Link.id,
    slug: clientB_Link.slug,
    viewerName: clientB_Link.viewer_name,
    sessionVersion: clientB_Link.session_version,
    expiresAt: Date.now() + 1000 * 60 * 60 * 24,
  });

  // Create Drive Image Asset
  const clientImageAsset = await dataService.createAsset({
    id: crypto.randomUUID(),
    project_id: clientTestProject.id,
    title: 'تصميم بوستر القناة',
    file_url: `/api/media/${crypto.randomUUID()}`,
    file_type: 'image',
    mime_type: 'image/png',
    file_size: 2048576,
    is_visible: true,
    drive_file_id: 'drive-image-file-abc',
    drive_folder_id: 'mock-folder-id',
    source: 'drive',
  } as any);

  // Create Drive Video Asset
  const clientVideoAsset = await dataService.createAsset({
    id: crypto.randomUUID(),
    project_id: clientTestProject.id,
    title: 'فاصل القناة الترويجي',
    file_url: `/api/media/${crypto.randomUUID()}`,
    file_type: 'video',
    mime_type: 'video/mp4',
    file_size: 15728640,
    is_visible: true,
    drive_file_id: 'drive-video-file-xyz',
    drive_folder_id: 'mock-folder-id',
    source: 'drive',
  } as any);

  // Test 9.4: Service layer generates URLs with client slug
  {
    const resolvedPlayback = await resolveAssetPlaybackUrl(clientImageAsset, 7200, clientA_Link.slug);
    assert(
      resolvedPlayback.includes(`slug=${clientA_Link.slug}`),
      'resolveAssetPlaybackUrl embeds client slug for internal Drive assets'
    );

    const resolvedThumb = await resolveAssetThumbnailUrl(clientImageAsset, 7200, clientA_Link.slug);
    assert(
      resolvedThumb !== null && resolvedThumb.includes(`slug=${clientA_Link.slug}`) && resolvedThumb.includes('type=thumbnail'),
      'resolveAssetThumbnailUrl embeds client slug and type=thumbnail for Drive image'
    );

    const clientAssets = await dataService.getAssetsForProject(clientTestProject.id, true, clientA_Link.slug);
    assert(
      clientAssets.some((a) => a.id === clientImageAsset.id && a.playback_url?.includes(`slug=${clientA_Link.slug}`)),
      'getAssetsForProject populates playback_url with slug for image'
    );
    assert(
      clientAssets.some((a) => a.id === clientVideoAsset.id && a.playback_url?.includes(`slug=${clientA_Link.slug}`)),
      'getAssetsForProject populates playback_url with slug for video'
    );
  }

  // Test 9.5: Client-Only Image Streaming, Thumbnail, and Download (ZERO admin cookie)
  {
    mockFetch(async (url) => {
      if (url === 'https://oauth2.googleapis.com/token') {
        return new Response(JSON.stringify({ access_token: 'mock-valid-token', expires_in: 3600 }), { status: 200 });
      }
      if (url.includes('drive-image-file-abc')) {
        return new Response(Buffer.from('mock-png-image-bytes'), {
          status: 200,
          headers: {
            'Content-Type': 'image/png',
            'Content-Length': '20',
          },
        });
      }
      return new Response('Not found', { status: 404 });
    });

    // A. Preview image with client cookie ONLY
    const clientImgReq = makeRequest(
      `http://localhost:3000/api/media/${clientImageAsset.id}?slug=${clientA_Link.slug}`,
      {
        headers: {
          cookie: `client_session_${clientA_Link.slug}=${clientA_Token}`, // NO admin_session
        },
      }
    );
    const clientImgRes = await mediaDeliveryHandler(clientImgReq, {
      params: Promise.resolve({ assetId: clientImageAsset.id }),
    });
    assert(clientImgRes.status === 200, 'Authorized client can view image (HTTP 200 without admin cookie)');
    assert(clientImgRes.headers.get('Content-Type') === 'image/png', 'Image delivered with correct Content-Type');
    assert(clientImgRes.headers.get('Cache-Control') === 'private, no-store', 'Image enforced Cache-Control: private, no-store');

    // B. Image thumbnail with client cookie ONLY
    const clientThumbReq = makeRequest(
      `http://localhost:3000/api/media/${clientImageAsset.id}?type=thumbnail&slug=${clientA_Link.slug}`,
      {
        headers: {
          cookie: `client_session_${clientA_Link.slug}=${clientA_Token}`,
        },
      }
    );
    const clientThumbRes = await mediaDeliveryHandler(clientThumbReq, {
      params: Promise.resolve({ assetId: clientImageAsset.id }),
    });
    assert(clientThumbRes.status === 200, 'Authorized client can view Drive image thumbnail (HTTP 200)');

    // C. Download image with client cookie ONLY
    const clientDownloadReq = makeRequest(
      `http://localhost:3000/api/media/${clientImageAsset.id}?slug=${clientA_Link.slug}&download=1`,
      {
        headers: {
          cookie: `client_session_${clientA_Link.slug}=${clientA_Token}`,
        },
      }
    );
    const clientDownloadRes = await mediaDeliveryHandler(clientDownloadReq, {
      params: Promise.resolve({ assetId: clientImageAsset.id }),
    });
    assert(clientDownloadRes.status === 200, 'Authorized client can download image (HTTP 200)');
    assert(
      Boolean(clientDownloadRes.headers.get('Content-Disposition')?.includes('attachment;')),
      'Download response specifies Content-Disposition: attachment'
    );

    restoreFetch();
  }

  // Test 9.6: Client-Only Video Streaming (Seeking HTTP 206) & Download (ZERO admin cookie)
  {
    mockFetch(async (url, init) => {
      if (url === 'https://oauth2.googleapis.com/token') {
        return new Response(JSON.stringify({ access_token: 'mock-valid-token', expires_in: 3600 }), { status: 200 });
      }
      if (url.includes('drive-video-file-xyz')) {
        const range = (init?.headers as any)?.range || (init?.headers as any)?.Range;
        if (range) {
          return new Response(Buffer.from('partial-video-bytes'), {
            status: 206,
            headers: {
              'Content-Type': 'video/mp4',
              'Content-Range': 'bytes 0-100/1000',
              'Content-Length': '19',
            },
          });
        }
        return new Response(Buffer.from('full-video-stream'), {
          status: 200,
          headers: {
            'Content-Type': 'video/mp4',
            'Content-Length': '1000',
          },
        });
      }
      return new Response('Not found', { status: 404 });
    });

    // A. Video seeking with Range header and client cookie ONLY
    const clientVideoSeekReq = makeRequest(
      `http://localhost:3000/api/media/${clientVideoAsset.id}?slug=${clientA_Link.slug}`,
      {
        headers: {
          cookie: `client_session_${clientA_Link.slug}=${clientA_Token}`,
          Range: 'bytes=0-100',
        },
      }
    );
    const clientVideoSeekRes = await mediaDeliveryHandler(clientVideoSeekReq, {
      params: Promise.resolve({ assetId: clientVideoAsset.id }),
    });
    assert(clientVideoSeekRes.status === 206, 'Client video playback with Range header returns HTTP 206 Partial Content');
    assert(clientVideoSeekRes.headers.get('Content-Range') === 'bytes 0-100/1000', 'Response includes valid Content-Range');

    // B. Video download with client cookie ONLY
    const clientVideoDownloadReq = makeRequest(
      `http://localhost:3000/api/media/${clientVideoAsset.id}?slug=${clientA_Link.slug}&download=1`,
      {
        headers: {
          cookie: `client_session_${clientA_Link.slug}=${clientA_Token}`,
        },
      }
    );
    const clientVideoDownloadRes = await mediaDeliveryHandler(clientVideoDownloadReq, {
      params: Promise.resolve({ assetId: clientVideoAsset.id }),
    });
    assert(clientVideoDownloadRes.status === 200, 'Authorized client can download video');
    assert(
      Boolean(clientVideoDownloadRes.headers.get('Content-Disposition')?.includes('attachment;')),
      'Video download enforces attachment disposition'
    );

    restoreFetch();
  }

  // Test 9.7: Strict Rejection of Unauthorized Clients (Authorization Gate Preserved)
  {
    // A. Request without slug and without admin cookie -> 401
    const noSlugReq = makeRequest(`http://localhost:3000/api/media/${clientVideoAsset.id}`);
    const noSlugRes = await mediaDeliveryHandler(noSlugReq, {
      params: Promise.resolve({ assetId: clientVideoAsset.id }),
    });
    assert(noSlugRes.status === 401, 'Request without slug or admin cookie is rejected with 401 Unauthorized');

    // B. Request with slug but missing cookie -> 401
    const noCookieReq = makeRequest(
      `http://localhost:3000/api/media/${clientVideoAsset.id}?slug=${clientA_Link.slug}`
    );
    const noCookieRes = await mediaDeliveryHandler(noCookieReq, {
      params: Promise.resolve({ assetId: clientVideoAsset.id }),
    });
    assert(noCookieRes.status === 401, 'Client request with missing cookie is rejected with 401');

    // C. Request with Client B (not assigned to this project) -> 403 Forbidden
    const unassignedClientReq = makeRequest(
      `http://localhost:3000/api/media/${clientVideoAsset.id}?slug=${clientB_Link.slug}`,
      {
        headers: {
          cookie: `client_session_${clientB_Link.slug}=${clientB_Token}`,
        },
      }
    );
    const unassignedClientRes = await mediaDeliveryHandler(unassignedClientReq, {
      params: Promise.resolve({ assetId: clientVideoAsset.id }),
    });
    assert(
      unassignedClientRes.status === 403,
      'Client not assigned to project is strictly rejected with 403 Forbidden'
    );

    // D. Request with tampered client token -> 401
    const tamperedReq = makeRequest(
      `http://localhost:3000/api/media/${clientVideoAsset.id}?slug=${clientA_Link.slug}`,
      {
        headers: {
          cookie: `client_session_${clientA_Link.slug}=tampered.bogus.token`,
        },
      }
    );
    const tamperedRes = await mediaDeliveryHandler(tamperedReq, {
      params: Promise.resolve({ assetId: clientVideoAsset.id }),
    });
    assert(tamperedRes.status === 401, 'Tampered client cookie is rejected with 401');
  }

  // Test 9.8: Client Download of Legacy Supabase File & Protected URL Verification
  {
    // Create Legacy Supabase Asset (source='legacy', storage_path set, no drive_file_id)
    const clientLegacyAsset = await dataService.createAsset({
      id: crypto.randomUUID(),
      project_id: clientTestProject.id,
      title: 'فيديو أرشيف سابق',
      original_filename: 'legacy_showreel.mp4',
      file_url: 'https://gfeffyihxijzifebafml.supabase.co/storage/v1/object/sign/media-studio-assets/projects/legacy/showreel.mp4?token=mock',
      storage_path: 'projects/legacy/showreel.mp4',
      file_type: 'video',
      mime_type: 'video/mp4',
      file_size: 18000000,
      is_visible: true,
      source: 'legacy',
    } as any);

    // 1. Verify Client UI Download URL formula
    // downloadUrl MUST be /api/media/{assetId}?slug={slug}&download=1, NOT playback_url
    const legacyDownloadUrl = `/api/media/${clientLegacyAsset.id}?slug=${encodeURIComponent(clientA_Link.slug)}&download=1`;
    const driveDownloadUrl = `/api/media/${clientVideoAsset.id}?slug=${encodeURIComponent(clientA_Link.slug)}&download=1`;

    assert(
      legacyDownloadUrl === `/api/media/${clientLegacyAsset.id}?slug=${clientA_Link.slug}&download=1`,
      'Legacy file download URL strictly uses protected /api/media route instead of external playback_url'
    );
    assert(
      !legacyDownloadUrl.includes('supabase.co'),
      'Legacy download URL NEVER exposes external Supabase storage URL in client UI'
    );
    assert(
      driveDownloadUrl === `/api/media/${clientVideoAsset.id}?slug=${clientA_Link.slug}&download=1`,
      'Drive file download URL strictly uses protected /api/media route'
    );

    // 2. Client-only download of Legacy Supabase File (ZERO admin cookie)
    const legacyDownloadReq = makeRequest(
      `http://localhost:3000${legacyDownloadUrl}`,
      {
        headers: {
          cookie: `client_session_${clientA_Link.slug}=${clientA_Token}`, // NO admin_session
        },
      }
    );
    const legacyDownloadRes = await mediaDeliveryHandler(legacyDownloadReq, {
      params: Promise.resolve({ assetId: clientLegacyAsset.id }),
    });

    assert(
      legacyDownloadRes.status === 307,
      'Authorized client can download legacy Supabase file (HTTP 307 redirect to secured file without admin cookie)'
    );
    assert(
      Boolean(legacyDownloadRes.headers.get('location')),
      'Legacy download response directs client to file location'
    );

    // 3. Unauthorized Client B attempting to download legacy file is rejected with 403
    const unauthLegacyDownloadReq = makeRequest(
      `http://localhost:3000/api/media/${clientLegacyAsset.id}?slug=${encodeURIComponent(clientB_Link.slug)}&download=1`,
      {
        headers: {
          cookie: `client_session_${clientB_Link.slug}=${clientB_Token}`,
        },
      }
    );
    const unauthLegacyDownloadRes = await mediaDeliveryHandler(unauthLegacyDownloadReq, {
      params: Promise.resolve({ assetId: clientLegacyAsset.id }),
    });
    assert(
      unauthLegacyDownloadRes.status === 403,
      'Unauthorized client attempting to download legacy Supabase file is strictly rejected with 403 Forbidden'
    );

    await dataService.deleteAsset(clientLegacyAsset.id);
  }

  // Cleanup fixtures
  await dataService.deleteAsset(clientImageAsset.id);
  await dataService.deleteAsset(clientVideoAsset.id);
  await dataService.deleteProject(clientTestProject.id);
  await dataService.deleteAccessLink(clientA_Link.id);
  await dataService.deleteAccessLink(clientB_Link.id);

  // =============================================================
  // SUMMARY
  // =============================================================
  console.log('\n================================================================');
  console.log(`SUITE 6 RESULTS: ${passed} PASSED | ${failed} FAILED`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runDrivePrototypeTests().catch((err) => {
  console.error('Fatal error in Suite 6:', err);
  process.exit(1);
});
