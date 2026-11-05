/**
 * Test Suite 18b: Per-link page identity — rendered HTML
 * Neutral / custom / hidden-name pages must not contain the studio name or the viewer name.
 *
 * Run via (no react-server condition, client components render to HTML):
 *   npx tsx scripts/tests/18-link-branding-render.test.tsx
 */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { PasswordGate } from '../../app/p/[slug]/PasswordGate';
import { ClientHomeView } from '../../app/p/[slug]/ClientHomeView';
import { ProjectDetailView } from '../../app/p/[slug]/projects/[projectId]/ProjectDetailView';
import { StudioHeader } from '../../components/shared/StudioHeader';
import { LinkBrandingFields, DEFAULT_LINK_BRANDING } from '../../components/admin/LinkBrandingFields';
import { LinkIdentityQuickEdit } from '../../components/admin/LinkIdentityQuickEdit';
import { resolveLinkBranding, STUDIO_BRAND } from '../../lib/branding';
import type { Project } from '../../lib/supabase/database.types';

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

const noop = () => {};
const mockRouter = { push: noop, replace: noop, refresh: noop, back: noop, forward: noop, prefetch: noop } as any;
const render = (node: React.ReactElement) =>
  renderToStaticMarkup(<AppRouterContext.Provider value={mockRouter}>{node}</AppRouterContext.Provider>);

const STUDIO_MARKERS = [STUDIO_BRAND.name, STUDIO_BRAND.badge, STUDIO_BRAND.tagline, 'استوديو التصميم'];
const hasStudioMarker = (html: string) => STUDIO_MARKERS.some((m) => html.includes(m));

const project: Project = {
  id: 'p1',
  title: 'فيديو الحفل',
  description: '',
  progress: 40,
  created_at: new Date().toISOString(),
} as Project;

const neutral = resolveLinkBranding({ branding_mode: 'neutral', hide_viewer_name: true });
const custom = resolveLinkBranding({ branding_mode: 'custom', brand_name: 'شركة الأفق', hide_viewer_name: true });
const studio = resolveLinkBranding(null);

console.log('================================================================');
console.log('SUITE 18b: PAGE IDENTITY — RENDERED HTML');
console.log('================================================================\n');

console.log('>>> 1. Password gate');
let html = render(<PasswordGate viewerName={null} slug="s" isPublic projectTitle="فيديو الحفل" branding={neutral} />);
assert(!hasStudioMarker(html), 'Neutral gate has no studio name');
assert(html.includes('مرحباً بك') && !html.includes('مصطفى'), 'Hidden-name gate greets generically');

html = render(<PasswordGate viewerName={null} slug="s" isPublic={false} branding={custom} />);
assert(html.includes('شركة الأفق') && !hasStudioMarker(html), 'Custom gate shows the custom name only');

html = render(<PasswordGate viewerName="مصطفى" slug="s" isPublic />);
assert(html.includes('مرحباً مصطفى') && html.includes(STUDIO_BRAND.name), 'Default gate is unchanged (studio + name)');

console.log('\n>>> 2. Header');
html = render(<StudioHeader viewerName={null} branding={neutral} onLogout={noop} />);
assert(!hasStudioMarker(html) && html.includes('ملفات مشتركة'), 'Neutral header: generic label, no studio identity');
html = render(<StudioHeader viewerName={null} branding={custom} />);
assert(html.includes('شركة الأفق') && !hasStudioMarker(html), 'Custom header shows the custom name');
html = render(<StudioHeader viewerName="مصطفى" branding={studio} />);
assert(html.includes(STUDIO_BRAND.badge) && html.includes('مصطفى'), 'Studio header unchanged');

console.log('\n>>> 3. Client pages');
html = render(<ClientHomeView viewerName={null} slug="s" projects={[project]} branding={neutral} />);
assert(!hasStudioMarker(html), 'Neutral projects page has no studio name (header, copy, footer)');
assert(!html.includes('<footer'), 'Neutral projects page has no footer');

html = render(<ClientHomeView viewerName={null} slug="s" projects={[project]} branding={custom} />);
assert(html.includes('شركة الأفق • جميع الحقوق محفوظة') && !hasStudioMarker(html), 'Custom projects page footer uses the custom name');

html = render(
  <ProjectDetailView viewerName={null} linkId="l1" slug="s" project={project} initialAssets={[]} branding={neutral} />
);
assert(!hasStudioMarker(html) && html.includes('فيديو الحفل'), 'Neutral project page shows the project, not the studio');

html = render(<ProjectDetailView viewerName="مصطفى" linkId="l1" slug="s" project={project} initialAssets={[]} />);
assert(html.includes('استوديو التصميم التلفزيوني والإعلامي') && html.includes('مصطفى'), 'Default project page is unchanged');

console.log('\n>>> 4. Admin controls');
html = render(
  <LinkBrandingFields idPrefix="t" value={{ brandingMode: 'custom', brandName: 'الأفق', hideViewerName: true }} onChange={noop} />
);
assert(html.includes('id="t-brand-name"') && html.includes('value="الأفق"'), 'Custom mode shows the name field with its value');
assert(/id="t-hide-viewer-name"[^>]*checked/.test(html), 'Hide-name toggle reflects its state');
html = render(<LinkBrandingFields idPrefix="t" value={DEFAULT_LINK_BRANDING} onChange={noop} />);
assert(!html.includes('id="t-brand-name"'), 'Name field is hidden unless custom mode is chosen');

console.log('\n>>> 5. Share-window quick editor');
const baseLink = {
  id: 'l1',
  viewer_name: 'مصطفى',
  slug: 's',
  password_hash: '',
  enabled: true,
  session_version: 1,
  created_at: new Date().toISOString(),
};
html = render(<LinkIdentityQuickEdit link={baseLink} onSaved={noop} />);
assert(html.includes('هوية الاستوديو • الاسم ظاهر') && html.includes('تغيير الهوية'), 'Default link shows its studio identity and a change button');
html = render(
  <LinkIdentityQuickEdit link={{ ...baseLink, branding_mode: 'neutral', hide_viewer_name: true }} onSaved={noop} />
);
assert(html.includes('هوية محايدة') && html.includes('الاسم مخفي'), 'Neutral + hidden link shows both tags');

console.log('\n================================================================');
console.log(`SUITE 18b RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log('================================================================\n');
if (failed > 0) process.exit(1);
