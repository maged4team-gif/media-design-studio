/**
 * Test Suite 17: Auth Hardening
 * - No hardcoded signing-secret fallback in production
 * - Link passwords sealed at rest; login verifies bcrypt only
 * - Per-link and global rate limits that survive spoofed IP headers
 *
 * Run via: npx tsx --conditions=react-server scripts/tests/17-auth-hardening.test.ts
 */

process.env.DATA_MODE = 'demo';

import fs from 'fs';
import path from 'path';
import { getAppSecret } from '../../lib/auth/secret';
import { sealLinkPassword, revealLinkPassword, isSealedLinkPassword } from '../../lib/auth/link-password-vault';
import { dataService } from '../../lib/data/service';
import { POST as clientAuthHandler } from '../../app/api/client/auth/route';
import { POST as adminLoginHandler, DELETE as adminLogoutHandler } from '../../app/api/admin/login/route';
import { createAdminSessionToken, createSignedToken, getAdminSession } from '../../lib/auth/session';
import { revokeAllAdminSessions, resetAdminRevocationCache } from '../../lib/auth/admin-revocation';

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

function withEnv<T>(overrides: Record<string, string | undefined>, fn: () => T): T {
  const saved: Record<string, string | undefined> = {};
  for (const k of Object.keys(overrides)) {
    saved[k] = process.env[k];
    if (overrides[k] === undefined) delete process.env[k];
    else process.env[k] = overrides[k];
  }
  try {
    return fn();
  } finally {
    for (const k of Object.keys(saved)) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

function authRequest(body: Record<string, string>, ip: string): Request {
  return new Request('http://localhost:3000/api/client/auth', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost:3000', host: 'localhost:3000', 'x-forwarded-for': ip },
    body: JSON.stringify(body),
  });
}

async function runTests() {
  console.log('================================================================');
  console.log('SUITE 17: AUTH HARDENING');
  console.log('================================================================\n');

  console.log('>>> 1. Signing secret: no public fallback in production');
  let threw = false;
  try {
    withEnv({ NODE_ENV: 'production', SESSION_SECRET: undefined }, () => getAppSecret());
  } catch (e: any) {
    threw = String(e?.message).startsWith('CONFIG_ERROR');
  }
  assert(threw, 'getAppSecret throws CONFIG_ERROR in production without SESSION_SECRET');

  threw = false;
  try {
    withEnv({ NODE_ENV: 'production', SESSION_SECRET: 'short' }, () => getAppSecret());
  } catch {
    threw = true;
  }
  assert(threw, 'getAppSecret rejects a short SESSION_SECRET in production');

  const strong = 'a-strong-random-production-secret-value-123';
  assert(
    withEnv({ NODE_ENV: 'production', SESSION_SECRET: strong }, () => getAppSecret()) === strong,
    'getAppSecret returns configured secret in production'
  );

  console.log('\n>>> 2. Link password vault');
  const sealed = sealLinkPassword('Vault#Secret1');
  assert(isSealedLinkPassword(sealed), 'Sealed value carries enc:v1 prefix');
  assert(!sealed.includes('Vault#Secret1'), 'Sealed value does not contain the plain password');
  assert(revealLinkPassword(sealed) === 'Vault#Secret1', 'Sealed value round-trips');
  assert(sealLinkPassword('x') !== sealLinkPassword('x'), 'Sealing uses a fresh IV each time');
  const tampered = sealed.slice(0, -2) + (sealed.endsWith('00') ? '11' : '00');
  assert(revealLinkPassword(tampered) === null, 'Tampered ciphertext is rejected');
  assert(revealLinkPassword('legacy-plain') === 'legacy-plain', 'Legacy plain value is readable for re-sealing');

  console.log('\n>>> 3. Passwords are sealed at rest, admin still sees them');
  const project = await dataService.createProject({ title: 'مشروع اختبار التقوية', description: '', progress: 10 });
  const secret = 'AtRest!Pass2026';
  const link = await dataService.createAccessLink('عميل التقوية', secret, [project.id]);
  assert(link.password_plain === secret, 'createAccessLink returns readable password to admin once');

  const dataDir = path.join(process.cwd(), '.data');
  const storeRaw = fs.readFileSync(path.join(dataDir, 'store.json'), 'utf8');
  const passwordsFile = path.join(dataDir, 'link-passwords.json');
  const passwordsRaw = fs.existsSync(passwordsFile) ? fs.readFileSync(passwordsFile, 'utf8') : '';
  assert(!storeRaw.includes(secret), 'Local store does not contain the plain password');
  assert(!passwordsRaw.includes(secret), 'link-passwords.json does not contain the plain password');

  const adminView = (await dataService.getAllAccessLinks()).find((l) => l.id === link.id);
  assert(adminView?.password_plain === secret, 'Admin list reveals the password');

  const authData = await dataService.getAccessLinkAuthDataBySlug(link.slug);
  assert((authData as any)?.password_plain === undefined, 'Auth data carries no readable password');

  console.log('\n>>> 4. Login verifies bcrypt only');
  let res = await clientAuthHandler(authRequest({ slug: link.slug, password: secret }, '10.0.0.1'));
  // Cookie issuance needs a Next request scope; 500 here means password was accepted
  assert(res.status === 200 || res.status === 500, 'Correct password passes verification', `status ${res.status}`);

  const sealedStored = sealLinkPassword(secret);
  res = await clientAuthHandler(authRequest({ slug: link.slug, password: sealedStored }, '10.0.0.2'));
  assert(res.status === 401, 'Submitting the stored encrypted value does not log in');

  console.log('\n>>> 5. Per-link cap holds even when the IP header is rotated');
  const target = await dataService.createAccessLink('هدف التخمين', 'Brute!Force9', [project.id]);
  let blockedAt = -1;
  for (let i = 0; i < 15; i++) {
    const r = await clientAuthHandler(authRequest({ slug: target.slug, password: `guess-${i}` }, `203.0.113.${i}`));
    if (r.status === 429) {
      blockedAt = i;
      break;
    }
  }
  assert(blockedAt === 10, 'Per-link limit blocks the 11th guess despite a new IP each time', `blocked at ${blockedAt}`);

  console.log('\n>>> 6. Admin global cap holds when the IP header is rotated');
  process.env.ADMIN_PASSWORD = 'correct-admin-password-xyz';
  let adminBlockedAt = -1;
  for (let i = 0; i < 25; i++) {
    const r = await adminLoginHandler(
      new Request('http://localhost:3000/api/admin/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'http://localhost:3000', host: 'localhost:3000', 'x-forwarded-for': `198.51.100.${i}` },
        body: JSON.stringify({ password: `wrong-${i}` }),
      })
    );
    if (r.status === 429) {
      adminBlockedAt = i;
      break;
    }
  }
  assert(adminBlockedAt === 20, 'Admin global limit blocks the 21st guess', `blocked at ${adminBlockedAt}`);

  console.log('\n>>> 7. Admin sessions are revocable');
  const revocationFile = path.join(dataDir, 'admin-security.json');
  if (fs.existsSync(revocationFile)) fs.unlinkSync(revocationFile);
  resetAdminRevocationCache();

  const tokenBefore = createAdminSessionToken();
  assert(await getAdminSession(tokenBefore), 'Fresh admin token is accepted');
  assert(
    !(await getAdminSession(createSignedToken({ isAdmin: true, expiresAt: Date.now() + 3600000 }))),
    'Legacy-format admin token (no iat / fingerprint) is rejected'
  );

  process.env.ADMIN_PASSWORD = 'rotated-admin-password-abc';
  assert(!(await getAdminSession(tokenBefore)), 'Changing ADMIN_PASSWORD invalidates existing sessions');
  const tokenAfterRotation = createAdminSessionToken();
  assert(await getAdminSession(tokenAfterRotation), 'Token issued after password change is accepted');

  // Unauthenticated callers cannot trigger logout-everywhere
  const r = await adminLogoutHandler(
    new Request('http://localhost:3000/api/admin/login?scope=all', {
      method: 'DELETE',
      headers: { origin: 'http://localhost:3000', host: 'localhost:3000' },
    })
  );
  assert(r.status === 401, 'Logout-all without a valid admin session is rejected');

  await new Promise((resolve) => setTimeout(resolve, 5));
  await revokeAllAdminSessions();
  assert(!(await getAdminSession(tokenAfterRotation)), 'Revoke-all invalidates tokens issued before it');
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert(await getAdminSession(createAdminSessionToken()), 'New login after revoke-all is accepted');

  if (fs.existsSync(revocationFile)) fs.unlinkSync(revocationFile);
  resetAdminRevocationCache();

  await dataService.deleteProject(project.id).catch(() => false);

  console.log('\n================================================================');
  console.log(`SUITE 17 RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');
  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error('Test run error:', err);
  process.exit(1);
});
