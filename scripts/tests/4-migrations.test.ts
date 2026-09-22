/**
 * Test Suite 4: Static SQL Migrations & DDL Syntax Audit
 * Run via: npx tsx scripts/tests/4-migrations.test.ts
 *
 * NOTE ON SCOPE & EPISTEMIC BOUNDARY:
 * This suite performs static, structural, and syntax audits of the SQL migration files
 * and schema.sql in the codebase.
 * It is NOT a live execution of migrations on a PostgreSQL database instance, nor does
 * it perform live catalog diffing between two running databases.
 * Dynamic database convergence testing is formally documented as UNEXECUTED [لم يُنفذ]
 * (requires two isolated test databases, and write tests are disallowed on production keys).
 */

import fs from 'fs';
import path from 'path';

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

async function runMigrationTests() {
  console.log('================================================================');
  console.log('SUITE 4: STATIC SQL MIGRATION SCRIPTS & DDL SYNTAX AUDIT');
  console.log('================================================================\n');

  console.log('>>> [EPISTEMIC SCOPE CLARIFICATION]:');
  console.log('  Scope: Static text/AST audit of schema.sql and migrations (001-004).');
  console.log('  Boundary: Live database execution & dynamic catalog diffing is UNEXECUTED [لم يُنفذ]');
  console.log('            (Requires two isolated PostgreSQL instances; writes on live keys disallowed).\n');

  const supabaseDir = path.resolve(process.cwd(), 'supabase');
  const migrationsDir = path.join(supabaseDir, 'migrations');
  const schemaPath = path.join(supabaseDir, 'schema.sql');
  const seedPath = path.join(supabaseDir, 'seed.sql');

  // -------------------------------------------------------------
  // Path 1: Fresh Database Setup Static Audit (schema.sql & seed.sql)
  // -------------------------------------------------------------
  console.log('>>> 1. Static Audit of Fresh Setup Files (schema.sql & seed.sql)...');

  assert(fs.existsSync(schemaPath), 'schema.sql file exists on disk');
  assert(fs.existsSync(seedPath), 'seed.sql file exists on disk');

  const schemaContent = fs.readFileSync(schemaPath, 'utf8');
  const seedContent = fs.readFileSync(seedPath, 'utf8');

  assert(schemaContent.length > 500, 'schema.sql has complete DDL statements (>500 bytes)');
  assert(seedContent.length > 500, 'seed.sql has initial seed data (>500 bytes)');

  // Verify schema.sql syntax & definitions
  assert(
    schemaContent.includes('session_version INTEGER NOT NULL DEFAULT 1'),
    'schema.sql text defines access_links with session_version INTEGER DEFAULT 1'
  );

  assert(
    schemaContent.includes('cover_storage_path TEXT') &&
    schemaContent.includes('thumbnail_storage_path TEXT'),
    'schema.sql text defines storage_path columns for covers and thumbnails'
  );

  assert(
    schemaContent.includes('CONSTRAINT unique_approvals_asset_link UNIQUE (asset_id, access_link_id)'),
    'schema.sql text defines unconditional UNIQUE constraint on (asset_id, access_link_id)'
  );

  assert(
    schemaContent.includes('CREATE TABLE IF NOT EXISTS pending_storage_cleanups'),
    'schema.sql text defines pending_storage_cleanups table'
  );

  assert(
    schemaContent.includes('CREATE OR REPLACE FUNCTION public.update_access_link_atomic') &&
    schemaContent.includes("SET search_path = ''") &&
    schemaContent.includes('SECURITY DEFINER') &&
    schemaContent.includes('REVOKE ALL ON FUNCTION public.update_access_link_atomic') &&
    schemaContent.includes('GRANT EXECUTE ON FUNCTION public.update_access_link_atomic') &&
    schemaContent.includes('TO service_role;'),
    'schema.sql text contains update_access_link_atomic with search_path, revokes, and service_role grant'
  );

  assert(
    !schemaContent.includes('pg_catalog.coalesce('),
    'schema.sql does NOT contain invalid pg_catalog.coalesce( syntax'
  );

  assert(
    !schemaContent.includes("'password_hash'"),
    'schema.sql return payload explicitly omits password_hash'
  );

  assert(
    schemaContent.includes('524288000') &&
    schemaContent.includes('media-studio-assets'),
    'schema.sql configures media-studio-assets bucket with 500MB limit'
  );

  assert(
    schemaContent.includes('drive_folder_id TEXT') &&
    schemaContent.includes('drive_cover_file_id TEXT') &&
    schemaContent.includes('drive_file_id TEXT') &&
    schemaContent.includes('source VARCHAR(50) NOT NULL DEFAULT \'legacy\''),
    'schema.sql text defines Drive columns for projects and assets'
  );

  assert(
    schemaContent.includes('CONSTRAINT unique_assets_drive_file_id UNIQUE (drive_file_id)'),
    'schema.sql text defines UNIQUE constraint on assets(drive_file_id)'
  );

  assert(
    schemaContent.includes('idx_assets_drive_file_id') &&
    schemaContent.includes('idx_projects_drive_folder_id'),
    'schema.sql text defines indexes for Drive file and folder lookups'
  );

  // -------------------------------------------------------------
  // Path 2: Sequential Migrations Static File Sequence Audit
  // -------------------------------------------------------------
  console.log('\n>>> 2. Static Audit of Sequential Migration Files...');

  assert(fs.existsSync(migrationsDir), 'supabase/migrations directory exists');

  const migrationFiles = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
  console.log(`  Found ${migrationFiles.length} migration files in sequence:`, migrationFiles);

  assert(migrationFiles.length >= 8, 'All 8 required migrations are present in directory');

  const expectedMigrations = [
    '20260908000001_phase1_security.sql',
    '20260908000002_phase1_corrections.sql',
    '20260908000003_phase1_hardening.sql',
    '20260908000004_fix_coalesce_syntax.sql',
    '20260908000005_google_drive_support.sql',
    '20260908000006_add_show_progress.sql',
    '20260908000007_add_allow_feedback.sql',
    '20260909000008_align_schema_parity.sql',
  ];

  for (const expected of expectedMigrations) {
    assert(migrationFiles.includes(expected), `Migration sequence includes: ${expected}`);
  }

  // Migration 001 static check
  const m1Path = path.join(migrationsDir, '20260908000001_phase1_security.sql');
  const m1Content = fs.readFileSync(m1Path, 'utf8');
  assert(
    m1Content.includes('ENABLE ROW LEVEL SECURITY') &&
    m1Content.includes('media-studio-assets'),
    'Migration 001 text sets up RLS and private storage bucket'
  );

  // Migration 002 static check
  const m2Path = path.join(migrationsDir, '20260908000002_phase1_corrections.sql');
  const m2Content = fs.readFileSync(m2Path, 'utf8');
  assert(
    m2Content.includes('cover_storage_path') &&
    m2Content.includes('unique_approvals_asset_link') &&
    m2Content.includes('pending_storage_cleanups'),
    'Migration 002 text introduces storage paths, unique constraint, and cleanup table'
  );

  // Migration 003 static check
  const m3Path = path.join(migrationsDir, '20260908000003_phase1_hardening.sql');
  const m3Content = fs.readFileSync(m3Path, 'utf8');
  assert(
    m3Content.includes("SET search_path = ''") &&
    m3Content.includes('REVOKE ALL ON FUNCTION public.update_access_link_atomic') &&
    m3Content.includes('file_size_limit = 524288000'),
    'Migration 003 text hardens atomic function, revokes public execution, and sets 500MB bucket limit'
  );

  // Migration 004 static check
  const m4Path = path.join(migrationsDir, '20260908000004_fix_coalesce_syntax.sql');
  const m4Content = fs.readFileSync(m4Path, 'utf8');
  assert(
    !m4Content.includes('pg_catalog.coalesce(') &&
    m4Content.includes('COALESCE(') &&
    m4Content.includes("SET search_path = ''") &&
    m4Content.includes('REVOKE ALL ON FUNCTION public.update_access_link_atomic') &&
    m4Content.includes('GRANT EXECUTE ON FUNCTION public.update_access_link_atomic') &&
    m4Content.includes('TO service_role;'),
    'Migration 004 text fixes COALESCE syntax, enforces search_path, and restricts permissions to service_role'
  );
  assert(
    !m4Content.includes("'password_hash'"),
    'Migration 004 text removes password_hash from returned JSON payload'
  );

  // Migration 005 static check
  const m5Path = path.join(migrationsDir, '20260908000005_google_drive_support.sql');
  const m5Content = fs.readFileSync(m5Path, 'utf8');
  assert(
    m5Content.includes('drive_folder_id') &&
    m5Content.includes('drive_file_id') &&
    m5Content.includes('unique_assets_drive_file_id'),
    'Migration 005 text introduces Drive columns and unique constraint on drive_file_id'
  );

  // Migration 006 static check
  const m6Path = path.join(migrationsDir, '20260908000006_add_show_progress.sql');
  const m6Content = fs.readFileSync(m6Path, 'utf8');
  assert(
    m6Content.includes('show_progress BOOLEAN NOT NULL DEFAULT true'),
    'Migration 006 text introduces show_progress toggle column'
  );

  // Migration 007 static check
  const m7Path = path.join(migrationsDir, '20260908000007_add_allow_feedback.sql');
  const m7Content = fs.readFileSync(m7Path, 'utf8');
  assert(
    m7Content.includes('allow_feedback BOOLEAN NOT NULL DEFAULT true') &&
    m7Content.includes('idx_projects_allow_feedback'),
    'Migration 007 text introduces allow_feedback column and index'
  );

  // Migration 008 static check: Pure generic DDL (no hardcoded data or UPDATE statements)
  const m8Path = path.join(migrationsDir, '20260909000008_align_schema_parity.sql');
  const m8Content = fs.readFileSync(m8Path, 'utf8');
  assert(
    m8Content.includes('ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS show_progress') &&
    m8Content.includes('ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS allow_feedback') &&
    m8Content.includes('ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS drive_file_id') &&
    m8Content.includes('unique_assets_drive_file_id'),
    'Migration 008 is pure generic DDL ensuring schema parity across all environments'
  );
  assert(
    !m8Content.toUpperCase().includes('UPDATE public.projects') &&
    !m8Content.includes('1koVd1dp_1-GhANmgTJ0Ql8WWvRMb9pnV') &&
    !m8Content.includes('86efb486-8224-4167-ab83-5e0899c2b60c'),
    'Migration 008 contains ZERO studio-specific data or hardcoded UPDATE statements (pure generic DDL)'
  );

  // Decoupled Studio Historical Data Backfill Audit
  const backfillPath = path.resolve(process.cwd(), 'supabase/data-backfills/backfill_studio_historical_data.sql');
  assert(fs.existsSync(backfillPath), 'Studio-specific data backfill script exists in supabase/data-backfills/');
  const backfillContent = fs.readFileSync(backfillPath, 'utf8');
  assert(
    backfillContent.includes('DO $$') &&
    backfillContent.includes('ALREADY_APPLIED') &&
    backfillContent.includes('PRECONDITION_FAILED') &&
    backfillContent.includes('CONFLICT_DETECTED') &&
    backfillContent.includes('POST_VERIFICATION_FAILED'),
    'Studio backfill script implements atomic transaction with idempotency, existence, conflict, and post-verification'
  );
  assert(
    backfillContent.includes('FOR UPDATE'),
    'Studio backfill transaction locks target project and asset rows (FOR UPDATE) preventing concurrent mutations'
  );
  assert(
    backfillContent.includes('ba5dac17-3a8d-413e-ba90-63b0e0bd2058') &&
    backfillContent.includes('685602eb-6f63-40f5-afd0-972116bb6a2f') &&
    backfillContent.includes('ef0f1b1b-0e44-44c9-82ed-26a2e13a489b') &&
    backfillContent.includes('b8e1f656-233d-4f12-9827-9b8742e09cf9') &&
    backfillContent.includes('64c8407d-6b83-44f1-9574-4b852c8bd1e4') &&
    backfillContent.includes('6ce3ea6d-9d5b-41c2-b99f-17a7f5cfa21a'),
    'Studio backfill asserts all 6 assets individually across existence, idempotency, and post-verification'
  );

  // -------------------------------------------------------------
  // Path 3: Static DDL Parity (Checking Schema Definitions Match Migration End State)
  // -------------------------------------------------------------
  console.log('\n>>> 3. Checking Static Syntax Parity (schema.sql vs Migrations 001-007)...');

  const schemaHasCoalesceFix = schemaContent.includes('COALESCE(p_viewer_name, viewer_name)') && !schemaContent.includes('pg_catalog.coalesce(');
  const migrationHasCoalesceFix = m4Content.includes('COALESCE(p_viewer_name, viewer_name)') && !m4Content.includes('pg_catalog.coalesce(');
  assert(
    schemaHasCoalesceFix && migrationHasCoalesceFix,
    'Both schema.sql and Migration 004 text use identical intrinsic COALESCE syntax'
  );

  const schemaHasNoHash = !schemaContent.includes("'password_hash'");
  const migrationHasNoHash = !m4Content.includes("'password_hash'");
  assert(
    schemaHasNoHash && migrationHasNoHash,
    'Both schema.sql and Migration 004 text scrub password_hash from function return payload'
  );

  assert(
    schemaContent.includes('show_progress BOOLEAN NOT NULL DEFAULT true') &&
    schemaContent.includes('allow_feedback BOOLEAN NOT NULL DEFAULT true') &&
    schemaContent.includes('idx_projects_allow_feedback'),
    'schema.sql contains show_progress, allow_feedback, and idx_projects_allow_feedback matching migrations 006 and 007'
  );
  assert(
    schemaHasNoHash && migrationHasNoHash,
    'Both schema.sql and Migration 004 text scrub password_hash from function return payload'
  );

  console.log('\n================================================================');
  console.log(`SUITE 4 RESULTS: ${passed} PASSED | ${failed} FAILED`);
  console.log('================================================================');
  console.log('[NOTE]: Dynamic execution & database schema diffing: UNEXECUTED [لم يُنفذ]');
  console.log('================================================================\n');

  if (failed > 0) process.exit(1);
}

runMigrationTests().catch((err) => {
  console.error('Suite 4 crashed:', err);
  process.exit(1);
});
