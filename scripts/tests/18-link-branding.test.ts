/**
 * Test Suite 18: Per-link page identity (white-label sharing) — data, API and metadata
 * - Validation of branding input
 * - Branding persisted on create/update and returned to client pages + admin list
 * - Neutral/custom metadata never carries the studio name
 * - Hidden viewer name never reaches the browser (assets + comment/approval responses)
 *
 * Run via: npx tsx --conditions=react-server scripts/tests/18-link-branding.test.ts
 * (UI rendering is covered by 18-link-branding-render.test.tsx)
 */

process.env.DATA_MODE = 'demo';

import { dataService } from '../../lib/data/service';
import {
  normalizeBrandingInput,
  resolveLinkBranding,
  buildClientPageTitle,
  buildClientFooterText,
  visibleViewerName,
  HIDDEN_VIEWER_LABEL,
  STUDIO_BRAND,
} from '../../lib/branding';
import { buildClientMetadata, maskViewerNameInAssets } from '../../app/p/[slug]/link-context';
import { POST as createLinkHandler } from '../../app/api/admin/links/route';
import { PATCH as updateLinkHandler } from '../../app/api/admin/links/[id]/route';
import { POST as commentHandler } from '../../app/api/client/comments/route';
import { POST as approvalHandler } from '../../app/api/client/approvals/route';
import { createAdminSessionToken, createSignedToken, ClientSessionData } from '../../lib/auth/session';

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

function throwsWith(fn: () => unknown, prefix: string): boolean {
  try {
    fn();
    return false;
  } catch (e: any) {
    return String(e?.message).startsWith(prefix);
  }
}

const ORIGIN_HEADERS = { origin: 'http://localhost:3000', host: 'localhost:3000' };

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

function clientRequest(url: string, link: { id: string; slug: string; viewer_name: string; session_version: number }, body: unknown): Request {
  const session: ClientSessionData = {
    linkId: link.id,
    slug: link.slug,
    viewerName: link.viewer_name,
    sessionVersion: link.session_version,
    expiresAt: Date.now() + 3600000,
  };
  return new Request(url, {
    method: 'POST',
    headers: {
      ...ORIGIN_HEADERS,
      'content-type': 'application/json',
      cookie: `client_session_${link.slug}=${encodeURIComponent(createSignedToken(session))}`,
    },
    body: JSON.stringify(body),
  });
}

