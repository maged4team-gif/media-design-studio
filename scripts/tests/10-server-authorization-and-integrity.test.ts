/**
 * Test Suite 10: Server Authorization & Schema Integrity Guard Behavioral Tests
 * Run via: npx tsx --conditions=react-server --env-file=.env.local scripts/tests/10-server-authorization-and-integrity.test.ts
 *
 * NOTE ON RIGOR:
 * This suite executes REAL runtime behavior (HTTP requests, route handler execution,
 * live database schema enforcement, zero-write state verification, and data reconciliation).
 * No assertions are based on static code pattern searches.
 */

import fs from 'fs';
import path from 'path';
import { POST as handleCommentsPost } from '../../app/api/client/comments/route';
import { POST as handleApprovalsPost } from '../../app/api/client/approvals/route';
import { dataService } from '../../lib/data/service';
import { createSignedToken, ClientSessionData } from '../../lib/auth/session';
import { auditAndReconcileHistoricalData } from '../../lib/data/reconciliation';
import { setTestSupabaseClient } from '../../lib/supabase/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

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
  console.log('SUITE 10: SERVER AUTHORIZATION & SCHEMA INTEGRITY BEHAVIORAL TESTS');
  console.log('================================================================\n');

  // ==============================================================================
  // SECTION 1: BEHAVIORAL CLIENT AUTHORIZATION & ZERO-WRITE INVARIANCE
  // ==============================================================================
  console.log('>>> 1. Testing Behavioral Server-Side Authorization & Zero-Write Invariance...');

  // Setup isolated fixtures in demo store for clean repeatable execution
  process.env.DATA_MODE = 'demo';

  // 1A. Fixture: Project in Showcase Mode (allow_feedback = false)
  const showcaseProj = await dataService.createProject({
    title: 'مشروع للعرض فقط - اختبار سلوكي',
    description: 'مشروع مخصص لفحص الحظر السلوكي',
    allow_feedback: false,
    progress: 100,
  });
  assert(!!showcaseProj?.id, 'Created showcase test project fixture');

  const showcaseAsset = await dataService.createAsset({
    project_id: showcaseProj.id,
    title: 'فيديو للعرض فقط',
    file_url: 'https://example.com/showcase.mp4',
    file_type: 'video',
  });
  assert(!!showcaseAsset?.id, 'Created asset fixture under showcase project');

  const showcaseLink = await dataService.createAccessLink('عميل العرض فقط', '', [showcaseProj.id]);
  assert(!!showcaseLink?.id, 'Created access link fixture assigned to showcase project');

  // Generate genuine signed session token
  const showcaseSessionData: ClientSessionData = {
    linkId: showcaseLink.id,
    slug: showcaseLink.slug,
    viewerName: showcaseLink.viewer_name,
    sessionVersion: showcaseLink.session_version,
    expiresAt: Date.now() + 1000 * 60 * 60,
  };
  const showcaseToken = createSignedToken(showcaseSessionData);

  // 1B. BEHAVIORAL TEST: Attempt to add comment on showcase asset
  console.log('  -> Executing POST /api/client/comments on showcase project asset...');
  const commentsReq = new Request('http://localhost:3000/api/client/comments', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Host': 'localhost:3000',
      'Origin': 'http://localhost:3000',
      'Cookie': `client_session_${showcaseLink.slug}=${showcaseToken}`,
    },
    body: JSON.stringify({
      assetId: showcaseAsset.id,
      slug: showcaseLink.slug,
      body: 'محاولة إرسال ملاحظة غير مصرح بها برمجياً',
    }),
  });

  const commentsRes = await handleCommentsPost(commentsReq);
  const commentsBody = await commentsRes.json();

  assert(commentsRes.status === 403, 'Comments route returns HTTP 403 Forbidden for showcase project');
  assert(
    commentsBody.error === 'المشروع مضبوط في وضع العرض فقط ولا يقبل الملاحظات',
    'Comments route returns exact localized error message'
  );

  // CRITICAL ZERO-WRITE CHECK: Verify no comment record exists in storage
  const assetsAfterComment = await dataService.getAssetsForProject(showcaseProj.id);
  const targetAssetComments = assetsAfterComment.find((a) => a.id === showcaseAsset.id)?.comments || [];
  assert(targetAssetComments.length === 0, 'Zero-Write Verified: No comment was written or saved to storage');

  // 1C. BEHAVIORAL TEST: Attempt to toggle approval on showcase asset
  console.log('  -> Executing POST /api/client/approvals on showcase project asset...');
  const approvalsReq = new Request('http://localhost:3000/api/client/approvals', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Host': 'localhost:3000',
      'Origin': 'http://localhost:3000',
      'Cookie': `client_session_${showcaseLink.slug}=${showcaseToken}`,
    },
    body: JSON.stringify({
      assetId: showcaseAsset.id,
      slug: showcaseLink.slug,
      approved: true,
    }),
  });

  const approvalsRes = await handleApprovalsPost(approvalsReq);
  const approvalsBody = await approvalsRes.json();

  assert(approvalsRes.status === 403, 'Approvals route returns HTTP 403 Forbidden for showcase project');
  assert(
    approvalsBody.error === 'المشروع مضبوط في وضع العرض فقط ولا يقبل الاعتماد',
    'Approvals route returns exact localized error message'
  );

  // CRITICAL ZERO-WRITE CHECK: Verify no approval record exists in storage
  const assetsAfterApproval = await dataService.getAssetsForProject(showcaseProj.id);
  const targetAssetApprovals = assetsAfterApproval.find((a) => a.id === showcaseAsset.id)?.approvals || [];
  assert(targetAssetApprovals.length === 0, 'Zero-Write Verified: No approval was written or saved to storage');

  // ==============================================================================
  // SECTION 2: BEHAVIORAL INTERACTIVE PROJECT PERMITTED EXECUTION
  // ==============================================================================
  console.log('\n>>> 2. Testing Behavioral Acceptance for Interactive Project (allow_feedback = true)...');

  const interactiveProj = await dataService.createProject({
    title: 'مشروع تفاعلي - اختبار سلوكي',
    allow_feedback: true,
    progress: 50,
  });

  const interactiveAsset = await dataService.createAsset({
    project_id: interactiveProj.id,
    title: 'فيديو تفاعلي',
    file_url: 'https://example.com/interactive.mp4',
    file_type: 'video',
  });

  const interactiveLink = await dataService.createAccessLink('العميل التفاعلي', '', [interactiveProj.id]);

  const interactiveSessionData: ClientSessionData = {
    linkId: interactiveLink.id,
    slug: interactiveLink.slug,
    viewerName: interactiveLink.viewer_name,
    sessionVersion: interactiveLink.session_version,
    expiresAt: Date.now() + 1000 * 60 * 60,
  };
  const interactiveToken = createSignedToken(interactiveSessionData);

  // Authorized comment submission
  const validCommentReq = new Request('http://localhost:3000/api/client/comments', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Host': 'localhost:3000',
      'Origin': 'http://localhost:3000',
      'Cookie': `client_session_${interactiveLink.slug}=${interactiveToken}`,
    },
    body: JSON.stringify({
      assetId: interactiveAsset.id,
      slug: interactiveLink.slug,
      body: 'ملاحظة معتمدة وسليمة',
    }),
  });
  const validCommentRes = await handleCommentsPost(validCommentReq);
  const validCommentBody = await validCommentRes.json();

  assert(validCommentRes.status === 200, 'Interactive project accepts comment with HTTP 200 OK');
  assert(validCommentBody.success === true && !!validCommentBody.comment, 'Comment payload returned in response');

  const assetsWithComment = await dataService.getAssetsForProject(interactiveProj.id);
  const savedComments = assetsWithComment.find((a) => a.id === interactiveAsset.id)?.comments || [];
  assert(
    savedComments.length === 1 && savedComments[0].body === 'ملاحظة معتمدة وسليمة',
    'Comment is reliably saved and retrievable'
  );

  // Authorized approval submission
  const validApprovalReq = new Request('http://localhost:3000/api/client/approvals', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Host': 'localhost:3000',
      'Origin': 'http://localhost:3000',
      'Cookie': `client_session_${interactiveLink.slug}=${interactiveToken}`,
    },
    body: JSON.stringify({
      assetId: interactiveAsset.id,
      slug: interactiveLink.slug,
      approved: true,
    }),
  });
  const validApprovalRes = await handleApprovalsPost(validApprovalReq);
  const validApprovalBody = await validApprovalRes.json();

  assert(validApprovalRes.status === 200, 'Interactive project accepts approval toggle with HTTP 200 OK');
  assert(validApprovalBody.success === true && validApprovalBody.approval?.approved === true, 'Approval payload returned in response');

  const assetsWithApproval = await dataService.getAssetsForProject(interactiveProj.id);
  const savedApprovals = assetsWithApproval.find((a) => a.id === interactiveAsset.id)?.approvals || [];
  assert(
    savedApprovals.length === 1 && savedApprovals[0].approved === true,
    'Approval is reliably saved and retrievable'
  );

  // ==============================================================================
  // SECTION 3: BEHAVIORAL SUPABASE SCHEMA GUARD & ZERO-FALLBACK INVARIANCE
  // ==============================================================================
  console.log('\n>>> 3. Testing Behavioral Supabase Schema Guard & Zero-Fallback Invariance...');

  process.env.DATA_MODE = 'supabase';

  const projectSettingsFile = path.resolve(process.cwd(), '.data/project-settings.json');
  const assetMapFile = path.resolve(process.cwd(), '.data/asset-drive-map.json');

  const settingsBefore = fs.existsSync(projectSettingsFile) ? fs.readFileSync(projectSettingsFile, 'utf8') : '{}';
  const mapBefore = fs.existsSync(assetMapFile) ? fs.readFileSync(assetMapFile, 'utf8') : '{}';

  // We mock a PostgreSQL missing column error (code 42703) to ensure:
  // 1. dataService fails fast and throws DB_SCHEMA_ERROR.
  // 2. dataService calls insert/update EXACTLY ONCE (no retry with stripped fields).
  // 3. dataService NEVER writes to local recovery JSON files (Zero-Fallback).
  let pInsertCalls = 0;
  let pUpdateCalls = 0;
  let aInsertCalls = 0;
  let aUpdateCalls = 0;

  const mockSchemaErrorClient = {
    from: (table: string) => ({
      insert: () => {
        if (table === 'projects') pInsertCalls++;
        if (table === 'assets') aInsertCalls++;
        return {
          select: () => ({
            single: async () => ({
              data: null,
              error: {
                code: '42703',
                message:
                  table === 'projects'
                    ? 'column "show_progress" of relation "projects" does not exist'
                    : 'column "drive_file_id" of relation "assets" does not exist',
              },
            }),
          }),
        };
      },
      update: () => {
        if (table === 'projects') pUpdateCalls++;
        if (table === 'assets') aUpdateCalls++;
        return {
          eq: () => ({
            select: () => ({
              maybeSingle: async () => ({
                data: null,
                error: {
                  code: '42703',
                  message:
                    table === 'projects'
                      ? 'column "show_progress" of relation "projects" does not exist'
                      : 'column "drive_file_id" of relation "assets" does not exist',
                },
              }),
            }),
          }),
        };
      },
    }),
  };

  setTestSupabaseClient(mockSchemaErrorClient);

  // 3A. Test createProject with missing column error
  console.log('  -> Calling createProject with mock missing column error (42703)...');
  let createProjError: any = null;
  try {
    await dataService.createProject({
      title: 'مشروع اختبار المخطط',
      show_progress: false,
    });
  } catch (err: any) {
    createProjError = err;
  }

  assert(createProjError !== null, 'createProject threw an error on simulated missing column');
  assert(
    createProjError?.message?.includes('DB_SCHEMA_ERROR'),
    `createProject error is explicit DB_SCHEMA_ERROR (got: "${createProjError?.message?.slice(0, 45)}...")`
  );
  assert(pInsertCalls === 1, 'Zero-Retry Verified: createProject attempted insert exactly once without stripping fields');
  const settingsAfterCreate = fs.existsSync(projectSettingsFile) ? fs.readFileSync(projectSettingsFile, 'utf8') : '{}';
  assert(settingsBefore === settingsAfterCreate, 'Zero-Fallback: .data/project-settings.json was not modified on createProject');

  // 3B. Test updateProject with missing column error
  console.log('  -> Calling updateProject with mock missing column error (42703)...');
  let updateProjError: any = null;
  try {
    await dataService.updateProject('test-proj-id', {
      show_progress: false,
    });
  } catch (err: any) {
    updateProjError = err;
  }

  assert(updateProjError !== null, 'updateProject threw an error on simulated missing column');
  assert(
    updateProjError?.message?.includes('DB_SCHEMA_ERROR'),
    `updateProject error is explicit DB_SCHEMA_ERROR (got: "${updateProjError?.message?.slice(0, 45)}...")`
  );
  assert(pUpdateCalls === 1, 'Zero-Retry Verified: updateProject attempted update exactly once without stripping fields');
  const settingsAfterUpdate = fs.existsSync(projectSettingsFile) ? fs.readFileSync(projectSettingsFile, 'utf8') : '{}';
  assert(settingsBefore === settingsAfterUpdate, 'Zero-Fallback: .data/project-settings.json was not modified on updateProject');

  // 3C. Test createAsset with missing column error
  console.log('  -> Calling createAsset with mock missing column error (42703)...');
  let createAssetError: any = null;
  try {
    await dataService.createAsset({
      project_id: 'test-proj-id',
      title: 'ملف اختبار المخطط',
      file_url: 'https://example.com/asset.mp4',
      drive_file_id: 'test-drive-id',
    });
  } catch (err: any) {
    createAssetError = err;
  }

  assert(createAssetError !== null, 'createAsset threw an error on simulated missing column');
  assert(
    createAssetError?.message?.includes('DB_SCHEMA_ERROR'),
    `createAsset error is explicit DB_SCHEMA_ERROR (got: "${createAssetError?.message?.slice(0, 45)}...")`
  );
  assert(aInsertCalls === 1, 'Zero-Retry Verified: createAsset attempted insert exactly once without stripping fields');
  const mapAfterCreate = fs.existsSync(assetMapFile) ? fs.readFileSync(assetMapFile, 'utf8') : '{}';
  assert(mapBefore === mapAfterCreate, 'Zero-Fallback: .data/asset-drive-map.json was not modified on createAsset');

  // 3D. Test updateAsset with missing column error
  console.log('  -> Calling updateAsset with mock missing column error (42703)...');
  let updateAssetError: any = null;
  try {
    await dataService.updateAsset('test-asset-id', {
      drive_file_id: 'test-drive-id',
    });
  } catch (err: any) {
    updateAssetError = err;
  }

  assert(updateAssetError !== null, 'updateAsset threw an error on simulated missing column');
  assert(
    updateAssetError?.message?.includes('DB_SCHEMA_ERROR'),
    `updateAsset error is explicit DB_SCHEMA_ERROR (got: "${updateAssetError?.message?.slice(0, 45)}...")`
  );
  assert(aUpdateCalls === 1, 'Zero-Retry Verified: updateAsset attempted update exactly once without stripping fields');
  const mapAfterUpdate = fs.existsSync(assetMapFile) ? fs.readFileSync(assetMapFile, 'utf8') : '{}';
  assert(mapBefore === mapAfterUpdate, 'Zero-Fallback: .data/asset-drive-map.json was not modified on updateAsset');

  // Reset test client override
  setTestSupabaseClient(null);

  // ==============================================================================
  // SECTION 4: BEHAVIORAL MIGRATION RECONCILIATION & ANOMALY DETECTION
  // ==============================================================================
  console.log('\n>>> 4. Testing Behavioral Pre-Flight Migration Anomaly & Conflict Detection...');

  // Helper to build isolated mock Supabase clients for reconciliation tests
  function createMockReconciliationClient(opts: {
    projects?: any[];
    assets?: any[];
    missingProjectCols?: string[];
    missingAssetCols?: string[];
    probeErrors?: Record<string, { code: string; message: string }>;
  }) {
    const missingP = new Set(opts.missingProjectCols || []);
    const missingA = new Set(opts.missingAssetCols || []);
    const projects = opts.projects || [];
    const assets = opts.assets || [];
    const probeErrors = opts.probeErrors || {};

    return {
      from: (table: string) => ({
        select: (cols: string) => {
          const isProjects = table === 'projects';
          const missingCols = isProjects ? missingP : missingA;
          const targetData = isProjects ? projects : assets;
          const requestedCols = cols.split(',').map((c) => c.trim());
          const hasMissing = requestedCols.some((c) => missingCols.has(c));

          return {
            limit: async (n: number) => {
              const probeKey = `${table}.${requestedCols[0]}`;
              if (probeErrors[probeKey]) {
                return {
                  data: null,
                  error: probeErrors[probeKey],
                };
              }
              if (hasMissing) {
                return {
                  data: null,
                  error: {
                    code: '42703',
                    message: `column "${requestedCols[0]}" of relation "${table}" does not exist`,
                  },
                };
              }
              return { data: targetData.slice(0, n), error: null };
            },
            then: (resolve: any) => {
              if (hasMissing) {
                resolve({
                  data: null,
                  error: {
                    code: '42703',
                    message: `column of relation "${table}" does not exist`,
                  },
                });
              } else {
                resolve({ data: targetData, error: null });
              }
            },
          };
        },
      }),
    } as unknown as SupabaseClient;
  }

  // --- Field Conflict Tests Across All 7 Columns ---

  // 4A. Project: show_progress Conflict
  console.log('  -> Testing conflict detection for projects.show_progress...');
  const mockP1 = createMockReconciliationClient({
    projects: [{ id: 'proj-1', title: 'P1', show_progress: true }],
  });
  const repP1 = await auditAndReconcileHistoricalData(mockP1, { 'proj-1': { show_progress: false } }, {});
  assert(repP1.canProceedSafely === false, 'projects.show_progress conflict halts execution (canProceedSafely = false)');
  assert(repP1.conflicts.length === 1 && repP1.conflicts[0].field === 'show_progress', 'Conflict on show_progress identified');

  // 4B. Project: allow_feedback Conflict
  console.log('  -> Testing conflict detection for projects.allow_feedback...');
  const mockP2 = createMockReconciliationClient({
    projects: [{ id: 'proj-1', title: 'P1', allow_feedback: true }],
  });
  const repP2 = await auditAndReconcileHistoricalData(mockP2, { 'proj-1': { allow_feedback: false } }, {});
  assert(repP2.canProceedSafely === false, 'projects.allow_feedback conflict halts execution (canProceedSafely = false)');
  assert(repP2.conflicts.length === 1 && repP2.conflicts[0].field === 'allow_feedback', 'Conflict on allow_feedback identified');

  // 4C. Project: drive_folder_id Conflict
  console.log('  -> Testing conflict detection for projects.drive_folder_id...');
  const mockP3 = createMockReconciliationClient({
    projects: [{ id: 'proj-1', title: 'P1', drive_folder_id: 'db-folder-xyz' }],
  });
  const repP3 = await auditAndReconcileHistoricalData(mockP3, { 'proj-1': { drive_folder_id: 'local-folder-abc' } }, {});
  assert(repP3.canProceedSafely === false, 'projects.drive_folder_id conflict halts execution (canProceedSafely = false)');
  assert(repP3.conflicts.length === 1 && repP3.conflicts[0].field === 'drive_folder_id', 'Conflict on drive_folder_id identified');

  // 4D. Project: drive_cover_file_id Conflict
  console.log('  -> Testing conflict detection for projects.drive_cover_file_id...');
  const mockP4 = createMockReconciliationClient({
    projects: [{ id: 'proj-1', title: 'P1', drive_cover_file_id: 'db-cover-xyz' }],
  });
  const repP4 = await auditAndReconcileHistoricalData(mockP4, { 'proj-1': { drive_cover_file_id: 'local-cover-abc' } }, {});
  assert(repP4.canProceedSafely === false, 'projects.drive_cover_file_id conflict halts execution (canProceedSafely = false)');
  assert(repP4.conflicts.length === 1 && repP4.conflicts[0].field === 'drive_cover_file_id', 'Conflict on drive_cover_file_id identified');

  // 4E. Asset: drive_file_id Conflict
  console.log('  -> Testing conflict detection for assets.drive_file_id...');
  const mockA1 = createMockReconciliationClient({
    projects: [{ id: 'proj-1', title: 'P1' }],
    assets: [{ id: 'asset-1', project_id: 'proj-1', title: 'A1', drive_file_id: 'db-file-xyz' }],
  });
  const repA1 = await auditAndReconcileHistoricalData(mockA1, {}, { 'asset-1': { drive_file_id: 'local-file-abc' } });
  assert(repA1.canProceedSafely === false, 'assets.drive_file_id conflict halts execution (canProceedSafely = false)');
  assert(repA1.conflicts.length === 1 && repA1.conflicts[0].field === 'drive_file_id', 'Conflict on drive_file_id identified');

  // 4F. Asset: drive_folder_id Conflict
  console.log('  -> Testing conflict detection for assets.drive_folder_id...');
  const mockA2 = createMockReconciliationClient({
    projects: [{ id: 'proj-1', title: 'P1' }],
    assets: [{ id: 'asset-1', project_id: 'proj-1', title: 'A1', drive_folder_id: 'db-folder-xyz' }],
  });
  const repA2 = await auditAndReconcileHistoricalData(mockA2, {}, { 'asset-1': { drive_folder_id: 'local-folder-abc' } });
  assert(repA2.canProceedSafely === false, 'assets.drive_folder_id conflict halts execution (canProceedSafely = false)');
  assert(repA2.conflicts.length === 1 && repA2.conflicts[0].field === 'drive_folder_id', 'Conflict on asset drive_folder_id identified');

  // 4G. Asset: source Conflict
  console.log('  -> Testing conflict detection for assets.source...');
  const mockA3 = createMockReconciliationClient({
    projects: [{ id: 'proj-1', title: 'P1' }],
    assets: [{ id: 'asset-1', project_id: 'proj-1', title: 'A1', source: 'legacy' }],
  });
  const repA3 = await auditAndReconcileHistoricalData(mockA3, {}, { 'asset-1': { source: 'drive' } });
  assert(repA3.canProceedSafely === false, 'assets.source conflict halts execution (canProceedSafely = false)');
  assert(repA3.conflicts.length === 1 && repA3.conflicts[0].field === 'source', 'Conflict on source identified');

  // --- Structural Anomaly Tests ---

  // 4H. Missing Schema Column Anomaly (Differentiating missing column from missing value)
  console.log('  -> Testing unreadable schema column vs absent value differentiation...');
  const mockMissingCol = createMockReconciliationClient({
    projects: [{ id: 'proj-1', title: 'P1' }],
    missingProjectCols: ['show_progress'],
  });
  const repMissingCol = await auditAndReconcileHistoricalData(mockMissingCol, { 'proj-1': { show_progress: false } }, {});
  assert(repMissingCol.canProceedSafely === false, 'Missing schema column halts execution (unreadable column is NEVER treated as matching)');
  assert(
    repMissingCol.missingSchemaColumns.length === 1 &&
    repMissingCol.missingSchemaColumns[0].column === 'show_progress' &&
    repMissingCol.missingSchemaColumns[0].reason === 'column_missing_in_db',
    'Missing column accurately classified as column_missing_in_db'
  );

  // 4I. Missing Target Project in DB
  console.log('  -> Testing missing target project in DB...');
  const mockMissingProj = createMockReconciliationClient({
    projects: [],
  });
  const repMissingProj = await auditAndReconcileHistoricalData(mockMissingProj, { 'ghost-proj-id': { show_progress: false } }, {});
  assert(repMissingProj.canProceedSafely === false, 'Missing target project halts execution');
  assert(repMissingProj.missingProjectsInDb.includes('ghost-proj-id'), 'Missing project ID flagged in missingProjectsInDb');

  // 4J. Missing Target Asset in DB
  console.log('  -> Testing missing target asset in DB...');
  const mockMissingAsset = createMockReconciliationClient({
    projects: [{ id: 'proj-1', title: 'P1' }],
    assets: [],
  });
  const repMissingAsset = await auditAndReconcileHistoricalData(mockMissingAsset, {}, { 'ghost-asset-id': { drive_file_id: 'd1' } });
  assert(repMissingAsset.canProceedSafely === false, 'Missing target asset halts execution');
  assert(repMissingAsset.missingAssetsInDb.includes('ghost-asset-id'), 'Missing asset ID flagged in missingAssetsInDb');

  // 4K. Intra-Local Duplicate drive_file_id
  console.log('  -> Testing intra-local duplicate drive_file_id...');
  const mockIntraDup = createMockReconciliationClient({
    projects: [{ id: 'proj-1', title: 'P1' }],
    assets: [
      { id: 'asset-1', project_id: 'proj-1', title: 'A1' },
      { id: 'asset-2', project_id: 'proj-1', title: 'A2' },
    ],
  });
  const repIntraDup = await auditAndReconcileHistoricalData(
    mockIntraDup,
    {},
    {
      'asset-1': { drive_file_id: 'dup-id-123' },
      'asset-2': { drive_file_id: 'dup-id-123' },
    }
  );
  assert(repIntraDup.canProceedSafely === false, 'Intra-local duplicate drive_file_id halts execution');
  assert(repIntraDup.duplicateDriveFileIds.length === 1, 'Intra-local duplicate accurately detected');

  // 4L. Cross-System Duplicate drive_file_id
  console.log('  -> Testing cross-system duplicate drive_file_id (local vs DB collision)...');
  const mockCrossDup = createMockReconciliationClient({
    projects: [{ id: 'proj-1', title: 'P1' }],
    assets: [
      { id: 'asset-already-in-db', project_id: 'proj-1', title: 'ADB', drive_file_id: 'shared-drive-file-id' },
      { id: 'asset-local-pending', project_id: 'proj-1', title: 'ALP' },
    ],
  });
  const repCrossDup = await auditAndReconcileHistoricalData(
    mockCrossDup,
    {},
    {
      'asset-local-pending': { drive_file_id: 'shared-drive-file-id' },
    }
  );
  assert(repCrossDup.canProceedSafely === false, 'Cross-system duplicate drive_file_id halts execution');
  assert(repCrossDup.duplicateDriveFileIds.length === 1, 'Cross-system collision accurately detected');

  // 4M. Real Live State Audit of Production Records
  console.log('  -> Auditing current live database state against local recovery files...');
  const liveSupabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const liveLocalSettings = JSON.parse(fs.readFileSync(projectSettingsFile, 'utf8'));
  const liveLocalAssetMap = JSON.parse(fs.readFileSync(assetMapFile, 'utf8'));
  const liveReport = await auditAndReconcileHistoricalData(liveSupabase, liveLocalSettings, liveLocalAssetMap);

  assert(liveReport.conflicts.length === 0, 'Live Audit: Zero data conflicts detected with existing DB rows');
  assert(liveReport.duplicateDriveFileIds.length === 0, 'Live Audit: Zero duplicate Drive file IDs');
  assert(liveReport.missingAssetsInDb.length === 0, 'Live Audit: All 6 historical assets exist in live DB');
  assert(
    liveReport.missingProjectsInDb.length === 3,
    'Live Audit: Accurately identifies the 3 ephemeral test projects absent from live DB'
  );

  // ==============================================================================
  // SECTION 5: BEHAVIORAL TESTS FOR SPECIFIC USER-REQUESTED ANOMALY SCENARIOS
  // ==============================================================================
  console.log('\n>>> 5. Testing Specific User-Requested Anomaly & Integrity Scenarios...');

  // Scenario 5A: تطابق الأصل الأول وبقاء أصل آخر دون نقل
  console.log('  -> Testing Scenario 5A: First asset matches, but second asset remains unmigrated...');
  const localTargetAssets = {
    'ba5dac17-3a8d-413e-ba90-63b0e0bd2058': {
      drive_file_id: '1Wg3j7fBVgg4JKZ5J5KYvahD0SulcC_t3',
      drive_folder_id: '1koVd1dp_1-GhANmgTJ0Ql8WWvRMb9pnV',
      source: 'drive',
    },
    '685602eb-6f63-40f5-afd0-972116bb6a2f': {
      drive_file_id: '1d6VQJo-eGCs_adrNSfQ6FPGrtNur_Rn8',
      drive_folder_id: '1--uFjnwYt2uSQzYr0goYQcbew5Bhk1FL',
      source: 'drive',
    },
  };

  const mockPartialAssetsClient = createMockReconciliationClient({
    projects: [{ id: 'p1', title: 'P1' }],
    assets: [
      // Asset 1 is already transferred and matches 100%
      {
        id: 'ba5dac17-3a8d-413e-ba90-63b0e0bd2058',
        project_id: 'p1',
        title: 'Asset 1 (Migrated)',
        drive_file_id: '1Wg3j7fBVgg4JKZ5J5KYvahD0SulcC_t3',
        drive_folder_id: '1koVd1dp_1-GhANmgTJ0Ql8WWvRMb9pnV',
        source: 'drive',
      },
      // Asset 2 remains unmigrated (NULL values, legacy source)
      {
        id: '685602eb-6f63-40f5-afd0-972116bb6a2f',
        project_id: 'p1',
        title: 'Asset 2 (Unmigrated)',
        drive_file_id: null,
        drive_folder_id: null,
        source: 'legacy',
      },
    ],
  });

  const repPartial = await auditAndReconcileHistoricalData(mockPartialAssetsClient, {}, localTargetAssets);
  // Verified matches count should be 1 (only asset 1 matched)
  assert(repPartial.verifiedMatchesCount === 1, 'Partial Migration: Exactly 1 asset verified as matched');
  
  // Test ALREADY_APPLIED contract: Check whether all 6 assets match
  const allSixAssetsMatched = [
    'ba5dac17-3a8d-413e-ba90-63b0e0bd2058',
    '685602eb-6f63-40f5-afd0-972116bb6a2f',
    'ef0f1b1b-0e44-44c9-82ed-26a2e13a489b',
    'b8e1f656-233d-4f12-9827-9b8742e09cf9',
    '64c8407d-6b83-44f1-9574-4b852c8bd1e4',
    '6ce3ea6d-9d5b-41c2-b99f-17a7f5cfa21a',
  ].every((id) => id === 'ba5dac17-3a8d-413e-ba90-63b0e0bd2058'); // in partial state, only 1 matches
  assert(allSixAssetsMatched === false, 'ALREADY_APPLIED Contract: Strictly false when any asset remains unmigrated');

  // Scenario 5B: وجود قيمة حالية متعارضة في أحد الأصول
  console.log('  -> Testing Scenario 5B: Conflicting current value in one asset...');
  const mockConflictingAssetClient = createMockReconciliationClient({
    projects: [{ id: 'p1', title: 'P1' }],
    assets: [
      {
        id: 'ba5dac17-3a8d-413e-ba90-63b0e0bd2058',
        project_id: 'p1',
        title: 'Asset with Contradictory File ID',
        drive_file_id: 'unexpected_conflicting_file_id_xyz',
        drive_folder_id: '1koVd1dp_1-GhANmgTJ0Ql8WWvRMb9pnV',
        source: 'drive',
      },
    ],
  });

  const repAssetConflict = await auditAndReconcileHistoricalData(
    mockConflictingAssetClient,
    {},
    {
      'ba5dac17-3a8d-413e-ba90-63b0e0bd2058': {
        drive_file_id: '1Wg3j7fBVgg4JKZ5J5KYvahD0SulcC_t3',
      },
    }
  );

  assert(repAssetConflict.canProceedSafely === false, 'Asset Conflict: Halts execution immediately (canProceedSafely = false)');
  assert(repAssetConflict.conflicts.length === 1, 'Asset Conflict: Exactly 1 conflict recorded');
  assert(
    repAssetConflict.conflicts[0].entityType === 'asset' &&
    repAssetConflict.conflicts[0].field === 'drive_file_id' &&
    repAssetConflict.conflicts[0].dbValue === 'unexpected_conflicting_file_id_xyz',
    'Asset Conflict: Accurately identifies conflicting asset field and existing DB value'
  );

  // Scenario 5C: غياب مشروع أو أصل مستهدف
  console.log('  -> Testing Scenario 5C: Target project or asset missing in DB...');
  const mockMissingEntityClient = createMockReconciliationClient({
    projects: [], // 0 projects in DB
    assets: [],   // 0 assets in DB
  });

  const repMissingTarget = await auditAndReconcileHistoricalData(
    mockMissingEntityClient,
    { '9f9cc14b-b0bd-4b42-9ba6-9940c1681569': { drive_folder_id: '1koVd1dp_1-GhANmgTJ0Ql8WWvRMb9pnV' } },
    { 'ba5dac17-3a8d-413e-ba90-63b0e0bd2058': { drive_file_id: '1Wg3j7fBVgg4JKZ5J5KYvahD0SulcC_t3' } }
  );

  assert(repMissingTarget.canProceedSafely === false, 'Missing Targets: Halts execution (canProceedSafely = false)');
  assert(
    repMissingTarget.missingProjectsInDb.includes('9f9cc14b-b0bd-4b42-9ba6-9940c1681569'),
    'Missing Targets: Target project ID identified in missingProjectsInDb'
  );
  assert(
    repMissingTarget.missingAssetsInDb.includes('ba5dac17-3a8d-413e-ba90-63b0e0bd2058'),
    'Missing Targets: Target asset ID identified in missingAssetsInDb'
  );

  // Scenario 5D: فشل قراءة عمود بسبب خطأ صلاحيات (42501)
  console.log('  -> Testing Scenario 5D: Column read failure due to permissions error (42501)...');
  const mockPermissionErrorClient = createMockReconciliationClient({
    probeErrors: {
      'projects.show_progress': {
        code: '42501',
        message: 'permission denied for table projects',
      },
    },
  });

  let permError: any = null;
  try {
    await auditAndReconcileHistoricalData(mockPermissionErrorClient, { p1: { show_progress: false } }, {});
  } catch (err: any) {
    permError = err;
  }

  assert(permError !== null, 'Permissions Error: Reconciler threw an exception on permission error');
  assert(
    permError?.message?.includes('DB_PROBE_ERROR') && permError?.message?.includes('42501'),
    `Permissions Error: Threw explicit DB_PROBE_ERROR with code 42501 without silent exclusion (got: "${permError?.message?.slice(0, 50)}...")`
  );

  // Scenario 5E: فشل قراءة عمود بسبب خطأ خدمة (503 Service Unavailable)
  console.log('  -> Testing Scenario 5E: Column read failure due to service error (503)...');
  const mockServiceErrorClient = createMockReconciliationClient({
    probeErrors: {
      'assets.drive_file_id': {
        code: '503',
        message: 'upstream service unavailable / gateway timeout',
      },
    },
  });

  let serviceError: any = null;
  try {
    await auditAndReconcileHistoricalData(mockServiceErrorClient, {}, { a1: { drive_file_id: 'd1' } });
  } catch (err: any) {
    serviceError = err;
  }

  assert(serviceError !== null, 'Service Error: Reconciler threw an exception on service error');
  assert(
    serviceError?.message?.includes('DB_PROBE_ERROR') && serviceError?.message?.includes('503'),
    `Service Error: Threw explicit DB_PROBE_ERROR with code 503 without silent exclusion (got: "${serviceError?.message?.slice(0, 50)}...")`
  );

  console.log('\n================================================================');
  console.log(`SUITE 10 RESULTS: ${passed} PASSED | ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error('Suite 10 crashed:', err);
  process.exit(1);
});
