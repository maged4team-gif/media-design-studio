/**
 * Studio Historical Data Backfill & Reconciliation Runner
 * Run via: npx tsx --env-file=.env.local scripts/run-studio-data-backfill.ts
 *
 * Guarantees:
 * - Pre-flight audit via reconciliation.ts
 * - Halts immediately if canProceedSafely === false (no silent pass-through)
 * - Never treats missing records as ephemeral automatically
 * - Any exception must be explicitly defined and justified, followed by a re-audit
 * - Retains recovery files intact
 */

import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { auditAndReconcileHistoricalData, ReconciliationReport, ProjectSettingsMap } from '../lib/data/reconciliation';

// Strict, documented justification registry for known ephemeral test fixtures
// Generated strictly during isolated headless automated testing in demo mode.
const JUSTIFIED_EPHEMERAL_FIXTURES = new Map<string, string>([
  ['9a9fb21e-1856-4039-b0af-3f91f3087b63', 'Isolated showcase-mode automated test fixture in demo store'],
  ['dd9ca2e0-7a76-4041-91e0-249b1d9e8fcd', 'Isolated showcase-mode automated test fixture in demo store'],
  ['a8dc96ab-37e6-443a-8178-d6ea55bc9383', 'Isolated showcase-mode automated test fixture in demo store'],
]);

async function main() {
  console.log('================================================================');
  console.log('STUDIO HISTORICAL DATA BACKFILL & RECONCILIATION RUNNER');
  console.log('================================================================\n');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    console.error('ERROR: Supabase credentials not found in environment.');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const projectSettingsFile = path.resolve(process.cwd(), '.data/project-settings.json');
  const assetMapFile = path.resolve(process.cwd(), '.data/asset-drive-map.json');

  if (!fs.existsSync(projectSettingsFile) || !fs.existsSync(assetMapFile)) {
    console.error('ERROR: Local recovery files not found on disk.');
    process.exit(1);
  }

  const localProjectSettings = JSON.parse(fs.readFileSync(projectSettingsFile, 'utf8'));
  const localAssetMap = JSON.parse(fs.readFileSync(assetMapFile, 'utf8'));

  console.log('>>> Step 1: Performing Pre-Flight Reconciliation Audit...');
  let report: ReconciliationReport = await auditAndReconcileHistoricalData(supabase, localProjectSettings, localAssetMap);

  console.log(`  Initial Audit Summary: ${report.summary}`);
  console.log(`  Initial canProceedSafely: ${report.canProceedSafely ? 'YES' : 'NO'}`);

  // 1. Strict handling of missing records: Never treat missing records as ephemeral automatically
  if (report.missingProjectsInDb.length > 0 || report.missingAssetsInDb.length > 0) {
    console.warn(`\n[!] Missing records detected in database:`);
    console.warn(`    - Missing Projects: ${report.missingProjectsInDb.length}`);
    console.warn(`    - Missing Assets: ${report.missingAssetsInDb.length}`);

    if (report.missingAssetsInDb.length > 0) {
      console.error(`\n[!] CRITICAL: Missing target assets in database: ${report.missingAssetsInDb.join(', ')}`);
      console.error('No exceptions permitted for missing assets. Backfill aborted.');
      process.exit(1);
    }

    // Check if any missing project lacks explicit justification
    const unjustifiedProjects = report.missingProjectsInDb.filter(
      (id) => !JUSTIFIED_EPHEMERAL_FIXTURES.has(id)
    );

    if (unjustifiedProjects.length > 0) {
      console.error(`\n[!] ERROR: Unjustified missing target projects in database: ${unjustifiedProjects.join(', ')}`);
      console.error('Cannot proceed safely without explicit justification. Backfill aborted.');
      process.exit(1);
    }

    // Display explicit justification for whitelisted fixtures
    console.log('\n  Documented Justifications for Missing Fixtures:');
    for (const id of report.missingProjectsInDb) {
      console.log(`    - [${id}]: ${JUSTIFIED_EPHEMERAL_FIXTURES.get(id)}`);
    }

    // Re-audit with justified fixtures excluded to re-verify state
    console.log('\n  Re-running pre-flight reconciliation excluding justified fixtures (re-audit)...');
    const filteredProjects: ProjectSettingsMap = Object.fromEntries(
      Object.entries(localProjectSettings).filter(([id]) => !JUSTIFIED_EPHEMERAL_FIXTURES.has(id))
    ) as ProjectSettingsMap;
    report = await auditAndReconcileHistoricalData(supabase, filteredProjects, localAssetMap);

    console.log(`  Re-audit Summary: ${report.summary}`);
    console.log(`  Re-audit canProceedSafely: ${report.canProceedSafely ? 'YES' : 'NO'}`);
  }

  // 2. Strict Enforcement: Halt immediately whenever canProceedSafely is false
  if (!report.canProceedSafely) {
    console.error('\n[!] CANNOT PROCEED SAFELY (ABORTING):');
    console.error(`  Reason: ${report.summary}`);

    if (report.missingSchemaColumns.length > 0) {
      console.warn('\n  Schema columns missing:');
      for (const c of report.missingSchemaColumns) {
        console.warn(`    - ${c.table}.${c.column} (${c.affectedEntitiesCount} entities affected)`);
      }
      console.warn('\n  Please execute migration 008 in the Supabase SQL Editor:');
      console.warn('    supabase/migrations/20260909000008_align_schema_parity.sql\n');
    }

    if (report.conflicts.length > 0) {
      console.error('\n  Data conflicts detected:');
      for (const c of report.conflicts) {
        console.error(`    - Entity ${c.entityType} [${c.entityId}], Field "${c.field}": Local=${c.localValue} vs DB=${c.dbValue}`);
      }
    }

    if (report.duplicateDriveFileIds.length > 0) {
      console.error('\n  Duplicate Drive file IDs detected:');
      for (const d of report.duplicateDriveFileIds) {
        console.error(`    - ${d.message}`);
      }
    }

    if (report.missingProjectsInDb.length > 0) {
      console.error(`\n  Target projects missing from database: ${report.missingProjectsInDb.join(', ')}`);
    }

    if (report.missingAssetsInDb.length > 0) {
      console.error(`\n  Target assets missing from database: ${report.missingAssetsInDb.join(', ')}`);
    }

    console.error('\nBackfill runner halted. Resolve anomalies before proceeding.');
    process.exit(1);
  }

  console.log('\n>>> Step 2: Preparing Safe Studio Backfill...');
  const backfillSqlPath = path.resolve(process.cwd(), 'supabase/data-backfills/backfill_studio_historical_data.sql');
  const backfillSql = fs.readFileSync(backfillSqlPath, 'utf8');

  console.log(`  Read backfill transaction SQL (${backfillSql.length} bytes).`);
  console.log('  To apply atomically in Supabase, execute this transaction in the Supabase SQL Editor.');
  console.log('  Recovery files (.data/project-settings.json, .data/asset-drive-map.json) remain preserved intact.\n');
  console.log('>>> Backfill pre-flight completed successfully.');
}

main().catch((err) => {
  console.error('Runner failed:', err);
  process.exit(1);
});
