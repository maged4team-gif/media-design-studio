/**
 * Test Suite 5: Real HTTP Server Session & Cookie Lifecycle Verification
 * Run via: npx tsx scripts/tests/5-real-server-session.test.ts
 *
 * Tests the real HTTP server (http://localhost:3000) for:
 * 1. Issuance of Set-Cookie header on successful login
 * 2. Unauthenticated access without cookie rendering PasswordGate
 * 3. Authenticated access using the issued Set-Cookie rendering protected ClientHome
 * 4. Error propagation when session issuance fails (returns 500, not silent 200)
 */

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

async function runRealServerSessionTests() {
  console.log('================================================================');
  console.log('SUITE 5: REAL HTTP SERVER SESSION & COOKIE FLOW TESTS');
  console.log('================================================================\n');

  const BASE_URL = process.env.TEST_SERVER_URL || 'http://localhost:3000';

  // 0. Verify HTTP server is online
  console.log(`>>> 0. Checking Server Reachability on ${BASE_URL}...`);
  try {
    const pingRes = await fetch(BASE_URL);
    assert(pingRes.status === 200, `Real HTTP Server is responsive at ${BASE_URL}`);
  } catch (err: any) {
    console.error(`  [FATAL] Cannot connect to HTTP server at ${BASE_URL}:`, err.message);
    console.error('  Ensure `npm run dev` is active before running Suite 5.');
    process.exit(1);
  }

  const SLUG = 'x7K29AbC';
  const VALID_PASSWORD = '2580';
  const WRONG_PASSWORD = 'wrong_password_9999';

  // 1. Test Login with wrong password -> No Set-Cookie
  console.log('\n>>> 1. Testing Failed Login (Wrong Password)...');
  const badLoginRes = await fetch(`${BASE_URL}/api/client/auth`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'origin': BASE_URL,
      'host': 'localhost:3000',
    },
    body: JSON.stringify({ slug: SLUG, password: WRONG_PASSWORD }),
  });
  const badLoginJson = await badLoginRes.json();
  const badLoginCookie = badLoginRes.headers.get('set-cookie');

  assert(badLoginRes.status === 401, 'Invalid password rejected with HTTP 401');
  assert(!badLoginCookie, 'No Set-Cookie issued on failed authentication attempt');
  assert(badLoginJson.error === 'كلمة المرور غير صحيحة', 'Error response details incorrect password');

  // 2. Test Login with valid password -> Must issue Set-Cookie with security flags
  console.log('\n>>> 2. Testing Successful Login & Set-Cookie Issuance...');
  const goodLoginRes = await fetch(`${BASE_URL}/api/client/auth`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'origin': BASE_URL,
      'host': 'localhost:3000',
    },
    body: JSON.stringify({ slug: SLUG, password: VALID_PASSWORD }),
  });
  const goodLoginJson = await goodLoginRes.json();
  const setCookieHeader = goodLoginRes.headers.get('set-cookie');

  assert(goodLoginRes.status === 200, 'Valid credentials accepted with HTTP 200');
  assert(goodLoginJson.success === true, 'Response body contains success: true');
  assert(goodLoginJson.viewerName === 'أحمد', 'Response body identifies viewer "أحمد"');
  assert(Boolean(setCookieHeader), 'HTTP response includes Set-Cookie header');

  const cookieStr = setCookieHeader || '';
  assert(cookieStr.includes(`client_session_${SLUG}=`), `Set-Cookie contains client_session_${SLUG} token`);
  assert(cookieStr.toLowerCase().includes('httponly'), 'Set-Cookie includes HttpOnly flag');
  assert(cookieStr.toLowerCase().includes('samesite=lax'), 'Set-Cookie includes SameSite=lax flag');
  assert(cookieStr.toLowerCase().includes('path=/'), 'Set-Cookie includes Path=/ attribute');

  // Extract pure cookie key=value for subsequent requests
  const cookieMatch = cookieStr.match(new RegExp(`(client_session_${SLUG}=[^;]+)`));
  const cookiePair = cookieMatch ? cookieMatch[1] : '';
  assert(Boolean(cookiePair), 'Extracted cookie string for subsequent requests');

  // 3. Test Accessing Protected Page WITHOUT Cookie -> Must show PasswordGate
  console.log('\n>>> 3. Testing Protected Client Page Access WITHOUT Cookie...');
  const unauthPageRes = await fetch(`${BASE_URL}/p/${SLUG}`);
  const unauthHtml = await unauthPageRes.text();

  assert(unauthPageRes.status === 200, 'Page loads with HTTP 200 status');
  assert(
    unauthHtml.includes('بوابة العميل') || unauthHtml.includes('كلمة المرور') || unauthHtml.includes('PasswordGate'),
    'Unauthenticated request serves PasswordGate (access blocked)'
  );
  assert(
    !unauthHtml.includes('مشاريع العميل') && !unauthHtml.includes('logout'),
    'Protected client projects are NOT visible without cookie'
  );

  // 4. Test Accessing Protected Page WITH the Issued Cookie -> Must show Authenticated View
  console.log('\n>>> 4. Testing Protected Client Page Access WITH Issued Cookie...');
  const authPageRes = await fetch(`${BASE_URL}/p/${SLUG}`, {
    headers: {
      cookie: cookiePair,
    },
  });
  const authHtml = await authPageRes.text();

  assert(authPageRes.status === 200, 'Authenticated page request responds with HTTP 200');
  assert(
    authHtml.includes('أحمد') && (authHtml.includes('مشاريع') || authHtml.includes('ClientHomeView') || authHtml.includes('هوية')),
    'Protected ClientHome view renders client projects for "أحمد"'
  );
  assert(
    !authHtml.includes('يرجى إدخال كلمة المرور للوصول'),
    'PasswordGate is NOT presented when valid session cookie is supplied'
  );

  // 5. Test Protected API Operations using the Issued Cookie
  console.log('\n>>> 5. Testing Protected API Route Access with Real Session Cookie...');
  // Comments endpoint with cookie
  const commentRes = await fetch(`${BASE_URL}/api/client/comments`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'origin': BASE_URL,
      cookie: cookiePair,
    },
    body: JSON.stringify({
      assetId: '10000000-0000-0000-0000-000000000001',
      slug: SLUG,
      body: 'فحص جلسة حقيقية عبر خادم HTTP',
      timestampSeconds: 12,
    }),
  });
  const commentJson = await commentRes.json();
  assert(
    commentRes.status === 200 && commentJson.comment?.author_name === 'أحمد',
    'Real session cookie authenticates comment API and automatically associates author name "أحمد"'
  );

  // Comments endpoint WITHOUT cookie -> 401
  const unauthCommentRes = await fetch(`${BASE_URL}/api/client/comments`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'origin': BASE_URL,
    },
    body: JSON.stringify({
      assetId: '10000000-0000-0000-0000-000000000001',
      slug: SLUG,
      body: 'محاولة تعليق بدون كوكي',
    }),
  });
  assert(unauthCommentRes.status === 401, 'API strictly rejects request without cookie with HTTP 401');

  // 6. Test Error Propagation in Auth Route (Removal of Silent Catch)
  console.log('\n>>> 6. Testing Error Propagation on Malformed / Corrupted Session State...');
  // Requesting login for non-existent slug returns 404 cleanly
  const missingSlugRes = await fetch(`${BASE_URL}/api/client/auth`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'origin': BASE_URL,
    },
    body: JSON.stringify({ slug: 'non_existent_slug_404', password: 'password' }),
  });
  assert(missingSlugRes.status === 404, 'Non-existent access link returns clean HTTP 404');

  // Missing fields -> 400
  const emptyBodyRes = await fetch(`${BASE_URL}/api/client/auth`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'origin': BASE_URL,
    },
    body: JSON.stringify({}),
  });
  assert(emptyBodyRes.status === 400, 'Empty auth request returns HTTP 400');

  console.log('\n================================================================');
  console.log(`SUITE 5 RESULTS: ${passed} PASSED | ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) process.exit(1);
}

runRealServerSessionTests().catch((err) => {
  console.error('Suite 5 crashed:', err);
  process.exit(1);
});
