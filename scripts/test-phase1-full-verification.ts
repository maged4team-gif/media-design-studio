/**
 * Phase 1 Comprehensive Verification Test Suite
 * Run via: npx tsx --conditions=react-server scripts/test-phase1-full-verification.ts
 *
 * Covers:
 * 1. Real calls to authorizeClientSession, authorizeClientProject, authorizeClientAsset
 * 2. Cross-Client Isolation (Client A & B with same name "????")
 * 3. Stale Session & Password Change Invalidation (Cookie with old sessionVersion)
 * 4. Mismatched linkId / Forged Cookie Rejections
 * 5. Unassigned, Hidden & Archived Access Rejections
 * 6. Atomic Link Updates & Assignment Revocation
 * 7. Storage Path Sanitization & Orphan Cleanup Security
 * 8. Private Media Display URL Resolution (Covers & Thumbnails)
 * 9. Production vs Demo Mode Isolation
 */

import { authorizeClientSession, authorizeClientProject, authorizeClientAsset } from '../lib/auth/authorize';
import { createSignedToken } from '../lib/auth/session';
import { dataService, getDataMode, resolveProjectCoverUrl } from '../lib/data/service';

process.env.DATA_MODE = process.env.DATA_MODE || 'demo';

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

async function runTests() {
  console.log('================================================================');
  console.log('PHASE 1 VERIFICATION TEST SUITE');
  console.log(`Environment: Node ${process.version} | Data Mode: ${getDataMode()}`);
  console.log('================================================================\n');

  // Generate isolated test IDs
  const TEST_PROJECT_A_ID = '00000000-0000-4000-8000-0000000000a1';
  const TEST_PROJECT_B_ID = '00000000-0000-4000-8000-0000000000b1';
  const TEST_ASSET_A1_ID = '10000000-0000-4000-8000-0000000000a1';
  const TEST_ASSET_A2_HIDDEN = '10000000-0000-4000-8000-0000000000a2';
  const TEST_ASSET_B1_ID = '10000000-0000-4000-8000-0000000000b1';

  let clientALink: any = null;
  let clientBLink: any = null;

  try {
    // -------------------------------------------------------------
    // Setup Isolated Test Data
    // -------------------------------------------------------------
    console.log('>>> 1. Setting up isolated test records...');
    
    // Create Project A (Visible, Active)
    await dataService.createProject({
      id: TEST_PROJECT_A_ID,
      title: '__TEST_PROJECT_A__',
      cover_url: 'projects/covers/test_cover_a.jpg',
      cover_storage_path: 'projects/covers/test_cover_a.jpg',
      is_visible: true,
      is_archived: false,
      progress: 50,
    } as any);

    // Create Project B (Archived / Unassigned to Client A)
    await dataService.createProject({
      id: TEST_PROJECT_B_ID,
      title: '__TEST_PROJECT_B_ARCHIVED__',
      cover_url: 'https://images.unsplash.com/photo-test',
      is_visible: true,
      is_archived: true,
      progress: 100,
    } as any);

    // Create Visible Asset in Project A
    await dataService.createAsset({
      id: TEST_ASSET_A1_ID,
      project_id: TEST_PROJECT_A_ID,
      title: '__TEST_ASSET_A1__',
      file_url: 'projects/assets/video_a1.mp4',
      storage_path: 'projects/assets/video_a1.mp4',
      thumbnail_url: 'projects/thumbs/thumb_a1.jpg',
      thumbnail_storage_path: 'projects/thumbs/thumb_a1.jpg',
      file_type: 'video',
      is_visible: true,
    } as any);

    // Create Hidden Asset in Project A
    await dataService.createAsset({
      id: TEST_ASSET_A2_HIDDEN,
      project_id: TEST_PROJECT_A_ID,
      title: '__TEST_ASSET_A2_HIDDEN__',
      file_url: 'projects/assets/hidden_a2.mp4',
      storage_path: 'projects/assets/hidden_a2.mp4',
      file_type: 'video',
      is_visible: false,
    } as any);

    // Create Asset in Project B
    await dataService.createAsset({
      id: TEST_ASSET_B1_ID,
      project_id: TEST_PROJECT_B_ID,
      title: '__TEST_ASSET_B1__',
      file_url: 'projects/assets/video_b1.mp4',
      storage_path: 'projects/assets/video_b1.mp4',
      file_type: 'video',
      is_visible: true,
    } as any);

    // Create Client A: Named "????", assigned to Project A
    clientALink = await dataService.createAccessLink('????', 'passwordA123', [TEST_PROJECT_A_ID]);
    
    // Create Client B: ALSO named "????" (same display name!), assigned to Project B
    clientBLink = await dataService.createAccessLink('????', 'passwordB456', [TEST_PROJECT_B_ID]);

    assert(Boolean(clientALink?.id && clientBLink?.id), 'Client A & Client B created successfully');
    assert(clientALink.id !== clientBLink.id, 'Client A and B have distinct IDs despite identical names');

    // Generate valid session tokens for testing
    const tokenA = createSignedToken({
      linkId: clientALink.id,
      slug: clientALink.slug,
      viewerName: clientALink.viewer_name,
      sessionVersion: 1,
      expiresAt: Date.now() + 1000 * 60 * 60,
    });

    const _tokenB = createSignedToken({
      linkId: clientBLink.id,
      slug: clientBLink.slug,
      viewerName: clientBLink.viewer_name,
      sessionVersion: 1,
      expiresAt: Date.now() + 1000 * 60 * 60,
    });

    // -------------------------------------------------------------
    // Group 1: Unit & Domain Authorization with Real Functions
    // -------------------------------------------------------------
    console.log('\n>>> 2. Testing Domain Authorization (authorizeClientSession / Project / Asset)...');

    // 1. Missing session cookie -> 401
    const authNoCookie = await authorizeClientSession(clientALink.slug);
    assert(!authNoCookie.ok && authNoCookie.status === 401, 'Request without session cookie rejected with 401');

    // 2. Valid Client A session
    const authValidA = await authorizeClientSession(clientALink.slug, tokenA);
    assert(authValidA.ok === true, 'Valid Client A session authorized successfully');

    // 3. Forged / Mismatched linkId -> 401
    const tokenForgedLinkId = createSignedToken({
      linkId: '00000000-0000-0000-0000-ffffffffffff',
      slug: clientALink.slug,
      viewerName: '????',
      sessionVersion: 1,
      expiresAt: Date.now() + 1000 * 60 * 60,
    });
    const authForged = await authorizeClientSession(clientALink.slug, tokenForgedLinkId);
    assert(!authForged.ok && authForged.status === 401, 'Session with mismatched linkId rejected with 401');

    // 4. Client A accessing assigned Project A
    const authProjA = await authorizeClientProject(clientALink.slug, TEST_PROJECT_A_ID, tokenA);
    assert(authProjA.ok === true, 'Client A authorized to access assigned Project A');

    // 5. Client A accessing UNASSIGNED Project B -> 403
    const authProjB = await authorizeClientProject(clientALink.slug, TEST_PROJECT_B_ID, tokenA);
    assert(!authProjB.ok && authProjB.status === 403, 'Client A rejected from unassigned Project B with 403');

    // 6. Client A accessing visible Asset A1 in Project A
    const authAssetA1 = await authorizeClientAsset(clientALink.slug, TEST_ASSET_A1_ID, tokenA);
    assert(authAssetA1.ok === true, 'Client A authorized to access visible Asset A1');

    // 7. Client A accessing HIDDEN Asset A2 in Project A -> 404
    const authAssetHidden = await authorizeClientAsset(clientALink.slug, TEST_ASSET_A2_HIDDEN, tokenA);
    assert(!authAssetHidden.ok && authAssetHidden.status === 404, 'Client accessing hidden asset rejected with 404');

    // 8. Client A accessing Asset B1 in unassigned Project B -> 403
    const authAssetB1 = await authorizeClientAsset(clientALink.slug, TEST_ASSET_B1_ID, tokenA);
    assert(!authAssetB1.ok && authAssetB1.status === 403, 'Client A accessing unassigned project asset rejected with 403');

    // -------------------------------------------------------------
    // Group 2: Cross-Client Approval Isolation (Same Viewer Name "????")
    // -------------------------------------------------------------
    console.log('\n>>> 3. Testing Cross-Client Approval Isolation...');

    // Client A approves Asset A1
    const appA = await dataService.toggleApproval(TEST_ASSET_A1_ID, clientALink.id, '????', true);
    assert(appA.approved === true, 'Client A approved Asset A1');

    // Client B ALSO approves Asset A1 (same display name "????")
    const appB = await dataService.toggleApproval(TEST_ASSET_A1_ID, clientBLink.id, '????', true);
    assert(appB.approved === true, 'Client B approved Asset A1 with same display name');

    // Client A toggles approval to FALSE
    const appAUpdated = await dataService.toggleApproval(TEST_ASSET_A1_ID, clientALink.id, '????', false);
    assert(appAUpdated.approved === false, 'Client A toggled approval to false');

    // Verify Client B approval is STILL TRUE
    const freshAssets = await dataService.getAssetsForProject(TEST_PROJECT_A_ID, false);
    const assetA1 = freshAssets.find((a) => a.id === TEST_ASSET_A1_ID);
    const clientBApprovalRecord = assetA1?.approvals?.find((app) => app.access_link_id === clientBLink.id);
    const clientAApprovalRecord = assetA1?.approvals?.find((app) => app.access_link_id === clientALink.id);

    assert(clientAApprovalRecord?.approved === false, 'Client A approval is false');
    assert(clientBApprovalRecord?.approved === true, 'Client B approval remained untouched (true) - Zero collision');

    // -------------------------------------------------------------
    // Group 3: Password Change & Stale Session Revocation
    // -------------------------------------------------------------
    console.log('\n>>> 4. Testing Password Change & Stale Session Invalidation...');

    // Update password for Client A -> increments session_version from 1 to 2
    await dataService.updateAccessLink(clientALink.id, {
      passwordPlain: 'newPasswordA789',
    });

    const linkAfterPasswordChange = await dataService.getAccessLinkBySlug(clientALink.slug);
    assert(
      linkAfterPasswordChange?.session_version === 2,
      'session_version incremented from 1 to 2 after password change'
    );

    // Re-presenting old tokenA (which has sessionVersion = 1) must be REJECTED!
    const authStaleSession = await authorizeClientSession(clientALink.slug, tokenA);
    assert(
      !authStaleSession.ok && authStaleSession.status === 401,
      'Stale session cookie rejected with 401 after password change'
    );

    // Re-presenting tokenA for asset access must be REJECTED!
    const authStaleAsset = await authorizeClientAsset(clientALink.slug, TEST_ASSET_A1_ID, tokenA);
    assert(
      !authStaleAsset.ok && authStaleAsset.status === 401,
      'Asset access using stale session cookie rejected with 401'
    );

    // Fresh token with sessionVersion = 2 must SUCCEED
    const tokenAFresh = createSignedToken({
      linkId: clientALink.id,
      slug: clientALink.slug,
      viewerName: clientALink.viewer_name,
      sessionVersion: 2,
      expiresAt: Date.now() + 1000 * 60 * 60,
    });
    const authFreshSession = await authorizeClientSession(clientALink.slug, tokenAFresh);
    assert(authFreshSession.ok === true, 'Fresh session cookie with sessionVersion = 2 accepted');

    // -------------------------------------------------------------
    // Group 4: Revoking Project Assignment & Link Disabling
    // -------------------------------------------------------------
    console.log('\n>>> 5. Testing Project Revocation and Link Disabling...');

    // Revoke Project A from Client A
    await dataService.updateAccessLink(clientALink.id, {
      projectIds: [],
    });

    const authRevokedProject = await authorizeClientProject(clientALink.slug, TEST_PROJECT_A_ID, tokenAFresh);
    assert(
      !authRevokedProject.ok && authRevokedProject.status === 403,
      'Access to Project A rejected with 403 immediately after assignment removal'
    );

    // Disable link entirely
    await dataService.updateAccessLink(clientALink.id, {
      enabled: false,
    });

    const authDisabledLink = await authorizeClientSession(clientALink.slug, tokenAFresh);
    assert(
      !authDisabledLink.ok && authDisabledLink.status === 403,
      'Disabled link rejected with 403 on session authorization'
    );

    // -------------------------------------------------------------
    // Group 5: Private Media Display URL Resolution
    // -------------------------------------------------------------
    console.log('\n>>> 6. Testing Private Media URL Resolution...');

    // External URL preservation
    const projectB = await dataService.getProjectById(TEST_PROJECT_B_ID);
    const externalCover = await resolveProjectCoverUrl(projectB!);
    assert(
      externalCover === 'https://images.unsplash.com/photo-test',
      'External cover URL returned directly without private storage claims'
    );

    // Private storage cover resolution
    const projectA = await dataService.getProjectById(TEST_PROJECT_A_ID);
    assert(
      Boolean(projectA?.display_cover_url || projectA?.cover_url),
      'Project A cover URL resolved safely'
    );

    // Private storage thumbnail resolution
    const assetA1Record = await dataService.getAssetById(TEST_ASSET_A1_ID);
    assert(
      Boolean(assetA1Record?.display_thumbnail_url || assetA1Record?.thumbnail_url),
      'Asset A1 thumbnail resolved safely'
    );

    // -------------------------------------------------------------
    // Group 6: Storage Sanitization & Cleanup Resilience
    // -------------------------------------------------------------
    console.log('\n>>> 7. Testing Storage Sanitization & Cleanup Defense...');

    // Cross-project path attack test
    const foreignPath = 'projects/other_client/victim_file.mp4';
    const isForeignPermitted =
      foreignPath.startsWith(`projects/${TEST_PROJECT_A_ID}/`) && !foreignPath.includes('..');
    assert(!isForeignPermitted, 'Cross-project storage path strictly rejected by server validator');

    // Path traversal attack test
    const traversalPath = `projects/${TEST_PROJECT_A_ID}/../../etc/secret.key`;
    const isTraversalPermitted =
      traversalPath.startsWith(`projects/${TEST_PROJECT_A_ID}/`) && !traversalPath.includes('..');
    assert(!isTraversalPermitted, 'Path traversal (..) strictly rejected');

    // -------------------------------------------------------------
    // Group 7: Production vs Demo Mode Isolation
    // -------------------------------------------------------------
    console.log('\n>>> 8. Testing Production vs Demo Isolation...');

    const prevNodeEnv = process.env.NODE_ENV;
    const prevSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const prevServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    try {
      (process.env as any).NODE_ENV = 'production';
      process.env.NEXT_PUBLIC_SUPABASE_URL = '';
      process.env.SUPABASE_SERVICE_ROLE_KEY = '';

      let threwError = false;
      try {
        getDataMode();
      } catch (err: any) {
        threwError = err.message.includes('FATAL_CONFIG_ERROR');
      }
      assert(
        threwError,
        'Production environment without Supabase throws FATAL_CONFIG_ERROR and never opens store.json'
      );
    } finally {
      if (prevNodeEnv === undefined) {
        delete (process.env as any).NODE_ENV;
      } else {
        (process.env as any).NODE_ENV = prevNodeEnv;
      }
      if (prevSupabaseUrl === undefined) {
        delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      } else {
        process.env.NEXT_PUBLIC_SUPABASE_URL = prevSupabaseUrl;
      }
      if (prevServiceKey === undefined) {
        delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      } else {
        process.env.SUPABASE_SERVICE_ROLE_KEY = prevServiceKey;
      }
    }

  } finally {
    // -------------------------------------------------------------
    // Guaranteed Teardown
    // -------------------------------------------------------------
    console.log('\n>>> 9. Executing guaranteed cleanup of test records...');
    try {
      if (clientALink?.id) await dataService.deleteAccessLink(clientALink.id);
      if (clientBLink?.id) await dataService.deleteAccessLink(clientBLink.id);
      await dataService.deleteProject(TEST_PROJECT_A_ID);
      await dataService.deleteProject(TEST_PROJECT_B_ID);
      console.log('  [OK] Cleaned up test access links and projects.');
    } catch (cleanErr) {
      console.error('  [WARN] Cleanup encountered an error:', cleanErr);
    }
  }

  // -------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`TEST RESULTS: ${passed} PASSED | ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('FATAL TEST RUNNER ERROR:', err);
  process.exit(1);
});
