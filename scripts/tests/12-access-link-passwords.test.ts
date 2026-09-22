/**
 * Test Suite 12: Access Link Password Display, Management, and Security
 * Run via: npx tsx --conditions=react-server scripts/tests/12-access-link-passwords.test.ts
 */

process.env.DATA_MODE = 'demo';

import { dataService } from '../../lib/data/service';
import bcrypt from 'bcryptjs';

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
  console.log('SUITE 12: ACCESS LINK PASSWORD DISPLAY & MANAGEMENT TESTS');
  console.log('================================================================\n');

  console.log('>>> 1. Creating a Protected Link with Plain Password...');
  const project = await dataService.createProject({
    title: 'مشروع اختبار كلمات السر',
    description: 'مشروع للتأكد من حفظ وعرض وتعديل كلمة السر',
    progress: 80,
  });

  const plainSecret = 'SecretPass!2026';
  const newLink = await dataService.createAccessLink(
    'شركة الإبداع للإنتاج',
    plainSecret,
    [project.id]
  );

  assert(newLink !== null && !!newLink.id, 'Link created successfully');
  assert(newLink.has_password === true, 'Link reports has_password === true');
  assert(newLink.password_plain === plainSecret, 'Created link returns password_plain matching original');
  assert(newLink.password_hash === '', 'Created link does NOT return password_hash');

  console.log('>>> 2. Verifying Admin Links List (getAllAccessLinks)...');
  const allLinks = await dataService.getAllAccessLinks();
  const retrieved = allLinks.find((l) => l.id === newLink.id);
  assert(retrieved !== undefined, 'Created link found in getAllAccessLinks');
  assert(retrieved?.password_plain === plainSecret, 'getAllAccessLinks delivers password_plain for admin display');
  assert(retrieved?.password_hash === '', 'getAllAccessLinks never exposes bcrypt hash');

  console.log('>>> 3. Ensuring Password is NEVER Leaked to Client Endpoints...');
  const clientView = await dataService.getAccessLinkBySlug(newLink.slug);
  assert(clientView !== null, 'Client view retrieved by slug');
  assert((clientView as any).password_plain === undefined, 'getAccessLinkBySlug does NOT contain password_plain');
  assert(clientView?.password_hash === '', 'getAccessLinkBySlug password_hash is empty string');

  const authData = await dataService.getAccessLinkAuthDataBySlug(newLink.slug);
  assert(authData !== null, 'Auth data retrieved');
  assert((authData as any).password_plain === undefined, 'getAccessLinkAuthDataBySlug does NOT contain password_plain');
  assert(await bcrypt.compare(plainSecret, authData!.password_hash), 'Auth data hash verifies against plain password');

  console.log('>>> 4. Updating Link Password (Change to new password)...');
  const updatedSecret = 'NewPass#9988';
  const initialVersion = newLink.session_version ?? 1;

  const updateSuccess = await dataService.updateAccessLink(newLink.id, {
    passwordPlain: updatedSecret,
  });
  assert(updateSuccess === true, 'updateAccessLink returns true when changing password');

  const linksAfterUpdate = await dataService.getAllAccessLinks();
  const updatedLink = linksAfterUpdate.find((l) => l.id === newLink.id);
  assert(updatedLink?.password_plain === updatedSecret, 'password_plain updated to new password');
  assert((updatedLink?.session_version ?? 1) > initialVersion, 'session_version incremented to invalidate old sessions');

  const updatedAuthData = await dataService.getAccessLinkAuthDataBySlug(newLink.slug);
  assert(await bcrypt.compare(updatedSecret, updatedAuthData!.password_hash), 'New password matches updated bcrypt hash');
  assert(!(await bcrypt.compare(plainSecret, updatedAuthData!.password_hash)), 'Old password fails against updated bcrypt hash');

  console.log('>>> 5. Updating Link to Public (removePassword)...');
  const removeSuccess = await dataService.updateAccessLink(newLink.id, {
    removePassword: true,
  });
  assert(removeSuccess === true, 'updateAccessLink returns true on removePassword');

  const linksAfterPublic = await dataService.getAllAccessLinks();
  const publicLink = linksAfterPublic.find((l) => l.id === newLink.id);
  assert(publicLink?.has_password === false, 'Link is now public (has_password === false)');
  assert(publicLink?.password_plain === null, 'password_plain is set to null when converted to public');

  const publicAuthData = await dataService.getAccessLinkAuthDataBySlug(newLink.slug);
  assert(publicAuthData?.has_password === false, 'Auth data confirms public link');
  assert(publicAuthData?.password_hash === '', 'Auth data confirms empty password_hash');

  console.log('>>> 6. Converting Public Link back to Password-Protected...');
  const resetSecret = 'RevivedPass*1122';
  const protectSuccess = await dataService.updateAccessLink(newLink.id, {
    passwordPlain: resetSecret,
  });
  assert(protectSuccess === true, 'updateAccessLink returns true when adding password back');

  const linksAfterReprotect = await dataService.getAllAccessLinks();
  const reprotectedLink = linksAfterReprotect.find((l) => l.id === newLink.id);
  assert(reprotectedLink?.has_password === true, 'Link is protected again (has_password === true)');
  assert(reprotectedLink?.password_plain === resetSecret, 'password_plain stored for the newly set password');

  const reprotectedAuth = await dataService.getAccessLinkAuthDataBySlug(newLink.slug);
  assert(await bcrypt.compare(resetSecret, reprotectedAuth!.password_hash), 'Newly set password matches bcrypt hash');

  console.log('>>> 7. Testing Legacy Protected Link (NULL password_plain)...');
  // Create an older link with null password_plain
  const legacyLink = await dataService.createAccessLink('عميل برابط قديم', 'LegacyInitialPass', [project.id]);
  // Reset its password_plain to simulate a legacy pre-migration link
  const allLinksStore = await dataService.getAllAccessLinks();
  const leg = allLinksStore.find(l => l.id === legacyLink.id);
  if (leg) {
    (leg as any).password_plain = null;
  }

  // Updating the legacy link sets a plain password
  await dataService.updateAccessLink(legacyLink.id, { passwordPlain: 'NewLegacyPass' });
  const legacyAfterSet = (await dataService.getAllAccessLinks()).find((l) => l.id === legacyLink.id);
  assert(legacyAfterSet?.password_plain === 'NewLegacyPass', 'Setting new password on legacy link populates password_plain');

  console.log('\n================================================================');
  console.log(`SUITE 12 RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test run error:', err);
  process.exit(1);
});
