/**
 * Phase 1 Security & Authorization Acceptance Test Suite
 * Run with: node scripts/test-phase1-security.mjs
 */

process.env.DATA_MODE = process.env.DATA_MODE || 'demo';

import { checkRateLimit, recordRateLimitAttempt, resetRateLimit } from '../lib/auth/rate-limit.ts';
import { timingSafeEqualString } from '../lib/auth/session.ts';
import { verifyRequestOrigin } from '../lib/auth/csrf.ts';
import { dataService } from '../lib/data/service.ts';

async function runTests() {
  console.log('\n======================================================');
  console.log('   PHASE 1 SECURITY ACCEPTANCE TEST SUITE');
  console.log('======================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`[PASS] ${message}`);
      passed++;
    } else {
      console.error(`[FAIL] ${message}`);
      failed++;
    }
  }

  // -------------------------------------------------------------
  // Test 1: Timing-safe string comparison
  // -------------------------------------------------------------
  console.log('\n--- 1. Timing-Safe Comparison Tests ---');
  assert(timingSafeEqualString('password123', 'password123') === true, 'Matching strings return true');
  assert(timingSafeEqualString('password123', 'password124') === false, 'Differing characters return false');
  assert(timingSafeEqualString('password123', 'short') === false, 'Differing lengths return false');

  // -------------------------------------------------------------
  // Test 2: Rate Limiting Enforcement
  // -------------------------------------------------------------
  console.log('\n--- 2. Rate Limiting Tests ---');
  const testIp = 'test_ip_127_0_0_1';
  resetRateLimit(testIp);

  // 5 attempts allowed
  for (let i = 1; i <= 5; i++) {
    const check = checkRateLimit(testIp, 5, 60000);
    assert(check.allowed === true, `Attempt ${i} within limit is allowed`);
    recordRateLimitAttempt(testIp);
  }

  // 6th attempt blocked
  const blockedCheck = checkRateLimit(testIp, 5, 60000);
  assert(blockedCheck.allowed === false, '6th attempt is blocked (HTTP 429)');
  assert(blockedCheck.retryAfterSeconds > 0, 'Returns positive retryAfterSeconds');
  resetRateLimit(testIp);

  // -------------------------------------------------------------
  // Test 3: CSRF & Origin Verification
  // -------------------------------------------------------------
  console.log('\n--- 3. CSRF Protection Tests ---');
  const validReq = new Request('http://localhost:3000/api/client/comments', {
    method: 'POST',
    headers: {
      host: 'localhost:3000',
      origin: 'http://localhost:3000',
    },
  });
  assert(verifyRequestOrigin(validReq) === true, 'Matching host and origin is permitted');

  const evilReq = new Request('http://localhost:3000/api/client/comments', {
    method: 'POST',
    headers: {
      host: 'localhost:3000',
      origin: 'http://malicious-site.com',
    },
  });
  assert(verifyRequestOrigin(evilReq) === false, 'Cross-site origin is rejected (CSRF blocked)');

  // -------------------------------------------------------------
  // Test 4: Two Clients with Same Name ("أحمد") Approval Isolation
  // -------------------------------------------------------------
  console.log('\n--- 4. Approval Identity Isolation (Same Name Clients) ---');
  // Create Link 1: أحمد A
  const link1 = await dataService.createAccessLink('أحمد', 'pass1111', ['00000000-0000-0000-0000-000000000001']);
  // Create Link 2: أحمد B
  const link2 = await dataService.createAccessLink('أحمد', 'pass2222', ['00000000-0000-0000-0000-000000000001']);

  assert(link1.id !== link2.id, 'Links have unique IDs despite identical names');

  const assetId = '10000000-0000-0000-0000-000000000001';

  // Client 1 approves the asset
  await dataService.toggleApproval(assetId, link1.id, link1.viewer_name, true);
  // Client 2 does NOT approve (or sets false)
  await dataService.toggleApproval(assetId, link2.id, link2.viewer_name, false);

  const assets = await dataService.getAssetsForProject('00000000-0000-0000-0000-000000000001', false);
  const targetAsset = assets.find((a) => a.id === assetId);

  const approval1 = targetAsset?.approvals?.find((app) => app.access_link_id === link1.id);
  const approval2 = targetAsset?.approvals?.find((app) => app.access_link_id === link2.id);

  assert(approval1?.approved === true, 'Client 1 approval is true');
  assert(approval2?.approved === false, 'Client 2 approval is false (independent, no collision)');

  // -------------------------------------------------------------
  // Test 5: Cross-Project Authorization Rejection
  // -------------------------------------------------------------
  console.log('\n--- 5. Cross-Project Access Enforcement ---');
  // Link 3 assigned ONLY Project 1
  const link3 = await dataService.createAccessLink('عميل مشروع 1', 'pass3333', ['00000000-0000-0000-0000-000000000001']);

  // Client 3 attempts to access Asset of Project 2
  // We mock a session matching Link 3's session version
  // We check via authorizeClientAsset
  // Since authorizeClientAsset checks cookie store via getClientSession, let's test getProjectForClient
  const client3Proj2Access = await dataService.getProjectForClient(link3.id, '00000000-0000-0000-0000-000000000002');
  assert(client3Proj2Access === null, 'Client 3 is strictly blocked from unassigned Project 2');

  // -------------------------------------------------------------
  // Test 6: Session Version Invalidation on Password Change
  // -------------------------------------------------------------
  console.log('\n--- 6. Session Invalidation via session_version ---');
  const initialVersion = link3.session_version ?? 1;
  assert(initialVersion === 1, 'Initial session_version is 1');

  // Admin changes password
  await dataService.updateAccessLink(link3.id, { passwordPlain: 'newPass4444' });
  const updatedLink3 = await dataService.getAccessLinkBySlug(link3.slug);

  assert(updatedLink3?.session_version === 2, 'session_version incremented to 2 after password change');

  // -------------------------------------------------------------
  // Test 7: Immediate Revocation on Link Disable
  // -------------------------------------------------------------
  console.log('\n--- 7. Immediate Revocation on Disabled Link ---');
  await dataService.updateAccessLink(link3.id, { enabled: false });
  const disabledLink = await dataService.getAccessLinkBySlug(link3.slug);
  assert(disabledLink === null || disabledLink.enabled === false, 'Disabled link is marked disabled / unaccessible');

  // -------------------------------------------------------------
  // Test 8: Hidden Assets & Archived Projects Access Block
  // -------------------------------------------------------------
  console.log('\n--- 8. Hidden Assets & Archived Projects Protection ---');
  // Create an asset that is hidden (is_visible: false)
  const hiddenAsset = await dataService.createAsset({
    project_id: '00000000-0000-0000-0000-000000000001',
    title: 'ملف سري داخلي غير ظاهر',
    file_url: 'https://example.com/secret.mp4',
    is_visible: false,
  });

  // Query assets for client
  const clientVisibleAssets = await dataService.getAssetsForProject('00000000-0000-0000-0000-000000000001', true);
  const foundHiddenInClient = clientVisibleAssets.some((a) => a.id === hiddenAsset.id);
  assert(foundHiddenInClient === false, 'Hidden asset is filtered out from client assets list');

  // Query assets for admin (forClient: false)
  const adminAssets = await dataService.getAssetsForProject('00000000-0000-0000-0000-000000000001', false);
  const foundHiddenInAdmin = adminAssets.some((a) => a.id === hiddenAsset.id);
  assert(foundHiddenInAdmin === true, 'Hidden asset is visible in admin assets list');

  // Archive Project 1 temporarily to test block
  await dataService.updateProject('00000000-0000-0000-0000-000000000001', { is_archived: true });
  const clientArchivedProjects = await dataService.getProjectsForClient(link1.id);
  const foundArchived = clientArchivedProjects.some((p) => p.id === '00000000-0000-0000-0000-000000000001');
  assert(foundArchived === false, 'Archived project is blocked from client home showcase');

  // Restore Project 1
  await dataService.updateProject('00000000-0000-0000-0000-000000000001', { is_archived: false });
  // Delete test hidden asset
  await dataService.deleteAsset(hiddenAsset.id);

  // Cleanup test links
  await dataService.deleteAccessLink(link1.id);
  await dataService.deleteAccessLink(link2.id);
  await dataService.deleteAccessLink(link3.id);

  console.log('\n======================================================');
  console.log(`   TESTS COMPLETED: ${passed} Passed, ${failed} Failed`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
