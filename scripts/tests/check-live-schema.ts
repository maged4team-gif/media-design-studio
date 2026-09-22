import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const client = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

async function main() {
  console.log('Connecting to live Supabase:', supabaseUrl);

  const tables = [
    'projects',
    'assets',
    'access_links',
    'access_link_projects',
    'approvals',
    'comments',
    'pending_storage_cleanups'
  ];

  for (const table of tables) {
    const { error, count } = await client.from(table).select('*', { count: 'exact', head: true });
    if (error) {
      console.log(`❌ Table [${table}]: ERROR ${error.code} - ${error.message}`);
    } else {
      console.log(`✅ Table [${table}]: OK (count: ${count ?? 0})`);
    }
  }

  // Check Storage Buckets
  const { data: buckets, error: bErr } = await client.storage.listBuckets();
  if (bErr) {
    console.log(`❌ Storage Buckets: ERROR ${bErr.message}`);
  } else {
    console.log('✅ Storage Buckets detected:', buckets?.map(b => `${b.name} (public: ${b.public}, limit: ${b.file_size_limit})`));
  }
}

main().catch(console.error);
