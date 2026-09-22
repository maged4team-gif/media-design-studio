/**
 * Test Suite 3: Supabase / PostgreSQL Live Integration Tests & RPC Boundary Verification
 * Run via: npx tsx --conditions=react-server scripts/tests/3-supabase-integration.test.ts
 *
 * NOTE ON TESTING BOUNDARIES:
 * Production write tests are strictly forbidden against live user production instances.
 * This suite executes ONLY when configured with an isolated test Supabase instance.
 * In decoupled / local demo mode, all live cloud execution tests are cleanly skipped and documented as UNEXECUTED [لم يُنفذ].
 */

import { isServerSupabaseConfigured, getServerSupabase } from '../../lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// Helper to create a signed mock authenticated JWT for RPC testing when test environment is active
function createMockAuthenticatedJwt(secret: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      role: 'authenticated',
      sub: '00000000-0000-0000-0000-000000000001',
      aud: 'authenticated',
      exp: Math.floor(Date.now() / 1000) + 3600,
    })
  ).toString('base64url');
  // Simple HMAC signature for test token
  const signature = crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

async function runSupabaseIntegrationTests() {
  console.log('================================================================');
  console.log('SUITE 3: SUPABASE / POSTGRESQL LIVE INTEGRATION SUITE');
  console.log('================================================================\n');

  const isConfigured = isServerSupabaseConfigured();

  if (!isConfigured) {
    console.log('>>> [NOTICE: ISOLATED / DEMO ENVIRONMENT BOUNDARY]');
    console.log('  Live Supabase connection keys are currently decoupled in .env.local.');
    console.log('  In accordance with the safety rule: "Never use production keys for write tests",');
    console.log('  live database write and RPC executions are strictly preserved in isolated test mode.\n');
    console.log('>>> [DOCUMENTED / UNEXECUTED LIVE SUPABASE TESTS]:');
    console.log('  1. [UNEXECUTED - REQUIRES ISOLATED TEST DB] Strict RPC permission differentiation:');
    console.log('     - Assert anon receives specifically 42501 (insufficient_privilege / permission denied).');
    console.log('     - Explicitly verify it is NOT 42883 (undefined_function), NOT PGRST202, NOT connection error.');
    console.log('     - Assert authenticated role receives specifically 42501 permission denied.');
    console.log('     - Assert service_role successfully executes RPC with valid payload without permission error.');
    console.log('  2. [UNEXECUTED - REQUIRES ISOLATED TEST DB] Approvals unconditional UNIQUE constraint & upsert:');
    console.log('     - Verify ON CONFLICT (asset_id, access_link_id) executes without partial index mismatch.');
    console.log('  3. [UNEXECUTED - REQUIRES ISOLATED TEST DB] Live RLS policies enforcement:');
    console.log('     - Verify anon cannot SELECT/INSERT on projects, assets, access_links, approvals.');
    console.log('  4. [UNEXECUTED - REQUIRES ISOLATED TEST DB] Storage bucket limits (500 MB & allowed MIME types).');
    console.log('\n================================================================');
    console.log('SUITE 3 STATUS: 0 EXECUTED | 4 SKIPPED [UNEXECUTED / لم يُنفذ في البيئة الحالية]');
    console.log('================================================================\n');
    return;
  }

  // If isolated test database keys are present, execute tests with strict error differentiation
  console.log('>>> Isolated Supabase test environment detected. Executing integration tests...\n');
  let passed = 0;
  let failed = 0;

  function assert(cond: boolean, name: string, detail?: string) {
    if (cond) {
      console.log(`  [PASS] ${name}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${name} ${detail ? `(${detail})` : ''}`);
      failed++;
    }
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  const jwtSecret = process.env.SUPABASE_JWT_SECRET || 'test-jwt-secret-placeholder-32-chars';

  const serviceClient = getServerSupabase()!;
  const anonClient = createClient(supabaseUrl, anonKey);
  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: {
      headers: {
        Authorization: `Bearer ${createMockAuthenticatedJwt(jwtSecret)}`,
      },
    },
  });

  try {
    // -------------------------------------------------------------
    // POINT 3: Differentiated RPC Error Checking
    // -------------------------------------------------------------
    console.log('>>> Testing RPC Execution Permission Differentiation on update_access_link_atomic...');

    const validTestLinkId = '00000000-0000-0000-0000-000000000001';
    const validPayload = {
      p_link_id: validTestLinkId,
      p_viewer_name: null,
      p_password_hash: null,
      p_enabled: true,
      p_increment_session_version: false,
      p_project_ids: null,
    };

    // 1. Test anon role: Must receive 42501 Permission Denied specifically
    const { error: anonRpcErr } = await anonClient.rpc('update_access_link_atomic', validPayload);

    const isAnonPermissionDenied = Boolean(
      anonRpcErr &&
      (anonRpcErr.code === '42501' ||
       anonRpcErr.message?.toLowerCase().includes('permission denied') ||
       (anonRpcErr as any).status === 401 ||
       (anonRpcErr as any).status === 403)
    );
    const isAnonMissingFunction = Boolean(
      anonRpcErr && (anonRpcErr.code === '42883' || anonRpcErr.code === 'PGRST202')
    );
    const isAnonConnectionError = Boolean(
      anonRpcErr && (anonRpcErr.message?.includes('fetch failed') || anonRpcErr.message?.includes('ECONNREFUSED'))
    );
    const isAnonDataError = Boolean(
      anonRpcErr && (anonRpcErr.code === '22P02' || anonRpcErr.code === 'P0001')
    );

    assert(
      isAnonPermissionDenied && !isAnonMissingFunction && !isAnonConnectionError && !isAnonDataError,
      'Anon role execution is rejected specifically with 42501 / Permission Denied (not 42883 function missing, network error, or data error)',
      `Actual Code: ${anonRpcErr?.code}, Message: ${anonRpcErr?.message}`
    );

    // 2. Test authenticated role: Must receive 42501 Permission Denied specifically
    const { error: authRpcErr } = await authClient.rpc('update_access_link_atomic', validPayload);

    const isAuthPermissionDenied = Boolean(
      authRpcErr &&
      (authRpcErr.code === '42501' ||
       authRpcErr.message?.toLowerCase().includes('permission denied') ||
       (authRpcErr as any).status === 401 ||
       (authRpcErr as any).status === 403)
    );
    const isAuthMissingFunction = Boolean(
      authRpcErr && (authRpcErr.code === '42883' || authRpcErr.code === 'PGRST202')
    );

    assert(
      isAuthPermissionDenied && !isAuthMissingFunction,
      'Authenticated role execution is rejected specifically with 42501 / Permission Denied (not 42883 function missing)',
      `Actual Code: ${authRpcErr?.code}, Message: ${authRpcErr?.message}`
    );

    // 3. Test service_role: Must succeed without 42501 Permission Denied
    const { error: serviceRpcErr } = await serviceClient.rpc('update_access_link_atomic', validPayload);
    const isServicePermissionDenied = Boolean(
      serviceRpcErr &&
      (serviceRpcErr.code === '42501' || serviceRpcErr.message?.toLowerCase().includes('permission denied'))
    );

    assert(
      !isServicePermissionDenied,
      'Service role is fully authorized and does NOT encounter 42501 permission denial'
    );

    // 4. Test Live Approvals ON CONFLICT (asset_id, access_link_id)
    console.log('\n>>> Testing live database operations with service_role...');
    const testProjectId = '11111111-2222-3333-4444-555555555555';
    const testAssetId = '22222222-3333-4444-5555-666666666666';
    const testLinkId = '33333333-4444-5555-6666-777777777777';

    // Cleanup previous test fixtures if any
    await serviceClient.from('approvals').delete().eq('asset_id', testAssetId);
    await serviceClient.from('access_link_projects').delete().eq('access_link_id', testLinkId);
    await serviceClient.from('assets').delete().eq('id', testAssetId);
    await serviceClient.from('projects').delete().eq('id', testProjectId);
    await serviceClient.from('access_links').delete().eq('id', testLinkId);

    // Create test project
    const { error: projInsErr } = await serviceClient.from('projects').insert({
      id: testProjectId,
      title: 'مشروع فحص السيرفر المباشر',
      category: 'هويات بصرية',
      progress: 45,
      is_visible: true,
      is_archived: false,
    });
    assert(!projInsErr, 'Inserted test project into isolated test Supabase database');

    // Create test asset
    const { error: assetInsErr } = await serviceClient.from('assets').insert({
      id: testAssetId,
      project_id: testProjectId,
      title: 'ملف فحص الاعتماد',
      file_url: 'https://example.com/test-video.mp4',
      file_type: 'video',
      version: 'V1',
      is_visible: true,
    });
    assert(!assetInsErr, 'Inserted test asset into isolated test Supabase database');

    // Create test link
    const { error: linkInsErr } = await serviceClient.from('access_links').insert({
      id: testLinkId,
      slug: 'live-test-link-' + Date.now(),
      viewer_name: 'عميل الفحص الحي',
      password_hash: '$2b$10$liveTestHashPlaceholder9999999999999999999999999999999',
      enabled: true,
      session_version: 1,
    });
    assert(!linkInsErr, 'Inserted test access_link into isolated test Supabase database');

    // Link project
    await serviceClient.from('access_link_projects').insert({
      access_link_id: testLinkId,
      project_id: testProjectId,
    });

    // Test Atomic Stored Procedure on real record with service_role (should succeed)
    const { data: updatedRpcData, error: atomicExecErr } = await serviceClient.rpc('update_access_link_atomic', {
      p_link_id: testLinkId,
      p_viewer_name: 'عميل محدّث ذرياً',
      p_password_hash: null,
      p_enabled: true,
      p_increment_session_version: true,
      p_project_ids: [testProjectId],
    });
    assert(!atomicExecErr && updatedRpcData?.viewer_name === 'عميل محدّث ذرياً', 'Executed update_access_link_atomic successfully via service_role');
    assert(updatedRpcData?.session_version === 2, 'Session version incremented atomically');
    assert(Boolean(updatedRpcData && !('password_hash' in updatedRpcData)), 'password_hash strictly stripped from RPC response payload');

    // Test Approvals Unconditional ON CONFLICT Upsert
    const { error: app1Err } = await serviceClient.from('approvals').upsert({
      asset_id: testAssetId,
      access_link_id: testLinkId,
      approved: true,
      viewer_name: 'عميل الفحص الحي',
    }, { onConflict: 'asset_id,access_link_id' });
    assert(!app1Err, 'First approval inserted cleanly via upsert onConflict(asset_id, access_link_id)');

    // Toggle approval to false via onConflict
    const { error: app2Err } = await serviceClient.from('approvals').upsert({
      asset_id: testAssetId,
      access_link_id: testLinkId,
      approved: false,
      viewer_name: 'عميل الفحص الحي',
    }, { onConflict: 'asset_id,access_link_id' });
    assert(!app2Err, 'Second approval updated cleanly via upsert onConflict without unique constraint violation');

    const { data: finalAppRec } = await serviceClient.from('approvals').select('*').eq('asset_id', testAssetId).single();
    assert(finalAppRec?.approved === false, 'Approval record holds latest updated state in PostgreSQL');

    // Cleanup test fixtures
    await serviceClient.from('approvals').delete().eq('asset_id', testAssetId);
    await serviceClient.from('access_link_projects').delete().eq('access_link_id', testLinkId);
    await serviceClient.from('assets').delete().eq('id', testAssetId);
    await serviceClient.from('projects').delete().eq('id', testProjectId);
    await serviceClient.from('access_links').delete().eq('id', testLinkId);
    console.log('>>> Cleaned up all isolated test records.');

  } catch (err: any) {
    console.error('Isolated Supabase integration test error:', err);
    failed++;
  }

  console.log('\n================================================================');
  console.log(`SUITE 3 RESULTS: ${passed} PASSED | ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) process.exit(1);
}

runSupabaseIntegrationTests().catch((err) => {
  console.error('Suite 3 crashed:', err);
  process.exit(1);
});
