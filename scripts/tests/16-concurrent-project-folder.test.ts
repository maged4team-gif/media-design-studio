process.env.DATA_MODE = 'demo';
process.env.ADMIN_PASSWORD = 'test-admin-secret-password-123';
process.env.GOOGLE_DRIVE_REFRESH_TOKEN = 'mock-refresh-token';
process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID = 'mock-root-archive-folder-id';
process.env.GOOGLE_CLIENT_ID = 'mock-client-id';
process.env.GOOGLE_CLIENT_SECRET = 'mock-client-secret';

import { dataService } from '../../lib/data/service';
import { POST as initHandler } from '../../app/api/admin/drive/upload/init/route';
import { POST as registerHandler } from '../../app/api/admin/drive/upload/register/route';
import { createSignedToken } from '../../lib/auth/session';

let passed = 0;
let failed = 0;

function assert(condition: any, message: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(`  ✗ FAIL: ${message}`);
  }
}

async function runConcurrencyTests() {
  console.log('================================================================');
  console.log('SUITE 16: CONCURRENT PROJECT FOLDER RACE CONDITION & RECOVERY');
  console.log('================================================================\n');

  // Prepare authenticated admin session
  const adminToken = createSignedToken({
    isAdmin: true,
    expiresAt: Date.now() + 1000 * 60 * 60, // 1 hour
  });

  // -------------------------------------------------------------
  // 1. Testing Atomic Compare-And-Set: claimProjectDriveFolder
  // -------------------------------------------------------------
  console.log('>>> 1. Testing Atomic Compare-And-Set (claimProjectDriveFolder)...');
  const proj = await dataService.createProject({
    title: 'مشروع اختبار التزامن 2026',
    status: 'new',
  });

  assert(proj && proj.id, 'Created new test project');
  assert(!proj.drive_folder_id, 'Project initially has null/empty drive_folder_id');

  // Simulate two concurrent claim requests with different candidate folder IDs
  const candidateFolderA = 'mock-folder-candidate-A';
  const candidateFolderB = 'mock-folder-candidate-B';

  const [claimA, claimB] = await Promise.all([
    dataService.claimProjectDriveFolder(proj.id, candidateFolderA),
    dataService.claimProjectDriveFolder(proj.id, candidateFolderB),
  ]);

  // Exactly one must win, and both must agree on the winning folder ID!
  const aClaimed = claimA.claimed;
  const bClaimed = claimB.claimed;

  assert(
    (aClaimed && !bClaimed) || (!aClaimed && bClaimed),
    `Exactly one request claimed the folder (ClaimA: ${aClaimed}, ClaimB: ${bClaimed})`
  );

  const winningFolder = aClaimed ? candidateFolderA : candidateFolderB;
  assert(claimA.folderId === winningFolder, `ClaimA points to official folder ${winningFolder}`);
  assert(claimB.folderId === winningFolder, `ClaimB points to official folder ${winningFolder}`);

  const freshProj = await dataService.getProjectById(proj.id);
  assert(freshProj?.drive_folder_id === winningFolder, `Database project record has official folder ${winningFolder}`);

  // -------------------------------------------------------------
  // 2. Testing Concurrent /upload/init Route Invocations
  // -------------------------------------------------------------
  console.log('\n>>> 2. Testing Concurrent /upload/init Route Calls...');
  const proj2 = await dataService.createProject({
    title: 'مشروع اختبار الرفع المتزامن',
    status: 'new',
  });

  assert(proj2 && !proj2.drive_folder_id, 'Project 2 created with null drive_folder_id');

  // Mock fetch for Google Drive API to simulate folder search and creation
  const originalFetch = global.fetch;
  let createdFolderCount = 0;
  const createdFolderIds: string[] = [];

  global.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;

    // OAuth token refresh
    if (url.includes('oauth2.googleapis.com/token')) {
      return new Response(JSON.stringify({
        access_token: 'mock-valid-access-token',
        expires_in: 3600,
        token_type: 'Bearer',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // Google Drive search
    if (url.includes('/drive/v3/files?q=') && !url.includes('uploadType=resumable')) {
      return new Response(JSON.stringify({ files: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // Google Drive folder create
    if (url.includes('/drive/v3/files') && init?.method === 'POST' && !url.includes('uploadType=resumable')) {
      createdFolderCount++;
      const id = `mock-folder-id-${createdFolderCount}`;
      createdFolderIds.push(id);
      return new Response(JSON.stringify({ id, name: 'Project Folder' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Google Drive resumable upload init
    if (url.includes('/upload/drive/v3/files?uploadType=resumable')) {
      return new Response('', {
        status: 200,
        headers: {
          location: 'https://www.googleapis.com/upload/drive/v3/files?upload_id=mock-upload-session-123',
        },
      });
    }

    return originalFetch(input, init);
  };

  try {
    // Fire 2 concurrent /upload/init requests simultaneously (simulating MAX_CONCURRENT_UPLOADS = 2)
    const req1 = new Request('http://localhost:3000/api/admin/drive/upload/init', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `admin_session=${adminToken}`,
        Host: 'localhost:3000',
        Origin: 'http://localhost:3000',
      },
      body: JSON.stringify({
        filename: 'Video_Final.mp4',
        mimeType: 'video/mp4',
        fileSize: 50 * 1024 * 1024,
        projectId: proj2.id,
      }),
    });

    const req2 = new Request('http://localhost:3000/api/admin/drive/upload/init', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `admin_session=${adminToken}`,
        Host: 'localhost:3000',
        Origin: 'http://localhost:3000',
      },
      body: JSON.stringify({
        filename: 'Image_01.png',
        mimeType: 'image/png',
        fileSize: 5 * 1024 * 1024,
        projectId: proj2.id,
      }),
    });

    const [res1, res2] = await Promise.all([initHandler(req1), initHandler(req2)]);
    const data1 = await res1.json();
    const data2 = await res2.json();
    if (res1.status !== 200) console.log('res1 error:', res1.status, data1);
    if (res2.status !== 200) console.log('res2 error:', res2.status, data2);

    assert(res1.status === 200, 'Init request 1 succeeded with HTTP 200');
    assert(res2.status === 200, 'Init request 2 succeeded with HTTP 200');

    assert(Boolean(data1.uploadToken), 'Request 1 returned uploadToken');
    assert(Boolean(data2.uploadToken), 'Request 2 returned uploadToken');

    assert(
      data1.projectFolderId === data2.projectFolderId,
      `Both concurrent upload requests received the EXACT SAME projectFolderId: ${data1.projectFolderId}`
    );

    const updatedProj2 = await dataService.getProjectById(proj2.id);
    assert(
      updatedProj2?.drive_folder_id === data1.projectFolderId,
      `Database project.drive_folder_id matches returned folderId (${updatedProj2?.drive_folder_id})`
    );
  } finally {
    global.fetch = originalFetch;
  }

  // -------------------------------------------------------------
  // 3. Testing Safe Server-Side Recovery in /upload/register
  // -------------------------------------------------------------
  console.log('\n>>> 3. Testing Server-Side Parent Recovery in /upload/register...');
  const recoveryProj = await dataService.createProject({
    title: 'مشروع اختبار الاسترداد',
    status: 'new',
  });
  const officialFolderId = 'official-project-folder-xyz';
  await dataService.updateProject(recoveryProj.id, { drive_folder_id: officialFolderId });

  // Simulate file uploaded to orphan project folder 'orphan-folder-abc'
  const orphanFolderId = 'orphan-folder-abc';
  const stuckFileId = 'stuck-file-12345';
  let fileCurrentParents = [orphanFolderId];
  let moveCalledWith: any = null;

  global.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;

    if (url.includes('oauth2.googleapis.com/token')) {
      return new Response(JSON.stringify({
        access_token: 'mock-valid-access-token',
        expires_in: 3600,
        token_type: 'Bearer',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // Move file PATCH request (check BEFORE generic file GET)
    if (init?.method === 'PATCH' || (url.includes('addParents=') && url.includes('removeParents='))) {
      moveCalledWith = { fileId: stuckFileId, officialFolderId, orphanFolderId };
      fileCurrentParents = [officialFolderId]; // Move succeeded!
      return new Response(
        JSON.stringify({
          id: stuckFileId,
          parents: [officialFolderId],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // File metadata query for the stuck file
    if (url.includes(`/drive/v3/files/${stuckFileId}`)) {
      return new Response(
        JSON.stringify({
          id: stuckFileId,
          name: 'Video_Promo.mp4',
          mimeType: 'video/mp4',
          size: 14200000,
          parents: fileCurrentParents,
          trashed: false,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Parent folder metadata check
    if (url.includes(`/drive/v3/files/${orphanFolderId}`)) {
      return new Response(
        JSON.stringify({
          id: orphanFolderId,
          name: `مشروع اختبار الاسترداد [${recoveryProj.id}]`,
          mimeType: 'application/vnd.google-apps.folder',
          parents: ['root-archive-id'],
          trashed: false,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Check if orphan folder is empty
    if (url.includes('/drive/v3/files?q=') && url.includes(orphanFolderId)) {
      return new Response(JSON.stringify({ files: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // Delete empty orphan folder
    if (url.includes(`/drive/v3/files/${orphanFolderId}`) && init?.method === 'DELETE') {
      return new Response('', { status: 204 });
    }

    return originalFetch(input, init);
  };

  try {
    const regReq = new Request('http://localhost:3000/api/admin/drive/upload/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `admin_session=${adminToken}`,
        Host: 'localhost:3000',
        Origin: 'http://localhost:3000',
      },
      body: JSON.stringify({
        fileId: stuckFileId,
        projectId: recoveryProj.id,
        title: 'Video_Promo',
      }),
    });

    const regRes = await registerHandler(regReq);
    assert(regRes.status === 200, 'Register endpoint returned HTTP 200 on recovery');

    const regData = await regRes.json();
    assert(regData.success === true, 'Registration succeeded with success: true');
    assert(regData.asset && regData.asset.id, 'Asset created in database');
    assert(Boolean(moveCalledWith), 'Server-side recovery invoked Google Drive move API');
    assert(moveCalledWith.fileId === stuckFileId, 'Moved the correct stuck file ID');
    assert(moveCalledWith.officialFolderId === officialFolderId, 'Moved file to official project folder');
    assert(moveCalledWith.orphanFolderId === orphanFolderId, 'Removed file from orphan folder');

    // Wait for orphan folder background cleanup to settle
    await new Promise((r) => setTimeout(r, 100));

    // -------------------------------------------------------------
    // 4. Testing Strict Rejection of Unrelated External File
    // -------------------------------------------------------------
    console.log('\n>>> 4. Testing Strict Security Guard Against Unrelated Files...');
    const maliciousFileId = 'malicious-file-999';

    // Override fetch to return an unrelated folder not associated with this project
    global.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
      if (url.includes('oauth2.googleapis.com/token')) {
        return new Response(JSON.stringify({
          access_token: 'mock-valid-access-token',
          expires_in: 3600,
          token_type: 'Bearer',
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.includes(`/drive/v3/files/${maliciousFileId}`)) {
        return new Response(
          JSON.stringify({
            id: maliciousFileId,
            name: 'unrelated.png',
            mimeType: 'image/png',
            size: 1000,
            parents: ['random-external-folder'],
            trashed: false,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url.includes('random-external-folder')) {
        return new Response(
          JSON.stringify({
            id: 'random-external-folder',
            name: 'Random Unrelated Folder',
            parents: ['stranger-root'],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return originalFetch(input, init);
    };

    const badReq = new Request('http://localhost:3000/api/admin/drive/upload/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `admin_session=${adminToken}`,
        Host: 'localhost:3000',
        Origin: 'http://localhost:3000',
      },
      body: JSON.stringify({
        fileId: maliciousFileId,
        projectId: recoveryProj.id,
        title: 'Unrelated',
      }),
    });

    const badRes = await registerHandler(badReq);
    assert(badRes.status === 400, 'Rejects unrelated external file with HTTP 400');
    const badData = await badRes.json();
    assert(
      badData.error?.includes('لا يتطابق مع مجلد المشروع'),
      'Returns strict parent mismatch error message when file does not belong to project'
    );
  } finally {
    await new Promise((r) => setTimeout(r, 60));
    global.fetch = originalFetch;
  }

  console.log('\n================================================================');
  console.log(`SUITE 16 RESULTS: ${passed} passed | ${failed} failed`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runConcurrencyTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
