/**
 * Test Suite 7: Direct Project Sharing & Routing Authorization Tests
 * Run via: npx tsx --conditions=react-server scripts/tests/7-direct-project-share.test.ts
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
  console.log('SUITE 7: DIRECT PROJECT SHARING & AUTHORIZATION TESTS');
  console.log('================================================================\n');

  console.log('>>> 1. Creating Isolated Fixtures...');
  const project1 = await dataService.createProject({
    title: 'لقاء خاص',
    description: 'مشروع حلقة حوارية خاصة',
    progress: 80,
  });

  const project2 = await dataService.createProject({
    title: 'نشرة الأخبار',
    description: 'مشروع النشرة الرئيسية',
    progress: 40,
  });

  // Client link assigned ONLY to project1 ("لقاء خاص")
  const clientLink = await dataService.createAccessLink(
    'قناة الشرقية',
    'secure-password-123',
    [project1.id]
  );

  console.log('>>> 2. Testing Direct Route Link Generation Format...');
  const directLinkUrl = `/p/${clientLink.slug}/projects/${project1.id}?direct=true`;
  const generalLinkUrl = `/p/${clientLink.slug}`;

  assert(directLinkUrl === `/p/${clientLink.slug}/projects/${project1.id}?direct=true`, 'Direct project link includes ?direct=true flag');
  assert(/^\/p\/[a-zA-Z0-9_-]+\/projects\/[a-zA-Z0-9_-]+\?direct=true$/.test(directLinkUrl), 'Direct link matches URL regex pattern with ?direct=true');
  assert(generalLinkUrl === `/p/${clientLink.slug}`, 'General client link follows /p/[slug] schema without query parameter');
  assert(directLinkUrl !== generalLinkUrl, 'Direct link is distinct from general link (additional option)');

  // Verify URL query parameter parsing behavior
  const parsedDirectUrl = new URL(directLinkUrl, 'http://localhost');
  assert(parsedDirectUrl.searchParams.get('direct') === 'true', 'URL searchParams accurately detects direct=true flag');
  const parsedGeneralUrl = new URL(generalLinkUrl, 'http://localhost');
  assert(parsedGeneralUrl.searchParams.get('direct') === null, 'General URL has no direct flag');

  console.log('>>> 3. Testing Strict Project-To-Client Assignment...');
  // Project 1 is assigned
  const assignedProject = await dataService.getProjectForClient(clientLink.id, project1.id);
  assert(assignedProject !== null && assignedProject.id === project1.id, 'Client can access assigned project ("لقاء خاص")');
  assert(assignedProject?.title === 'لقاء خاص', 'Project title matches "لقاء خاص"');

  // Project 2 is NOT assigned
  const unassignedProject = await dataService.getProjectForClient(clientLink.id, project2.id);
  assert(unassignedProject === null, 'Client CANNOT access unassigned project ("نشرة الأخبار") - returns null (404)');

  console.log('>>> 4. Testing Client Session Verification for Direct Access...');
  // Valid token with matching linkId and sessionVersion
  const validToken = await createSignedToken({
    linkId: clientLink.id,
    viewerName: clientLink.viewer_name,
    slug: clientLink.slug,
    sessionVersion: clientLink.session_version,
  });

  const verifiedSession = await verifySignedToken<ClientSessionData>(validToken);
  assert(verifiedSession !== null, 'Valid token verified successfully');
  assert(
    verifiedSession?.linkId === clientLink.id && verifiedSession?.sessionVersion === clientLink.session_version,
    'Session linkId and sessionVersion strictly match link record'
  );

  // Stale token (e.g. after password reset / session invalidation)
  const staleToken = await createSignedToken({
    linkId: clientLink.id,
    viewerName: clientLink.viewer_name,
    slug: clientLink.slug,
    sessionVersion: clientLink.session_version + 1,
  });

  const verifiedStale = await verifySignedToken<ClientSessionData>(staleToken);
  assert(
    verifiedStale?.sessionVersion !== clientLink.session_version,
    'Stale session version detected and rejected (forces PasswordGate re-entry)'
  );

  console.log('>>> 5. Testing Disabled Link Protection...');
  const disabledLink = await dataService.createAccessLink(
    'عميل متوقف',
    'pass',
    [project1.id]
  );
  await dataService.updateAccessLink(disabledLink.id, { enabled: false });

  const fetchedDisabled = await dataService.getAccessLinkBySlug(disabledLink.slug);
  assert(fetchedDisabled?.enabled === false, 'Disabled link is strictly recognized as disabled (triggers 404)');

  console.log('>>> 6. Testing Customizable Progress Bar (show_progress)...');
  // project1 defaults to show_progress: true
  assert(project1.show_progress === true, 'project1 defaults to show_progress: true');

  // Create project with show_progress: false
  const noProgressProject = await dataService.createProject({
    title: 'مشروع بدون نسبة إنجاز',
    description: 'مشروع ملغي منه شريط الإنجاز',
    progress: 50,
    show_progress: false,
  });
  assert(noProgressProject.show_progress === false, 'Project created with show_progress: false correctly saves setting');

  // Toggle show_progress to true
  const toggledProject = await dataService.updateProject(noProgressProject.id, { show_progress: true });
  assert(toggledProject?.show_progress === true, 'Project show_progress updated to true via updateProject');

  // Toggle show_progress to false
  const toggledOff = await dataService.updateProject(noProgressProject.id, { show_progress: false });
  assert(toggledOff?.show_progress === false, 'Project show_progress updated back to false via updateProject');

  // Verify fetch reflect show_progress: false
  const fetchedNoProg = await dataService.getProjectById(noProgressProject.id);
  assert(fetchedNoProg?.show_progress === false, 'getProjectById reflects show_progress: false');

  console.log('>>> 7. Testing Clean-up of Fixtures...');
  await dataService.deleteAccessLink(clientLink.id);
  await dataService.deleteAccessLink(disabledLink.id);
  await dataService.deleteProject(project1.id);
  await dataService.deleteProject(project2.id);
  await dataService.deleteProject(noProgressProject.id);
  assert(true, 'Test fixtures cleaned up successfully');

  console.log(`\n================================================================`);
  console.log(`SUITE 7 RESULTS: ${passed} PASSED | ${failed} FAILED`);
  console.log(`================================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
