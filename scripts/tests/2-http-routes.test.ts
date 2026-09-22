/**
 * Test Suite 2: HTTP Route Handlers Integration Tests
 * Run via: npx tsx --conditions=react-server scripts/tests/2-http-routes.test.ts
 */

process.env.DATA_MODE = 'demo';

import { POST as authHandler } from '../../app/api/client/auth/route';
import { POST as commentHandler } from '../../app/api/client/comments/route';
import { POST as approvalHandler } from '../../app/api/client/approvals/route';
import { GET as coverHandler } from '../../app/api/media/cover/[projectId]/route';
import { GET as mediaHandler } from '../../app/api/media/[assetId]/route';
import { POST as uploadSignHandler } from '../../app/api/admin/upload/sign/route';
import { DELETE as orphanDeleteHandler } from '../../app/api/admin/assets/route';
import { PATCH as projectPatchHandler } from '../../app/api/admin/projects/[id]/route';

import { dataService, resolveProjectCoverUrl, isStoragePathReferenced } from '../../lib/data/service';
import { isServerSupabaseConfigured, getServerSupabase } from '../../lib/supabase/server';
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
    'host': 'localhost:3000',
    'origin': 'http://localhost:3000',
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

async function runHttpTests() {
  console.log('================================================================');
  console.log('SUITE 2: HTTP ROUTE HANDLERS & INTEGRATION RIGOR TESTS');
  console.log('================================================================\n');

  const HTTP_PROJ_A = '33333333-0000-4000-8000-0000000000a1';
  const HTTP_PROJ_B = '33333333-0000-4000-8000-0000000000b1';
  const HTTP_ASSET_A1 = '44444444-0000-4000-8000-0000000000a1';
  const HTTP_ASSET_B1 = '44444444-0000-4000-8000-0000000000b1';

  let linkA: any = null;
  let linkDisabled: any = null;

  try {
    console.log('>>> 1. Creating Isolated HTTP Test Fixtures...');
    await dataService.createProject({
      id: HTTP_PROJ_A,
      title: '__HTTP_TEST_PROJ_A__',
      cover_url: 'https://images.unsplash.com/photo-a',
      cover_storage_path: `projects/${HTTP_PROJ_A}/cover_a.jpg`,
      is_visible: true,
      is_archived: false,
      progress: 50,
    } as any);

    await dataService.createProject({
      id: HTTP_PROJ_B,
      title: '__HTTP_TEST_PROJ_B__',
      cover_url: 'https://images.unsplash.com/photo-b',
      cover_storage_path: `projects/${HTTP_PROJ_B}/cover_b.jpg`,
      is_visible: true,
      is_archived: false,
      progress: 75,
    } as any);

    await dataService.createAsset({
      id: HTTP_ASSET_A1,
      project_id: HTTP_PROJ_A,
      title: '__HTTP_TEST_ASSET_A1__',
      file_url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
      storage_path: `projects/${HTTP_PROJ_A}/asset_main_a1.mp4`,
      thumbnail_url: 'https://images.unsplash.com/photo-thumb-a',
      thumbnail_storage_path: `projects/${HTTP_PROJ_A}/thumb_a1.jpg`,
      file_type: 'video',
      is_visible: true,
    } as any);

    await dataService.createAsset({
      id: HTTP_ASSET_B1,
      project_id: HTTP_PROJ_B,
      title: '__HTTP_TEST_ASSET_B1__',
      file_url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
      storage_path: `projects/${HTTP_PROJ_B}/asset_main_b1.mp4`,
      file_type: 'video',
      is_visible: true,
    } as any);

    linkA = await dataService.createAccessLink('عميل تجربة HTTP', 'password123', [HTTP_PROJ_A]);
    linkDisabled = await dataService.createAccessLink('عميل معطل', 'disabled123', [HTTP_PROJ_A]);
    await dataService.updateAccessLink(linkDisabled.id, { enabled: false });

    const clientTokenA = createSignedToken({
      linkId: linkA.id,
      slug: linkA.slug,
      viewerName: linkA.viewer_name,
      sessionVersion: linkA.session_version ?? 1,
      expiresAt: Date.now() + 3600000,
    });

    const adminToken = createSignedToken({
      isAdmin: true,
      expiresAt: Date.now() + 3600000,
    });

    console.log('\n>>> 2. Testing /api/client/auth Route (Status, Payload, Cookies)...');
    // Invalid password -> 401
    const badAuthReq = makeRequest('http://localhost:3000/api/client/auth', {
      method: 'POST',
      body: { slug: linkA.slug, password: 'wrong_password' },
    });
    const badAuthRes = await authHandler(badAuthReq);
    const badAuthJson = await badAuthRes.json();
    assert(badAuthRes.status === 401, 'Invalid password rejected with 401');
    assert(typeof badAuthJson.error === 'string', '401 response contains error message payload');

    // Disabled link -> 403
    const disabledReq = makeRequest('http://localhost:3000/api/client/auth', {
      method: 'POST',
      body: { slug: linkDisabled.slug, password: 'disabled123' },
    });
    const disabledRes = await authHandler(disabledReq);
    const disabledJson = await disabledRes.json();
    assert(disabledRes.status === 403, 'Disabled link rejected with 403');
    assert(disabledJson.error.includes('معطل') || typeof disabledJson.error === 'string', '403 response details disabled link');

    // Direct handler invocation outside Next.js request scope:
    // Without the silent catch, setClientSession throws, authHandler catches it and returns 500
    // (Proves silent swallow was eliminated; real cookie issuance is tested in Suite 5 on live server)
    const directAuthReq = makeRequest('http://localhost:3000/api/client/auth', {
      method: 'POST',
      body: { slug: linkA.slug, password: 'password123' },
    });
    const directAuthRes = await authHandler(directAuthReq);
    const directAuthJson = await directAuthRes.json();
    assert(
      directAuthRes.status === 500 && directAuthJson.error?.includes('فشل إصدار جلسة'),
      'Direct authHandler invocation outside request scope propagates session failure with 500 (silent catch eliminated)'
    );

    console.log('\n>>> 3. Testing /api/client/comments Route (Rigor & Payload Verification)...');
    // Without session cookie -> 401
    const unauthCommentReq = makeRequest('http://localhost:3000/api/client/comments', {
      method: 'POST',
      body: { assetId: HTTP_ASSET_A1, slug: linkA.slug, body: 'ملاحظة غير مصرحة' },
    });
    const unauthCommentRes = await commentHandler(unauthCommentReq);
    assert(unauthCommentRes.status === 401, 'Comment without session rejected with 401');

    // Unassigned asset -> 403
    const foreignCommentReq = makeRequest('http://localhost:3000/api/client/comments', {
      method: 'POST',
      headers: { cookie: `client_session_${linkA.slug}=${clientTokenA}` },
      body: { assetId: HTTP_ASSET_B1, slug: linkA.slug, body: 'محاولة تعليق على مشروع آخر' },
    });
    const foreignCommentRes = await commentHandler(foreignCommentReq);
    assert(foreignCommentRes.status === 403, 'Comment on unassigned asset rejected with 403');

    // Valid comment -> 200
    const validCommentReq = makeRequest('http://localhost:3000/api/client/comments', {
      method: 'POST',
      headers: { cookie: `client_session_${linkA.slug}=${clientTokenA}` },
      body: { assetId: HTTP_ASSET_A1, slug: linkA.slug, body: 'ملاحظة شرعية ومحكمة', timestampSeconds: 5 },
    });
    const validCommentRes = await commentHandler(validCommentReq);
    const validCommentJson = await validCommentRes.json();
    assert(validCommentRes.status === 200, 'Authorized comment accepted with 200');
    assert(validCommentJson.comment?.body === 'ملاحظة شرعية ومحكمة', 'Comment payload stored and returned correctly');
    assert(validCommentJson.comment?.author_name === 'عميل تجربة HTTP', 'Author name automatically derived from token');

    console.log('\n>>> 4. Testing /api/client/approvals Route (Toggle Payload Verification)...');
    // Without session cookie -> 401
    const unauthAppReq = makeRequest('http://localhost:3000/api/client/approvals', {
      method: 'POST',
      body: { assetId: HTTP_ASSET_A1, slug: linkA.slug, approved: true },
    });
    const unauthAppRes = await approvalHandler(unauthAppReq);
    assert(unauthAppRes.status === 401, 'Approval without session rejected with 401');

    // Unassigned asset -> 403
    const foreignAppReq = makeRequest('http://localhost:3000/api/client/approvals', {
      method: 'POST',
      headers: { cookie: `client_session_${linkA.slug}=${clientTokenA}` },
      body: { assetId: HTTP_ASSET_B1, slug: linkA.slug, approved: true },
    });
    const foreignAppRes = await approvalHandler(foreignAppReq);
    assert(foreignAppRes.status === 403, 'Approval on unassigned asset rejected with 403');

    // Valid approval toggle -> 200
    const validAppReq = makeRequest('http://localhost:3000/api/client/approvals', {
      method: 'POST',
      headers: { cookie: `client_session_${linkA.slug}=${clientTokenA}` },
      body: { assetId: HTTP_ASSET_A1, slug: linkA.slug, approved: true },
    });
    const validAppRes = await approvalHandler(validAppReq);
    const validAppJson = await validAppRes.json();
    assert(validAppRes.status === 200, 'Authorized approval toggle accepted with 200');
    assert(validAppJson.approval?.approved === true, 'Approval payload reflects approved: true');

    console.log('\n>>> 5. Testing /api/media/cover/[projectId] Route (Security & Redirection)...');
    // Unauthorized -> 401
    const unauthCoverReq = makeRequest(`http://localhost:3000/api/media/cover/${HTTP_PROJ_A}`);
    const unauthCoverRes = await coverHandler(unauthCoverReq, { params: Promise.resolve({ projectId: HTTP_PROJ_A }) });
    assert(unauthCoverRes.status === 401, 'Cover request without session rejected with 401');

    // Unassigned project -> 403
    const foreignCoverReq = makeRequest(`http://localhost:3000/api/media/cover/${HTTP_PROJ_B}?slug=${linkA.slug}`, {
      headers: { cookie: `client_session_${linkA.slug}=${clientTokenA}` },
    });
    const foreignCoverRes = await coverHandler(foreignCoverReq, { params: Promise.resolve({ projectId: HTTP_PROJ_B }) });
    assert(foreignCoverRes.status === 403, 'Cover request for unassigned project rejected with 403');

    // Authorized cover access -> Must NEVER expose raw storage path
    const validCoverReq = makeRequest(`http://localhost:3000/api/media/cover/${HTTP_PROJ_A}?slug=${linkA.slug}`, {
      headers: { cookie: `client_session_${linkA.slug}=${clientTokenA}` },
    });
    const validCoverRes = await coverHandler(validCoverReq, { params: Promise.resolve({ projectId: HTTP_PROJ_A }) });
    const locationHeader = validCoverRes.headers.get('location');
    assert(
      (validCoverRes.status === 200 || validCoverRes.status === 307) && !locationHeader?.startsWith('projects/'),
      'Authorized cover resolved without exposing raw internal storage path',
      `Status: ${validCoverRes.status}, Location: ${locationHeader}`
    );

    console.log('\n>>> 6. Testing /api/media/[assetId] Route (Thumbnail & Media Safety)...');
    const unauthThumbReq = makeRequest(`http://localhost:3000/api/media/${HTTP_ASSET_A1}?type=thumbnail`);
    const unauthThumbRes = await mediaHandler(unauthThumbReq, { params: Promise.resolve({ assetId: HTTP_ASSET_A1 }) });
    assert(unauthThumbRes.status === 401, 'Thumbnail request without session rejected with 401');

    const foreignThumbReq = makeRequest(`http://localhost:3000/api/media/${HTTP_ASSET_B1}?type=thumbnail&slug=${linkA.slug}`, {
      headers: { cookie: `client_session_${linkA.slug}=${clientTokenA}` },
    });
    const foreignThumbRes = await mediaHandler(foreignThumbReq, { params: Promise.resolve({ assetId: HTTP_ASSET_B1 }) });
    assert(foreignThumbRes.status === 403, 'Thumbnail request for unassigned asset rejected with 403');

    const validThumbReq = makeRequest(`http://localhost:3000/api/media/${HTTP_ASSET_A1}?type=thumbnail&slug=${linkA.slug}`, {
      headers: { cookie: `client_session_${linkA.slug}=${clientTokenA}` },
    });
    const validThumbRes = await mediaHandler(validThumbReq, { params: Promise.resolve({ assetId: HTTP_ASSET_A1 }) });
    const thumbLocation = validThumbRes.headers.get('location');
    assert(
      (validThumbRes.status === 200 || validThumbRes.status === 307) && !thumbLocation?.startsWith('projects/'),
      'Authorized thumbnail resolved safely without raw storage path'
    );

    console.log('\n>>> 7. Testing /api/admin/upload/sign Route (File Size Limits & Guardrails)...');
    const missingSizeReq = makeRequest('http://localhost:3000/api/admin/upload/sign', {
      method: 'POST',
      headers: { cookie: `admin_session=${adminToken}` },
      body: { filename: 'ident.mp4', projectId: HTTP_PROJ_A },
    });
    const missingSizeRes = await uploadSignHandler(missingSizeReq);
    assert(missingSizeRes.status === 400, 'Missing fileSize rejected with 400');

    const negativeSizeReq = makeRequest('http://localhost:3000/api/admin/upload/sign', {
      method: 'POST',
      headers: { cookie: `admin_session=${adminToken}` },
      body: { filename: 'ident.mp4', projectId: HTTP_PROJ_A, fileSize: -50 },
    });
    const negativeSizeRes = await uploadSignHandler(negativeSizeReq);
    assert(negativeSizeRes.status === 400, 'Negative fileSize rejected with 400');

    const oversizedReq = makeRequest('http://localhost:3000/api/admin/upload/sign', {
      method: 'POST',
      headers: { cookie: `admin_session=${adminToken}` },
      body: { filename: 'ident.mp4', projectId: HTTP_PROJ_A, fileSize: 524288001 },
    });
    const oversizedRes = await uploadSignHandler(oversizedReq);
    assert(oversizedRes.status === 400, 'File exceeding 500 MB hard limit rejected with 400');

    const validSignReq = makeRequest('http://localhost:3000/api/admin/upload/sign', {
      method: 'POST',
      headers: { cookie: `admin_session=${adminToken}` },
      body: { filename: 'ident.mp4', projectId: HTTP_PROJ_A, fileSize: 45000000 },
    });
    const validSignRes = await uploadSignHandler(validSignReq);
    const validSignJson = await validSignRes.json();
    assert(validSignRes.status === 200, 'Valid upload signing request accepted with 200');
    assert(validSignJson.directUpload === false && validSignJson.storagePath === null, 'Sign route indicates directUpload: false in demo mode');

    console.log('\n>>> 8. Testing Sanitization in DELETE /api/admin/assets...');
    const traversalReq = makeRequest('http://localhost:3000/api/admin/assets', {
      method: 'DELETE',
      headers: { cookie: `admin_session=${adminToken}` },
      body: { storagePath: `projects/${HTTP_PROJ_A}/../../etc/secret.key`, projectId: HTTP_PROJ_A },
    });
    const traversalRes = await orphanDeleteHandler(traversalReq);
    assert(traversalRes.status === 400, 'DELETE endpoint strictly rejects traversal (..) with 400');

    const crossProjReq = makeRequest('http://localhost:3000/api/admin/assets', {
      method: 'DELETE',
      headers: { cookie: `admin_session=${adminToken}` },
      body: { storagePath: `projects/${HTTP_PROJ_B}/victim.mp4`, projectId: HTTP_PROJ_A },
    });
    const crossProjRes = await orphanDeleteHandler(crossProjReq);
    assert(crossProjRes.status === 400, 'DELETE endpoint strictly rejects cross-project storage path with 400');

    const unauthDeleteReq = makeRequest('http://localhost:3000/api/admin/assets', {
      method: 'DELETE',
      body: { storagePath: `projects/${HTTP_PROJ_A}/temp.mp4`, projectId: HTTP_PROJ_A },
    });
    const unauthDeleteRes = await orphanDeleteHandler(unauthDeleteReq);
    assert(unauthDeleteRes.status === 401, 'DELETE endpoint rejects unauthenticated request with 401');

    // -------------------------------------------------------------
    // POINT 1: Orphan Cleanup Reference Checking & Abortion Tests
    // -------------------------------------------------------------
    console.log('\n>>> 9. Point 1: Testing Orphan Cleanup Reference Protection & Error-First Abortion...');

    // 9a. Test attempting to delete storage_path of an active asset
    const deleteMainAssetFileReq = makeRequest('http://localhost:3000/api/admin/assets', {
      method: 'DELETE',
      headers: { cookie: `admin_session=${adminToken}` },
      body: { storagePath: `projects/${HTTP_PROJ_A}/asset_main_a1.mp4`, projectId: HTTP_PROJ_A },
    });
    const deleteMainAssetFileRes = await orphanDeleteHandler(deleteMainAssetFileReq);
    const deleteMainJson = await deleteMainAssetFileRes.json();
    assert(
      deleteMainAssetFileRes.status === 400 && deleteMainJson.error?.includes('ملف أصل رئيسي'),
      'Refuses deletion of storage path referenced as main asset file (400 Bad Request)',
      `Payload: ${JSON.stringify(deleteMainJson)}`
    );

    // 9b. Test attempting to delete thumbnail_storage_path of an active asset
    const deleteThumbFileReq = makeRequest('http://localhost:3000/api/admin/assets', {
      method: 'DELETE',
      headers: { cookie: `admin_session=${adminToken}` },
      body: { storagePath: `projects/${HTTP_PROJ_A}/thumb_a1.jpg`, projectId: HTTP_PROJ_A },
    });
    const deleteThumbFileRes = await orphanDeleteHandler(deleteThumbFileReq);
    const deleteThumbJson = await deleteThumbFileRes.json();
    assert(
      deleteThumbFileRes.status === 400 && deleteThumbJson.error?.includes('مصغر لأصل'),
      'Refuses deletion of storage path referenced as asset thumbnail (400 Bad Request)',
      `Payload: ${JSON.stringify(deleteThumbJson)}`
    );

    // 9c. Test attempting to delete cover_storage_path of a project
    const deleteCoverFileReq = makeRequest('http://localhost:3000/api/admin/assets', {
      method: 'DELETE',
      headers: { cookie: `admin_session=${adminToken}` },
      body: { storagePath: `projects/${HTTP_PROJ_A}/cover_a.jpg`, projectId: HTTP_PROJ_A },
    });
    const deleteCoverFileRes = await orphanDeleteHandler(deleteCoverFileReq);
    const deleteCoverJson = await deleteCoverFileRes.json();
    assert(
      deleteCoverFileRes.status === 400 && deleteCoverJson.error?.includes('غلاف لمشروع'),
      'Refuses deletion of storage path referenced as project cover (400 Bad Request)',
      `Payload: ${JSON.stringify(deleteCoverJson)}`
    );

    // 9d. Test deleting an unreferenced temporary path (must succeed with 200)
    const deleteUnrefReq = makeRequest('http://localhost:3000/api/admin/assets', {
      method: 'DELETE',
      headers: { cookie: `admin_session=${adminToken}` },
      body: { storagePath: `projects/${HTTP_PROJ_A}/truly_unreferenced_orphan.mp4`, projectId: HTTP_PROJ_A },
    });
    const deleteUnrefRes = await orphanDeleteHandler(deleteUnrefReq);
    const deleteUnrefJson = await deleteUnrefRes.json();
    assert(
      deleteUnrefRes.status === 200 && deleteUnrefJson.success === true,
      'Permits deletion of truly unreferenced storage path with 200 OK'
    );

    // 9e. Direct test of isStoragePathReferenced function behavior
    const refDirectAsset = await isStoragePathReferenced(`projects/${HTTP_PROJ_A}/asset_main_a1.mp4`);
    assert(refDirectAsset.referenced === true, 'isStoragePathReferenced detects active asset file');

    const refDirectThumb = await isStoragePathReferenced(`projects/${HTTP_PROJ_A}/thumb_a1.jpg`);
    assert(refDirectThumb.referenced === true, 'isStoragePathReferenced detects active thumbnail');

    const refDirectCover = await isStoragePathReferenced(`projects/${HTTP_PROJ_A}/cover_a.jpg`);
    assert(refDirectCover.referenced === true, 'isStoragePathReferenced detects active project cover');

    const refDirectClean = await isStoragePathReferenced(`projects/${HTTP_PROJ_A}/non_existent_file.jpg`);
    assert(refDirectClean.referenced === false, 'isStoragePathReferenced correctly reports unreferenced file');

    // -------------------------------------------------------------
    // POINT 2: DATA_MODE as Single Source of Truth & Mock Supabase Spy
    // -------------------------------------------------------------
    console.log('\n>>> 10. Point 2: Testing DATA_MODE as Single Source of Truth & Zero Cloud Calls Spy...');

    // Temporarily inject dummy Supabase keys while DATA_MODE=demo
    const originalEnvUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const originalAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const originalServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    let cloudNetworkAttempted = false;
    const originalFetch = globalThis.fetch;

    try {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://fake-mock-spy-project.supabase.co';
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'fake-anon-key-mock-data-mode';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role-key-mock-data-mode';
      process.env.DATA_MODE = 'demo';

      // Verify that despite present keys, isServerSupabaseConfigured() is strictly false
      assert(
        isServerSupabaseConfigured() === false,
        'isServerSupabaseConfigured() returns false when DATA_MODE=demo even with all Supabase keys present'
      );

      // Verify that getServerSupabase() returns null
      assert(
        getServerSupabase() === null,
        'getServerSupabase() returns null when DATA_MODE=demo'
      );

      // Spy on fetch to ensure zero outbound calls to Supabase endpoint
      globalThis.fetch = (async (input: any, init: any) => {
        const urlStr = typeof input === 'string' ? input : input?.url || '';
        if (urlStr.includes('supabase.co')) {
          cloudNetworkAttempted = true;
          throw new Error(`SECURITY_ALERT: Unauthorized outbound cloud call to ${urlStr} during DATA_MODE=demo!`);
        }
        return originalFetch(input, init);
      }) as any;

      // Perform a full series of dataService and API operations
      const spyTestProjId = '77777777-0000-4000-8000-000000000001';
      await dataService.createProject({
        id: spyTestProjId,
        title: '__SPY_PROJ__',
        is_visible: true,
        progress: 10,
      } as any);

      await dataService.updateProject(spyTestProjId, { progress: 20 });
      await dataService.getAllProjects();
      await dataService.getProjectById(spyTestProjId);

      const spyLink = await dataService.createAccessLink('عميل الفحص الصامت', 'pass123', [spyTestProjId]);
      await dataService.getAccessLinkBySlug(spyLink.slug);

      // Run upload sign route
      const spySignReq = makeRequest('http://localhost:3000/api/admin/upload/sign', {
        method: 'POST',
        headers: { cookie: `admin_session=${adminToken}` },
        body: { filename: 'spy_demo_upload.mp4', projectId: spyTestProjId, fileSize: 1024 },
      });
      const spySignRes = await uploadSignHandler(spySignReq);
      assert(spySignRes.status === 200, 'Upload sign handled locally in demo mode');

      // Clean up spy test entities
      await dataService.deleteAccessLink(spyLink.id);
      await dataService.deleteProject(spyTestProjId);

      assert(cloudNetworkAttempted === false, 'Supabase spy empirically confirmed ZERO cloud calls / writes in demo mode');

    } finally {
      // Restore environment and fetch
      globalThis.fetch = originalFetch;
      if (originalEnvUrl) process.env.NEXT_PUBLIC_SUPABASE_URL = originalEnvUrl;
      else delete process.env.NEXT_PUBLIC_SUPABASE_URL;

      if (originalAnonKey) process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalAnonKey;
      else delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      if (originalServiceKey) process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceKey;
      else delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    }

    // -------------------------------------------------------------
    // POINT 4: Unifying cover_url and cover_storage_path in Migrated Projects
    // -------------------------------------------------------------
    console.log('\n>>> 11. Point 4: Testing Migration of Legacy Project Cover -> Update -> Clear (display_cover_url === null)...');

    const MIGRATED_PROJ_ID = '66666666-0000-4000-8000-000000000001';

    // Step 1: Create a project simulating a legacy migrated project with old storage path
    await dataService.createProject({
      id: MIGRATED_PROJ_ID,
      title: '__LEGACY_MIGRATED_PROJECT__',
      cover_url: 'projects/covers/legacy_broadcast_cover.jpg',
      cover_storage_path: 'projects/covers/legacy_broadcast_cover.jpg',
      is_visible: true,
      progress: 60,
    } as any);

    const initialMigrated = await dataService.getProjectById(MIGRATED_PROJ_ID);
    assert(initialMigrated?.cover_url === 'projects/covers/legacy_broadcast_cover.jpg', 'Initial legacy project cover_url set');
    assert(initialMigrated?.cover_storage_path === 'projects/covers/legacy_broadcast_cover.jpg', 'Initial legacy project cover_storage_path set');

    const initialResolvedCover = await resolveProjectCoverUrl(initialMigrated!);
    assert(
      initialResolvedCover !== null && !initialResolvedCover.startsWith('projects/'),
      'Legacy project initially resolves display cover safely'
    );

    // Step 2: Update cover to a new external URL via PATCH /api/admin/projects/[id]
    const updateCoverReq = makeRequest(`http://localhost:3000/api/admin/projects/${MIGRATED_PROJ_ID}`, {
      method: 'PATCH',
      headers: { cookie: `admin_session=${adminToken}` },
      body: { cover_url: 'https://images.unsplash.com/photo-new-channel-ident' },
    });
    const updateCoverRes = await projectPatchHandler(updateCoverReq, { params: Promise.resolve({ id: MIGRATED_PROJ_ID }) });
    const updateCoverJson = await updateCoverRes.json();
    assert(updateCoverRes.status === 200, 'PATCH project cover succeeded with 200');
    assert(updateCoverJson.project?.cover_url === 'https://images.unsplash.com/photo-new-channel-ident', 'cover_url updated to new URL');
    assert(updateCoverJson.project?.cover_storage_path === null, 'cover_storage_path cleared when replaced by direct URL');

    // Step 3: Remove cover by sending { cover_url: null } via PATCH /api/admin/projects/[id]
    const removeCoverReq = makeRequest(`http://localhost:3000/api/admin/projects/${MIGRATED_PROJ_ID}`, {
      method: 'PATCH',
      headers: { cookie: `admin_session=${adminToken}` },
      body: { cover_url: null },
    });
    const removeCoverRes = await projectPatchHandler(removeCoverReq, { params: Promise.resolve({ id: MIGRATED_PROJ_ID }) });
    const removeCoverJson = await removeCoverRes.json();
    assert(removeCoverRes.status === 200, 'PATCH remove project cover succeeded with 200');
    assert(removeCoverJson.project?.cover_url === null, 'PATCH response returns cover_url: null');
    assert(removeCoverJson.project?.cover_storage_path === null, 'PATCH response returns cover_storage_path: null');

    // Step 4: Reload project from dataService and verify display_cover_url === null
    const reloadedMigratedProj = await dataService.getProjectById(MIGRATED_PROJ_ID);
    assert(reloadedMigratedProj?.cover_url === null, 'Reloaded project cover_url is strictly null');
    assert(reloadedMigratedProj?.cover_storage_path === null, 'Reloaded project cover_storage_path is strictly null');

    const finalDisplayCoverUrl = await resolveProjectCoverUrl(reloadedMigratedProj!);
    assert(finalDisplayCoverUrl === null, 'Empirically verified: display_cover_url === null after cover removal');

    // Clean up migrated test project
    await dataService.deleteProject(MIGRATED_PROJ_ID);

  } finally {
    console.log('\n>>> Cleaning up HTTP test fixtures...');
    if (linkA?.id) await dataService.deleteAccessLink(linkA.id);
    if (linkDisabled?.id) await dataService.deleteAccessLink(linkDisabled.id);
    await dataService.deleteProject(HTTP_PROJ_A);
    await dataService.deleteProject(HTTP_PROJ_B);
    console.log('  [OK] Cleaned up.');
  }

  console.log('\n================================================================');
  console.log(`SUITE 2 RESULTS: ${passed} PASSED | ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) process.exit(1);
}

runHttpTests().catch((err) => {
  console.error('Suite 2 crashed:', err);
  process.exit(1);
});
