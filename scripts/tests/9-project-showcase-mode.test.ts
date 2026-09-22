/**
 * Test Suite 9: Project Showcase Mode (allow_feedback) Tests
 * Run via: npx tsx --conditions=react-server scripts/tests/9-project-showcase-mode.test.ts
 */

process.env.DATA_MODE = 'demo';

import { dataService } from '../../lib/data/service';

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
  console.log('SUITE 9: PROJECT SHOWCASE MODE (allow_feedback) TESTS');
  console.log('================================================================\n');

  console.log('>>> 1. Creating Showcase Project (allow_feedback = false)...');
  const showcaseProj = await dataService.createProject({
    title: 'مشروع معرض أعمال (للعرض والتحميل فقط)',
    description: 'مشروع لا يسمح بالملاحظات أو الاعتماد ويعرض بحجم كامل',
    category: 'تصميم جرافيك وتلفزيون',
    progress: 100,
    allow_feedback: false,
  });

  assert(showcaseProj !== null && !!showcaseProj.id, 'Showcase project created');
  assert(showcaseProj.allow_feedback === false, 'Showcase project has allow_feedback = false');

  console.log('>>> 2. Verifying getProjectById retains allow_feedback = false...');
  const fetchedShowcase = await dataService.getProjectById(showcaseProj.id);
  assert(fetchedShowcase !== null, 'Fetched showcase project found');
  assert(fetchedShowcase?.allow_feedback === false, 'Fetched showcase project has allow_feedback === false');

  console.log('>>> 3. Creating Default Project (omitted allow_feedback)...');
  const defaultProj = await dataService.createProject({
    title: 'مشروع تفاعلي افتراضي',
    description: 'مشروع تفاعلي يقبل الملاحظات والاعتماد',
    progress: 50,
  });
  assert(defaultProj.allow_feedback !== false, 'Default project has allow_feedback = true (or not false)');

  console.log('>>> 4. Updating Showcase Project to Interactive (allow_feedback = true)...');
  const updatedToInteractive = await dataService.updateProject(showcaseProj.id, {
    allow_feedback: true,
  });
  assert(updatedToInteractive?.allow_feedback === true, 'Showcase project updated to allow_feedback = true');

  console.log('>>> 5. Updating Back to Showcase (allow_feedback = false)...');
  const updatedToShowcase = await dataService.updateProject(showcaseProj.id, {
    allow_feedback: false,
  });
  assert(updatedToShowcase?.allow_feedback === false, 'Project updated back to allow_feedback = false');

  console.log('>>> 6. Verifying Client View Service Layer (getProjectsForClient & getProjectForClient)...');
  const link = await dataService.createAccessLink('عميل تجربة العرض', '', [showcaseProj.id]);
  const clientProjects = await dataService.getProjectsForClient(link.id);
  assert(clientProjects.length > 0, 'Client projects retrieved');
  const clientShowcase = clientProjects.find((p) => p.id === showcaseProj.id);
  assert(clientShowcase !== undefined, 'Client project exists in list');
  assert(clientShowcase?.allow_feedback === false, 'Client project retains allow_feedback === false');

  const singleClientProj = await dataService.getProjectForClient(link.id, showcaseProj.id);
  assert(singleClientProj !== null, 'Single client project retrieved');
  assert(singleClientProj?.allow_feedback === false, 'Single client project retains allow_feedback === false');

  console.log('\n================================================================');
  console.log(`TEST SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal error in tests:', err);
  process.exit(1);
});
