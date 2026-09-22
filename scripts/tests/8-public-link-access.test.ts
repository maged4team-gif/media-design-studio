/**
 * Test Suite 8: Public Access Links (No Password) Tests
 * Run via: npx tsx --conditions=react-server scripts/tests/8-public-link-access.test.ts
 */

process.env.DATA_MODE = 'demo';

import { dataService } from '../../lib/data/service';
import { createSignedToken, verifySignedToken, ClientSessionData } from '../../lib/auth/session';

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
  console.log('SUITE 8: PUBLIC ACCESS LINKS (NO PASSWORD) TESTS');
  console.log('================================================================\n');

  console.log('>>> 1. Creating a Public Link (Empty Password)...');
  const project = await dataService.createProject({
    title: 'مشروع عام للتجربة',
    description: 'مشروع متاح عبر رابط عام',
    progress: 100,
  });

  const publicLink = await dataService.createAccessLink(
    'عميل عام بدون كلمة سر',
    '', // No password
    [project.id]
  );

  assert(publicLink !== null && !!publicLink.id, 'Public link created successfully');
  assert(publicLink.has_password === false, 'Public link has has_password = false');

  console.log('>>> 2. Verifying getAccessLinkBySlug & getAccessLinkAuthDataBySlug...');
  const fetchedLink = await dataService.getAccessLinkBySlug(publicLink.slug);
  assert(fetchedLink !== null, 'Public link found by slug');
  assert(fetchedLink?.has_password === false, 'Fetched link reports has_password === false');

  const authData = await dataService.getAccessLinkAuthDataBySlug(publicLink.slug);
  assert(authData !== null, 'Auth data retrieved successfully');
  assert(authData?.has_password === false, 'Auth data reports has_password === false');
  assert(authData?.password_hash === '', 'Auth data reports empty password_hash');

  console.log('>>> 3. Creating Protected Link Comparison...');
  const protectedLink = await dataService.createAccessLink(
    'عميل محمي بكلمة سر',
    'pass1234',
    [project.id]
  );

  assert(protectedLink.has_password === true, 'Protected link has has_password = true');
  const protectedAuthData = await dataService.getAccessLinkAuthDataBySlug(protectedLink.slug);
  assert(protectedAuthData?.has_password === true, 'Protected auth data reports has_password === true');
  assert(protectedAuthData?.password_hash !== '', 'Protected auth data has non-empty password_hash');

  console.log('>>> 4. Updating Protected Link to Remove Password...');
  const updateSuccess = await dataService.updateAccessLink(protectedLink.id, {
    removePassword: true,
  });
  assert(updateSuccess === true, 'Link updated with removePassword returns true');
  
  const allLinks = await dataService.getAllAccessLinks();
  const updatedLink = allLinks.find((l) => l.id === protectedLink.id);
  assert(updatedLink !== undefined && updatedLink.has_password === false, 'Updated link now has has_password = false');

  const updatedAuthData = await dataService.getAccessLinkAuthDataBySlug(protectedLink.slug);
  assert(updatedAuthData?.has_password === false, 'Updated link auth data reports has_password === false');
  assert(updatedAuthData?.password_hash === '', 'Updated link auth data password_hash is empty string');

  console.log('>>> 5. Testing Public Client Session Creation & Token Verification...');
  // Simulating what /api/client/auth does when has_password === false
  const sessionData: ClientSessionData = {
    linkId: publicLink.id,
    slug: publicLink.slug,
    viewerName: publicLink.viewer_name,
    sessionVersion: publicLink.session_version,
    expiresAt: Date.now() + 86400000,
  };
  const token = await createSignedToken(sessionData);
  assert(typeof token === 'string' && token.length > 20, 'Signed token generated for public client session');

  const verified = await verifySignedToken<ClientSessionData>(token);
  assert(verified !== null, 'Public client token verified successfully');
  assert(verified?.linkId === publicLink.id, 'Verified linkId matches public link');
  assert(verified?.slug === publicLink.slug, 'Verified slug matches public link');

  console.log('>>> 6. Testing Project Access for Public Client Link...');
  const clientProject = await dataService.getProjectForClient(publicLink.id, project.id);
  assert(clientProject !== null && clientProject.id === project.id, 'Public client link grants access to assigned project');

  console.log('\n================================================================');
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test run failed with error:', err);
  process.exit(1);
});
