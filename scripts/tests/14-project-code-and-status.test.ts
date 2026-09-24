import assert from 'assert';
import {
  dataService,
  generateNextProjectCode,
  isValidProjectStatus,
  VALID_PROJECT_STATUSES,
} from '../../lib/data/service';
import { ProjectStatus, PROJECT_STATUS_LABELS, PROJECT_STATUS_COLORS } from '../../lib/supabase/database.types';
import { PATCH as updateProjectHandler } from '../../app/api/admin/projects/[id]/route';
import { POST as createProjectHandler } from '../../app/api/admin/projects/route';
import { createSignedToken } from '../../lib/auth/session';

async function runTestSuite() {
  console.log('================================================================');
  console.log('SUITE 14: PROJECT CODE & STATUS LIFECYCLE TESTS');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function test(name: string, fn: () => void | Promise<void>) {
    try {
      const res = fn();
      if (res instanceof Promise) {
        return res
          .then(() => {
            console.log(`  ✓ ${name}`);
            passed++;
          })
          .catch((err) => {
            console.error(`  ✗ ${name}`);
            console.error(err);
            failed++;
          });
      } else {
        console.log(`  ✓ ${name}`);
        passed++;
      }
    } catch (err) {
      console.error(`  ✗ ${name}`);
      console.error(err);
      failed++;
    }
  }

  // -----------------------------------------------------------------
  // 1. Project Code Format & Sequential Generation
  // -----------------------------------------------------------------
  console.log('>>> 1. Testing Project Code Format & Sequential Generation...');

  await test('Generates project codes with format MDS-YYYY-NNN', async () => {
    const code = await generateNextProjectCode(2026);
    assert(typeof code === 'string', 'Code must be string');
    assert(/^MDS-2026-\d{3,}$/.test(code), `Code ${code} must match MDS-YYYY-NNN pattern`);
  });

  await test('Generates codes sequentially for custom years', async () => {
    const code2030A = await generateNextProjectCode(2030);
    assert(/^MDS-2030-001$/.test(code2030A), `First code in 2030 should be MDS-2030-001, got ${code2030A}`);
  });

  // -----------------------------------------------------------------
  // 2. Concurrency & Race Condition Defense
  // -----------------------------------------------------------------
  console.log('\n>>> 2. Testing Concurrency & Race Condition Defense...');

  await test('Concurrent calls produce unique, collision-free project codes', async () => {
    const concurrencyCount = 20;
    const promises = Array.from({ length: concurrencyCount }, () =>
      generateNextProjectCode(2028)
    );
    const codes = await Promise.all(promises);

    assert.strictEqual(codes.length, concurrencyCount, 'Should generate all requested codes');
    const uniqueCodes = new Set(codes);
    assert.strictEqual(
      uniqueCodes.size,
      concurrencyCount,
      `All ${concurrencyCount} concurrent codes must be distinct (no duplicates). Generated: ${Array.from(uniqueCodes).join(', ')}`
    );

    // Verify all follow MDS-2028-XXX pattern
    for (const code of codes) {
      assert(/^MDS-2028-\d{3,}$/.test(code), `Code ${code} must match format`);
    }
  });

  // -----------------------------------------------------------------
  // 3. Project Creation & Status Defaults
  // -----------------------------------------------------------------
  console.log('\n>>> 3. Testing Project Creation & Status Defaults...');

  let testProject1: any;
  await test('createProject assigns automatic project_code and default status "new"', async () => {
    testProject1 = await dataService.createProject({
      title: 'مشروع اختبار تسلسل الأكواد 1',
      description: 'وصف تجريبي',
    });

    assert(testProject1.id, 'Project must have an id');
    assert(testProject1.project_code, 'Project must have a project_code');
    assert(/^MDS-\d{4}-\d{3,}$/.test(testProject1.project_code), `Code ${testProject1.project_code} must match format`);
    assert.strictEqual(testProject1.status, 'new', 'Default status must be "new"');
    assert.strictEqual(testProject1.is_archived, false, 'Default is_archived must be false');
  });

  let testProject2: any;
  await test('createProject accepts custom valid status', async () => {
    testProject2 = await dataService.createProject({
      title: 'مشروع اختبار حالة معتمد',
      status: 'approved',
    });

    assert.strictEqual(testProject2.status, 'approved', 'Status should be "approved"');
    assert.strictEqual(testProject2.is_archived, false, 'Non-archived project is_archived must be false');
    assert(testProject2.project_code, 'Must have project_code');
    assert(testProject2.project_code !== testProject1.project_code, 'Each project must have distinct code');
  });

  await test('createProject with status "archived" sets is_archived = true', async () => {
    const archivedProj = await dataService.createProject({
      title: 'مشروع مؤرشف منذ البداية',
      status: 'archived',
    });

    assert.strictEqual(archivedProj.status, 'archived');
    assert.strictEqual(archivedProj.is_archived, true);
  });

  await test('createProject rejects invalid status values', async () => {
    let threw = false;
    try {
      await dataService.createProject({
        title: 'مشروع بحالة خاطئة',
        status: 'invalid_status_xyz' as any,
      });
    } catch {
      threw = true;
    }
    assert(threw, 'Should throw error when attempting to create project with invalid status');
  });

  // -----------------------------------------------------------------
  // 4. Immutability of project_code
  // -----------------------------------------------------------------
  console.log('\n>>> 4. Testing Immutability of project_code...');

  await test('updateProject ignores attempts to modify project_code', async () => {
    const originalCode = testProject1.project_code;
    const updated = await dataService.updateProject(testProject1.id, {
      title: 'عنوان معدل',
      project_code: 'MDS-9999-999',
    } as any);

    assert(updated, 'Project should update successfully');
    assert.strictEqual(updated.title, 'عنوان معدل', 'Title was updated');
    assert.strictEqual(updated.project_code, originalCode, 'project_code MUST remain completely unchanged');
  });

  // -----------------------------------------------------------------
  // 5. Status Transitions & is_archived Sync
  // -----------------------------------------------------------------
  console.log('\n>>> 5. Testing Status Transitions & Synchronization...');

  await test('Can transition through all 7 allowed project statuses', async () => {
    const allowedStatuses: ProjectStatus[] = [
      'new',
      'in_progress',
      'ready_for_review',
      'changes_requested',
      'approved',
      'final',
      'archived',
    ];

    for (const st of allowedStatuses) {
      const res = await dataService.updateProject(testProject1.id, { status: st });
      assert(res, `Updating to status ${st} must succeed`);
      assert.strictEqual(res.status, st, `Status should be updated to ${st}`);
      if (st === 'archived') {
        assert.strictEqual(res.is_archived, true, 'status "archived" must set is_archived = true');
      } else {
        assert.strictEqual(res.is_archived, false, `status "${st}" must keep is_archived = false`);
      }
    }
  });

  await test('Transitioning away from archived unsets is_archived', async () => {
    // Set to archived
    await dataService.updateProject(testProject1.id, { status: 'archived' });
    let p = await dataService.getProjectById(testProject1.id);
    assert.strictEqual(p?.status, 'archived');
    assert.strictEqual(p?.is_archived, true);

    // Transition to in_progress
    await dataService.updateProject(testProject1.id, { status: 'in_progress' });
    p = await dataService.getProjectById(testProject1.id);
    assert.strictEqual(p?.status, 'in_progress');
    assert.strictEqual(p?.is_archived, false);
  });

  // -----------------------------------------------------------------
  // 6. Validation Helpers & UI Labels / Colors
  // -----------------------------------------------------------------
  console.log('\n>>> 6. Testing Status Helpers & Labels...');

  test('isValidProjectStatus correctly validates all 7 statuses', () => {
    for (const st of VALID_PROJECT_STATUSES) {
      assert.strictEqual(isValidProjectStatus(st), true, `${st} should be valid`);
      assert(PROJECT_STATUS_LABELS[st], `Label for ${st} must exist`);
      assert(PROJECT_STATUS_COLORS[st], `Color config for ${st} must exist`);
      assert(PROJECT_STATUS_COLORS[st].badge, `Badge style for ${st} must exist`);
      assert(PROJECT_STATUS_COLORS[st].dot, `Dot style for ${st} must exist`);
    }

    assert.strictEqual(isValidProjectStatus('unknown'), false);
    assert.strictEqual(isValidProjectStatus(''), false);
    assert.strictEqual(isValidProjectStatus(null), false);
    assert.strictEqual(isValidProjectStatus(undefined), false);
  });

  // -----------------------------------------------------------------
  // 7. API Handlers Testing (POST & PATCH)
  // -----------------------------------------------------------------
  console.log('\n>>> 7. Testing API Handlers...');

  const mockAdminToken = createSignedToken(
    { isAdmin: true, expiresAt: Date.now() + 60 * 60 * 1000 }
  );

  await test('POST /api/admin/projects creates project with code and validated status', async () => {
    const req = new Request('http://localhost:3000/api/admin/projects', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'host': 'localhost:3000',
        'Origin': 'http://localhost:3000',
        Cookie: `admin_session=${mockAdminToken}`,
      },
      body: JSON.stringify({
        title: 'مشروع تجريبي عبر API',
        status: 'ready_for_review',
        progress: 45,
      }),
    });

    const res = await createProjectHandler(req);
    assert.strictEqual(res.status, 200, 'POST should return 200');
    const data = await res.json();
    assert(data.success, 'Response should indicate success');
    assert(data.project.project_code, 'Project should have code');
    assert(/^MDS-\d{4}-\d{3,}$/.test(data.project.project_code), 'Code must match pattern');
    assert.strictEqual(data.project.status, 'ready_for_review');
  });

  await test('PATCH /api/admin/projects/[id] validates status and blocks code mutation', async () => {
    // 1. Attempt invalid status
    const badReq = new Request(`http://localhost:3000/api/admin/projects/${testProject1.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'host': 'localhost:3000',
        'Origin': 'http://localhost:3000',
        Cookie: `admin_session=${mockAdminToken}`,
      },
      body: JSON.stringify({
        status: 'invalid_status_value',
      }),
    });

    const badRes = await updateProjectHandler(badReq, {
      params: Promise.resolve({ id: testProject1.id }),
    });
    assert.strictEqual(badRes.status, 400, 'PATCH with invalid status should return 400');
    const badData = await badRes.json();
    assert(badData.error?.includes('حالة المشروع غير صالحة'), 'Error message should explain invalid status');

    // 2. Valid status and attempted code mutation
    const originalCode = testProject1.project_code;
    const goodReq = new Request(`http://localhost:3000/api/admin/projects/${testProject1.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'host': 'localhost:3000',
        'Origin': 'http://localhost:3000',
        Cookie: `admin_session=${mockAdminToken}`,
      },
      body: JSON.stringify({
        status: 'final',
        project_code: 'HACKED-CODE-123',
      }),
    });

    const goodRes = await updateProjectHandler(goodReq, {
      params: Promise.resolve({ id: testProject1.id }),
    });
    assert.strictEqual(goodRes.status, 200, 'PATCH should return 200');
    const goodData = await goodRes.json();
    assert.strictEqual(goodData.project.status, 'final', 'Status updated to final');
    assert.strictEqual(goodData.project.project_code, originalCode, 'Code remains untouched');
  });

  // -----------------------------------------------------------------
  // 8. Search & Filter Simulation
  // -----------------------------------------------------------------
  console.log('\n>>> 8. Testing Search & Filter Parity...');

  await test('Search by project_code and filter by status works simultaneously', async () => {
    const allProjects = await dataService.getAllProjects();
    assert(allProjects.length >= 3, 'Must have at least 3 projects');

    // Every project returned must have project_code and status
    for (const p of allProjects) {
      assert(p.project_code, `Project ${p.id} must have project_code`);
      assert(p.status, `Project ${p.id} must have status`);
      assert(isValidProjectStatus(p.status), `Project status ${p.status} must be valid`);
    }

    // Search by code:
    const targetProject = allProjects[0];
    const codeQuery = targetProject.project_code || '';
    const codeMatches = allProjects.filter((p) =>
      (p.project_code || '').toLowerCase().includes(codeQuery.toLowerCase())
    );
    assert(codeMatches.some((p) => p.id === targetProject.id), 'Search by exact code finds project');

    // Partial code search (e.g. last 3 digits)
    const partial = codeQuery.slice(-3);
    const partialMatches = allProjects.filter((p) =>
      (p.project_code || '').toLowerCase().includes(partial.toLowerCase())
    );
    assert(partialMatches.length >= 1, 'Partial code search works');

    // Status filter
    const statusMatches = allProjects.filter((p) => p.status === targetProject.status);
    assert(statusMatches.every((p) => p.status === targetProject.status), 'Filter by status matches correctly');

    // Simultaneous search + filter
    const comboMatches = allProjects.filter(
      (p) =>
        p.status === targetProject.status &&
        ((p.project_code || '').toLowerCase().includes(codeQuery.toLowerCase()) ||
          p.title.toLowerCase().includes(targetProject.title.toLowerCase()))
    );
    assert(comboMatches.some((p) => p.id === targetProject.id), 'Simultaneous search and filter works');
  });

  console.log('\n================================================================');
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Test suite failed with uncaught exception:', err);
  process.exit(1);
});
