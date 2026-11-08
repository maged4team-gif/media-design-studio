/**
 * Test Suite 19b: Per-link access controls — rendered HTML
 *
 * Run via (no react-server condition, client components render to HTML):
 *   npx tsx scripts/tests/19-link-controls-render.test.tsx
 */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AssetCard } from '../../components/client/AssetCard';
import { MediaLightbox } from '../../components/client/MediaLightbox';
import { LinkControlsFields, LinkControlTags, DEFAULT_LINK_CONTROLS } from '../../components/admin/LinkControlsFields';
import { LinkExpiredNotice } from '../../app/p/[slug]/LinkExpiredNotice';
import { resolveLinkBranding, STUDIO_BRAND } from '../../lib/branding';
import type { Asset } from '../../lib/supabase/database.types';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string) {
  if (condition) {
    console.log(`  [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${testName}`);
    failed++;
  }
}

const noop = () => {};
const asset = (title: string, file_type: Asset['file_type'], mime_type: string): Asset =>
  ({
    id: 'a1',
    project_id: 'p1',
    title,
    file_url: '/api/media/a1',
    playback_url: '/api/media/a1',
    thumbnail_url: null,
    file_type,
    mime_type,
    file_size: 100,
    version: 'V1',
    original_filename: title,
    comments: [],
    approvals: [],
  }) as unknown as Asset;

const card = (a: Asset, allowDownload: boolean) =>
  renderToStaticMarkup(
    <AssetCard asset={a} slug="s" projectId="p1" isApproved={false} onPreview={noop} onCommentClick={noop} onToggleApproval={noop} allowDownload={allowDownload} />
  );
const lightbox = (a: Asset, allowDownload: boolean) =>
  renderToStaticMarkup(
    <MediaLightbox
      asset={a}
      isOpen
      onClose={noop}
      viewerName={null}
      slug="s"
      projectId="p1"
      isApproved={false}
      onToggleApproval={noop}
      onAddComment={async () => {}}
      allowDownload={allowDownload}
    />
  );

console.log('================================================================');
console.log('SUITE 19b: ACCESS CONTROLS — RENDERED HTML');
console.log('================================================================\n');

console.log('>>> 1. Asset card');
const zip = asset('source.zip', 'file', 'application/zip');
assert(card(zip, true).includes('تحميل الملف'), 'Download button shows on normal links');
assert(!card(zip, false).includes('تحميل'), 'No download button on view-only links');

console.log('\n>>> 2. Preview window');
let html = lightbox(zip, false);
assert(html.includes('التحميل غير متاح') && !html.includes('تحميل الملف'), 'Non-previewable file explains why it is unavailable');
html = lightbox(zip, true);
assert(html.includes('تحميل الملف عبر الرابط المحمي'), 'Non-previewable file offers download on normal links');

html = lightbox(asset('cv.pdf', 'file', 'application/pdf'), false);
assert(html.includes('<iframe') && html.includes('#toolbar=0'), 'PDF opens inside the page on view-only links');
html = lightbox(asset('voice.mp3', 'file', 'audio/mpeg'), false);
assert(html.includes('<audio') && html.includes('nodownload') && !html.includes('تحميل الملف'), 'Audio plays inside the page without download');
html = lightbox(asset('clip.mp4', 'video', 'video/mp4'), false);
assert(html.includes('nodownload') && !html.includes('تنزيل الملف المباشر'), 'Video hides the player and fallback download controls');
html = lightbox(asset('clip.mp4', 'video', 'video/mp4'), true);
assert(!html.includes('nodownload') && html.includes('تحميل'), 'Normal links keep video download');

console.log('\n>>> 3. Expired page');
html = renderToStaticMarkup(<LinkExpiredNotice branding={resolveLinkBranding({ branding_mode: 'neutral' })} />);
assert(html.includes('انتهت صلاحية') && !html.includes(STUDIO_BRAND.name), 'Neutral link: no studio name');
html = renderToStaticMarkup(<LinkExpiredNotice branding={resolveLinkBranding({ branding_mode: 'custom', brand_name: 'شركة الأفق' })} />);
assert(html.includes('شركة الأفق') && !html.includes(STUDIO_BRAND.name), 'Custom link: custom name only');
html = renderToStaticMarkup(<LinkExpiredNotice branding={resolveLinkBranding(null)} />);
assert(html.includes(STUDIO_BRAND.name), 'Studio link: studio name');

console.log('\n>>> 4. Admin controls');
html = renderToStaticMarkup(<LinkControlsFields idPrefix="t" value={DEFAULT_LINK_CONTROLS} onChange={noop} />);
assert(!html.includes('id="t-expires-at"'), 'Date field is hidden until expiry is switched on');
assert(/id="t-allow-download"[^>]*checked/.test(html), 'Downloads are allowed by default');
html = renderToStaticMarkup(
  <LinkControlsFields idPrefix="t" value={{ expiresAt: new Date(Date.now() + 86400000).toISOString(), allowDownload: false }} onChange={noop} />
);
assert(html.includes('id="t-expires-at"') && html.includes('لا يمنع تصوير الشاشة'), 'Date field and the honest limit note appear when used');
html = renderToStaticMarkup(
  <LinkControlsFields idPrefix="t" value={{ expiresAt: new Date(Date.now() - 86400000).toISOString(), allowDownload: true }} onChange={noop} />
);
assert(html.includes('هذا الموعد مضى'), 'Past date shows a warning');

html = renderToStaticMarkup(<LinkControlTags link={{}} />);
assert(html === '', 'Default link has no control tags');
html = renderToStaticMarkup(<LinkControlTags link={{ expires_at: new Date().toISOString(), allow_download: false }} />);
assert(html.includes('التحميل ممنوع') && html.includes('له موعد انتهاء'), 'Tags show expiry and blocked downloads');

console.log('\n================================================================');
console.log(`SUITE 19b RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log('================================================================\n');
if (failed > 0) process.exit(1);
