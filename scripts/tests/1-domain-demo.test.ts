/**
 * Test Suite 1: Domain & Demo Engine Isolation Tests
 * Run via: npx tsx --conditions=react-server scripts/tests/1-domain-demo.test.ts
 */

import { authorizeClientSession, authorizeClientProject, authorizeClientAsset } from '../../lib/auth/authorize';
import { createSignedToken } from '../../lib/auth/session';
import { dataService, getDataMode, resolveProjectCoverUrl, resolveAssetThumbnailUrl } from '../../lib/data/service';

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

async function runDomainTests() {
  console.log('================================================================');
  console.log('SUITE 1: DOMAIN & DEMO ENGINE ISOLATION TESTS');
  console.log('================================================================\n');

  // -------------------------------------------------------------
  // Test 0: Verify Explicit DATA_MODE Requirement
  // -------------------------------------------------------------
  console.log('>>> 0. Testing DATA_MODE Configuration Enforcement...');
  try {
    delete process.env.DATA_MODE;
    let missingModeThrew = false;
    try {
      getDataMode();
    } catch (err: any) {
      missingModeThrew = err.message.includes('CONFIG_ERROR');
    }
    assert(missingModeThrew, 'Absence of DATA_MODE throws CONFIG_ERROR and refuses implicit demo');
  } finally {
    process.env.DATA_MODE = 'demo';
  }

  assert(getDataMode() === 'demo', 'Explicit DATA_MODE=demo recognized');

  const TEST_PROJ_A = '11111111-0000-4000-8000-0000000000a1';
  const TEST_PROJ_B = '11111111-0000-4000-8000-0000000000b1';
  const TEST_ASSET_A1 = '22222222-0000-4000-8000-0000000000a1';

  let linkA: any = null;
  let linkB: any = null;

  try {
    console.log('\n>>> 1. Creating Isolated Test Entities...');
    await dataService.createProject({
      id: TEST_PROJ_A,
      title: '__TEST_DOMAIN_PROJ_A__',
      cover_url: 'projects/covers/cover_a.jpg',
      cover_storage_path: 'projects/covers/cover_a.jpg',
      is_visible: true,
      is_archived: false,
      progress: 40,
    } as any);

    await dataService.createProject({
      id: TEST_PROJ_B,
      title: '__TEST_DOMAIN_PROJ_B__',
      cover_url: 'https://images.unsplash.com/photo-ext',
      is_visible: true,
      is_archived: false,
      progress: 80,
    } as any);

    await dataService.createAsset({
      id: TEST_ASSET_A1,
      project_id: TEST_PROJ_A,
      title: '__TEST_DOMAIN_ASSET_A1__',
      file_url: 'projects/assets/video_a.mp4',
      storage_path: 'projects/assets/video_a.mp4',
      thumbnail_url: 'projects/thumbs/thumb_a.jpg',
      thumbnail_storage_path: 'projects/thumbs/thumb_a.jpg',
      file_type: 'video',
      is_visible: true,
    } as any);

    linkA = await dataService.createAccessLink('أحمد', 'passA123', [TEST_PROJ_A]);
    linkB = await dataService.createAccessLink('أحمد', 'passB456', [TEST_PROJ_B]);

    assert(Boolean(linkA?.id && linkB?.id), 'Client A & Client B links created');
    assert(linkA.id !== linkB.id, 'Distinct link IDs despite identical names ("أحمد")');

    console.log('\n>>> 2. Domain Authorization & Cross-Client Isolation...');
    const tokenA = createSignedToken({
      linkId: linkA.id,
      slug: linkA.slug,
      viewerName: linkA.viewer_name,
      sessionVersion: 1,
      expiresAt: Date.now() + 3600000,
    });

    const authResultA = await authorizeClientSession(linkA.slug, tokenA);
    assert(authResultA.ok === true, 'Client A session authorized with valid token');

    const projAAuth = await authorizeClientProject(linkA.slug, TEST_PROJ_A, tokenA);
    assert(projAAuth.ok === true, 'Client A authorized to assigned Project A');

    const projBAuth = await authorizeClientProject(linkA.slug, TEST_PROJ_B, tokenA);
    assert(projBAuth.ok === false && projBAuth.status === 403, 'Client A blocked from unassigned Project B with 403');

    const assetA1Auth = await authorizeClientAsset(linkA.slug, TEST_ASSET_A1, tokenA);
    assert(assetA1Auth.ok === true, 'Client A authorized to Asset A1');

    console.log('\n>>> 3. Cross-Client Approval Independence...');
    const appA1 = await dataService.toggleApproval(TEST_ASSET_A1, linkA.id, 'أحمد', true);
    const appB1 = await dataService.toggleApproval(TEST_ASSET_A1, linkB.id, 'أحمد', true);
    assert(appA1.approved === true && appB1.approved === true, 'Both clients approved asset independently');

    const appA2 = await dataService.toggleApproval(TEST_ASSET_A1, linkA.id, 'أحمد', false);
    const assetsProjA = await dataService.getAssetsForProject(TEST_PROJ_A);
    const assetA1Record = assetsProjA.find((a) => a.id === TEST_ASSET_A1);
    const storedAppA = assetA1Record?.approvals?.find((a) => a.access_link_id === linkA.id);
    const storedAppB = assetA1Record?.approvals?.find((a) => a.access_link_id === linkB.id);

    assert(appA2.approved === false && storedAppA?.approved === false, 'Client A toggled approval to false');
    assert(storedAppB?.approved === true, 'Client B approval strictly unaffected (zero collision)');

    console.log('\n>>> 4. Session Invalidation on Password Change...');
    await dataService.updateAccessLink(linkA.id, { passwordPlain: 'newSecretA' });
    const refreshedLinkA = await dataService.getAccessLinkBySlug(linkA.slug);
    assert(refreshedLinkA?.session_version === 2, 'session_version incremented to 2');

    const staleAuth = await authorizeClientSession(linkA.slug, tokenA);
    assert(staleAuth.ok === false && staleAuth.status === 401, 'Stale token (version 1) rejected with 401');

    console.log('\n>>> 5. Atomic Clone-and-Swap & Transaction Rollback...');
    const preRollbackVersion = refreshedLinkA!.session_version;
    let atomicFailedAsExpected = false;
    try {
      // Attempting to assign a non-existent project ID must throw and rollback cleanly
      await dataService.updateAccessLink(linkA.id, {
        projectIds: ['99999999-9999-9999-9999-999999999999'],
        passwordPlain: 'will_be_reverted',
      });
    } catch (err: any) {
      atomicFailedAsExpected = err.message.includes('ATOMIC_UPDATE_FAILED');
    }
    assert(atomicFailedAsExpected, 'Invalid project assignment threw ATOMIC_UPDATE_FAILED error');

    const postRollbackLink = await dataService.getAccessLinkBySlug(linkA.slug);
    assert(postRollbackLink?.session_version === preRollbackVersion, 'Link session_version was rolled back to original');
    assert(Boolean(postRollbackLink?.project_ids?.includes(TEST_PROJ_A)), 'Original project assignments preserved intact');

    console.log('\n>>> 6. Raw Storage Path Exposure Prevention...');
    const projARecord = await dataService.getProjectById(TEST_PROJ_A);
    const resolvedCover = await resolveProjectCoverUrl(projARecord!);
    assert(
      resolvedCover !== null && !resolvedCover.startsWith('projects/'),
      'Project cover resolver NEVER returns raw internal storage path',
      `Resolved value: ${resolvedCover}`
    );

    const assetA1Rec = await dataService.getAssetById(TEST_ASSET_A1);
    const resolvedThumb = await resolveAssetThumbnailUrl(assetA1Rec!);
    assert(
      resolvedThumb !== null && !resolvedThumb.startsWith('projects/'),
      'Asset thumbnail resolver NEVER returns raw internal storage path',
      `Resolved value: ${resolvedThumb}`
    );

  } finally {
    console.log('\n>>> Cleaning up test entities...');
    if (linkA?.id) await dataService.deleteAccessLink(linkA.id);
    if (linkB?.id) await dataService.deleteAccessLink(linkB.id);
    await dataService.deleteProject(TEST_PROJ_A);
    await dataService.deleteProject(TEST_PROJ_B);
    console.log('  [OK] Cleaned up.');
  }

  console.log('\n================================================================');
  console.log(`SUITE 1 RESULTS: ${passed} PASSED | ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) process.exit(1);
}

runDomainTests().catch((err) => {
  console.error('Suite 1 crashed:', err);
  process.exit(1);
});
