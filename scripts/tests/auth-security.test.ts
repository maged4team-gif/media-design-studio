import { checkRateLimit, recordRateLimitAttempt, resetRateLimit } from '../../lib/auth/rate-limit';
import fs from 'fs';
import path from 'path';

console.log('🧪 Starting Auth Security & Form Protection Tests...\n');

let failed = 0;

function assert(condition: boolean, testName: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
  } else {
    console.error(`  ❌ FAIL: ${testName}`);
    failed++;
  }
}

// 1. Rate Limiting Tests
const testKey = 'test_ip_' + Date.now();
resetRateLimit(testKey);

for (let i = 0; i < 5; i++) {
  const check = checkRateLimit(testKey, 5, 60000);
  assert(check.allowed === true, `Rate limit attempt ${i + 1} is permitted`);
  recordRateLimitAttempt(testKey);
}

// 6th attempt must be blocked
const blockedCheck = checkRateLimit(testKey, 5, 60000);
assert(blockedCheck.allowed === false, 'Rate limit blocks 6th attempt within window');
assert((blockedCheck.retryAfterSeconds ?? 0) > 0, 'Returns positive retryAfterSeconds');

// Reset allows again
resetRateLimit(testKey);
const afterReset = checkRateLimit(testKey, 5, 60000);
assert(afterReset.allowed === true, 'Reset rate limit clears block immediately');

// 2. Form Attributes Verification (POST method, action, noValidate, labels)
const adminLoginContent = fs.readFileSync(
  path.join(process.cwd(), 'app/admin/login/page.tsx'),
  'utf8'
);

assert(
  adminLoginContent.includes('method="POST"'),
  'Admin login form explicitly specifies method="POST"'
);
assert(
  adminLoginContent.includes('action="/api/admin/login"'),
  'Admin login form explicitly specifies action="/api/admin/login"'
);
assert(
  adminLoginContent.includes('noValidate'),
  'Admin login form specifies noValidate to prevent default English tooltips'
);
assert(
  adminLoginContent.includes('autoComplete="current-password"'),
  'Admin login password input has autoComplete="current-password"'
);
assert(
  adminLoginContent.includes('id="admin-password-input"') &&
    adminLoginContent.includes('htmlFor="admin-password-input"'),
  'Admin login input has htmlFor/id label association'
);
assert(
  adminLoginContent.includes('role="alert"'),
  'Admin login error container has role="alert"'
);
assert(
  adminLoginContent.includes('bg-amber-700'),
  'Admin login button uses bg-amber-700 for WCAG AA compliance'
);

// 3. PasswordGate Form Verification
const clientGateContent = fs.readFileSync(
  path.join(process.cwd(), 'app/p/[slug]/PasswordGate.tsx'),
  'utf8'
);

assert(
  clientGateContent.includes('method="POST"'),
  'Client gate form explicitly specifies method="POST"'
);
assert(
  clientGateContent.includes('action="/api/client/auth"'),
  'Client gate form explicitly specifies action="/api/client/auth"'
);
assert(
  clientGateContent.includes('noValidate'),
  'Client gate form specifies noValidate'
);
assert(
  clientGateContent.includes('id="client-gate-password"') &&
    clientGateContent.includes('htmlFor="client-gate-password"'),
  'Client gate input has htmlFor/id label association'
);
assert(
  clientGateContent.includes('scrollRestoration') &&
    clientGateContent.includes('scrollTo'),
  'Client gate implements scroll position reset'
);

// 4. Homepage Verification (No exposed credentials)
const homepageContent = fs.readFileSync(
  path.join(process.cwd(), 'app/page.tsx'),
  'utf8'
);

assert(
  !homepageContent.includes('2580'),
  'Homepage contains NO exposed password "2580"'
);
assert(
  homepageContent.includes('NEXT_PUBLIC_DEMO_MODE'),
  'Homepage gates demo mode behind NEXT_PUBLIC_DEMO_MODE'
);

console.log(`\nTests finished: ${failed === 0 ? 'ALL PASSED' : `${failed} FAILED`}`);
process.exit(failed === 0 ? 0 : 1);
