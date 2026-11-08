/**
 * Test Suite 19: Per-link access controls — data, API and delivery
 * - Expiry closes login, existing sessions and every client API
 * - View-only links refuse downloads and non-previewable files on the server
 * - A recipient never receives another link's comments or approvals
 * - New upload types are accepted
 *
 * Run via: npx tsx --conditions=react-server scripts/tests/19-link-controls.test.ts
 * (UI rendering is covered by 19-link-controls-render.test.tsx)
 */

process.env.DATA_MODE = 'demo';

import { dataService } from '../../lib/data/service';
import {
  normalizeLinkControlsInput,
  isLinkExpired,
  isLinkActive,
  linkAllowsDownload,
  getAssetPreviewKind,
} from '../../lib/link-controls';
import { ALLOWED_UPLOAD_EXTENSIONS, UPLOAD_ACCEPT_ATTRIBUTE } from '../../lib/upload/file-types';
import { prepareAssetsForLink } from '../../app/p/[slug]/link-context';
import { POST as createLinkHandler } from '../../app/api/admin/links/route';
import { PATCH as updateLinkHandler } from '../../app/api/admin/links/[id]/route';
import { POST as commentHandler } from '../../app/api/client/comments/route';
import { POST as clientAuthHandler } from '../../app/api/client/auth/route';
import { GET as mediaHandler } from '../../app/api/media/[assetId]/route';
import { createAdminSessionToken, createSignedToken, ClientSessionData } from '../../lib/auth/session';
import type { AccessLink, Asset } from '../../lib/supabase/database.types';

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

function throwsValidation(fn: () => unknown): boolean {
  try {
    fn();
    return false;
  } catch (e: any) {
    return String(e?.message).startsWith('VALIDATION');
  }
}

const ORIGIN_HEADERS = { origin: 'http://localhost:3000', host: 'localhost:3000' };
const HOUR = 3600000;
const future = () => new Date(Date.now() + 24 * HOUR).toISOString();
const past = () => new Date(Date.now() - HOUR).toISOString();

function adminRequest(url: string, method: string, body: unknown): Request {
  return new Request(url, {
    method,
    headers: {
      ...ORIGIN_HEADERS,
      'content-type': 'application/json',
      cookie: `admin_session=${encodeURIComponent(createAdminSessionToken())}`,
    },
    body: JSON.stringify(body),
  });
}

function clientCookie(link: AccessLink): string {
  const session: ClientSessionData = {
    linkId: link.id,
    slug: link.slug,
    viewerName: link.viewer_name,
    sessionVersion: link.session_version ?? 1,
    expiresAt: Date.now() + HOUR,
  };
  return `client_session_${link.slug}=${encodeURIComponent(createSignedToken(session))}`;
}

function mediaRequest(link: AccessLink, assetId: string, query: string = ''): [Request, { params: Promise<{ assetId: string }> }] {
  const req = new Request(`http://localhost:3000/api/media/${assetId}?slug=${link.slug}${query}`, {
    headers: { cookie: clientCookie(link) },
  });
  return [req, { params: Promise.resolve({ assetId }) }];
}

async function freshLink(name: string, projectIds: string[]): Promise<AccessLink> {
  return dataService.createAccessLink(name, '', projectIds);
}

async function setExpired(link: AccessLink) {
  // Written at the data layer on purpose: the admin API refuses past dates
  await dataService.updateAccessLink(link.id, { controls: { expiresAt: past() } });
}

