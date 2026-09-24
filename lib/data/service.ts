import 'server-only';
import { getServerSupabase, isServerSupabaseConfigured, isSupabaseHealthy, reportSupabaseFailure, reportSupabaseSuccess } from '@/lib/supabase/server';
import { Project, Asset, AccessLink, Comment, Approval, StudioNotification, ProjectStatus } from '@/lib/supabase/database.types';
import bcrypt from 'bcryptjs';
import { generateSlug } from '@/lib/utils/slug';
import { deleteDriveFileOrFolder } from '@/lib/drive/client';
import fs from 'fs';
import path from 'path';

function getDataDir(): string {
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NODE_ENV === 'production') {
    const tmpDir = path.join('/tmp', '.data');
    try {
      if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
      return tmpDir;
    } catch {
      // ignore
    }
  }
  const localDir = path.join(process.cwd(), '.data');
  try {
    if (!fs.existsSync(localDir)) fs.mkdirSync(localDir, { recursive: true });
  } catch {
    // ignore
  }
  return localDir;
}

function getLocalStoreFile(): string {
  return path.join(getDataDir(), 'store.json');
}

interface LocalStore {
  projects: Project[];
  assets: Asset[];
  access_links: (AccessLink & { project_ids: string[] })[];
  comments: Comment[];
  approvals: Approval[];
}

interface ProjectSettings {
  show_progress?: boolean;
  allow_feedback?: boolean;
  drive_folder_id?: string | null;
  drive_cover_file_id?: string | null;
}

function getProjectSettingsMap(): Record<string, ProjectSettings> {
  try {
    const p = path.join(getDataDir(), 'project-settings.json');
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    }
  } catch {
    // ignore
  }
  return {};
}

interface AssetDriveMapping {
  drive_file_id?: string | null;
  drive_folder_id?: string | null;
  source?: 'drive' | 'legacy' | 'demo';
}

function getAssetDriveMap(): Record<string, AssetDriveMapping> {
  try {
    const p = path.join(getDataDir(), 'asset-drive-map.json');
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    }
  } catch {
    // ignore
  }
  return {};
}

function removeAssetDriveMapping(assetId: string) {
  try {
    const p = path.join(getDataDir(), 'asset-drive-map.json');
    const existing = getAssetDriveMap();
    if (existing[assetId]) {
      delete existing[assetId];
      fs.writeFileSync(p, JSON.stringify(existing, null, 2), 'utf8');
    }
  } catch (e) {
    console.error('Failed to remove local asset drive mapping:', e);
  }
}

function getLinkPasswordsMap(): Record<string, string> {
  try {
    const p = path.join(getDataDir(), 'link-passwords.json');
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    }
  } catch {
    // ignore
  }
  return {};
}

