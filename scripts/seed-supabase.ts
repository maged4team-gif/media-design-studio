import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const client = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function seed() {
  console.log('Seeding Supabase database with broadcast studio showcase data...');

  const projects = [
    {
      id: '00000000-0000-0000-0000-000000000001',
      title: 'هوية القناة 2027',
      description: 'تصميم وتطوير الهوية البصرية الشاملة للقناة التلفزيونية متضمنة الفواصل، شارة البداية، والعناصر ثلاثية الأبعاد.',
      cover_url: 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?auto=format&fit=crop&w=1200&q=80',
      category: 'هويات تلفزيونية',
      progress: 82,
      is_visible: true,
      is_archived: false,
    },
    {
      id: '00000000-0000-0000-0000-000000000002',
      title: 'هوية الأخبار',
      description: 'حزمة الجرافيك الإخباري المتكامل: استوديو افتراضي، شريط الأخبار العاجلة، وقوالب المخططات البيانية المتحركة.',
      cover_url: 'https://images.unsplash.com/photo-1585829365295-ab7cd400c167?auto=format&fit=crop&w=1200&q=80',
      category: 'نشرات إخبارية',
      progress: 55,
      is_visible: true,
      is_archived: false,
    },
    {
      id: '00000000-0000-0000-0000-000000000003',
      title: 'الملف السياسي',
      description: 'موشن جرافيكس وهوية بصرية لبرنامج حواري سياسي أسبوعي مع مؤثرات سينمائية رقمية.',
      cover_url: 'https://images.unsplash.com/photo-1541872703-74c5e44368f9?auto=format&fit=crop&w=1200&q=80',
      category: 'برامج حوارية',
      progress: 35,
      is_visible: true,
      is_archived: false,
    },
    {
      id: '00000000-0000-0000-0000-000000000004',
      title: 'جرافيك 26 سبتمبر',
      description: 'تغطية وطنية خاصة واحتفالية بذكرى 26 سبتمبر: شارات وثائقية وفواصل تلفزيونية مكتملة الإنتاج.',
      cover_url: 'https://images.unsplash.com/photo-1533130061792-64b345e4a833?auto=format&fit=crop&w=1200&q=80',
      category: 'مناسبات وطنية',
      progress: 100,
      is_visible: true,
      is_archived: false,
    },
    {
      id: '00000000-0000-0000-0000-000000000005',
      title: 'هوية رمضان',
      description: 'تصاميم رمضانية بصرية أنيقة تشمل مقدمة الإفطار، فواصل الإمساكية، وتنسيقات جدول البرامج الرمضاني.',
      cover_url: 'https://images.unsplash.com/photo-1564769625905-50e93615e769?auto=format&fit=crop&w=1200&q=80',
      category: 'مواسم خاصة',
      progress: 68,
      is_visible: true,
      is_archived: false,
    },
    {
      id: '00000000-0000-0000-0000-000000000006',
      title: 'لقاء خاص',
      description: 'هوية برنامج المقابلات الشخصية الحصري لكبار الضيوف بتدرجات داكنة وإضاءات استوديو دافئة.',
      cover_url: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=1200&q=80',
      category: 'مقابلات حصرية',
      progress: 20,
      is_visible: true,
      is_archived: false,
    },
  ];

  for (const p of projects) {
    const { error } = await client.from('projects').upsert(p, { onConflict: 'id' });
    if (error) console.error(`Error inserting project ${p.title}:`, error);
  }
  console.log('✅ 6 Showcase Projects seeded.');

  type SeedAsset = {
    id: string;
    project_id: string;
    title: string;
    file_url: string;
    thumbnail_url: string | null;
    file_type: 'video' | 'image' | 'file';
    mime_type: string | null;
    file_size: number | null;
    duration_seconds: number | null;
    version: string | null;
    sort_order: number;
    is_visible: boolean;
    original_filename: string | null;
  };

  const assets: SeedAsset[] = [
    {
      id: '10000000-0000-0000-0000-000000000001',
      project_id: '00000000-0000-0000-0000-000000000001',
      title: 'شارة البداية الرئيسية ثلاثية الأبعاد - Ident Main',
      file_url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
      thumbnail_url: 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?auto=format&fit=crop&w=800&q=80',
      file_type: 'video',
      mime_type: 'video/mp4',
      file_size: 45200000,
      duration_seconds: 15,
      version: 'V2',
      sort_order: 1,
      is_visible: true,
      original_filename: 'ident_main_v2.mp4',
    },
    {
      id: '10000000-0000-0000-0000-000000000002',
      project_id: '00000000-0000-0000-0000-000000000001',
      title: 'دليل الهوية البصرية والقواعد الإرشادية - Brand Guidelines',
      file_url: 'https://example.com/channel-guidelines.pdf',
      thumbnail_url: 'https://images.unsplash.com/photo-1586281380349-632531db7ed4?auto=format&fit=crop&w=800&q=80',
      file_type: 'file',
      mime_type: 'application/pdf',
      file_size: 18500000,
      duration_seconds: null,
      version: 'Final',
      sort_order: 2,
      is_visible: true,
      original_filename: 'channel_guidelines_final.pdf',
    },
    {
      id: '10000000-0000-0000-0000-000000000003',
      project_id: '00000000-0000-0000-0000-000000000001',
      title: 'فاصل الإعلانات الترويجي - Station Promo Bumper',
      file_url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
      thumbnail_url: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=800&q=80',
      file_type: 'video',
      mime_type: 'video/mp4',
      file_size: 28400000,
      duration_seconds: 10,
      version: 'V1',
      sort_order: 3,
      is_visible: true,
      original_filename: 'promo_bumper.mp4',
    },
    {
      id: '20000000-0000-0000-0000-000000000001',
      project_id: '00000000-0000-0000-0000-000000000002',
      title: 'مقدمة نشرة الأخبار الرئيسية - Main News Intro',
      file_url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
      thumbnail_url: 'https://images.unsplash.com/photo-1585829365295-ab7cd400c167?auto=format&fit=crop&w=800&q=80',
      file_type: 'video',
      mime_type: 'video/mp4',
      file_size: 31200000,
      duration_seconds: 12,
      version: 'V2',
      sort_order: 1,
      is_visible: true,
      original_filename: 'news_intro.mp4',
    },
  ];

  for (const a of assets) {
    const { error } = await client.from('assets').upsert(a, { onConflict: 'id' });
    if (error) console.error(`Error inserting asset ${a.title}:`, error);
  }
  console.log('✅ Showcase Assets seeded.');

  // Seed Access Link: slug 'x7K29AbC', password '2580', client 'أحمد'
  const linkId = '30000000-0000-0000-0000-000000000001';
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash('2580', salt);

  const { error: linkErr } = await client.from('access_links').upsert({
    id: linkId,
    viewer_name: 'أحمد',
    slug: 'x7K29AbC',
    password_hash: passwordHash,
    enabled: true,
    session_version: 1,
  }, { onConflict: 'id' });
  if (linkErr) console.error('Error inserting access link:', linkErr);

  // Link projects to client
  for (const p of projects) {
    await client.from('access_link_projects').upsert({
      access_link_id: linkId,
      project_id: p.id,
    }, { onConflict: 'access_link_id,project_id' });
  }
  console.log('✅ Client Access Link seeded (Slug: x7K29AbC, Password: 2580, Client: أحمد).');

  // Seed comment
  await client.from('comments').upsert({
    id: '40000000-0000-0000-0000-000000000001',
    asset_id: '10000000-0000-0000-0000-000000000001',
    access_link_id: linkId,
    author_name: 'أحمد',
    body: 'الشعار يحتاج تكبير قليلاً في نهاية الشارة',
    timestamp_seconds: 7,
  }, { onConflict: 'id' });

  // Seed approval
  await client.from('approvals').upsert({
    id: '50000000-0000-0000-0000-000000000001',
    asset_id: '10000000-0000-0000-0000-000000000001',
    access_link_id: linkId,
    viewer_name: 'أحمد',
    approved: true,
  }, { onConflict: 'asset_id,access_link_id' });

  console.log('✅ Initial comments and approvals seeded.');
  console.log('🚀 Supabase Database ready for live testing!');
}

seed().catch(console.error);
