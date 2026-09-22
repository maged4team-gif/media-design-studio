import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  console.log('================================================================');
  console.log('AUDIT & COMPARISON: LIVE SUPABASE DB VS LOCAL HISTORICAL DATA');
  console.log('================================================================\n');

  // 1. Load local recovery files
  const projectSettingsPath = path.resolve(process.cwd(), '.data/project-settings.json');
  const assetMapPath = path.resolve(process.cwd(), '.data/asset-drive-map.json');

  const localProjectSettings = fs.existsSync(projectSettingsPath)
    ? JSON.parse(fs.readFileSync(projectSettingsPath, 'utf8'))
    : {};
  const localAssetMap = fs.existsSync(assetMapPath)
    ? JSON.parse(fs.readFileSync(assetMapPath, 'utf8'))
    : {};

  console.log(`Local project settings entries: ${Object.keys(localProjectSettings).length}`);
  console.log(`Local asset drive map entries: ${Object.keys(localAssetMap).length}\n`);

  // 2. Check live table columns by doing test selects
  console.log('>>> Step 1: Checking schema columns in live database...');
  
  // Test projects columns
  const projCols = ['id', 'title', 'progress', 'show_progress', 'allow_feedback', 'drive_folder_id', 'drive_cover_file_id'];
  const liveProjColStatus: Record<string, boolean> = {};
  for (const col of projCols) {
    const { error } = await supabase.from('projects').select(col).limit(1);
    liveProjColStatus[col] = !error;
  }
  console.log('Live projects columns availability:', liveProjColStatus);

  // Test assets columns
  const assetCols = ['id', 'title', 'project_id', 'drive_file_id', 'drive_folder_id', 'source'];
  const liveAssetColStatus: Record<string, boolean> = {};
  for (const col of assetCols) {
    const { error } = await supabase.from('assets').select(col).limit(1);
    liveAssetColStatus[col] = !error;
  }
  console.log('Live assets columns availability:', liveAssetColStatus);

  // 3. Fetch all projects from live database
  console.log('\n>>> Step 2: Fetching live projects and comparing with local settings...');
  const { data: liveProjects, error: projErr } = await supabase
    .from('projects')
    .select('*');

  if (projErr) {
    console.error('Failed to fetch live projects:', projErr);
    return;
  }

  console.log(`Total live projects found in DB: ${liveProjects.length}`);
  const liveProjMap = new Map(liveProjects.map(p => [p.id, p]));

  const missingProjectsInDb: string[] = [];
  const projectConflicts: any[] = [];
  const matchingProjects: any[] = [];

  for (const [projectId, localSettings] of Object.entries<any>(localProjectSettings)) {
    const dbProj = liveProjMap.get(projectId);
    if (!dbProj) {
      missingProjectsInDb.push(projectId);
      continue;
    }

    const conflicts: string[] = [];
    if (localSettings.show_progress !== undefined && dbProj.show_progress !== undefined && dbProj.show_progress !== localSettings.show_progress) {
      conflicts.push(`show_progress: DB=${dbProj.show_progress} vs LOCAL=${localSettings.show_progress}`);
    }
    if (localSettings.allow_feedback !== undefined && dbProj.allow_feedback !== undefined && dbProj.allow_feedback !== localSettings.allow_feedback) {
      conflicts.push(`allow_feedback: DB=${dbProj.allow_feedback} vs LOCAL=${localSettings.allow_feedback}`);
    }
    if (localSettings.drive_folder_id && dbProj.drive_folder_id && dbProj.drive_folder_id !== localSettings.drive_folder_id) {
      conflicts.push(`drive_folder_id: DB=${dbProj.drive_folder_id} vs LOCAL=${localSettings.drive_folder_id}`);
    }

    if (conflicts.length > 0) {
      projectConflicts.push({ projectId, title: dbProj.title, conflicts, local: localSettings, db: dbProj });
    } else {
      matchingProjects.push({ projectId, title: dbProj.title, local: localSettings, db: dbProj });
    }
  }

  console.log(`- Missing projects in DB: ${missingProjectsInDb.length} ${JSON.stringify(missingProjectsInDb)}`);
  console.log(`- Conflicting projects: ${projectConflicts.length}`);
  if (projectConflicts.length > 0) {
    console.log('Project Conflicts Detail:', JSON.stringify(projectConflicts, null, 2));
  }
  console.log(`- Matching / Clean projects: ${matchingProjects.length}`);

  // 4. Fetch all assets from live database
  console.log('\n>>> Step 3: Fetching live assets and comparing with local drive mappings...');
  const { data: liveAssets, error: assetErr } = await supabase
    .from('assets')
    .select('*');

  if (assetErr) {
    console.error('Failed to fetch live assets:', assetErr);
    return;
  }

  console.log(`Total live assets found in DB: ${liveAssets.length}`);
  const liveAssetMap = new Map(liveAssets.map(a => [a.id, a]));

  const missingAssetsInDb: string[] = [];
  const assetConflicts: any[] = [];
  const matchingAssets: any[] = [];
  const duplicateDriveFileIds: Map<string, string[]> = new Map();

  for (const [assetId, localMapping] of Object.entries<any>(localAssetMap)) {
    const dbAsset = liveAssetMap.get(assetId);
    if (!dbAsset) {
      missingAssetsInDb.push(assetId);
      continue;
    }

    const conflicts: string[] = [];
    if (localMapping.drive_file_id && dbAsset.drive_file_id && dbAsset.drive_file_id !== localMapping.drive_file_id) {
      conflicts.push(`drive_file_id: DB=${dbAsset.drive_file_id} vs LOCAL=${localMapping.drive_file_id}`);
    }
    if (localMapping.drive_folder_id && dbAsset.drive_folder_id && dbAsset.drive_folder_id !== localMapping.drive_folder_id) {
      conflicts.push(`drive_folder_id: DB=${dbAsset.drive_folder_id} vs LOCAL=${localMapping.drive_folder_id}`);
    }
    if (localMapping.source && dbAsset.source && dbAsset.source !== localMapping.source) {
      conflicts.push(`source: DB=${dbAsset.source} vs LOCAL=${localMapping.source}`);
    }

    if (conflicts.length > 0) {
      assetConflicts.push({ assetId, title: dbAsset.title, conflicts, local: localMapping, db: dbAsset });
    } else {
      matchingAssets.push({ assetId, title: dbAsset.title, local: localMapping, db: dbAsset });
    }

    if (localMapping.drive_file_id) {
      const existing = duplicateDriveFileIds.get(localMapping.drive_file_id) || [];
      existing.push(assetId);
      duplicateDriveFileIds.set(localMapping.drive_file_id, existing);
    }
  }

  const duplicates = Array.from(duplicateDriveFileIds.entries()).filter(([_, ids]) => ids.length > 1);

  console.log(`- Missing assets in DB: ${missingAssetsInDb.length} ${JSON.stringify(missingAssetsInDb)}`);
  console.log(`- Conflicting assets: ${assetConflicts.length}`);
  if (assetConflicts.length > 0) {
    console.log('Asset Conflicts Detail:', JSON.stringify(assetConflicts, null, 2));
  }
  console.log(`- Duplicate drive_file_ids across mapped assets: ${duplicates.length}`);
  if (duplicates.length > 0) {
    console.log('Duplicates Detail:', JSON.stringify(duplicates, null, 2));
  }
  console.log(`- Matching / Clean assets: ${matchingAssets.length}`);

  console.log('\n================================================================');
  console.log('AUDIT COMPLETED');
  console.log('================================================================');
}

main().catch(console.error);
