-- ==============================================================================
-- TV & Media Design Studio Showcase - Sample Seed Data
-- ==============================================================================

-- 1. Insert 6 Broadcast Projects
INSERT INTO projects (id, title, description, cover_url, category, progress, is_visible, is_archived)
VALUES
  (
    '00000000-0000-0000-0000-000000000001',
    'هوية القناة 2027',
    'تصميم وتطوير الهوية البصرية الشاملة للقناة التلفزيونية متضمنة الفواصل، شارة البداية، والعناصر التفاعلية ثلاثية الأبعاد.',
    'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?auto=format&fit=crop&w=1200&q=80',
    'هويات تلفزيونية',
    82,
    true,
    false
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'هوية الأخبار',
    'حزمة الجرافيك الإخباري المتكامل: استوديو افتراضي، شريط الأخبار العاجلة، وقوالب الخرائط والمخططات البيانية المتحركة.',
    'https://images.unsplash.com/photo-1585829365295-ab7cd400c167?auto=format&fit=crop&w=1200&q=80',
    'نشرات إخبارية',
    55,
    true,
    false
  ),
  (
    '00000000-0000-0000-0000-000000000003',
    'الملف السياسي',
    'موشن جرافيكس وهوية بصرية لبرنامج حواري سياسي أسبوعي مع مؤثرات سينمائية رقمية.',
    'https://images.unsplash.com/photo-1541872703-74c5e44368f9?auto=format&fit=crop&w=1200&q=80',
    'برامج حوارية',
    35,
    true,
    false
  ),
  (
    '00000000-0000-0000-0000-000000000004',
    'جرافيك 26 سبتمبر',
    'تغطية وطنية خاصة واحتفالية بذكرى 26 سبتمبر: شارات وثائقية وفواصل تلفزيونية مكتملة الإنتاج.',
    'https://images.unsplash.com/photo-1533130061792-64b345e4a833?auto=format&fit=crop&w=1200&q=80',
    'مناسبات وطنية',
    100,
    true,
    false
  ),
  (
    '00000000-0000-0000-0000-000000000005',
    'هوية رمضان',
    'تصاميم رمضانية بصرية أنيقة تشمل مقدمة الإفطار، فواصل الإمساكية، وتنسيقات جدول البرامج الرمضاني.',
    'https://images.unsplash.com/photo-1564769625905-50e93615e769?auto=format&fit=crop&w=1200&q=80',
    'مواسم خاصة',
    68,
    true,
    false
  ),
  (
    '00000000-0000-0000-0000-000000000006',
    'لقاء خاص',
    'هوية برنامج المقابلات الشخصية الحصري لكبار الضيوف بتدرجات داكنة وإضاءات استوديو دافئة.',
    'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=1200&q=80',
    'مقابلات حصرية',
    20,
    true,
    false
  )
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  progress = EXCLUDED.progress;

-- 2. Insert Sample Assets for "هوية القناة 2027"
INSERT INTO assets (id, project_id, title, file_url, thumbnail_url, file_type, mime_type, file_size, duration_seconds, version, sort_order, is_visible)
VALUES
  (
    '10000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    'شارة البداية الرئيسية ثلاثية الأبعاد - Ident Main',
    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?auto=format&fit=crop&w=800&q=80',
    'video',
    'video/mp4',
    42800000,
    15,
    'V2',
    1,
    true
  ),
  (
    '10000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001',
    'شعار القناة ودليل الألوان والخطوط',
    'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=800&q=80',
    'image',
    'image/jpeg',
    3400000,
    NULL,
    'Final',
    2,
    true
  ),
  (
    '10000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000001',
    'فاصل الإعلانات الترويجي - Station Promo Bumper',
    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
    'https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=800&q=80',
    'video',
    'video/mp4',
    28400000,
    10,
    'V1',
    3,
    true
  ),
  (
    '10000000-0000-0000-0000-000000000004',
    '00000000-0000-0000-0000-000000000001',
    'ملفات المشروع والطبقات المفتوحة (After Effects & C4D)',
    'https://example.com/assets/channel-brand-package-2027.zip',
    'https://images.unsplash.com/photo-1626785774573-4b799315345d?auto=format&fit=crop&w=800&q=80',
    'file',
    'application/zip',
    124000000,
    NULL,
    'V1',
    4,
    true
  )
ON CONFLICT (id) DO NOTHING;

-- 3. Insert Sample Assets for "هوية الأخبار"
INSERT INTO assets (id, project_id, title, file_url, thumbnail_url, file_type, mime_type, file_size, duration_seconds, version, sort_order, is_visible)
VALUES
  (
    '20000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000002',
    'مقدمة نشرة الأخبار الرئيسية - Main News Intro',
    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    'https://images.unsplash.com/photo-1585829365295-ab7cd400c167?auto=format&fit=crop&w=800&q=80',
    'video',
    'video/mp4',
    31200000,
    12,
    'V2',
    1,
    true
  ),
  (
    '20000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000002',
    'شريط الأخبار العاجلة والقوالب التحتية (Lower Thirds)',
    'https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&w=800&q=80',
    'image',
    'image/jpeg',
    2100000,
    NULL,
    'V1',
    2,
    true
  )
ON CONFLICT (id) DO NOTHING;

-- 4. Sample Client Access Link: Ahmed with password "2580"
-- Pre-hashed with bcrypt (rounds=10) for "2580"
INSERT INTO access_links (id, viewer_name, slug, password_hash, enabled)
VALUES (
  '30000000-0000-0000-0000-000000000001',
  'أحمد',
  'x7K29AbC',
  '$2a$10$iT3pUv0a747wHqSgR/OtxOi4.lXoYVb4N7u3sF5eB8k4N/xQ7KjX2', -- bcrypt hash of '2580'
  true
)
ON CONFLICT (slug) DO NOTHING;

-- 5. Link Ahmed to projects
INSERT INTO access_link_projects (access_link_id, project_id)
VALUES
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002'),
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003'),
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000004'),
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000005'),
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000006')
ON CONFLICT DO NOTHING;

-- 6. Sample Comment and Approval
INSERT INTO comments (asset_id, access_link_id, author_name, body, timestamp_seconds)
VALUES
  ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'أحمد', 'الشعار يحتاج تكبير قليلاً في نهاية الشارة', 7),
  ('10000000-0000-0000-0000-000000000001', NULL, 'إدارة الاستوديو', 'تم تعديل النسخة واعتماد التوقيت الجديد', 10);

INSERT INTO approvals (asset_id, access_link_id, viewer_name, approved)
VALUES ('10000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', 'أحمد', true)
ON CONFLICT DO NOTHING;