async function runTests() {
  console.log('================================================================');
  console.log('SUITE 18: PER-LINK PAGE IDENTITY (WHITE-LABEL SHARING)');
  console.log('================================================================\n');

  console.log('>>> 1. Input validation');
  assert(throwsWith(() => normalizeBrandingInput({ brandingMode: 'evil' }), 'VALIDATION'), 'Unknown branding mode is rejected');
  assert(throwsWith(() => normalizeBrandingInput({ brandingMode: 'custom', brandName: '   ' }), 'VALIDATION'), 'Custom mode without a name is rejected');
  assert(throwsWith(() => normalizeBrandingInput({ brandName: 'x'.repeat(81) }), 'VALIDATION'), 'Brand name over 80 chars is rejected');
  assert(throwsWith(() => normalizeBrandingInput({ hideViewerName: 'yes' }), 'VALIDATION'), 'Non-boolean hideViewerName is rejected');
  const normalized = normalizeBrandingInput({ brandingMode: 'custom', brandName: '  شركة   الأفق ', hideViewerName: true });
  assert(normalized.brandName === 'شركة الأفق', 'Brand name is trimmed and whitespace-collapsed', normalized.brandName ?? '');
  assert(Object.keys(normalizeBrandingInput({})).length === 0, 'Omitted fields mean "no change"');

  console.log('\n>>> 2. Resolving the identity');
  assert(resolveLinkBranding(null).mode === 'studio', 'Legacy link (no fields) keeps the studio identity');
  assert(resolveLinkBranding({ branding_mode: 'neutral' }).brandName === null, 'Neutral identity has no name');
  assert(resolveLinkBranding({ branding_mode: 'custom', brand_name: 'الأفق' }).brandName === 'الأفق', 'Custom identity uses its own name');
  assert(resolveLinkBranding({ branding_mode: 'custom', brand_name: '' }).mode === 'neutral', 'Custom without a name degrades to neutral, never to studio');

  const neutral = resolveLinkBranding({ branding_mode: 'neutral' });
  const custom = resolveLinkBranding({ branding_mode: 'custom', brand_name: 'الأفق' });
  assert(buildClientPageTitle(neutral, 'فيديو الحفل') === 'فيديو الحفل', 'Neutral tab title is the project title only');
  assert(buildClientPageTitle(custom, 'فيديو الحفل') === 'فيديو الحفل | الأفق', 'Custom tab title uses the custom name');
  assert(buildClientFooterText(neutral, 'x') === null, 'Neutral pages have no footer');
  assert(visibleViewerName({ viewer_name: 'مصطفى', hide_viewer_name: true }) === null, 'Hidden viewer name resolves to null');

  console.log('\n>>> 3. Persisting identity on create / update (demo store)');
  const project = await dataService.createProject({ title: 'فيديو الحفل', description: '', progress: 50 });
  const link = await dataService.createAccessLink('مصطفى', '', [project.id], {
    brandingMode: 'neutral',
    hideViewerName: true,
  });
  assert(link.branding_mode === 'neutral' && link.hide_viewer_name === true, 'createAccessLink returns the identity');

  const bySlug = await dataService.getAccessLinkBySlug(link.slug);
  assert(bySlug?.branding_mode === 'neutral', 'getAccessLinkBySlug returns branding_mode');
  assert(bySlug?.hide_viewer_name === true, 'getAccessLinkBySlug returns hide_viewer_name');

  await dataService.updateAccessLink(link.id, { branding: { brandingMode: 'custom', brandName: 'الأفق' } });
  const adminView = (await dataService.getAllAccessLinks()).find((l) => l.id === link.id);
  assert(adminView?.branding_mode === 'custom' && adminView.brand_name === 'الأفق', 'updateAccessLink changes the identity');
  assert(adminView?.hide_viewer_name === true, 'Fields not sent in an update are left unchanged');
  assert(adminView?.viewer_name === 'مصطفى', 'Admin still sees the real viewer name');

  const legacy = await dataService.createAccessLink('عميل قديم', '', [project.id]);
  const legacyBySlug = await dataService.getAccessLinkBySlug(legacy.slug);
  assert(legacyBySlug?.branding_mode === 'studio' && legacyBySlug.hide_viewer_name === false, 'Links created without identity default to studio + visible name');

  console.log('\n>>> 4. Admin API');
  let res = await createLinkHandler(
    adminRequest('http://localhost:3000/api/admin/links', 'POST', { viewerName: 'س', password: '', projectIds: [], brandingMode: 'bogus' })
  );
  assert(res.status === 400, 'POST with an invalid mode returns 400', `status ${res.status}`);

  res = await createLinkHandler(
    adminRequest('http://localhost:3000/api/admin/links', 'POST', {
      viewerName: 'عميل API',
      password: '',
      projectIds: [project.id],
      brandingMode: 'custom',
      brandName: 'استوديو آخر',
      hideViewerName: true,
    })
  );
  const created = (await res.json()).link;
  assert(res.status === 200 && created?.brand_name === 'استوديو آخر', 'POST stores a custom identity', `status ${res.status}`);

  res = await updateLinkHandler(
    adminRequest(`http://localhost:3000/api/admin/links/${created.id}`, 'PATCH', { brandingMode: 'custom', brandName: '' }),
    { params: Promise.resolve({ id: created.id }) }
  );
  assert(res.status === 400, 'PATCH custom mode with an empty name returns 400', `status ${res.status}`);

  res = await updateLinkHandler(
    adminRequest(`http://localhost:3000/api/admin/links/${created.id}`, 'PATCH', { brandingMode: 'neutral', brandName: null, hideViewerName: false }),
    { params: Promise.resolve({ id: created.id }) }
  );
  const afterPatch = await dataService.getAccessLinkBySlug(created.slug);
  assert(res.status === 200 && afterPatch?.branding_mode === 'neutral' && afterPatch.hide_viewer_name === false, 'PATCH switches to neutral and shows the name again');

  const unauth = await createLinkHandler(
    new Request('http://localhost:3000/api/admin/links', {
      method: 'POST',
      headers: { ...ORIGIN_HEADERS, 'content-type': 'application/json' },
      body: JSON.stringify({ viewerName: 'x', brandingMode: 'neutral' }),
    })
  );
  assert(unauth.status === 401, 'Identity cannot be set without an admin session');

  console.log('\n>>> 5. Metadata (tab title / link preview)');
  const neutralLink = (await dataService.getAccessLinkBySlug(created.slug))!;
  const neutralMeta = buildClientMetadata(neutralLink, 'فيديو الحفل');
  const metaText = JSON.stringify(neutralMeta);
  assert(!metaText.includes(STUDIO_BRAND.name) && !metaText.includes('Media Design Studio'), 'Neutral metadata has no studio name', metaText);
  assert(neutralMeta.title === 'فيديو الحفل', 'Neutral metadata title is the project title');
  assert((neutralMeta.robots as any)?.index === false, 'Client pages are not indexed by search engines');
  const studioMeta = buildClientMetadata(legacyBySlug!, 'فيديو الحفل');
  assert(String(studioMeta.title).includes(STUDIO_BRAND.name), 'Studio links keep the studio name in the title');

  console.log('\n>>> 6. Hidden viewer name never reaches the browser');
  const hiddenLink = (await dataService.getAccessLinkBySlug(link.slug))!; // custom "الأفق" + hidden name
  const asset = await dataService.createAsset({
    project_id: project.id,
    title: 'Video 2',
    file_type: 'video',
    file_url: 'https://example.com/v2.mp4',
    is_visible: true,
  } as any);

  res = await commentHandler(
    clientRequest('http://localhost:3000/api/client/comments', hiddenLink, { assetId: asset.id, slug: hiddenLink.slug, body: 'ملاحظة' })
  );
  const commentBody = await res.json();
  assert(res.status === 200, 'Comment accepted for a hidden-name link', `status ${res.status} ${JSON.stringify(commentBody)}`);
  assert(commentBody.comment?.author_name === HIDDEN_VIEWER_LABEL, 'Comment response shows the neutral label');
  assert(!JSON.stringify(commentBody).includes('مصطفى'), 'Comment response does not contain the real name');

  res = await approvalHandler(
    clientRequest('http://localhost:3000/api/client/approvals', hiddenLink, { assetId: asset.id, slug: hiddenLink.slug, approved: true })
  );
  const approvalBody = await res.json();
  assert(res.status === 200 && !JSON.stringify(approvalBody).includes('مصطفى'), 'Approval response does not contain the real name', `status ${res.status}`);

  const assets = await dataService.getAssetsForProject(project.id, true, hiddenLink.slug);
  const storedComment = assets.find((a) => a.id === asset.id)?.comments?.find((c) => c.body === 'ملاحظة');
  assert(storedComment?.author_name === 'مصطفى', 'Stored comment keeps the real name for the admin');

  const masked = maskViewerNameInAssets(assets, hiddenLink);
  assert(!JSON.stringify(masked).includes('مصطفى'), 'Assets sent to the hidden-name page carry no real name');
  const unmasked = maskViewerNameInAssets(assets, { ...hiddenLink, hide_viewer_name: false });
  assert(JSON.stringify(unmasked).includes('مصطفى'), 'Visible-name links are left untouched');

  for (const id of [link.id, legacy.id, created.id]) await dataService.deleteAccessLink(id);
  await dataService.deleteProject(project.id).catch(() => false);

  console.log('\n================================================================');
  console.log(`SUITE 18 RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');
  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error('Test run error:', err);
  process.exit(1);
});