function saveLinkPasswordLocal(linkId: string, passwordPlain: string | null) {
  try {
    const dir = getDataDir();
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const p = path.join(dir, 'link-passwords.json');
    const existing = getLinkPasswordsMap();
    if (passwordPlain === null) {
      delete existing[linkId];
    } else {
      existing[linkId] = passwordPlain;
    }
    fs.writeFileSync(p, JSON.stringify(existing, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to save local link password:', e);
  }
}

function hydrateProjectSettings(p: any, localSettings: Record<string, ProjectSettings>): void {
  if (!p) return;
  const s = localSettings[p.id];
  p.show_progress = (p.show_progress !== undefined && p.show_progress !== null)
    ? Boolean(p.show_progress)
    : (s?.show_progress ?? true);
  p.allow_feedback = (p.allow_feedback !== undefined && p.allow_feedback !== null)
    ? Boolean(p.allow_feedback)
    : (s?.allow_feedback ?? true);
  if (!p.drive_folder_id && s?.drive_folder_id) {
    p.drive_folder_id = s.drive_folder_id;
  }
  if (!p.drive_cover_file_id && s?.drive_cover_file_id) {
    p.drive_cover_file_id = s.drive_cover_file_id;
  }
}

function hydrateAssetDrive(asset: any, driveMap: Record<string, AssetDriveMapping>): void {
  if (!asset) return;
  const m = driveMap[asset.id];
  if (m) {
    if (!asset.drive_file_id && m.drive_file_id) asset.drive_file_id = m.drive_file_id;
    if (!asset.drive_folder_id && m.drive_folder_id) asset.drive_folder_id = m.drive_folder_id;
    if ((!asset.source || asset.source === 'legacy') && m.source) asset.source = m.source;
  }
}

const DEFAULT_SEED_DATA: LocalStore = {
  projects: [
    {
      id: '00000000-0000-0000-0000-000000000001',
      project_code: 'MDS-2026-001',
      status: 'in_progress',
      title: 'هوية القناة 2027',
      description: 'تصميم وتطوير الهوية البصرية الشاملة للقناة التلفزيونية متضمنة الفواصل، شارة البداية، والعناصر ثلاثية الأبعاد.',
      cover_url: 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?auto=format&fit=crop&w=1200&q=80',
      category: 'هويات تلفزيونية',
      progress: 82,
      is_visible: true,
      is_archived: false,
      created_at: new Date('2026-01-10T10:00:00Z').toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: '00000000-0000-0000-0000-000000000002',
      project_code: 'MDS-2026-002',
      status: 'ready_for_review',
      title: 'هوية الأخبار',
      description: 'حزمة الجرافيك الإخباري المتكامل: استوديو افتراضي، شريط الأخبار العاجلة، وقوالب المخططات البيانية المتحركة.',
      cover_url: 'https://images.unsplash.com/photo-1585829365295-ab7cd400c167?auto=format&fit=crop&w=1200&q=80',
      category: 'نشرات إخبارية',
      progress: 55,
      is_visible: true,
      is_archived: false,
      created_at: new Date('2026-01-15T12:00:00Z').toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: '00000000-0000-0000-0000-000000000003',
      project_code: 'MDS-2026-003',
      status: 'changes_requested',
      title: 'الملف السياسي',
      description: 'موشن جرافيكس وهوية بصرية لبرنامج حواري سياسي أسبوعي مع مؤثرات سينمائية رقمية.',
      cover_url: 'https://images.unsplash.com/photo-1541872703-74c5e44368f9?auto=format&fit=crop&w=1200&q=80',
      category: 'برامج حوارية',
      progress: 35,
      is_visible: true,
      is_archived: false,
      created_at: new Date('2026-02-01T08:00:00Z').toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: '00000000-0000-0000-0000-000000000004',
      project_code: 'MDS-2026-004',
      status: 'final',
      title: 'جرافيك 26 سبتمبر',
      description: 'تغطية وطنية خاصة واحتفالية بذكرى 26 سبتمبر: شارات وثائقية وفواصل تلفزيونية مكتملة الإنتاج.',
      cover_url: 'https://images.unsplash.com/photo-1533130061792-64b345e4a833?auto=format&fit=crop&w=1200&q=80',
      category: 'مناسبات وطنية',
      progress: 100,
      is_visible: true,
      is_archived: false,
      created_at: new Date('2026-02-10T14:00:00Z').toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: '00000000-0000-0000-0000-000000000005',
      project_code: 'MDS-2026-005',
      status: 'approved',
      title: 'هوية رمضان',
      description: 'تصاميم رمضانية بصرية أنيقة تشمل مقدمة الإفطار، فواصل الإمساكية، وتنسيقات جدول البرامج الرمضاني.',
      cover_url: 'https://images.unsplash.com/photo-1564769625905-50e93615e769?auto=format&fit=crop&w=1200&q=80',
      category: 'مواسم خاصة',
      progress: 68,
      is_visible: true,
      is_archived: false,
      created_at: new Date('2026-02-18T09:00:00Z').toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: '00000000-0000-0000-0000-000000000006',
      project_code: 'MDS-2026-006',
      status: 'new',
      title: 'لقاء خاص',
      description: 'هوية برنامج المقابلات الشخصية الحصري لكبار الضيوف بتدرجات داكنة وإضاءات استوديو دافئة.',
      cover_url: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=1200&q=80',
      category: 'مقابلات حصرية',
      progress: 20,
      is_visible: true,
      is_archived: false,
      created_at: new Date('2026-02-25T11:00:00Z').toISOString(),
      updated_at: new Date().toISOString(),
    },
  ],
  assets: [
    {
      id: '10000000-0000-0000-0000-000000000001',
      project_id: '00000000-0000-0000-0000-000000000001',
      title: 'شارة البداية الرئيسية ثلاثية الأبعاد - Ident Main',
      file_url: 'https://vjs.zencdn.net/v/oceans.mp4',
      thumbnail_url: 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?auto=format&fit=crop&w=800&q=80',
      file_type: 'video',
      mime_type: 'video/mp4',
      file_size: 23014356,
      duration_seconds: 46,
      version: 'V2',
      sort_order: 1,
      is_visible: true,
      original_filename: 'main_ident.mp4',
      storage_path: null,
      created_at: new Date('2026-02-01T10:00:00Z').toISOString(),
    },
    {
      id: '10000000-0000-0000-0000-000000000002',
      project_id: '00000000-0000-0000-0000-000000000001',
      title: 'شعار القناة ودليل الألوان والخطوط البصرية',
      file_url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1600&q=80',
      thumbnail_url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=800&q=80',
      file_type: 'image',
      mime_type: 'image/jpeg',
      file_size: 3400000,
      duration_seconds: null,
      version: 'Final',
      sort_order: 2,
      is_visible: true,
      original_filename: 'brand_guide.jpg',
      storage_path: null,
      created_at: new Date('2026-02-02T11:00:00Z').toISOString(),
    },
    {
      id: '10000000-0000-0000-0000-000000000003',
      project_id: '00000000-0000-0000-0000-000000000001',
      title: 'فاصل الإعلانات الترويجي - Station Promo Bumper',
      file_url: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
      thumbnail_url: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=800&q=80',
      file_type: 'video',
      mime_type: 'video/mp4',
      file_size: 28400000,
      duration_seconds: 10,
      version: 'V1',
      sort_order: 3,
      is_visible: true,
      original_filename: 'promo_bumper.mp4',
      storage_path: null,
      created_at: new Date('2026-02-05T13:00:00Z').toISOString(),
    },
    {
      id: '10000000-0000-0000-0000-000000000004',
      project_id: '00000000-0000-0000-0000-000000000001',
      title: 'ملفات المشروع والطبقات المفتوحة (AE & C4D)',
      file_url: 'https://example.com/channel-package-2027.zip',
      thumbnail_url: 'https://images.unsplash.com/photo-1626785774573-4b799315345d?auto=format&fit=crop&w=800&q=80',
      file_type: 'file',
      mime_type: 'application/zip',
      file_size: 124000000,
      duration_seconds: null,
      version: 'V1',
      sort_order: 4,
      is_visible: true,
      original_filename: 'channel-package-2027.zip',
      storage_path: null,
      created_at: new Date('2026-02-06T15:00:00Z').toISOString(),
    },
    {
      id: '20000000-0000-0000-0000-000000000001',
      project_id: '00000000-0000-0000-0000-000000000002',
      title: 'مقدمة نشرة الأخبار الرئيسية - Main News Intro',
      file_url: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
      thumbnail_url: 'https://images.unsplash.com/photo-1585829365295-ab7cd400c167?auto=format&fit=crop&w=800&q=80',
      file_type: 'video',
      mime_type: 'video/mp4',
      file_size: 1128375,
      duration_seconds: 5,
      version: 'V2',
      sort_order: 1,
      is_visible: true,
      original_filename: 'news_intro.mp4',
      storage_path: null,
      created_at: new Date('2026-02-10T12:00:00Z').toISOString(),
    },
    {
      id: '20000000-0000-0000-0000-000000000002',
      project_id: '00000000-0000-0000-0000-000000000002',
      title: 'شريط الأخبار والقوالب التحتية (Lower Thirds)',
      file_url: 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&w=1200&q=80',
      thumbnail_url: 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&w=800&q=80',
      file_type: 'image',
      mime_type: 'image/jpeg',
      file_size: 2100000,
      duration_seconds: null,
      version: 'V1',
      sort_order: 2,
      is_visible: true,
      original_filename: 'lower_thirds.jpg',
      storage_path: null,
      created_at: new Date('2026-02-12T14:00:00Z').toISOString(),
    },
    {
      id: '40000000-0000-0000-0000-000000000001',
      project_id: '00000000-0000-0000-0000-000000000004',
      title: 'شارة العيد الوطني 26 سبتمبر - الفاصل التلفزيوني الرئيسي',
      file_url: 'https://vjs.zencdn.net/v/oceans.mp4',
      thumbnail_url: 'https://images.unsplash.com/photo-1533130061792-64b345e4a833?auto=format&fit=crop&w=800&q=80',
      file_type: 'video',
      mime_type: 'video/mp4',
      file_size: 23014356,
      duration_seconds: 46,
      version: 'Final',
      sort_order: 1,
      is_visible: true,
      original_filename: 'september_26_ident.mp4',
      storage_path: null,
      created_at: new Date('2026-02-11T10:00:00Z').toISOString(),
    },
    {
      id: '40000000-0000-0000-0000-000000000002',
      project_id: '00000000-0000-0000-0000-000000000004',
      title: 'دليل الهوية التلفزيونية والشعار المعتمد 26 سبتمبر',
      file_url: 'https://images.unsplash.com/photo-1541872703-74c5e44368f9?auto=format&fit=crop&w=1600&q=80',
      thumbnail_url: 'https://images.unsplash.com/photo-1541872703-74c5e44368f9?auto=format&fit=crop&w=800&q=80',
      file_type: 'image',
      mime_type: 'image/jpeg',
      file_size: 4200000,
      duration_seconds: null,
      version: 'Final',
      sort_order: 2,
      is_visible: true,
      original_filename: 'september_26_identity_guide.jpg',
      storage_path: null,
      created_at: new Date('2026-02-12T11:00:00Z').toISOString(),
    },
    {
      id: '40000000-0000-0000-0000-000000000003',
      project_id: '00000000-0000-0000-0000-000000000004',
      title: 'حزمة القوالب والمشاريع المفتوحة (AE & 3D Assets)',
      file_url: 'https://example.com/september-26-assets.zip',
      thumbnail_url: 'https://images.unsplash.com/photo-1626785774573-4b799315345d?auto=format&fit=crop&w=800&q=80',
      file_type: 'file',
      mime_type: 'application/zip',
      file_size: 145000000,
      duration_seconds: null,
      version: 'Final',
      sort_order: 3,
      is_visible: true,
      original_filename: 'september_26_package.zip',
      storage_path: null,
      created_at: new Date('2026-02-13T12:00:00Z').toISOString(),
    },
  ],
  access_links: [
    {
      id: '30000000-0000-0000-0000-000000000001',
      viewer_name: 'أحمد',
      slug: 'x7K29AbC',
      password_hash: bcrypt.hashSync('2580', 10),
      password_plain: '2580',
      enabled: true,
      session_version: 1,
      created_at: new Date('2026-01-01T00:00:00Z').toISOString(),
      project_ids: [
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000002',
        '00000000-0000-0000-0000-000000000003',
        '00000000-0000-0000-0000-000000000004',
        '00000000-0000-0000-0000-000000000005',
        '00000000-0000-0000-0000-000000000006',
      ],
    },
  ],
  comments: [
    {
      id: '40000000-0000-0000-0000-000000000001',
      asset_id: '10000000-0000-0000-0000-000000000001',
      access_link_id: '30000000-0000-0000-0000-000000000001',
      author_name: 'أحمد',
      body: 'الشعار يحتاج تكبير قليلاً في نهاية الشارة',
      timestamp_seconds: 7,
      created_at: new Date('2026-02-15T10:30:00Z').toISOString(),
    },
    {
      id: '40000000-0000-0000-0000-000000000002',
      asset_id: '10000000-0000-0000-0000-000000000001',
      access_link_id: null,
      author_name: 'إدارة الاستوديو',
      body: 'تم تعديل النسخة واعتماد التوقيت الجديد',
      timestamp_seconds: null,
      created_at: new Date('2026-02-15T11:45:00Z').toISOString(),
    },
  ],
  approvals: [
    {
      id: '50000000-0000-0000-0000-000000000001',
      asset_id: '10000000-0000-0000-0000-000000000002',
      access_link_id: '30000000-0000-0000-0000-000000000001',
      viewer_name: 'أحمد',
      approved: true,
      created_at: new Date('2026-02-14T09:00:00Z').toISOString(),
      updated_at: new Date('2026-02-14T09:00:00Z').toISOString(),
    },
  ],
};

export function getDataMode(): 'supabase' | 'demo' {
  const dataMode = process.env.DATA_MODE;

  // 1. If Supabase is fully configured and healthy, use Supabase
  if (isServerSupabaseConfigured() && isSupabaseHealthy()) {
    return 'supabase';
  }

  // 2. If explicit demo mode or explicitly allowed
  if (dataMode === 'demo' || process.env.ALLOW_DEMO === 'true') {
    return 'demo';
  }

  // 3. Fallback gracefully to demo / local store so outages or unresolvable hosts never crash admin or client
  return 'demo';
}

declare global {
  var __mediaStudioLocalStore: LocalStore | undefined;
}

function getLocalStore(): LocalStore {
  if (globalThis.__mediaStudioLocalStore) {
    return globalThis.__mediaStudioLocalStore;
  }

  const storeFile = getLocalStoreFile();
  try {
    if (fs.existsSync(storeFile)) {
      const data = fs.readFileSync(storeFile, 'utf-8');
      const parsed = JSON.parse(data) as LocalStore;

      // Ensure seed deliverables and projects are retained if store was created before updates
      let updated = false;
      for (const p of DEFAULT_SEED_DATA.projects) {
        if (!parsed.projects.some((ep) => ep.id === p.id)) {
          parsed.projects.push(p);
          updated = true;
        }
      }
      for (const a of DEFAULT_SEED_DATA.assets) {
        if (!parsed.assets.some((ea) => ea.id === a.id)) {
          parsed.assets.push(a);
          updated = true;
        }
      }
      for (const l of DEFAULT_SEED_DATA.access_links) {
        if (!parsed.access_links.some((el) => el.id === l.id)) {
          parsed.access_links.push(l);
          updated = true;
        }
      }

      // Backfill project_code and status for all existing projects in store
      // Sort projects by created_at ascending for deterministic sequence generation
      const sortedProjects = [...parsed.projects].sort(
        (a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
      );

      for (const p of sortedProjects) {
        const target = parsed.projects.find((x) => x.id === p.id);
        if (!target) continue;

        if (!target.status) {
          target.status = target.is_archived ? 'archived' : 'new';
          updated = true;
        }

        if (!target.project_code || !target.project_code.trim()) {
          const year = new Date(target.created_at || Date.now()).getFullYear();
          const prefix = `MDS-${year}-`;
          let maxNum = 0;
          for (const ep of parsed.projects) {
            if (ep.project_code && ep.project_code.startsWith(prefix)) {
              const num = parseInt(ep.project_code.slice(prefix.length), 10);
              if (!isNaN(num) && num > maxNum) maxNum = num;
            }
          }
          target.project_code = `${prefix}${String(maxNum + 1).padStart(3, '0')}`;
          updated = true;
        }
      }

      if (updated) {
        try {
          fs.writeFileSync(storeFile, JSON.stringify(parsed, null, 2), 'utf-8');
        } catch {
          // ignore
        }
      }

      globalThis.__mediaStudioLocalStore = parsed;
      return parsed;
    }
  } catch (err) {
    console.warn('[DataService] Notice: Could not read local store file, falling back to seed:', err);
  }

  // Initialize in-memory store from clone of seed data
  const initial = JSON.parse(JSON.stringify(DEFAULT_SEED_DATA)) as LocalStore;
  globalThis.__mediaStudioLocalStore = initial;
  saveLocalStore(initial);
  return initial;
}

function saveLocalStore(data: LocalStore): void {
  globalThis.__mediaStudioLocalStore = data;
  try {
    const storeFile = getLocalStoreFile();
    const dir = path.dirname(storeFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(storeFile, JSON.stringify(data, null, 2), 'utf-8');
  } catch {
    // In-memory globalThis.__mediaStudioLocalStore is already updated
  }
}

export const VALID_PROJECT_STATUSES: readonly ProjectStatus[] = [
  'new',
  'in_progress',
  'ready_for_review',
  'changes_requested',
  'approved',
  'final',
  'archived',
] as const;

export function isValidProjectStatus(status: unknown): status is ProjectStatus {
  return typeof status === 'string' && (VALID_PROJECT_STATUSES as readonly string[]).includes(status);
}

// In-memory mutex and sequence tracker for concurrency-safe project_code sequence generation
let projectCodeMutex = Promise.resolve();
const localCodeSequences: Record<number, number> = {};

export async function generateNextProjectCode(year: number = new Date().getFullYear()): Promise<string> {
  let release: () => void = () => {};
  const gate = new Promise<void>((res) => {
    release = res;
  });
  const prev = projectCodeMutex;
  projectCodeMutex = (async () => {
    try {
      await prev;
    } catch {
      // ignore
    }
    await gate;
  })();

  try {
    await prev;
    const prefix = `MDS-${year}-`;

    if (getDataMode() === 'supabase') {
      const supabase = getServerSupabase();
      if (supabase) {
        try {
          const { data, error } = await supabase.rpc('generate_project_code', { p_year: year });
          if (!error && data && typeof data === 'string' && data.startsWith(prefix)) {
            return data;
          }
          const { data: rows, error: qErr } = await supabase
            .from('projects')
            .select('project_code')
            .like('project_code', `${prefix}%`);
          if (!qErr && rows) {
            let maxNum = 0;
            for (const r of rows) {
              if (r.project_code) {
                const num = parseInt(r.project_code.slice(prefix.length), 10);
                if (!isNaN(num) && num > maxNum) maxNum = num;
              }
            }
            return `${prefix}${String(maxNum + 1).padStart(3, '0')}`;
          }
        } catch {
          // fallback to local store below
        }
      }
    }

    // Determine current sequence value from store or sequence tracker
    const store = getLocalStore();
    let currentVal = localCodeSequences[year] || 0;
    for (const p of store.projects) {
      if (p.project_code && p.project_code.startsWith(prefix)) {
        const num = parseInt(p.project_code.slice(prefix.length), 10);
        if (!isNaN(num) && num > currentVal) currentVal = num;
      }
    }

    const nextVal = currentVal + 1;
    localCodeSequences[year] = nextVal;
    return `${prefix}${String(nextVal).padStart(3, '0')}`;
  } finally {
    release();
  }
}

/**
 * Resolves a secure playback/view URL for an asset:
 * - If stored in private Supabase bucket: generates a short-lived signed URL (default 2 hours).
 * - Never returns a raw private storage path if signing fails.
 */
export async function resolveAssetPlaybackUrl(
  asset: Asset,
  expiresInSeconds: number = 7200,
  clientSlug?: string
): Promise<string> {
  const isDirectWebUrl = (url: string | null | undefined): boolean => {
    if (!url) return false;
    return url.startsWith('http://') || url.startsWith('https://') || url.startsWith('/uploads/');
  };

  const attachClientSlug = (url: string): string => {
    if (!clientSlug) return url;
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('/uploads/')) {
      return url; // Preserve external URLs
    }
    const [p, q] = url.split('?');
    const sp = new URLSearchParams(q || '');
    if (!sp.has('slug')) {
      sp.set('slug', clientSlug);
    }
    const qs = sp.toString();
    return qs ? `${p}?${qs}` : p;
  };

  if (asset.storage_path || (!isDirectWebUrl(asset.file_url) && !asset.file_url?.startsWith('/api/'))) {
    const targetPath = asset.storage_path || asset.file_url;
    if (getDataMode() === 'supabase') {
      const supabase = getServerSupabase();
      if (supabase) {
        try {
          const { data, error } = await supabase.storage
            .from('media-studio-assets')
            .createSignedUrl(targetPath, expiresInSeconds);
          if (error || !data?.signedUrl) {
            console.error(`Failed to generate signed URL for asset: ${targetPath}`, error);
            reportSupabaseFailure(error);
          } else {
            reportSupabaseSuccess();
            return data.signedUrl;
          }
        } catch (err) {
          reportSupabaseFailure(err);
        }
      }
    }
    // Demo proxy route
    return attachClientSlug(`/api/media/${asset.id}`);
  }

  // Handle internal media endpoints (e.g. Drive /api/media/{id})
  if (asset.file_url?.startsWith('/api/')) {
    return attachClientSlug(asset.file_url);
  }

  // Intercept deprecated Google Cloud Storage sample videos that return XML 403 Access Denied
  if (asset.file_url?.includes('gtv-videos-bucket') || asset.file_url?.includes('commondatastorage.googleapis.com')) {
    return 'https://vjs.zencdn.net/v/oceans.mp4';
  }

  return asset.file_url;
}

export async function resolveProjectCoverUrl(project: Project, expiresInSeconds: number = 7200): Promise<string | null> {
  const isDirectWebUrl = (url: string | null | undefined): boolean => {
    if (!url) return false;
    return url.startsWith('http://') || url.startsWith('https://') || url.startsWith('/uploads/') || url.startsWith('/api/') || url.startsWith('data:');
  };

  const targetPath = project.cover_storage_path || (!isDirectWebUrl(project.cover_url) ? project.cover_url : null);

  if (targetPath) {
    if (getDataMode() === 'supabase') {
      const supabase = getServerSupabase();
      if (supabase) {
        try {
          const { data, error } = await supabase.storage
            .from('media-studio-assets')
            .createSignedUrl(targetPath, expiresInSeconds);
          if (error || !data?.signedUrl) {
            console.error(`Failed to generate signed URL for cover: ${targetPath}`, error);
            reportSupabaseFailure(error);
          } else {
            reportSupabaseSuccess();
            return data.signedUrl;
          }
        } catch (err) {
          reportSupabaseFailure(err);
        }
      }
    }
    // Demo mode: Return the protected proxy endpoint instead of raw storage path
    if (project.id) {
      return `/api/media/cover/${project.id}`;
    }
    return null;
  }
  return isDirectWebUrl(project.cover_url) ? project.cover_url! : null;
}

export async function resolveAssetThumbnailUrl(
  asset: Asset,
  expiresInSeconds: number = 7200,
  clientSlug?: string
): Promise<string | null> {
  const isDirectWebUrl = (url: string | null | undefined): boolean => {
    if (!url) return false;
    return url.startsWith('http://') || url.startsWith('https://') || url.startsWith('/uploads/');
  };

  const attachClientSlug = (url: string): string => {
    if (!clientSlug) return url;
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('/uploads/')) {
      return url; // Preserve external URLs
    }
    const [p, q] = url.split('?');
    const sp = new URLSearchParams(q || '');
    if (!sp.has('slug')) {
      sp.set('slug', clientSlug);
    }
    const qs = sp.toString();
    return qs ? `${p}?${qs}` : p;
  };

  const targetPath = asset.thumbnail_storage_path || (!isDirectWebUrl(asset.thumbnail_url) && !asset.thumbnail_url?.startsWith('/api/') ? asset.thumbnail_url : null);

  if (targetPath) {
    if (getDataMode() === 'supabase') {
      const supabase = getServerSupabase();
      if (supabase) {
        try {
          const { data, error } = await supabase.storage
            .from('media-studio-assets')
            .createSignedUrl(targetPath, expiresInSeconds);
          if (error || !data?.signedUrl) {
            console.error(`Failed to generate signed URL for thumbnail: ${targetPath}`, error);
            reportSupabaseFailure(error);
          } else {
            reportSupabaseSuccess();
            return data.signedUrl;
          }
        } catch (err) {
          reportSupabaseFailure(err);
        }
      }
    }
    // Demo mode: Return the protected thumbnail proxy endpoint instead of raw storage path
    if (asset.id) {
      return attachClientSlug(`/api/media/${asset.id}?type=thumbnail`);
    }
    return null;
  }

  if (asset.thumbnail_url?.startsWith('/api/')) {
    return attachClientSlug(asset.thumbnail_url);
  }

  // For any Google Drive asset (videos or images) or assets with googleusercontent URLs, route to protected thumbnail endpoint
  if (asset.id && (asset.drive_file_id || asset.thumbnail_url?.includes('googleusercontent.com'))) {
    return attachClientSlug(`/api/media/${asset.id}?type=thumbnail`);
  }

  return isDirectWebUrl(asset.thumbnail_url) ? asset.thumbnail_url! : null;
}

/**
 * Unifies and synchronizes cover_url and cover_storage_path across project operations.
 * Ensures consistent behavior when updating legacy/migrated covers or clearing covers.
 */
export function normalizeProjectCoverData(data: Partial<Project>): void {
  if (data.cover_url !== undefined || data.cover_storage_path !== undefined) {
    const rawCover = data.cover_url !== undefined ? (data.cover_url ? data.cover_url.trim() : null) : undefined;
    const rawPath = data.cover_storage_path !== undefined ? (data.cover_storage_path ? data.cover_storage_path.trim() : null) : undefined;

    const isDirectWebUrl = (u: string | null | undefined): boolean => {
      if (!u) return false;
      return u.startsWith('http://') || u.startsWith('https://') || u.startsWith('/uploads/') || u.startsWith('/api/') || u.startsWith('data:');
    };

    if (rawCover === null || (rawCover === undefined && rawPath === null)) {
      // Explicit removal: clear both fields completely
      data.cover_url = null;
      data.cover_storage_path = null;
    } else if (rawPath) {
      data.cover_storage_path = rawPath;
      data.cover_url = rawCover || rawPath;
    } else if (rawCover) {
      if (isDirectWebUrl(rawCover)) {
        data.cover_url = rawCover;
        data.cover_storage_path = null; // Direct web URL replaces old storage path
      } else {
        // Relative or migrated storage path
        data.cover_storage_path = rawCover;
        data.cover_url = rawCover;
      }
    }
  }
}

/**
 * Deep check across assets (file and thumbnail) and projects (covers)
 * to verify if a storage path is currently referenced in the database.
 * Throws on DB query errors so callers can abort deletions.
 */
export async function isStoragePathReferenced(storagePath: string): Promise<{ referenced: boolean; reason?: string }> {
  if (getDataMode() === 'supabase') {
    const supabase = getServerSupabase();
    if (supabase) {
      try {
        // 1. Check assets storage_path and file_url
        const { count: assetCount, error: assetErr } = await supabase
          .from('assets')
          .select('*', { count: 'exact', head: true })
          .or(`storage_path.eq.${storagePath},file_url.eq.${storagePath}`);

        if (!assetErr && assetCount && assetCount > 0) {
          return { referenced: true, reason: 'مستخدم كملف أصل رئيسي' };
        }

        // 2. Check assets thumbnail_storage_path and thumbnail_url
        const { count: thumbCount, error: thumbErr } = await supabase
          .from('assets')
          .select('*', { count: 'exact', head: true })
          .or(`thumbnail_storage_path.eq.${storagePath},thumbnail_url.eq.${storagePath}`);

        if (!thumbErr && thumbCount && thumbCount > 0) {
          return { referenced: true, reason: 'مستخدم كمصغر لأصل' };
        }

        // 3. Check projects cover_storage_path and cover_url
        const { count: coverCount, error: coverErr } = await supabase
          .from('projects')
          .select('*', { count: 'exact', head: true })
          .or(`cover_storage_path.eq.${storagePath},cover_url.eq.${storagePath}`);

        if (!coverErr && coverCount && coverCount > 0) {
          return { referenced: true, reason: 'مستخدم كغلاف لمشروع' };
        }

        return { referenced: false };
      } catch (err: any) {
        reportSupabaseFailure(err);
        console.warn('isStoragePathReferenced Supabase check failed, falling back to local check:', err?.message || err);
      }
    }
  }

  // Demo mode reference check
  const store = getLocalStore();
  const usedInAsset = store.assets.some(
    (a) => a.storage_path === storagePath || a.file_url === storagePath
  );
  if (usedInAsset) return { referenced: true, reason: 'مستخدم كملف أصل رئيسي (تجريبي)' };

  const usedInThumb = store.assets.some(
    (a) => a.thumbnail_storage_path === storagePath || a.thumbnail_url === storagePath
  );
  if (usedInThumb) return { referenced: true, reason: 'مستخدم كمصغر لأصل (تجريبي)' };

  const usedInCover = store.projects.some(
    (p) => p.cover_storage_path === storagePath || p.cover_url === storagePath
  );
  if (usedInCover) return { referenced: true, reason: 'مستخدم كغلاف لمشروع (تجريبي)' };

  return { referenced: false };
}

// -------------------------------------------------------------
// Data Access Service (Strict Single Source of Truth)
// -------------------------------------------------------------

export const dataService = {
  // 1. Client Link Retrieval
  async getAccessLinkBySlug(slug: string): Promise<AccessLink | null> {
    if (getDataMode() === 'supabase') {
      const supabase = getServerSupabase();
      if (supabase) {
        try {
          const { data, error } = await supabase
            .from('access_links')
            .select('id, viewer_name, slug, password_hash, enabled, session_version, created_at, access_link_projects(project_id)')
            .eq('slug', slug)
            .maybeSingle();

          if (!error && data) {
            reportSupabaseSuccess();
            const hasPassword = Boolean(
              data.password_hash &&
              data.password_hash.trim() !== '' &&
              data.password_hash !== 'NO_PASSWORD'
            );

            return {
              id: data.id,
              viewer_name: data.viewer_name,
              slug: data.slug,
              password_hash: '', // Omit password hash for safety when not verifying password
              has_password: hasPassword,
              enabled: data.enabled,
              session_version: data.session_version ?? 1,
              created_at: data.created_at,
              project_ids: data.access_link_projects?.map((alp: { project_id: string }) => alp.project_id) || [],
            };
          } else if (error) {
            reportSupabaseFailure(error);
            console.error('[Supabase Error] Failed to fetch access link by slug:', error.message);
          }
        } catch (err: any) {
          reportSupabaseFailure(err);
          console.error('[Supabase Exception] Failed to query link by slug:', err?.message || err);
        }
      }
    }

    const store = getLocalStore();
    const link = store.access_links.find((l) => l.slug === slug);
    if (!link) return null;

    const hasPassword = Boolean(
      link.password_hash &&
      link.password_hash.trim() !== '' &&
      link.password_hash !== 'NO_PASSWORD'
    );

    return {
      id: link.id,
      viewer_name: link.viewer_name,
      slug: link.slug,
      password_hash: '',
      has_password: hasPassword,
      enabled: link.enabled,
      session_version: link.session_version ?? 1,
      created_at: link.created_at,
      project_ids: link.project_ids,
    };
  },

  // Retrieve link with password hash strictly for authentication verification
  async getAccessLinkAuthDataBySlug(slug: string): Promise<AccessLink | null> {
    const supabase = getServerSupabase();
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('access_links')
          .select('id, viewer_name, slug, password_hash, enabled, session_version, created_at')
          .eq('slug', slug)
          .maybeSingle();

        if (!error && data) {
          reportSupabaseSuccess();
          const hasPassword = Boolean(
            data.password_hash &&
            data.password_hash.trim() !== '' &&
            data.password_hash !== 'NO_PASSWORD'
          );

          const localPasswords = getLinkPasswordsMap();
          return {
            ...data,
            password_plain: (data as any).password_plain || localPasswords[data.id] || null,
            has_password: hasPassword,
          };
        } else if (error) {
          reportSupabaseFailure(error);
          console.warn('[Supabase Warning] Failed to fetch auth data for slug:', error.message);
        }
      } catch (err: any) {
        reportSupabaseFailure(err);
        console.warn('[Supabase Exception] getAccessLinkAuthDataBySlug:', err?.message || err);
      }
    }

    const store = getLocalStore();
    const link = store.access_links.find((l) => l.slug === slug);
    if (!link) return null;

    const localPasswords = getLinkPasswordsMap();
    const hasPassword = Boolean(
      link.password_hash &&
      link.password_hash.trim() !== '' &&
      link.password_hash !== 'NO_PASSWORD'
    );

    return {
      id: link.id,
      viewer_name: link.viewer_name,
      slug: link.slug,
      password_hash: link.password_hash,
      password_plain: link.password_plain || localPasswords[link.id] || null,
      enabled: link.enabled,
      session_version: link.session_version ?? 1,
      created_at: link.created_at,
      has_password: hasPassword,
    };
  },

  // 2. Client Projects List
  async getProjectsForClient(linkId: string): Promise<Project[]> {
    const supabase = getServerSupabase();
    if (supabase) {
      try {
        const { data: linkProjects, error: linkErr } = await supabase
          .from('access_link_projects')
          .select('project_id')
          .eq('access_link_id', linkId);

        if (!linkErr && linkProjects) {
          const projectIds = linkProjects.map((lp) => lp.project_id) || [];
          if (projectIds.length === 0) return [];

          const { data: projects, error: projErr } = await supabase
            .from('projects')
            .select('*, assets(count)')
            .in('id', projectIds)
            .eq('is_visible', true)
            .eq('is_archived', false)
            .order('created_at', { ascending: false });

          if (!projErr && projects) {
            reportSupabaseSuccess();
            const localSettings = getProjectSettingsMap();
            const mapped = projects.map((p) => {
              hydrateProjectSettings(p, localSettings);
              return {
                ...p,
                file_count: p.assets?.[0]?.count || 0,
              };
            });

            for (const p of mapped) {
              try {
                p.display_cover_url = await resolveProjectCoverUrl(p);
              } catch {
                p.display_cover_url = p.cover_url || null;
              }
            }

            return mapped;
          } else if (projErr) {
            reportSupabaseFailure(projErr);
          }
        } else if (linkErr) {
          reportSupabaseFailure(linkErr);
        }
      } catch (err: any) {
        reportSupabaseFailure(err);
        console.error('[Supabase Exception] Failed to get client projects:', err?.message || err);
      }
    }

    const store = getLocalStore();
    const link = store.access_links.find((l) => l.id === linkId);
    if (!link) return [];

    return store.projects
      .filter((p) => link.project_ids.includes(p.id) && p.is_visible && !p.is_archived)
      .map((p) => ({
        ...p,
        show_progress: p.show_progress ?? true,
        allow_feedback: p.allow_feedback ?? true,
        display_cover_url: p.cover_url,
        file_count: store.assets.filter((a) => a.project_id === p.id && a.is_visible).length,
      }));
  },

  // 3. Client Single Project Access Check
  async getProjectForClient(linkId: string, projectId: string): Promise<Project | null> {
    const supabase = getServerSupabase();
    if (supabase) {
      try {
        const { data: linkProj, error: linkErr } = await supabase
          .from('access_link_projects')
          .select('project_id')
          .eq('access_link_id', linkId)
          .eq('project_id', projectId)
          .maybeSingle();

        if (!linkErr && linkProj) {
          const { data: project, error: projErr } = await supabase
            .from('projects')
            .select('*')
            .eq('id', projectId)
            .eq('is_visible', true)
            .eq('is_archived', false)
            .maybeSingle();

          if (!projErr && project) {
            reportSupabaseSuccess();
            const localSettings = getProjectSettingsMap();
            hydrateProjectSettings(project, localSettings);
            try {
              project.display_cover_url = await resolveProjectCoverUrl(project);
            } catch {
              project.display_cover_url = project.cover_url || null;
            }
            return project;
          } else if (projErr) {
            reportSupabaseFailure(projErr);
          }
        } else if (linkErr) {
          reportSupabaseFailure(linkErr);
          console.warn('[Supabase Warning] Failed to check project assignment:', linkErr.message);
        }
      } catch (err: any) {
        reportSupabaseFailure(err);
        console.warn('[Supabase Exception] getProjectForClient:', err?.message || err);
      }
    }

    const store = getLocalStore();
    const link = store.access_links.find((l) => l.id === linkId);
    if (!link || !link.project_ids.includes(projectId)) return null;

    const project = store.projects.find((p) => p.id === projectId && p.is_visible && !p.is_archived);
    if (!project) return null;
    return {
      ...project,
      show_progress: project.show_progress ?? true,
      allow_feedback: project.allow_feedback ?? true,
      display_cover_url: project.cover_url,
    };
  },

  // 4. Project Assets (with ephemeral signed URLs, approvals and comments)
  async getAssetsForProject(
    projectId: string,
    forClient: boolean = true,
    clientSlug?: string
  ): Promise<Asset[]> {
    const supabase = getServerSupabase();
    if (supabase) {
      try {
        let query = supabase
          .from('assets')
          .select('*, approvals(*), comments(*)')
          .eq('project_id', projectId)
          .order('sort_order', { ascending: true });

        if (forClient) {
          query = query.eq('is_visible', true);
        }

        const { data, error } = await query;
        if (!error && data) {
          reportSupabaseSuccess();
          const assets = (data || []) as Asset[];
          const driveMap = getAssetDriveMap();

          // Resolve ephemeral signed URLs for playback and thumbnail preview
          for (const asset of assets) {
            hydrateAssetDrive(asset, driveMap);
            try {
              asset.playback_url = await resolveAssetPlaybackUrl(asset, 7200, clientSlug);
            } catch {
              asset.playback_url = asset.file_url;
            }
            try {
              asset.display_thumbnail_url = await resolveAssetThumbnailUrl(asset, 7200, clientSlug);
            } catch {
              asset.display_thumbnail_url = asset.thumbnail_url || asset.file_url;
            }
          }

          return assets;
        } else if (error) {
          reportSupabaseFailure(error);
          console.error('[Supabase Error] Failed to fetch assets for project:', error.message);
        }
      } catch (err: any) {
        reportSupabaseFailure(err);
        console.error('[Supabase Exception] Failed to query assets:', err?.message || err);
      }
    }

    const store = getLocalStore();
    return store.assets
      .filter((a) => a.project_id === projectId && (!forClient || a.is_visible))
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((a) => {
        const attachSlug = (url: string | null | undefined): string | null => {
          if (!url) return null;
          if (clientSlug && url.startsWith('/api/')) {
            const [p, q] = url.split('?');
            const sp = new URLSearchParams(q || '');
            if (!sp.has('slug')) sp.set('slug', clientSlug);
            const str = sp.toString();
            return str ? `${p}?${str}` : p;
          }
          return url;
        };
        return {
          ...a,
          playback_url: attachSlug(a.file_url) || a.file_url,
          display_thumbnail_url: attachSlug(a.thumbnail_url) || a.thumbnail_url,
          approvals: store.approvals.filter((app) => app.asset_id === a.id),
          comments: store.comments
            .filter((c) => c.asset_id === a.id)
            .sort((x, y) => new Date(x.created_at).getTime() - new Date(y.created_at).getTime()),
        };
      });
  },

  // 5. Get Single Asset by ID
  async getAssetById(assetId: string): Promise<Asset | null> {
    const supabase = getServerSupabase();
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('assets')
          .select('*')
          .eq('id', assetId)
          .maybeSingle();

        if (!error && data) {
          reportSupabaseSuccess();
          const asset = data as Asset;
          const driveMap = getAssetDriveMap();
          hydrateAssetDrive(asset, driveMap);
          asset.playback_url = await resolveAssetPlaybackUrl(asset);
          asset.display_thumbnail_url = await resolveAssetThumbnailUrl(asset);
          return asset;
        } else if (error) {
          reportSupabaseFailure(error);
          console.warn(`[Supabase Warning] Failed to fetch asset ${assetId}:`, error.message);
        }
      } catch (err: any) {
        reportSupabaseFailure(err);
        console.warn(`[Supabase Exception] getAssetById:`, err?.message || err);
      }
    }

    const store = getLocalStore();
    const asset = store.assets.find((a) => a.id === assetId);
    if (!asset) return null;
    return { ...asset, playback_url: asset.file_url, display_thumbnail_url: asset.thumbnail_url };
  },

  // 6. Add Comment
  async addComment(
    assetId: string,
    accessLinkId: string | null,
    authorName: string,
    body: string,
    timestampSeconds?: number | null
  ): Promise<Comment> {
    const supabase = getServerSupabase();
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('comments')
          .insert({
            asset_id: assetId,
            access_link_id: accessLinkId,
            author_name: authorName,
            body,
            timestamp_seconds: timestampSeconds ?? null,
          })
          .select()
          .single();

        if (!error && data) {
          reportSupabaseSuccess();
          return data as Comment;
        } else if (error) {
          reportSupabaseFailure(error);
          console.warn('[Supabase Warning] Failed to insert comment:', error.message);
        }
      } catch (err: any) {
        reportSupabaseFailure(err);
        console.warn('[Supabase Exception] addComment:', err?.message || err);
      }
    }

    const store = getLocalStore();
    const newComment: Comment = {
      id: crypto.randomUUID(),
      asset_id: assetId,
      access_link_id: accessLinkId,
      author_name: authorName,
      body,
      timestamp_seconds: timestampSeconds ?? null,
      created_at: new Date().toISOString(),
    };
    store.comments.push(newComment);
    saveLocalStore(store);
    return newComment;
  },

  // 7. Toggle Approval (Keyed on asset_id + access_link_id)
  async toggleApproval(
    assetId: string,
    accessLinkId: string | null,
    viewerName: string,
    approved: boolean
  ): Promise<Approval> {
    const supabase = getServerSupabase();
    if (supabase) {
      if (!accessLinkId) {
        throw new Error('VALIDATION_ERROR: accessLinkId is required to record approval.');
      }

      try {
        // Upsert keyed on (asset_id, access_link_id)
        const { data, error } = await supabase
          .from('approvals')
          .upsert(
            {
              asset_id: assetId,
              access_link_id: accessLinkId,
              viewer_name: viewerName,
              approved,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'asset_id,access_link_id' }
          )
          .select()
          .single();

        if (!error && data) {
          reportSupabaseSuccess();
          return data as Approval;
        } else if (error) {
          reportSupabaseFailure(error);
          console.warn('[Supabase Warning] Failed to update approval:', error.message);
        }
      } catch (err: any) {
        reportSupabaseFailure(err);
        console.warn('[Supabase Exception] toggleApproval:', err?.message || err);
      }
    }

    const store = getLocalStore();
    const existingIndex = store.approvals.findIndex(
      (a) => a.asset_id === assetId && a.access_link_id === accessLinkId
    );

    let result: Approval;
    if (existingIndex >= 0) {
      store.approvals[existingIndex].approved = approved;
      store.approvals[existingIndex].viewer_name = viewerName; // update display name snapshot
      store.approvals[existingIndex].updated_at = new Date().toISOString();
      result = store.approvals[existingIndex];
    } else {
      result = {
        id: crypto.randomUUID(),
        asset_id: assetId,
        access_link_id: accessLinkId,
        viewer_name: viewerName,
        approved,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      store.approvals.push(result);
    }
    saveLocalStore(store);
    return result;
  },

  // -------------------------------------------------------------
  // Admin Project Management
  // -------------------------------------------------------------

  async getAllProjects(): Promise<Project[]> {
    const supabase = getServerSupabase();
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('projects')
          .select(`
            *,
            assets (
              id,
              comments (id),
              approvals (id, approved)
            )
          `)
          .order('created_at', { ascending: false });

        if (!error && data) {
          const localSettings = getProjectSettingsMap();
          const mapped = (data || []).map((p: any) => {
            hydrateProjectSettings(p, localSettings);
            const assetsList = p.assets || [];
            const fileCount = assetsList.length;
            const commentsCount = assetsList.reduce((sum: number, a: any) => sum + (a.comments?.length || 0), 0);
            const approvalsCount = assetsList.reduce(
              (sum: number, a: any) => sum + (a.approvals?.filter((app: any) => app.approved)?.length || 0),
              0
            );

            return {
              ...p,
              project_code: p.project_code || 'MDS-2026-000',
              status: p.status || (p.is_archived ? 'archived' : 'new'),
              file_count: fileCount,
              comments_count: commentsCount,
              approvals_count: approvalsCount,
            };
          });

          for (const p of mapped) {
            try {
              p.display_cover_url = await resolveProjectCoverUrl(p);
            } catch {
              p.display_cover_url = p.cover_url || null;
            }
          }

          return mapped;
        } else if (error) {
          console.error('[Supabase Error] Failed to fetch all projects:', error.message);
        }
      } catch (err: any) {
        console.error('[Supabase Exception] Failed to query projects:', err?.message || err);
      }
    }

    const store = getLocalStore();
    return store.projects.map((p) => {
      const projAssets = store.assets.filter((a) => a.project_id === p.id);
      const commentsCount = projAssets.reduce((sum, a) => sum + (a.comments?.length || 0), 0);
      const approvalsCount = projAssets.reduce(
        (sum, a) => sum + (a.approvals?.filter((app) => app.approved)?.length || 0),
        0
      );

      return {
        ...p,
        project_code: p.project_code || 'MDS-2026-000',
        status: p.status || (p.is_archived ? 'archived' : 'new'),
        show_progress: p.show_progress ?? true,
        allow_feedback: p.allow_feedback ?? true,
        display_cover_url: p.cover_url,
        file_count: projAssets.length,
        comments_count: commentsCount,
        approvals_count: approvalsCount,
      };
    });
  },

  async getRecentStudioNotifications(limit: number = 30): Promise<StudioNotification[]> {
    if (getDataMode() === 'supabase') {
      const supabase = getServerSupabase();
      if (!supabase) return [];

      // 1. Fetch recent comments
      const { data: commentsData } = await supabase
        .from('comments')
        .select(`
          id,
          body,
          author_name,
          timestamp_seconds,
          created_at,
          asset_id,
          assets (
            id,
            title,
            thumbnail_url,
            file_type,
            file_url,
            project_id,
            projects (
              id,
              title,
              cover_url
            )
          )
        `)
        .order('created_at', { ascending: false })
        .limit(limit);

      // 2. Fetch recent approvals (where approved = true)
      const { data: approvalsData } = await supabase
        .from('approvals')
        .select(`
          id,
          viewer_name,
          approved,
          created_at,
          updated_at,
          asset_id,
          assets (
            id,
            title,
            thumbnail_url,
            file_type,
            file_url,
            project_id,
            projects (
              id,
              title,
              cover_url
            )
          )
        `)
        .eq('approved', true)
        .order('updated_at', { ascending: false })
        .limit(limit);

      const notifications: StudioNotification[] = [];

      for (const c of commentsData || []) {
        const asset = (c.assets as any);
        const project = (asset?.projects as any);
        if (asset && project) {
          const thumbUrl = (asset.thumbnail_url?.includes('googleusercontent.com') || asset.file_url?.includes('/api/media/'))
            ? `/api/media/${asset.id}?type=thumbnail`
            : (asset.thumbnail_url || (asset.file_type === 'image' ? asset.file_url : null));

          notifications.push({
            id: `comment_${c.id}`,
            type: 'comment',
            project_id: project.id,
            project_title: project.title,
            project_cover_url: project.cover_url || null,
            asset_id: asset.id,
            asset_title: asset.title,
            asset_thumbnail_url: thumbUrl,
            client_name: c.author_name || 'عميل',
            content: c.body,
            timestamp_seconds: c.timestamp_seconds ?? null,
            created_at: c.created_at,
          });
        }
      }

      for (const a of approvalsData || []) {
        const asset = (a.assets as any);
        const project = (asset?.projects as any);
        if (asset && project) {
          const thumbUrl = (asset.thumbnail_url?.includes('googleusercontent.com') || asset.file_url?.includes('/api/media/'))
            ? `/api/media/${asset.id}?type=thumbnail`
            : (asset.thumbnail_url || (asset.file_type === 'image' ? asset.file_url : null));

          notifications.push({
            id: `approval_${a.id}`,
            type: 'approval',
            project_id: project.id,
            project_title: project.title,
            project_cover_url: project.cover_url || null,
            asset_id: asset.id,
            asset_title: asset.title,
            asset_thumbnail_url: thumbUrl,
            client_name: a.viewer_name || 'عميل',
            content: 'تم اعتماد هذا الملف بنجاح',
            timestamp_seconds: null,
            created_at: a.updated_at || a.created_at,
          });
        }
      }

      // Resolve display cover URLs for notifications
      for (const n of notifications) {
        if (n.project_cover_url && !n.project_cover_url.startsWith('http')) {
          n.project_cover_url = await resolveProjectCoverUrl({ id: n.project_id, cover_url: n.project_cover_url } as Project);
        }
      }

      notifications.sort((x, y) => new Date(y.created_at).getTime() - new Date(x.created_at).getTime());
      return notifications.slice(0, limit);
    }

    // Demo Mode
    const store = getLocalStore();
    const notifications: StudioNotification[] = [];

    for (const asset of store.assets) {
      const project = store.projects.find((p) => p.id === asset.project_id);
      if (!project) continue;

      for (const c of asset.comments || []) {
        notifications.push({
          id: `comment_${c.id}`,
          type: 'comment',
          project_id: project.id,
          project_title: project.title,
          project_cover_url: project.cover_url,
          asset_id: asset.id,
          asset_title: asset.title,
          asset_thumbnail_url: asset.thumbnail_url || asset.file_url,
          client_name: c.author_name,
          content: c.body,
          timestamp_seconds: c.timestamp_seconds,
          created_at: c.created_at,
        });
      }

      for (const app of asset.approvals || []) {
        if (!app.approved) continue;
        notifications.push({
          id: `approval_${app.id}`,
          type: 'approval',
          project_id: project.id,
          project_title: project.title,
          project_cover_url: project.cover_url,
          asset_id: asset.id,
          asset_title: asset.title,
          asset_thumbnail_url: asset.thumbnail_url || asset.file_url,
          client_name: app.viewer_name,
          content: 'تم اعتماد هذا الملف بنجاح',
          timestamp_seconds: null,
          created_at: app.updated_at || app.created_at,
        });
      }
    }

    notifications.sort((x, y) => new Date(y.created_at).getTime() - new Date(x.created_at).getTime());
    return notifications.slice(0, limit);
  },

  async getProjectById(id: string): Promise<Project | null> {
    const supabase = getServerSupabase();
    if (supabase) {
      try {
        const { data, error } = await supabase.from('projects').select('*').eq('id', id).maybeSingle();
        if (!error && data) {
          const proj = data as Project;
          const localSettings = getProjectSettingsMap();
          hydrateProjectSettings(proj, localSettings);
          try {
            proj.display_cover_url = await resolveProjectCoverUrl(proj);
          } catch {
            proj.display_cover_url = proj.cover_url || null;
          }
          return proj;
        } else if (error) {
          console.error(`[Supabase Error] Failed to fetch project ${id}:`, error.message);
        }
      } catch (err: any) {
        console.error(`[Supabase Exception] Failed to query project ${id}:`, err?.message || err);
      }
    }

    const store = getLocalStore();
    const found = store.projects.find((p) => p.id === id);
    if (!found) return null;
    return {
      ...found,
      project_code: found.project_code || 'MDS-2026-000',
      status: found.status || (found.is_archived ? 'archived' : 'new'),
      show_progress: found.show_progress ?? true,
      allow_feedback: found.allow_feedback ?? true,
      display_cover_url: found.cover_url,
    };
  },

  async createProject(data: Partial<Project>): Promise<Project> {
    normalizeProjectCoverData(data);
    const showProgress = data.show_progress !== undefined ? Boolean(data.show_progress) : true;
    const allowFeedback = data.allow_feedback !== undefined ? Boolean(data.allow_feedback) : true;

    // Validate and resolve project status
    let initialStatus: ProjectStatus = 'new';
    if (data.status) {
      if (!isValidProjectStatus(data.status)) {
        throw new Error(`حالة المشروع غير صالحة: '${data.status}'. الحالات المسموحة: ${VALID_PROJECT_STATUSES.join(', ')}`);
      }
      initialStatus = data.status;
    } else if (data.is_archived) {
      initialStatus = 'archived';
    }

    const isArchived = initialStatus === 'archived' ? true : Boolean(data.is_archived ?? false);

    // Concurrency-safe atomic project_code generation
    const currentYear = new Date().getFullYear();
    const projectCode = data.project_code?.trim() || (await generateNextProjectCode(currentYear));

    if (getDataMode() === 'supabase') {
      const supabase = getServerSupabase();
      if (supabase) {
        try {
          const insertPayload: Record<string, any> = {
            project_code: projectCode,
            status: initialStatus,
            title: data.title || 'مشروع جديد',
            description: data.description || null,
            cover_url: data.cover_url ?? null,
            cover_storage_path: data.cover_storage_path ?? null,
            category: data.category || null,
            progress: Math.min(100, Math.max(0, Number(data.progress || 0))),
            show_progress: showProgress,
            allow_feedback: allowFeedback,
            is_visible: data.is_visible ?? true,
            is_archived: isArchived,
          };
          if (data.id) insertPayload.id = data.id;

          const { data: resData, error: resErr } = await supabase
            .from('projects')
            .insert(insertPayload)
            .select()
            .single();

          if (!resErr && resData) {
            reportSupabaseSuccess();
            const localSettings = getProjectSettingsMap();
            hydrateProjectSettings(resData, localSettings);
            return {
              ...resData,
              project_code: resData.project_code || projectCode,
              status: resData.status || initialStatus,
            };
          } else if (resErr) {
            reportSupabaseFailure(resErr);
            console.warn('[Supabase Warning] createProject failed, falling back to local store:', resErr.message);
          }
        } catch (err: any) {
          reportSupabaseFailure(err);
          console.warn('[Supabase Exception] createProject failed, falling back to local store:', err?.message || err);
        }
      }
    }

    const store = getLocalStore();
    const newProj: Project = {
      id: data.id || crypto.randomUUID(),
      project_code: projectCode,
      status: initialStatus,
      title: data.title || 'مشروع جديد',
      description: data.description || null,
      cover_url: data.cover_url ?? null,
      cover_storage_path: data.cover_storage_path ?? null,
      drive_folder_id: data.drive_folder_id ?? null,
      drive_cover_file_id: data.drive_cover_file_id ?? null,
      category: data.category || null,
      progress: Math.min(100, Math.max(0, Number(data.progress || 0))),
      show_progress: showProgress,
      allow_feedback: allowFeedback,
      is_visible: data.is_visible ?? true,
      is_archived: isArchived,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      file_count: 0,
    };
    store.projects.unshift(newProj);
    saveLocalStore(store);
    return newProj;
  },

  async updateProject(id: string, data: Partial<Project>): Promise<Project | null> {
    normalizeProjectCoverData(data);

    // Enforce immutability of project_code
    delete (data as any).project_code;

    // Validate status if provided
    if (data.status !== undefined) {
      if (!isValidProjectStatus(data.status)) {
        throw new Error(`حالة المشروع غير صالحة: '${data.status}'. الحالات المسموحة: ${VALID_PROJECT_STATUSES.join(', ')}`);
      }
      if (data.status === 'archived') {
        data.is_archived = true;
      } else if (data.is_archived === undefined) {
        data.is_archived = false;
      }
    } else if (data.is_archived !== undefined) {
      if (data.is_archived) {
        data.status = 'archived';
      }
    }

    if (getDataMode() === 'supabase') {
      const supabase = getServerSupabase();
      if (supabase) {
        try {
          const updatePayload: Record<string, any> = {
            ...data,
            updated_at: new Date().toISOString(),
          };
          delete updatePayload.project_code; // Enforce immutability
          if (data.cover_url !== undefined) updatePayload.cover_url = data.cover_url;
          if (data.cover_storage_path !== undefined) updatePayload.cover_storage_path = data.cover_storage_path;

          const { data: resData, error: resErr } = await supabase
            .from('projects')
            .update(updatePayload)
            .eq('id', id)
            .select()
            .maybeSingle();

          if (!resErr && resData) {
            reportSupabaseSuccess();
            const localMap = getProjectSettingsMap();
            hydrateProjectSettings(resData, localMap);
            return resData;
          } else if (resErr) {
            reportSupabaseFailure(resErr);
            console.warn('[Supabase Warning] updateProject failed, falling back to local store:', resErr.message);
          }
        } catch (err: any) {
          reportSupabaseFailure(err);
          console.warn('[Supabase Exception] updateProject failed, falling back to local store:', err?.message || err);
        }
      }
    }

    const store = getLocalStore();
    const idx = store.projects.findIndex((p) => p.id === id);
    if (idx < 0) return null;

    const current = store.projects[idx];
    const nextStatus = data.status ?? (data.is_archived ? 'archived' : (current.status ?? 'new'));
    const nextIsArchived = data.is_archived ?? (nextStatus === 'archived');

    store.projects[idx] = {
      ...current,
      ...data,
      project_code: current.project_code, // strictly preserved / immutable
      status: nextStatus,
      is_archived: nextIsArchived,
      allow_feedback: data.allow_feedback !== undefined ? Boolean(data.allow_feedback) : (current.allow_feedback ?? true),
      updated_at: new Date().toISOString(),
    };
    saveLocalStore(store);
    return store.projects[idx];
  },

  /**
   * Atomically claims or assigns a Google Drive folder ID to a project.
   * Uses Compare-And-Set (CAS) to prevent race conditions when concurrent uploads initialize.
   * If drive_folder_id is already set, returns { claimed: false, folderId: existingId }.
   * If claimed successfully, returns { claimed: true, folderId: candidateFolderId }.
   */
  async claimProjectDriveFolder(
    projectId: string,
    candidateFolderId: string
  ): Promise<{ claimed: boolean; folderId: string }> {
    const cleanCandidate = candidateFolderId.trim();

    if (getDataMode() === 'supabase') {
      const supabase = getServerSupabase();
      if (supabase) {
        try {
          // Compare-And-Set: Only update if drive_folder_id is NULL
          const { data, error } = await supabase
            .from('projects')
            .update({
              drive_folder_id: cleanCandidate,
              updated_at: new Date().toISOString(),
            })
            .eq('id', projectId)
            .is('drive_folder_id', null)
            .select('id, drive_folder_id')
            .maybeSingle();

          if (!error && data?.drive_folder_id) {
            reportSupabaseSuccess();
            return { claimed: true, folderId: data.drive_folder_id };
          }

          // If no row updated, someone else already claimed it or it was not null
          const fresh = await this.getProjectById(projectId);
          if (fresh?.drive_folder_id) {
            return { claimed: false, folderId: fresh.drive_folder_id };
          }
        } catch (err: any) {
          reportSupabaseFailure(err);
          console.warn('[Supabase Warning] claimProjectDriveFolder failed, falling back to local store:', err?.message || err);
        }
      }
    }

    const store = getLocalStore();
    const idx = store.projects.findIndex((p) => p.id === projectId);
    if (idx < 0) {
      throw new Error(`Project ${projectId} not found`);
    }

    const project = store.projects[idx];
    if (!project.drive_folder_id || project.drive_folder_id.trim() === '') {
      project.drive_folder_id = cleanCandidate;
      project.updated_at = new Date().toISOString();
      saveLocalStore(store);
      return { claimed: true, folderId: cleanCandidate };
    }

    return { claimed: false, folderId: project.drive_folder_id };
  },

  async deleteProject(id: string): Promise<boolean> {
    const supabase = getServerSupabase();
    let projectDriveFolderId: string | null = null;
    let projectCoverDriveFileId: string | null = null;
    const assetDriveFileIds: string[] = [];
    const assetIds: string[] = [];
    const pathsToDelete: string[] = [];

    if (supabase) {
      try {
        const { data: project } = await supabase
          .from('projects')
          .select('id, title, cover_storage_path, cover_url, drive_folder_id, drive_cover_file_id')
          .eq('id', id)
          .maybeSingle();

        if (project) {
          if (project.drive_folder_id) projectDriveFolderId = project.drive_folder_id;
          if (project.drive_cover_file_id) projectCoverDriveFileId = project.drive_cover_file_id;
          if (project.cover_storage_path) pathsToDelete.push(project.cover_storage_path);
        }

        const { data: assets } = await supabase
          .from('assets')
          .select('id, drive_file_id, storage_path, thumbnail_storage_path, thumbnail_url')
          .eq('project_id', id);

        if (assets && assets.length > 0) {
          for (const a of assets) {
            assetIds.push(a.id);
            if (a.drive_file_id) assetDriveFileIds.push(a.drive_file_id);
            if (a.storage_path) pathsToDelete.push(a.storage_path);
            if (a.thumbnail_storage_path) pathsToDelete.push(a.thumbnail_storage_path);
          }
        }
      } catch (err: any) {
        console.warn('[Supabase Exception] deleteProject querying items:', err?.message || err);
      }
    }

    // Also check local store & project settings map for fallback/hybrid IDs
    const store = getLocalStore();
    const localProj = store.projects.find((p) => p.id === id);
    if (localProj) {
      if (!projectDriveFolderId && localProj.drive_folder_id) projectDriveFolderId = localProj.drive_folder_id;
      if (!projectCoverDriveFileId && localProj.drive_cover_file_id) projectCoverDriveFileId = localProj.drive_cover_file_id;
      if (localProj.cover_storage_path) pathsToDelete.push(localProj.cover_storage_path);
    }
    const projectSettings = getProjectSettingsMap()[id];
    if (projectSettings) {
      if (!projectDriveFolderId && projectSettings.drive_folder_id) projectDriveFolderId = projectSettings.drive_folder_id;
      if (!projectCoverDriveFileId && projectSettings.drive_cover_file_id) projectCoverDriveFileId = projectSettings.drive_cover_file_id;
    }

    const localAssets = store.assets.filter((a) => a.project_id === id);
    for (const la of localAssets) {
      if (!assetIds.includes(la.id)) assetIds.push(la.id);
      if (la.drive_file_id && !assetDriveFileIds.includes(la.drive_file_id)) assetDriveFileIds.push(la.drive_file_id);
      if (la.storage_path) pathsToDelete.push(la.storage_path);
      if (la.thumbnail_storage_path) pathsToDelete.push(la.thumbnail_storage_path);
    }

    const driveMap = getAssetDriveMap();
    for (const [aId, dMap] of Object.entries(driveMap)) {
      if (assetIds.includes(aId) && dMap.drive_file_id && !assetDriveFileIds.includes(dMap.drive_file_id)) {
        assetDriveFileIds.push(dMap.drive_file_id);
      }
    }

    // 1. Delete associated files from Google Drive (resilient: 404 treated as success, errors caught)
    for (const driveFileId of assetDriveFileIds) {
      try {
        await deleteDriveFileOrFolder(driveFileId);
      } catch (e: any) {
        console.warn(`[Drive Error] Failed to delete asset drive file ${driveFileId}:`, e?.message || e);
      }
    }

    if (projectCoverDriveFileId) {
      try {
        await deleteDriveFileOrFolder(projectCoverDriveFileId);
      } catch (e: any) {
        console.warn(`[Drive Error] Failed to delete cover drive file ${projectCoverDriveFileId}:`, e?.message || e);
      }
    }

    // Project folder deletion with safety guard:
    // Ensure it is NOT shared with ANY OTHER project in Supabase or localStore
    if (projectDriveFolderId) {
      let isSharedFolder = false;
      if (supabase) {
        try {
          const { data: shared } = await supabase
            .from('projects')
            .select('id')
            .eq('drive_folder_id', projectDriveFolderId)
            .neq('id', id)
            .limit(1);
          if (shared && shared.length > 0) {
            isSharedFolder = true;
          }
        } catch {
          // ignore
        }
      }
      if (!isSharedFolder) {
        if (store.projects.some((p) => p.id !== id && p.drive_folder_id === projectDriveFolderId)) {
          isSharedFolder = true;
        }
      }

      if (!isSharedFolder) {
        try {
          await deleteDriveFileOrFolder(projectDriveFolderId, { isFolder: true });
        } catch (e: any) {
          console.warn(`[Drive Error] Failed to delete project folder ${projectDriveFolderId}:`, e?.message || e);
        }
      } else {
        console.log(`[Drive Safety] Skipping folder ${projectDriveFolderId} deletion as it is shared by other projects.`);
      }
    }

    // Delete Supabase storage objects if any
    if (supabase && pathsToDelete.length > 0) {
      try {
        await supabase.storage.from('media-studio-assets').remove(pathsToDelete);
      } catch {
        // ignore
      }
    }

    // 2. Ordered Database Cleanup in Supabase:
    // approvals -> comments -> assets -> access_link_projects -> projects
    if (supabase) {
      try {
        if (assetIds.length > 0) {
          // 1. approvals
          try {
            await supabase.from('approvals').delete().in('asset_id', assetIds);
          } catch (e) {
            console.warn('[Supabase Cleanup] Failed deleting approvals:', e);
          }

          // 2. comments
          try {
            await supabase.from('comments').delete().in('asset_id', assetIds);
          } catch (e) {
            console.warn('[Supabase Cleanup] Failed deleting comments:', e);
          }

          // 3. assets
          try {
            await supabase.from('assets').delete().eq('project_id', id);
          } catch (e) {
            console.warn('[Supabase Cleanup] Failed deleting assets:', e);
          }
        }

        // 4. access_link_projects
        try {
          await supabase.from('access_link_projects').delete().eq('project_id', id);
        } catch (e) {
          console.warn('[Supabase Cleanup] Failed deleting access_link_projects:', e);
        }

        // 5. projects
        const { error: delErr } = await supabase.from('projects').delete().eq('id', id);
        if (!delErr) {
          reportSupabaseSuccess();
        } else {
          reportSupabaseFailure(delErr);
          console.warn('[Supabase Warning] deleteProject failed:', delErr.message);
        }
      } catch (err: any) {
        reportSupabaseFailure(err);
        console.warn('[Supabase Exception] deleteProject:', err?.message || err);
      }
    }

    // Clean localStore & maps
    store.projects = store.projects.filter((p) => p.id !== id);
    store.assets = store.assets.filter((a) => a.project_id !== id);
    if (assetIds.length > 0) {
      store.comments = store.comments.filter((c) => !assetIds.includes(c.asset_id));
      store.approvals = store.approvals.filter((app) => !assetIds.includes(app.asset_id));
    }
    store.access_links.forEach((link) => {
      link.project_ids = (link.project_ids || []).filter((pId) => pId !== id);
    });
    saveLocalStore(store);

    for (const aId of assetIds) {
      removeAssetDriveMapping(aId);
    }

    return true;
  },

  async deleteProjectsBatch(projectIds: string[]): Promise<{
    success: boolean;
    deletedCount: number;
    totalAssetsDeleted: number;
    failedIds: string[];
  }> {
    const uniqueIds = Array.from(new Set(projectIds.filter((p) => typeof p === 'string' && p.trim())));
    let deletedCount = 0;
    let totalAssetsDeleted = 0;
    const failedIds: string[] = [];

    for (const id of uniqueIds) {
      try {
        const assets = await this.getAssetsForProject(id, false).catch(() => []);
        const assetCount = assets.length;

        const ok = await this.deleteProject(id);
        if (ok) {
          deletedCount++;
          totalAssetsDeleted += assetCount;
        } else {
          failedIds.push(id);
        }
      } catch (err) {
        console.error(`Error deleting project ${id} in batch:`, err);
        failedIds.push(id);
      }
    }

    return {
      success: failedIds.length === 0,
      deletedCount,
      totalAssetsDeleted,
      failedIds,
    };
  },

  // -------------------------------------------------------------
  // Admin Asset Management
  // -------------------------------------------------------------

  async getAssetByDriveFileId(driveFileId: string): Promise<Asset | null> {
    const supabase = getServerSupabase();
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('assets')
          .select('*')
          .eq('drive_file_id', driveFileId)
          .maybeSingle();

        if (!error && data) {
          const driveMap = getAssetDriveMap();
          hydrateAssetDrive(data, driveMap);
          return data;
        }
        if (error && error.code !== '42703' && error.code !== 'PGRST204' && !error.message?.includes('drive_file_id') && !error.message?.includes('schema cache')) {
          throw new Error(`DB_ERROR: Failed to fetch asset by Drive file ID: ${error.message}`);
        }
      } catch (e: any) {
        if (!e.message?.includes('drive_file_id') && !e.message?.includes('schema cache')) {
          throw e;
        }
      }

      // Check local drive map fallback
      const driveMap = getAssetDriveMap();
      for (const [assetId, map] of Object.entries(driveMap)) {
        if (map.drive_file_id === driveFileId) {
          const asset = await this.getAssetById(assetId);
          if (asset) return asset;
        }
      }
      return null;
    }

    const store = getLocalStore();
    return store.assets.find((a) => a.drive_file_id === driveFileId) || null;
  },

  async createAsset(data: Partial<Asset>): Promise<Asset> {
    const supabase = getServerSupabase();
    if (supabase) {
      try {
        const payload: Record<string, unknown> = {
          project_id: data.project_id,
          title: data.title || 'ملف جديد',
          file_url: data.file_url,
          thumbnail_url: data.thumbnail_url || null,
          thumbnail_storage_path: data.thumbnail_storage_path || null,
          file_type: data.file_type || 'file',
          mime_type: data.mime_type || null,
          file_size: data.file_size || null,
          duration_seconds: data.duration_seconds || null,
          version: data.version || 'V1',
          sort_order: data.sort_order || 0,
          is_visible: data.is_visible ?? true,
          original_filename: data.original_filename || null,
          storage_path: data.storage_path || null,
          drive_file_id: data.drive_file_id || null,
          drive_folder_id: data.drive_folder_id || null,
          source: data.source || (data.drive_file_id ? 'drive' : (data.storage_path ? 'legacy' : 'demo')),
        };
        if (data.id) {
          payload.id = data.id;
        }

        const { data: resCreated, error } = await supabase
          .from('assets')
          .insert(payload)
          .select()
          .single();

        if (!error && resCreated) {
          reportSupabaseSuccess();
          const driveMap = getAssetDriveMap();
          hydrateAssetDrive(resCreated, driveMap);
          return resCreated as Asset;
        } else if (error) {
          reportSupabaseFailure(error);
          console.warn('[Supabase Warning] createAsset failed, falling back to local store:', error.message);
        }
      } catch (err: any) {
        reportSupabaseFailure(err);
        console.warn('[Supabase Exception] createAsset failed, falling back to local store:', err?.message || err);
      }
    }

    const store = getLocalStore();
    if (data.drive_file_id) {
      const existing = store.assets.find((a) => a.drive_file_id === data.drive_file_id);
      if (existing) return existing;
    }
    const newAsset: Asset = {
      id: data.id || crypto.randomUUID(),
      project_id: data.project_id!,
      title: data.title || 'ملف جديد',
      file_url: data.file_url!,
      thumbnail_url: data.thumbnail_url || null,
      thumbnail_storage_path: data.thumbnail_storage_path || null,
      file_type: data.file_type || 'file',
      mime_type: data.mime_type || null,
      file_size: data.file_size || null,
      duration_seconds: data.duration_seconds || null,
      version: data.version || 'V1',
      sort_order: data.sort_order ?? store.assets.filter((a) => a.project_id === data.project_id).length + 1,
      is_visible: data.is_visible ?? true,
      original_filename: data.original_filename || null,
      storage_path: data.storage_path || null,
      drive_file_id: data.drive_file_id || null,
      drive_folder_id: data.drive_folder_id || null,
      source: data.source || (data.drive_file_id ? 'drive' : (data.storage_path ? 'legacy' : 'demo')),
      created_at: new Date().toISOString(),
    };
    store.assets.push(newAsset);
    saveLocalStore(store);
    return newAsset;
  },

  async updateAsset(id: string, data: Partial<Asset>): Promise<Asset | null> {
    const supabase = getServerSupabase();
    if (supabase) {
      try {
        const updatePayload: Record<string, any> = { ...data };
        const { data: resUpdated, error } = await supabase
          .from('assets')
          .update(updatePayload)
          .eq('id', id)
          .select()
          .maybeSingle();

        if (!error && resUpdated) {
          reportSupabaseSuccess();
          const driveMap = getAssetDriveMap();
          hydrateAssetDrive(resUpdated, driveMap);
          return resUpdated as Asset;
        } else if (error) {
          reportSupabaseFailure(error);
          console.warn('[Supabase Warning] updateAsset failed, falling back to local store:', error.message);
        }
      } catch (err: any) {
        reportSupabaseFailure(err);
        console.warn('[Supabase Exception] updateAsset failed, falling back to local store:', err?.message || err);
      }
    }

    const store = getLocalStore();
    const idx = store.assets.findIndex((a) => a.id === id);
    if (idx < 0) return null;

    store.assets[idx] = {
      ...store.assets[idx],
      ...data,
    };
    saveLocalStore(store);
    return store.assets[idx];
  },

  async deleteAsset(id: string): Promise<boolean> {
    const supabase = getServerSupabase();
    if (supabase) {
      try {
        const { data: asset } = await supabase
          .from('assets')
          .select('storage_path, thumbnail_storage_path, thumbnail_url')
          .eq('id', id)
          .maybeSingle();

        if (asset) {
          const pathsToDelete: string[] = [];
          if (asset.storage_path) pathsToDelete.push(asset.storage_path);
          if (asset.thumbnail_storage_path) pathsToDelete.push(asset.thumbnail_storage_path);
          if (pathsToDelete.length > 0) {
            try {
              await supabase.storage.from('media-studio-assets').remove(pathsToDelete);
            } catch {
              // ignore
            }
          }
        }

        // Clean dependent approvals and comments first
        try {
          await supabase.from('approvals').delete().eq('asset_id', id);
        } catch {
          // ignore
        }
        try {
          await supabase.from('comments').delete().eq('asset_id', id);
        } catch {
          // ignore
        }

        const { error: delErr } = await supabase.from('assets').delete().eq('id', id);
        if (!delErr) {
          reportSupabaseSuccess();
          const store = getLocalStore();
          store.assets = store.assets.filter((a) => a.id !== id);
          store.comments = store.comments.filter((c) => c.asset_id !== id);
          store.approvals = store.approvals.filter((app) => app.asset_id !== id);
          saveLocalStore(store);
          removeAssetDriveMapping(id);
          return true;
        } else {
          reportSupabaseFailure(delErr);
          console.warn('[Supabase Warning] deleteAsset failed:', delErr.message);
        }
      } catch (err: any) {
        reportSupabaseFailure(err);
        console.warn('[Supabase Exception] deleteAsset:', err?.message || err);
      }
    }

    const store = getLocalStore();
    store.assets = store.assets.filter((a) => a.id !== id);
    store.comments = store.comments.filter((c) => c.asset_id !== id);
    store.approvals = store.approvals.filter((app) => app.asset_id !== id);
    saveLocalStore(store);
    removeAssetDriveMapping(id);
    return true;
  },

  async reorderAssets(orderedIds: string[]): Promise<boolean> {
    const supabase = getServerSupabase();
    if (supabase) {
      try {
        for (let i = 0; i < orderedIds.length; i++) {
          await supabase.from('assets').update({ sort_order: i + 1 }).eq('id', orderedIds[i]);
        }
        reportSupabaseSuccess();
      } catch (err: any) {
        reportSupabaseFailure(err);
        console.warn('[Supabase Exception] reorderAssets:', err?.message || err);
      }
    }

    const store = getLocalStore();
    orderedIds.forEach((id, index) => {
      const a = store.assets.find((item) => item.id === id);
      if (a) a.sort_order = index + 1;
    });
    store.assets.sort((a, b) => a.sort_order - b.sort_order);
    saveLocalStore(store);
    return true;
  },

  // -------------------------------------------------------------
  // Admin Client Access Link Management
  // -------------------------------------------------------------

  async getAllAccessLinks(): Promise<(AccessLink & { project_ids: string[] })[]> {
    const supabase = getServerSupabase();
    if (supabase) {
      try {
        let { data, error } = await supabase
          .from('access_links')
          .select('id, viewer_name, slug, password_hash, password_plain, enabled, session_version, created_at, access_link_projects(project_id)')
          .order('created_at', { ascending: false });

        // Fallback if password_plain column is not yet present on remote DB
        if (error && (error.code === '42703' || error.message?.includes('password_plain') || error.message?.includes('schema cache'))) {
          const fallbackRes = await supabase
            .from('access_links')
            .select('id, viewer_name, slug, password_hash, enabled, session_version, created_at, access_link_projects(project_id)')
            .order('created_at', { ascending: false });
          data = fallbackRes.data as any;
          error = fallbackRes.error;
        }

        if (!error && data) {
          const localPasswords = getLinkPasswordsMap();
          return (data || []).map((link: any) => ({
            id: link.id,
            viewer_name: link.viewer_name,
            slug: link.slug,
            password_hash: '', // Never leak password hash to admin view
            password_plain: link.password_plain || localPasswords[link.id] || null,
            has_password: Boolean(link.password_hash && link.password_hash.trim() !== '' && link.password_hash !== 'NO_PASSWORD'),
            enabled: link.enabled,
            session_version: link.session_version ?? 1,
            created_at: link.created_at,
            project_ids: link.access_link_projects?.map((alp: { project_id: string }) => alp.project_id) || [],
          }));
        } else if (error) {
          console.error('[Supabase Error] Failed to fetch access links:', error.message);
        }
      } catch (err: any) {
        console.error('[Supabase Exception] Failed to query access links:', err?.message || err);
      }
    }

    const store = getLocalStore();
    return store.access_links.map((l) => ({
      ...l,
      password_hash: '', // Never leak password hash
      password_plain: l.password_plain || null,
      has_password: Boolean(l.password_hash && l.password_hash.trim() !== '' && l.password_hash !== 'NO_PASSWORD'),
    }));
  },

  async createAccessLink(viewerName: string, passwordPlain: string, projectIds: string[]): Promise<AccessLink> {
    const slug = generateSlug(8);
    const hasPassword = Boolean(passwordPlain && passwordPlain.trim() !== '');
    const cleanPassword = hasPassword ? passwordPlain.trim() : null;
    const passwordHash = hasPassword ? await bcrypt.hash(cleanPassword!, 10) : '';

    const supabase = getServerSupabase();
    if (supabase) {
      try {
        const insertPayload: Record<string, unknown> = {
          viewer_name: viewerName,
          slug,
          password_hash: passwordHash,
          password_plain: cleanPassword,
          enabled: true,
          session_version: 1,
        };

        let { data: link, error } = await supabase
          .from('access_links')
          .insert(insertPayload)
          .select('id, viewer_name, slug, enabled, session_version, created_at')
          .single();

        // Graceful fallback if password_plain column is not yet applied on remote DB
        if (error && (error.code === '42703' || error.message?.includes('password_plain') || error.message?.includes('schema cache'))) {
          delete insertPayload.password_plain;
          const retryRes = await supabase
            .from('access_links')
            .insert(insertPayload)
            .select('id, viewer_name, slug, enabled, session_version, created_at')
            .single();
          link = retryRes.data;
          error = retryRes.error;
        }

        if (!error && link) {
          if (projectIds.length > 0) {
            const insertData = projectIds.map((pId) => ({
              access_link_id: link.id,
              project_id: pId,
            }));
            const { error: assignErr } = await supabase.from('access_link_projects').insert(insertData);
            if (assignErr) {
              console.warn('[Supabase Error] Assign projects to link failed:', assignErr.message);
            }
          }

          if (cleanPassword) {
            saveLinkPasswordLocal(link.id, cleanPassword);
          }

          return {
            ...link,
            password_hash: '',
            password_plain: cleanPassword,
            has_password: hasPassword,
            project_ids: projectIds,
          };
        } else {
          console.warn('[Supabase Warning] Failed to create access link via Supabase:', error?.message);
        }
      } catch (err: any) {
        console.warn('[Supabase Exception] Failed to create access link via Supabase:', err?.message || err);
      }
    }

    const store = getLocalStore();
    const newLink: AccessLink & { project_ids: string[] } = {
      id: crypto.randomUUID(),
      viewer_name: viewerName,
      slug,
      password_hash: passwordHash,
      password_plain: cleanPassword,
      enabled: true,
      session_version: 1,
      created_at: new Date().toISOString(),
      project_ids: projectIds,
    };
    store.access_links.unshift(newLink);
    saveLocalStore(store);

    return {
      ...newLink,
      password_hash: '',
      password_plain: cleanPassword,
      has_password: hasPassword,
    };
  },

  async updateAccessLink(
    id: string,
    data: { viewerName?: string; passwordPlain?: string; projectIds?: string[]; enabled?: boolean; removePassword?: boolean }
  ): Promise<boolean> {
    const supabase = getServerSupabase();
    if (supabase) {
      try {
        let passwordHash: string | null = null;
        let incrementSessionVersion = false;

        if (data.removePassword) {
          passwordHash = '';
          incrementSessionVersion = true;
        } else if (data.passwordPlain && data.passwordPlain.trim() !== '') {
          passwordHash = await bcrypt.hash(data.passwordPlain.trim(), 10);
          incrementSessionVersion = true;
        }

        // Execute strictly through atomic stored procedure (no unsafe manual rollbacks)
        const { error: rpcErr } = await supabase.rpc('update_access_link_atomic', {
          p_link_id: id,
          p_viewer_name: data.viewerName ?? null,
          p_password_hash: passwordHash,
          p_enabled: data.enabled ?? null,
          p_increment_session_version: incrementSessionVersion,
          p_project_ids: data.projectIds ?? null,
        });

        if (!rpcErr) {
          // Update password_plain safely (ignoring if column doesn't exist on remote DB yet)
          try {
            if (data.removePassword) {
              saveLinkPasswordLocal(id, null);
              const { error: plainErr } = await supabase.from('access_links').update({ password_plain: null }).eq('id', id);
              if (plainErr && plainErr.code !== '42703' && !plainErr.message?.includes('password_plain')) {
                console.warn('Could not clear password_plain:', plainErr.message);
              }
            } else if (data.passwordPlain && data.passwordPlain.trim() !== '') {
              saveLinkPasswordLocal(id, data.passwordPlain.trim());
              const { error: plainErr } = await supabase.from('access_links').update({ password_plain: data.passwordPlain.trim() }).eq('id', id);
              if (plainErr && plainErr.code !== '42703' && !plainErr.message?.includes('password_plain')) {
                console.warn('Could not update password_plain:', plainErr.message);
              }
            }
          } catch (colErr) {
            console.warn('Could not update password_plain (likely column not yet applied on remote DB):', colErr);
          }

          return true;
        }

        console.warn('[Supabase RPC Warning] Stored procedure update_access_link_atomic failed:', rpcErr.message);
      } catch (err: any) {
        console.warn('[Supabase Exception] Failed to update access link via Supabase:', err?.message || err);
      }
    }

    // Local Demo: Atomic clone-and-swap
    const store = getLocalStore();
    const idx = store.access_links.findIndex((l) => l.id === id);
    if (idx < 0) return false;

    const backup = JSON.parse(JSON.stringify(store)) as LocalStore;

    try {
      const link = store.access_links[idx];
      if (data.viewerName !== undefined) link.viewer_name = data.viewerName;
      if (data.enabled !== undefined) link.enabled = data.enabled;
      if (data.removePassword) {
        link.password_hash = '';
        link.password_plain = null;
        saveLinkPasswordLocal(id, null);
        link.session_version = (link.session_version ?? 1) + 1;
      } else if (data.passwordPlain && data.passwordPlain.trim() !== '') {
        link.password_hash = await bcrypt.hash(data.passwordPlain.trim(), 10);
        link.password_plain = data.passwordPlain.trim();
        saveLinkPasswordLocal(id, data.passwordPlain.trim());
        link.session_version = (link.session_version ?? 1) + 1;
      }
      if (data.projectIds) {
        // Enforce referential integrity: every assigned project must exist
        for (const pId of data.projectIds) {
          if (!store.projects.some((p) => p.id === pId)) {
            throw new Error(`ATOMIC_UPDATE_FAILED: Referenced project '${pId}' does not exist.`);
          }
        }
        link.project_ids = [...data.projectIds];
      }
      saveLocalStore(store);
      return true;
    } catch (err) {
      saveLocalStore(backup);
      throw err;
    }
  },

  async deleteAccessLink(id: string): Promise<boolean> {
    saveLinkPasswordLocal(id, null);
    const supabase = getServerSupabase();
    if (supabase) {
      try {
        const { error } = await supabase.from('access_links').delete().eq('id', id);
        if (!error) return true;
        console.warn('[Supabase Warning] Failed to delete link:', error.message);
      } catch (err: any) {
        console.warn('[Supabase Exception] Failed to delete link:', err?.message || err);
      }
    }

    const store = getLocalStore();
    store.access_links = store.access_links.filter((l) => l.id !== id);
    saveLocalStore(store);
    return true;
  },
};