async function runTests() {
  console.log('================================================================');
  console.log('SUITE 19: PER-LINK ACCESS CONTROLS');
  console.log('================================================================\n');

  console.log('>>> 1. Input validation');
  assert(throwsValidation(() => normalizeLinkControlsInput({ expiresAt: 'not-a-date' })), 'Invalid date is rejected');
  assert(throwsValidation(() => normalizeLinkControlsInput({ expiresAt: 12345 })), 'Non-string date is rejected');
  assert(throwsValidation(() => normalizeLinkControlsInput({ expiresAt: past() })), 'Past date is rejected');
  assert(throwsValidation(() => normalizeLinkControlsInput({ allowDownload: 'no' })), 'Non-boolean allowDownload is rejected');
  assert(normalizeLinkControlsInput({ expiresAt: null }).expiresAt === null, 'null clears the expiry');
  assert(Object.keys(normalizeLinkControlsInput({})).length === 0, 'Omitted fields mean "no change"');

  console.log('\n>>> 2. Link state rules');
  assert(!isLinkExpired({ expires_at: null }), 'No date never expires');
  assert(!isLinkExpired({ expires_at: future() }), 'Future date is not expired');
  assert(isLinkExpired({ expires_at: past() }), 'Past date is expired');
  assert(!isLinkActive({ enabled: true, expires_at: past() }), 'Enabled but expired link is not active');
  assert(!isLinkActive({ enabled: false, expires_at: future() }), 'Disabled link is not active');
  assert(linkAllowsDownload({}), 'Links from before the migration keep downloads');
  assert(!linkAllowsDownload({ allow_download: false }), 'allow_download=false blocks downloads');

  console.log('\n>>> 3. Preview kinds');
  assert(getAssetPreviewKind({ file_type: 'file', mime_type: 'audio/mpeg' }) === 'audio', 'Audio by MIME type');
  assert(getAssetPreviewKind({ file_type: 'file', original_filename: 'voice.MP3' }) === 'audio', 'Audio by extension');
  assert(getAssetPreviewKind({ file_type: 'file', title: 'cv.pdf' }) === 'pdf', 'PDF by extension');
  assert(getAssetPreviewKind({ file_type: 'file', title: 'source.zip' }) === null, 'Archives cannot be previewed');
  assert(getAssetPreviewKind({ file_type: 'file', title: 'report.docx' }) === null, 'Word files cannot be previewed');

  console.log('\n>>> 4. Upload types');
  for (const ext of ['docx', 'xlsx', 'pptx', 'mp3', 'wav', 'pdf', 'zip']) {
    assert(ALLOWED_UPLOAD_EXTENSIONS.has(ext) && UPLOAD_ACCEPT_ATTRIBUTE.includes(`.${ext}`), `.${ext} is accepted`);
  }
  for (const ext of ['exe', 'html', 'svg', 'js']) {
    assert(!ALLOWED_UPLOAD_EXTENSIONS.has(ext), `.${ext} is refused`);
  }

  const project = await dataService.createProject({
    title: 'مشروع ضوابط الروابط',
    description: '',
    cover_url: null,
    category: null,
    progress: 0,
    is_visible: true,
    is_archived: false,
  } as any);
  const addAsset = (title: string, file_type: 'video' | 'image' | 'file', mime_type: string) =>
    dataService.createAsset({
      project_id: project.id,
      title,
      file_url: `https://example.com/${encodeURIComponent(title)}`,
      thumbnail_url: null,
      file_type,
      mime_type,
      file_size: 100,
      duration_seconds: null,
      version: 'V1',
      is_visible: true,
      original_filename: title,
      storage_path: null,
    } as any);
  const video = await addAsset('clip.mp4', 'video', 'video/mp4');
  const pdf = await addAsset('cv.pdf', 'file', 'application/pdf');
  const zip = await addAsset('source.zip', 'file', 'application/zip');

  console.log('\n>>> 5. Admin API');
  const created = await createLinkHandler(
    adminRequest('http://localhost:3000/api/admin/links', 'POST', {
      viewerName: 'عميل الضوابط',
      password: '',
      projectIds: [project.id],
      expiresAt: future(),
      allowDownload: false,
    })
  );
  const createdBody = await created.json();
  assert(created.status === 200 && createdBody.link.allow_download === false && Boolean(createdBody.link.expires_at), 'POST stores expiry and download setting');

  const bad = await createLinkHandler(
    adminRequest('http://localhost:3000/api/admin/links', 'POST', { viewerName: 'س', expiresAt: past() })
  );
  assert(bad.status === 400, 'POST with a past date returns 400', String(bad.status));

  const linkId: string = createdBody.link.id;
  const patchRes = await updateLinkHandler(
    adminRequest(`http://localhost:3000/api/admin/links/${linkId}`, 'PATCH', { expiresAt: null, allowDownload: true }),
    { params: Promise.resolve({ id: linkId }) }
  );
  const saved = (await dataService.getAllAccessLinks()).find((l) => l.id === linkId);
  assert(patchRes.status === 200 && saved?.expires_at === null && saved?.allow_download === true, 'PATCH clears the expiry and restores downloads');

  const enabledOnly = await updateLinkHandler(
    adminRequest(`http://localhost:3000/api/admin/links/${linkId}`, 'PATCH', { enabled: true }),
    { params: Promise.resolve({ id: linkId }) }
  );
  assert(enabledOnly.status === 200, 'PATCH without controls keeps working');

  const legacy = await freshLink('رابط افتراضي', [project.id]);
  assert(legacy.expires_at === null && legacy.allow_download === true, 'New links default to no expiry, downloads allowed');

  console.log('\n>>> 6. Expiry enforcement');
  const expiring = await freshLink('رابط منتهي', [project.id]);
  const before = await mediaHandler(...mediaRequest(expiring, video.id));
  assert(before.status === 307, 'Active link can reach the file', String(before.status));

  await setExpired(expiring);
  const expired = (await dataService.getAccessLinkBySlug(expiring.slug))!;
  assert(isLinkExpired(expired), 'Expired date is returned to client pages');

  const mediaAfter = await mediaHandler(...mediaRequest(expiring, video.id));
  assert(mediaAfter.status === 403, 'Existing session cannot fetch files after expiry', String(mediaAfter.status));

  const thumbAfter = await mediaHandler(...mediaRequest(expiring, video.id, '&type=thumbnail'));
  assert(thumbAfter.status === 403, 'Existing session cannot fetch thumbnails after expiry', String(thumbAfter.status));

  const commentAfter = await commentHandler(
    new Request('http://localhost:3000/api/client/comments', {
      method: 'POST',
      headers: { ...ORIGIN_HEADERS, 'content-type': 'application/json', cookie: clientCookie(expiring) },
      body: JSON.stringify({ assetId: video.id, slug: expiring.slug, body: 'بعد الانتهاء' }),
    })
  );
  assert(commentAfter.status === 403, 'Existing session cannot comment after expiry', String(commentAfter.status));

  const loginAfter = await clientAuthHandler(
    new Request('http://localhost:3000/api/client/auth', {
      method: 'POST',
      headers: { ...ORIGIN_HEADERS, 'content-type': 'application/json' },
      body: JSON.stringify({ slug: expiring.slug, password: '' }),
    })
  );
  assert(loginAfter.status === 401, 'Public link refuses a new session after expiry', String(loginAfter.status));

  await dataService.updateAccessLink(expiring.id, { controls: { expiresAt: future() } });
  const reopened = await mediaHandler(...mediaRequest(expiring, video.id));
  assert(reopened.status === 307, 'Setting a later date reopens the link', String(reopened.status));

  console.log('\n>>> 7. View-only delivery');
  const viewOnly = await dataService.createAccessLink('مشاهدة فقط', '', [project.id], {}, { allowDownload: false });
  const statusOf = async (assetId: string, query: string = '') => (await mediaHandler(...mediaRequest(viewOnly, assetId, query))).status;

  assert((await statusOf(video.id)) === 307, 'Video still plays inline');
  assert((await statusOf(pdf.id)) === 307, 'PDF still opens inline');
  assert((await statusOf(video.id, '&download=1')) === 403, 'Video download is refused');
  assert((await statusOf(pdf.id, '&download=1')) === 403, 'PDF download is refused');
  assert((await statusOf(zip.id)) === 403, 'Non-previewable file cannot be fetched inline');
  assert((await statusOf(zip.id, '&download=1')) === 403, 'Non-previewable file cannot be downloaded');

  const open = await freshLink('تحميل مسموح', [project.id]);
  assert((await mediaHandler(...mediaRequest(open, zip.id, '&download=1'))).status === 307, 'Normal links can still download');

  console.log('\n>>> 8. What reaches the browser');
  const other = await freshLink('عميل آخر', [project.id]);
  await dataService.addComment(video.id, viewOnly.id, viewOnly.viewer_name, 'ملاحظتي');
  await dataService.addComment(video.id, other.id, other.viewer_name, 'ملاحظة سرية');
  await dataService.addComment(video.id, null, 'رابط محذوف', 'ملاحظة يتيمة');
  await dataService.toggleApproval(video.id, other.id, other.viewer_name, true);

  const fullAssets: Asset[] = await dataService.getAssetsForProject(project.id, true, viewOnly.slug);
  const seen = prepareAssetsForLink(fullAssets, (await dataService.getAccessLinkBySlug(viewOnly.slug))!);
  const seenVideo = seen.find((a) => a.id === video.id)!;
  const seenZip = seen.find((a) => a.id === zip.id)!;

  assert(seenVideo.comments?.length === 1 && seenVideo.comments[0].body === 'ملاحظتي', 'Only own comments are sent');
  assert(!JSON.stringify(seen).includes(other.viewer_name), "Another recipient's name is not sent");
  assert(!JSON.stringify(seen).includes('ملاحظة سرية'), "Another recipient's comment is not sent");
  assert((seenVideo.approvals || []).length === 0, "Another recipient's approval is not sent");
  assert(seenZip.playback_url === `/api/media/${zip.id}` && seenZip.file_url === `/api/media/${zip.id}`, 'Non-previewable file has no direct address');
  assert(!JSON.stringify(seen).includes('example.com/source.zip'), 'Storage address of the file is not sent');
  assert(seen.every((a) => !a.storage_path && !a.drive_file_id), 'Storage identifiers are not sent on view-only links');

  const adminView = await dataService.getAssetsForProject(project.id, false);
  assert((adminView.find((a) => a.id === video.id)?.comments || []).length === 3, 'Admin still sees all comments');

  await dataService.deleteAccessLink(linkId);
  for (const l of [legacy, expiring, viewOnly, open, other]) await dataService.deleteAccessLink(l.id);
  await dataService.deleteProject(project.id).catch(() => false);

  console.log('\n================================================================');
  console.log(`SUITE 19 RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');
  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error('Test run error:', err);
  process.exit(1);
});
