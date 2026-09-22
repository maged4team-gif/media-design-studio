import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const client = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

async function setupBucket() {
  console.log('Ensuring bucket media-studio-assets exists...');
  const { data: buckets } = await client.storage.listBuckets();
  const exists = buckets?.find(b => b.name === 'media-studio-assets');

  const allowedMimeTypes = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/svg+xml',
    'image/gif',
    'video/mp4',
    'video/quicktime',
    'video/webm',
    'application/pdf',
    'application/zip',
    'application/x-zip-compressed',
    'application/octet-stream'
  ];

  if (!exists) {
    // Note: Supabase Free plan has a hard limit of 50MB (52428800 bytes)
    const { data, error } = await client.storage.createBucket('media-studio-assets', {
      public: false,
      fileSizeLimit: 52428800, // 50 MB for free tier compatibility
      allowedMimeTypes
    });
    if (error) {
      console.error('Error creating bucket with 50MB limit:', error);
      // Fallback: create without explicit limit so it uses project max
      const fallback = await client.storage.createBucket('media-studio-assets', {
        public: false,
        allowedMimeTypes
      });
      console.log('Fallback bucket creation without fileSizeLimit:', fallback);
    } else {
      console.log('Successfully created bucket media-studio-assets:', data);
    }
  } else {
    console.log('Bucket exists, updating configuration...');
    const { data, error } = await client.storage.updateBucket('media-studio-assets', {
      public: false,
      fileSizeLimit: 524288000,
      allowedMimeTypes
    });
    if (error) {
      console.error('Error updating bucket:', error);
    } else {
      console.log('Successfully updated bucket media-studio-assets:', data);
    }
  }

  const { data: finalBuckets } = await client.storage.listBuckets();
  console.log('Current buckets:', finalBuckets);
}

setupBucket().catch(console.error);
