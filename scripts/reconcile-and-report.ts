import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { auditAndReconcileHistoricalData } from '../lib/data/reconciliation';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function run() {
  console.log('================================================================');
  console.log('HISTORICAL DATA AUDIT & RECONCILIATION REPORT');
  console.log('================================================================\n');

  const projectSettingsPath = path.resolve(process.cwd(), '.data/project-settings.json');
  const assetMapPath = path.resolve(process.cwd(), '.data/asset-drive-map.json');

  const localProjectSettings = fs.existsSync(projectSettingsPath)
    ? JSON.parse(fs.readFileSync(projectSettingsPath, 'utf8'))
    : {};
  const localAssetMap = fs.existsSync(assetMapPath)
    ? JSON.parse(fs.readFileSync(assetMapPath, 'utf8'))
    : {};

  const report = await auditAndReconcileHistoricalData(
    supabase,
    localProjectSettings,
    localAssetMap
  );

  console.log(`- Status: ${report.canProceedSafely ? 'READY FOR ATOMIC MIGRATION' : 'ATTENTION NEEDED'}`);
  console.log(`- Summary: ${report.summary}`);
  console.log(`- Verified target matches in DB: ${report.verifiedMatchesCount}`);
  console.log(`- Missing schema columns in DB: ${report.missingSchemaColumns.length}`);
  if (report.missingSchemaColumns.length > 0) {
    console.log('  Schema Columns Needed:', report.missingSchemaColumns);
  }
  console.log(`- Missing projects in DB: ${report.missingProjectsInDb.length}`);
  if (report.missingProjectsInDb.length > 0) {
    console.log('  Missing Project IDs:', report.missingProjectsInDb);
  }
  console.log(`- Missing assets in DB: ${report.missingAssetsInDb.length}`);
  console.log(`- Detected conflicts: ${report.conflicts.length}`);
  if (report.conflicts.length > 0) {
    console.log('  Conflicts:', report.conflicts);
  }
  console.log(`- Duplicate Drive file IDs: ${report.duplicateDriveFileIds.length}`);
  if (report.duplicateDriveFileIds.length > 0) {
    console.log('  Duplicates:', report.duplicateDriveFileIds);
  }

  console.log('\n================================================================');
}

run().catch(console.error);
