import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

async function run() {
  const { data: projs, error: pErr } = await supabase
    .from('projects')
    .select('id, title, progress, allow_feedback, is_visible, is_archived');
  if (pErr) console.error('Error fetching projects:', pErr);
  else {
    console.log(`LIVE PROJECTS IN SUPABASE (count: ${projs.length}):`);
    projs.forEach((p, i) => {
      console.log(`[${i+1}] ${p.id} | ${p.title} | progress: ${p.progress} | allow_feedback: ${p.allow_feedback}`);
    });
  }

  const { data: assets, error: aErr } = await supabase
    .from('assets')
    .select('id, project_id, title, file_type, mime_type, file_url');
  if (aErr) console.error('Error fetching assets:', aErr);
  else {
    console.log('LIVE ASSETS IN SUPABASE:');
    console.table(assets);
  }
}

run().catch(console.error);
