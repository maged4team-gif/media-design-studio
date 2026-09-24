/**
 * Test Suite 13: Resilient Google Drive Cleanup & Safe Batch Project Deletion
 * Run via: npx tsx --conditions=react-server scripts/tests/13-safe-project-deletion.test.ts
 */

process.env.DATA_MODE = 'demo';
process.env.ADMIN_PASSWORD = 'test-admin-secret-password-123';
process.env.GOOGLE_DRIVE_REFRESH_TOKEN = 'mock-refresh-token';
process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID = 'mock-root-archive-folder-id';
process.env.GOOGLE_CLIENT_ID = 'mock-client-id';
process.env.GOOGLE_CLIENT_SECRET = 'mock-client-secret';

import crypto from 'crypto';
import { dataService } from '../../lib/data/service';
import { deleteDriveFileOrFolder } from '../../lib/drive/client';
import { DELETE as batchDeleteHandler } from '../../app/api/admin/projects/route';
import { DELETE as singleDeleteHandler } from '../../app/api/admin/projects/[id]/route';
import { createSignedToken } from '../../lib/auth/session';

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

// Global fetch mocking with token support
const originalFetch = global.fetch;
function mockFetch(handler: (url: string, init?: RequestInit) => Promise<Response>) {
  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
    if (url.includes('oauth2.googleapis.com/token')) {
      return new Response(JSON.stringify({
        access_token: 'mock-valid-access-token',
        expires_in: 3600,
        token_type: 'Bearer',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return handler(url, init);
  }) as typeof global.fetch;
}
function restoreFetch() {
  global.fetch = originalFetch;
}

function makeRequest(
  url: string,
  options: {
    method?: string;
    body?: any;
    headers?: Record<string, string>;
  } = {}
): Request {
  const method = options.method || 'GET';
  const headers = new Headers({
    host: 'localhost:3000',
    origin: 'http://localhost:3000',
    ...(options.headers || {}),
  });

  if (options.body && method !== 'GET') {
    headers.set('content-type', 'application/json');
    return new Request(url, {
      method,
      headers,
      body: JSON.stringify(options.body),
    });
  }

  return new Request(url, {
    method,
    headers,
  });
}

async function runTests() {
  console.log('================================================================');
  console.log('SUITE 13: RESILIENT DRIVE CLEANUP & SAFE PROJECT DELETION TESTS');
  console.log('================================================================\n');

  const mockAdminToken = createSignedToken(
    { isAdmin: true, expiresAt: Date.now() + 60 * 60 * 1000 },
    60 * 60 * 1000
  );

  // -------------------------------------------------------------
  // 1. deleteDriveFileOrFolder Unit Tests
  // -------------------------------------------------------------
  console.log('>>> 1. Testing deleteDriveFileOrFolder Resiliency & Safety Guards...');

  // Null/empty ID
  const nullRes = await deleteDriveFileOrFolder(null);
  assert(nullRes.success === true && nullRes.notFound === true, 'deleteDriveFileOrFolder handles null or empty ID gracefully');

  // Root folder protection (by ID)
  const rootProtectRes = await deleteDriveFileOrFolder('mock-root-archive-folder-id');
  assert(rootProtectRes.success === false, 'Strictly blocks deletion of root archive folder by ID');
  assert(rootProtectRes.error?.includes('root archive'), 'Returns explicit error for root archive folder protection');

  // Root folder protection (by Name check)
  mockFetch(async (url) => {
    if (url.includes('/files/folder-named-archive')) {
      return new Response(JSON.stringify({ id: 'folder-named-archive', name: 'Media Studio Archive' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(null, { status: 404 });
  });
  const rootNameRes = await deleteDriveFileOrFolder('folder-named-archive', { isFolder: true });
  assert(rootNameRes.success === false, 'Strictly blocks deletion of folder named Media Studio Archive');
  restoreFetch();

  // 404 Tolerance (item already deleted on Drive)
  mockFetch(async (url, init) => {
    if (init?.method === 'DELETE') {
      return new Response(JSON.stringify({ error: { message: 'File not found: 404' } }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(null, { status: 200 });
  });
  const notFoundRes = await deleteDriveFileOrFolder('already-deleted-file-id');
  assert(notFoundRes.success === true, 'Drive 404 response is treated as success (item already gone)');
  assert(notFoundRes.notFound === true, 'Identifies item as already deleted/not found');
  restoreFetch();

  // Network / 500 error tolerance (does not throw)
  mockFetch(async (url) => {
    if (url.includes('/files/')) {
      throw new Error('Network connection timeout');
    }
    return new Response(null, { status: 200 });
  });
  const networkErrRes = await deleteDriveFileOrFolder('network-fail-file-id');
  assert(networkErrRes.success === false, 'Network exception is safely caught and returns success: false without throwing');
  assert(networkErrRes.error === 'Network connection timeout', 'Captures error message safely');
  restoreFetch();

  // -------------------------------------------------------------
  // 2. dataService.deleteProject & Shared Folder Protection
  // -------------------------------------------------------------
  console.log('\n>>> 2. Testing Shared Folder Protection & Cascade Cleanup...');

  const sharedFolderId = 'shared-client-folder-' + crypto.randomUUID();
  const dynamicDriveFileId = 'drive-file-' + crypto.randomUUID();

  const projA = await dataService.createProject({
    title: 'مشروع اختبار أ ' + Date.now(),
    category: 'إعلانات',
  });
  const projB = await dataService.createProject({
    title: 'مشروع اختبار ب ' + Date.now(),
    category: 'إعلانات',
  });

  // Assign shared folder to both projects
  await dataService.updateProject(projA.id, { drive_folder_id: sharedFolderId });
  await dataService.updateProject(projB.id, { drive_folder_id: sharedFolderId });

  // Create an asset for projA
  const assetA = await dataService.createAsset({
    project_id: projA.id,
    title: 'ملف مشروع أ',
    file_url: '/api/media/dummy',
    drive_file_id: dynamicDriveFileId,
  });

  // Add a comment and approval for assetA
  await dataService.addComment(
    assetA.id,
    null,
    'العميل التجريبي',
    'ملاحظة على ملف أ'
  );
  await dataService.toggleApproval(
    assetA.id,
    'mock-access-link-id',
    'العميل التجريبي',
    true
  );

  const initialAssetsA = await dataService.getAssetsForProject(projA.id);
  assert(initialAssetsA.length === 1, 'Project A initialized with 1 asset');
  assert(initialAssetsA[0].comments?.length === 1, 'Asset has 1 comment attached');
  assert(initialAssetsA[0].approvals?.length === 1, 'Asset has 1 approval attached');

  let attemptedDeletedDriveIds: string[] = [];
  mockFetch(async (url, init) => {
    if (init?.method === 'DELETE' && url.includes('googleapis.com')) {
      const parts = url.split('/files/');
      if (parts[1]) attemptedDeletedDriveIds.push(decodeURIComponent(parts[1]));
      return new Response(null, { status: 204 });
    }
    return new Response(null, { status: 200 });
  });

  // Delete project A
  const deleteResultA = await dataService.deleteProject(projA.id);
  assert(deleteResultA === true, 'Project A deleted successfully');
  assert(attemptedDeletedDriveIds.includes(dynamicDriveFileId), 'Associated Drive file dynamicDriveFileId attempted for deletion');
  assert(!attemptedDeletedDriveIds.includes(sharedFolderId), 'Shared folder was NOT deleted (shared with Project B)');

  // Verify DB / store entities cleaned
  const fetchedProjA = await dataService.getProjectById(projA.id);
  assert(fetchedProjA === null, 'Project A record removed from store');
  const fetchedAssetA = await dataService.getAssetById(assetA.id);
  assert(fetchedAssetA === null, 'Asset A record removed from store');
  const remainingAssetsA = await dataService.getAssetsForProject(projA.id);
  assert(remainingAssetsA.length === 0, 'No remaining assets for Project A');

  // Now delete project B (sole remaining user of sharedFolderId)
  attemptedDeletedDriveIds = [];
  const deleteResultB = await dataService.deleteProject(projB.id);
  assert(deleteResultB === true, 'Project B deleted successfully');
  assert(attemptedDeletedDriveIds.includes(sharedFolderId), 'Folder is now deleted when no other projects share it');
  restoreFetch();

  // -------------------------------------------------------------
  // 3. Batch Project Deletion (dataService.deleteProjectsBatch)
  // -------------------------------------------------------------
  console.log('\n>>> 3. Testing deleteProjectsBatch...');

  const batchP1 = await dataService.createProject({ title: 'دفعة 1 ' + Date.now() });
  const batchP2 = await dataService.createProject({ title: 'دفعة 2 ' + Date.now() });
  const batchP3 = await dataService.createProject({ title: 'دفعة 3 ' + Date.now() });

  await dataService.createAsset({ project_id: batchP1.id, title: 'ملف 1', file_url: '/dummy1' });
  await dataService.createAsset({ project_id: batchP1.id, title: 'ملف 2', file_url: '/dummy2' });
  await dataService.createAsset({ project_id: batchP2.id, title: 'ملف 3', file_url: '/dummy3' });

  mockFetch(async () => new Response(null, { status: 204 }));
  const batchRes = await dataService.deleteProjectsBatch([batchP1.id, batchP2.id, batchP3.id]);
  assert(batchRes.success === true, 'Batch deletion returns success: true');
  assert(batchRes.deletedCount === 3, 'Batch reports deletedCount === 3');
  assert(batchRes.totalAssetsDeleted === 3, 'Batch reports totalAssetsDeleted === 3');
  assert(batchRes.failedIds.length === 0, 'Batch reports 0 failed IDs');

  const p1Check = await dataService.getProjectById(batchP1.id);
  const p2Check = await dataService.getProjectById(batchP2.id);
  const p3Check = await dataService.getProjectById(batchP3.id);
  assert(p1Check === null && p2Check === null && p3Check === null, 'All batch projects removed from store');
  restoreFetch();

  // -------------------------------------------------------------
  // 4. API Endpoints: Batch DELETE /api/admin/projects & CSRF/Auth Guards
  // -------------------------------------------------------------
  console.log('\n>>> 4. Testing Batch DELETE HTTP Route...');

  // Unauthenticated request
  const unauthReq = makeRequest('http://localhost:3000/api/admin/projects', {
    method: 'DELETE',
    body: { projectIds: ['any-id'] },
  });
  const unauthRes = await batchDeleteHandler(unauthReq);
  assert(unauthRes.status === 401, 'Batch DELETE endpoint rejects unauthenticated request with 401');

  // CSRF mismatch
  const csrfReq = new Request('http://localhost:3000/api/admin/projects', {
    method: 'DELETE',
    headers: {
      cookie: `admin_session=${mockAdminToken}`,
      origin: 'http://malicious-site.com',
      host: 'localhost:3000',
    },
    body: JSON.stringify({ projectIds: ['any-id'] }),
  });
  const csrfRes = await batchDeleteHandler(csrfReq);
  assert(csrfRes.status === 403, 'Batch DELETE endpoint rejects CSRF mismatch with 403');

  // Empty projectIds validation
  const emptyReq = makeRequest('http://localhost:3000/api/admin/projects', {
    method: 'DELETE',
    headers: {
      cookie: `admin_session=${mockAdminToken}`,
    },
    body: { projectIds: [] },
  });
  const emptyRes = await batchDeleteHandler(emptyReq);
  assert(emptyRes.status === 400, 'Batch DELETE endpoint validates non-empty projectIds with HTTP 400');

  // Authorized batch delete execution
  const testP4 = await dataService.createProject({ title: 'مشروع مسار 1 ' + Date.now() });
  const testP5 = await dataService.createProject({ title: 'مشروع مسار 2 ' + Date.now() });

  mockFetch(async () => new Response(null, { status: 204 }));
  const validBatchReq = makeRequest('http://localhost:3000/api/admin/projects', {
    method: 'DELETE',
    headers: {
      cookie: `admin_session=${mockAdminToken}`,
    },
    body: { projectIds: [testP4.id, testP5.id] },
  });
  const validBatchRes = await batchDeleteHandler(validBatchReq);
  const validBatchData = await validBatchRes.json();
  assert(validBatchRes.status === 200, 'Batch DELETE endpoint succeeds with HTTP 200');
  assert(validBatchData.success === true, 'Returns success: true');
  assert(validBatchData.deletedCount === 2, 'Returns deletedCount: 2');
  restoreFetch();

  // -------------------------------------------------------------
  // 5. API Endpoints: Single DELETE /api/admin/projects/[id]
  // -------------------------------------------------------------
  console.log('\n>>> 5. Testing Single Project DELETE HTTP Route...');

  const singleProj = await dataService.createProject({ title: 'مشروع فردي ' + Date.now() });
  mockFetch(async () => new Response(null, { status: 204 }));

  const singleReq = makeRequest(`http://localhost:3000/api/admin/projects/${singleProj.id}`, {
    method: 'DELETE',
    headers: {
      cookie: `admin_session=${mockAdminToken}`,
    },
  });
  const singleRes = await singleDeleteHandler(singleReq, {
    params: Promise.resolve({ id: singleProj.id }),
  });
  const singleData = await singleRes.json();
  assert(singleRes.status === 200, 'Single DELETE route returns HTTP 200');
  assert(singleData.success === true, 'Single DELETE returns success: true');

  const checkSingle = await dataService.getProjectById(singleProj.id);
  assert(checkSingle === null, 'Single project removed from database/store');
  restoreFetch();

  console.log('\n================================================================');
  console.log(`SUITE 13 RESULTS: ${passed} PASSED | ${failed} FAILED`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
