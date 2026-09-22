/**
 * Test Suite 11: Isolated Real SQL Backfill Transaction Behavioral Tests
 * Run via: npx tsx scripts/tests/11-isolated-sql-backfill-execution.test.ts
 *
 * RIGOR & ISOLATION GUARANTEES:
 * 1. REAL POSTGRESQL ENGINE: Runs the exact SQL transaction file
 *    (supabase/data-backfills/backfill_studio_historical_data.sql) directly on an isolated,
 *    in-memory PostgreSQL engine (PGlite / Postgres 18.x WASM).
 * 2. ZERO TS-SIMULATION CHEATING: Executes raw SQL DO $$ ... $$ blocks, testing real PL/pgSQL
 *    row locking, exception raising, transaction rollback, and notice emission.
 * 3. ZERO TOUCH OF USER/PRODUCTION DB: Completely isolated from the live Supabase instance.
 * 4. BEHAVIORAL INVARIANCE:
 *    - Conflicting existing settings (e.g. show_progress=true, allow_feedback=true, or drive_file_id conflict)
 *      strictly aborts the transaction with zero modifications to any record (Zero-Write verification).
 *    - Exact match of all target fields across all 3 projects and 6 assets emits ALREADY_APPLIED.
 *    - Missing or unmigrated asset strictly prevents premature declaration of ALREADY_APPLIED.
 */

import fs from 'fs';
import path from 'path';
import { PGlite } from '@electric-sql/pglite';

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

const BACKFILL_SQL_PATH = path.resolve(process.cwd(), 'supabase/data-backfills/backfill_studio_historical_data.sql');

async function createIsolatedDb(): Promise<PGlite> {
  const db = new PGlite();

  // Create schema matching Supabase PostgreSQL environment
  await db.exec(`
    CREATE SCHEMA IF NOT EXISTS public;

    CREATE TABLE IF NOT EXISTS public.projects (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      show_progress BOOLEAN DEFAULT true,
      allow_feedback BOOLEAN DEFAULT true,
      drive_folder_id TEXT,
      drive_cover_file_id TEXT
    );

    CREATE TABLE IF NOT EXISTS public.assets (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES public.projects(id),
      title TEXT NOT NULL,
      drive_file_id TEXT,
      drive_folder_id TEXT,
      source TEXT DEFAULT 'legacy'
    );

    CREATE TABLE IF NOT EXISTS public.access_links (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS public.access_link_projects (
      id SERIAL PRIMARY KEY,
      access_link_id TEXT NOT NULL REFERENCES public.access_links(id),
      project_id TEXT NOT NULL REFERENCES public.projects(id)
    );
  `);

  return db;
}

interface FixtureOptions {
  projectOverrides?: Record<string, { show_progress?: boolean | null; allow_feedback?: boolean | null; drive_folder_id?: string | null }>;
  assetOverrides?: Record<string, { drive_file_id?: string | null; drive_folder_id?: string | null; source?: string | null }>;
  omitAssets?: string[];
  omitProjects?: string[];
}

async function seedFixture(db: PGlite, options: FixtureOptions = {}) {
  await db.exec(`INSERT INTO public.access_links (id, title) VALUES ('test-link-1', 'Main Studio Link') ON CONFLICT DO NOTHING;`);

  const projects = [
    { id: '9f9cc14b-b0bd-4b42-9ba6-9940c1681569', title: 'Studio Project 1' },
    { id: 'd57f384f-ae88-4108-98db-b9a0aa95f7ae', title: 'Studio Project 2' },
    { id: '86efb486-8224-4167-ab83-5e0899c2b60c', title: 'Studio Project 3' },
  ];

  for (const p of projects) {
    if (options.omitProjects?.includes(p.id)) continue;
    const o = options.projectOverrides?.[p.id] || {};
    await db.query(
      `INSERT INTO public.projects (id, title, show_progress, allow_feedback, drive_folder_id, drive_cover_file_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [p.id, p.title, o.show_progress ?? null, o.allow_feedback ?? null, o.drive_folder_id ?? null, null]
    );
    await db.query(
      `INSERT INTO public.access_link_projects (access_link_id, project_id) VALUES ('test-link-1', $1)`,
      [p.id]
    );
  }

  const assets = [
    { id: 'ba5dac17-3a8d-413e-ba90-63b0e0bd2058', projectId: '9f9cc14b-b0bd-4b42-9ba6-9940c1681569', title: 'Asset 1' },
    { id: '685602eb-6f63-40f5-afd0-972116bb6a2f', projectId: 'd57f384f-ae88-4108-98db-b9a0aa95f7ae', title: 'Asset 2' },
    { id: 'ef0f1b1b-0e44-44c9-82ed-26a2e13a489b', projectId: '86efb486-8224-4167-ab83-5e0899c2b60c', title: 'Asset 3' },
    { id: 'b8e1f656-233d-4f12-9827-9b8742e09cf9', projectId: '86efb486-8224-4167-ab83-5e0899c2b60c', title: 'Asset 4' },
    { id: '64c8407d-6b83-44f1-9574-4b852c8bd1e4', projectId: '86efb486-8224-4167-ab83-5e0899c2b60c', title: 'Asset 5' },
    { id: '6ce3ea6d-9d5b-41c2-b99f-17a7f5cfa21a', projectId: '86efb486-8224-4167-ab83-5e0899c2b60c', title: 'Asset 6' },
  ];

  for (const a of assets) {
    if (options.omitAssets?.includes(a.id)) continue;
    const o = options.assetOverrides?.[a.id] || {};
    await db.query(
      `INSERT INTO public.assets (id, project_id, title, drive_file_id, drive_folder_id, source)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [a.id, a.projectId, a.title, o.drive_file_id ?? null, o.drive_folder_id ?? null, o.source ?? 'legacy']
    );
  }
}

async function runBackfillSql(db: PGlite, backfillSql: string): Promise<{ success: boolean; notices: string[]; error?: string }> {
  const notices: string[] = [];
  try {
    await db.exec(backfillSql, {
      onNotice: (notice) => {
        if (notice.message) {
          notices.push(notice.message);
        }
      },
    });
    return { success: true, notices };
  } catch (err: any) {
    return { success: false, notices, error: err.message || String(err) };
  }
}

async function runIsolatedSqlTests() {
  console.log('================================================================');
  console.log('SUITE 11: ISOLATED REAL SQL BACKFILL TRANSACTION BEHAVIORAL TESTS');
  console.log('================================================================\n');

  assert(fs.existsSync(BACKFILL_SQL_PATH), 'Backfill SQL script exists at expected path');
  const backfillSql = fs.readFileSync(BACKFILL_SQL_PATH, 'utf8');

  // ==============================================================================
  // SECTION 1: CONFLICTING CURRENT SETTINGS LEAD TO ABORT WITH ZERO WRITES
  // ==============================================================================
  console.log('>>> 1. Testing Conflicting Settings: Abort & Zero-Write Invariance (Real PostgreSQL)...');

  // Scenario 1A: show_progress = true on project d57f384f (Target is false, true must NOT be assumed innocent default)
  {
    const db = await createIsolatedDb();
    await seedFixture(db, {
      projectOverrides: {
        'd57f384f-ae88-4108-98db-b9a0aa95f7ae': { show_progress: true, drive_folder_id: null },
      },
    });

    const result = await runBackfillSql(db, backfillSql);
    assert(!result.success, 'Scenario 1A: Transaction aborted on conflicting show_progress=true');
    assert(
      result.error?.includes('CONFLICT_DETECTED') === true &&
      result.error?.includes('show_progress') === true &&
      result.error?.includes('Do not assume true is default') === true,
      'Scenario 1A: Abort error explicitly identifies show_progress conflict and forbids assuming true is default',
      result.error
    );

    // Zero-Write Verification
    const projRes = await db.query<any>('SELECT id, show_progress, drive_folder_id FROM public.projects;');
    const d57f = projRes.rows.find((r) => r.id === 'd57f384f-ae88-4108-98db-b9a0aa95f7ae');
    const p9f9 = projRes.rows.find((r) => r.id === '9f9cc14b-b0bd-4b42-9ba6-9940c1681569');
    assert(d57f?.show_progress === true, 'Scenario 1A (Zero-Write): Conflicting project show_progress remained untouched');
    assert(d57f?.drive_folder_id === null, 'Scenario 1A (Zero-Write): Conflicting project drive_folder_id remained NULL (no partial write)');
    assert(p9f9?.drive_folder_id === null, 'Scenario 1A (Zero-Write): Preceding project drive_folder_id was rolled back completely');

    const assetRes = await db.query<any>('SELECT drive_file_id FROM public.assets WHERE drive_file_id IS NOT NULL;');
    assert(assetRes.rows.length === 0, 'Scenario 1A (Zero-Write): Zero asset updates occurred in database');
    await db.close();
  }

  // Scenario 1B: allow_feedback = true on project 86efb486 (Target is false)
  {
    const db = await createIsolatedDb();
    await seedFixture(db, {
      projectOverrides: {
        '86efb486-8224-4167-ab83-5e0899c2b60c': { show_progress: false, allow_feedback: true, drive_folder_id: null },
      },
    });

    const result = await runBackfillSql(db, backfillSql);
    assert(!result.success, 'Scenario 1B: Transaction aborted on conflicting allow_feedback=true');
    assert(
      result.error?.includes('CONFLICT_DETECTED') === true &&
      result.error?.includes('allow_feedback') === true &&
      result.error?.includes('Do not assume true is default') === true,
      'Scenario 1B: Abort error explicitly identifies allow_feedback conflict and forbids assuming true is default',
      result.error
    );

    // Zero-Write Verification
    const projRes = await db.query<any>('SELECT id, allow_feedback, drive_folder_id FROM public.projects;');
    const p86ef = projRes.rows.find((r) => r.id === '86efb486-8224-4167-ab83-5e0899c2b60c');
    assert(p86ef?.allow_feedback === true, 'Scenario 1B (Zero-Write): allow_feedback remained untouched');
    assert(p86ef?.drive_folder_id === null, 'Scenario 1B (Zero-Write): drive_folder_id remained NULL');
    await db.close();
  }

  // Scenario 1C: Conflicting drive_file_id on asset ba5dac17
  {
    const db = await createIsolatedDb();
    await seedFixture(db, {
      assetOverrides: {
        'ba5dac17-3a8d-413e-ba90-63b0e0bd2058': { drive_file_id: 'conflict-unrelated-file-id-123' },
      },
    });

    const result = await runBackfillSql(db, backfillSql);
    assert(!result.success, 'Scenario 1C: Transaction aborted on conflicting asset drive_file_id');
    assert(
      result.error?.includes('CONFLICT_DETECTED') === true &&
      result.error?.includes('drive_file_id') === true,
      'Scenario 1C: Abort error explicitly identifies conflicting asset drive_file_id',
      result.error
    );

    // Zero-Write Verification
    const assetRes = await db.query<any>('SELECT id, drive_file_id, source FROM public.assets WHERE id = $1;', [
      'ba5dac17-3a8d-413e-ba90-63b0e0bd2058',
    ]);
    assert(assetRes.rows[0]?.drive_file_id === 'conflict-unrelated-file-id-123', 'Scenario 1C (Zero-Write): Conflicting ID was NOT overwritten');
    assert(assetRes.rows[0]?.source === 'legacy', 'Scenario 1C (Zero-Write): Asset source remained "legacy" (no partial update)');
    await db.close();
  }

  // ==============================================================================
  // SECTION 2: MATCHING OF ALL VALUES LEADS TO ALREADY_APPLIED
  // ==============================================================================
  console.log('\n>>> 2. Testing Full Match: ALREADY_APPLIED Invariance (Real PostgreSQL)...');

  {
    const db = await createIsolatedDb();
    // Seed fully migrated state for all 3 projects and all 6 assets
    await seedFixture(db, {
      projectOverrides: {
        '9f9cc14b-b0bd-4b42-9ba6-9940c1681569': { drive_folder_id: '1koVd1dp_1-GhANmgTJ0Ql8WWvRMb9pnV' },
        'd57f384f-ae88-4108-98db-b9a0aa95f7ae': { show_progress: false, drive_folder_id: '1--uFjnwYt2uSQzYr0goYQcbew5Bhk1FL' },
        '86efb486-8224-4167-ab83-5e0899c2b60c': { show_progress: false, allow_feedback: false, drive_folder_id: '1FECwB4AQfXOS_nWqisSU8yOc6jfclYfF' },
      },
      assetOverrides: {
        'ba5dac17-3a8d-413e-ba90-63b0e0bd2058': { drive_file_id: '1Wg3j7fBVgg4JKZ5J5KYvahD0SulcC_t3', drive_folder_id: '1koVd1dp_1-GhANmgTJ0Ql8WWvRMb9pnV', source: 'drive' },
        '685602eb-6f63-40f5-afd0-972116bb6a2f': { drive_file_id: '1d6VQJo-eGCs_adrNSfQ6FPGrtNur_Rn8', drive_folder_id: '1--uFjnwYt2uSQzYr0goYQcbew5Bhk1FL', source: 'drive' },
        'ef0f1b1b-0e44-44c9-82ed-26a2e13a489b': { drive_file_id: '1RrVPhC3PaICyP-ID7PggDJ0nxLjxH0iU', drive_folder_id: '1FECwB4AQfXOS_nWqisSU8yOc6jfclYfF', source: 'drive' },
        'b8e1f656-233d-4f12-9827-9b8742e09cf9': { drive_file_id: '1eeNtvSMGX3ddVxBWNe9Mi3on3aXtwbWW', drive_folder_id: '1FECwB4AQfXOS_nWqisSU8yOc6jfclYfF', source: 'drive' },
        '64c8407d-6b83-44f1-9574-4b852c8bd1e4': { drive_file_id: '1tRou5UwtmZtTDTrOdA4ACySnBE1f_izO', drive_folder_id: '1FECwB4AQfXOS_nWqisSU8yOc6jfclYfF', source: 'drive' },
        '6ce3ea6d-9d5b-41c2-b99f-17a7f5cfa21a': { drive_file_id: '1GaQBHyfTJ1uU4AqJrNe22twIMX7pxicl', drive_folder_id: '1FECwB4AQfXOS_nWqisSU8yOc6jfclYfF', source: 'drive' },
      },
    });

    const result = await runBackfillSql(db, backfillSql);
    assert(result.success, 'Full Match: Backfill executed cleanly without error');
    assert(
      result.notices.some((n) => n.includes('ALREADY_APPLIED')),
      'Full Match: Emits ALREADY_APPLIED notice when all 3 projects and all 6 assets match target fields'
    );
    assert(
      !result.notices.some((n) => n.includes('SUCCESS: Studio historical data backfill applied')),
      'Full Match: Does NOT perform redundant update (exits early at Section 4)'
    );
    await db.close();
  }

  // ==============================================================================
  // SECTION 3: MISSING OR UNMIGRATED ASSET PREVENTS DECLARING ALREADY_APPLIED
  // ==============================================================================
  console.log('\n>>> 3. Testing Missing / Unmigrated Asset: Completion Prevention (Real PostgreSQL)...');

  // Scenario 3A: 5 assets match, but 6th asset has NULL drive_file_id (unmigrated)
  {
    const db = await createIsolatedDb();
    await seedFixture(db, {
      projectOverrides: {
        '9f9cc14b-b0bd-4b42-9ba6-9940c1681569': { drive_folder_id: '1koVd1dp_1-GhANmgTJ0Ql8WWvRMb9pnV' },
        'd57f384f-ae88-4108-98db-b9a0aa95f7ae': { show_progress: false, drive_folder_id: '1--uFjnwYt2uSQzYr0goYQcbew5Bhk1FL' },
        '86efb486-8224-4167-ab83-5e0899c2b60c': { show_progress: false, allow_feedback: false, drive_folder_id: '1FECwB4AQfXOS_nWqisSU8yOc6jfclYfF' },
      },
      assetOverrides: {
        'ba5dac17-3a8d-413e-ba90-63b0e0bd2058': { drive_file_id: '1Wg3j7fBVgg4JKZ5J5KYvahD0SulcC_t3', drive_folder_id: '1koVd1dp_1-GhANmgTJ0Ql8WWvRMb9pnV', source: 'drive' },
        '685602eb-6f63-40f5-afd0-972116bb6a2f': { drive_file_id: '1d6VQJo-eGCs_adrNSfQ6FPGrtNur_Rn8', drive_folder_id: '1--uFjnwYt2uSQzYr0goYQcbew5Bhk1FL', source: 'drive' },
        'ef0f1b1b-0e44-44c9-82ed-26a2e13a489b': { drive_file_id: '1RrVPhC3PaICyP-ID7PggDJ0nxLjxH0iU', drive_folder_id: '1FECwB4AQfXOS_nWqisSU8yOc6jfclYfF', source: 'drive' },
        'b8e1f656-233d-4f12-9827-9b8742e09cf9': { drive_file_id: '1eeNtvSMGX3ddVxBWNe9Mi3on3aXtwbWW', drive_folder_id: '1FECwB4AQfXOS_nWqisSU8yOc6jfclYfF', source: 'drive' },
        '64c8407d-6b83-44f1-9574-4b852c8bd1e4': { drive_file_id: '1tRou5UwtmZtTDTrOdA4ACySnBE1f_izO', drive_folder_id: '1FECwB4AQfXOS_nWqisSU8yOc6jfclYfF', source: 'drive' },
        // 6th asset is unmigrated (drive_file_id is NULL)
        '6ce3ea6d-9d5b-41c2-b99f-17a7f5cfa21a': { drive_file_id: null, drive_folder_id: null, source: 'legacy' },
      },
    });

    const result = await runBackfillSql(db, backfillSql);
    assert(result.success, 'Scenario 3A: Executes backfill without error', result.error);
    assert(
      !result.notices.some((n) => n.includes('ALREADY_APPLIED')),
      'Scenario 3A: Does NOT emit ALREADY_APPLIED when any asset is unmigrated'
    );
    assert(
      result.notices.some((n) => n.includes('SUCCESS: Studio historical data backfill applied')),
      'Scenario 3A: Proceeds past Section 4, completes remaining migration, and verifies atomically'
    );

    // Verify 6th asset was now properly updated
    const asset6Res = await db.query<any>('SELECT drive_file_id, source FROM public.assets WHERE id = $1;', [
      '6ce3ea6d-9d5b-41c2-b99f-17a7f5cfa21a',
    ]);
    assert(asset6Res.rows[0]?.drive_file_id === '1GaQBHyfTJ1uU4AqJrNe22twIMX7pxicl', 'Scenario 3A: 6th asset migrated cleanly to target ID');
    assert(asset6Res.rows[0]?.source === 'drive', 'Scenario 3A: 6th asset source set to drive');
    await db.close();
  }

  // Scenario 3B: Target asset completely missing from database
  {
    const db = await createIsolatedDb();
    await seedFixture(db, {
      omitAssets: ['6ce3ea6d-9d5b-41c2-b99f-17a7f5cfa21a'], // Asset 6 completely missing
    });

    const result = await runBackfillSql(db, backfillSql);
    assert(!result.success, 'Scenario 3B: Aborts immediately when a target asset is missing from DB');
    assert(
      result.error?.includes('PRECONDITION_FAILED') === true &&
      result.error?.includes('6ce3ea6d-9d5b-41c2-b99f-17a7f5cfa21a') === true,
      'Scenario 3B: Error explicitly names missing asset ID under PRECONDITION_FAILED',
      result.error
    );
    assert(
      !result.notices.some((n) => n.includes('ALREADY_APPLIED')),
      'Scenario 3B: Strictly forbids announcing completion when asset is missing'
    );
    await db.close();
  }

  // Scenario 3C: 5 assets match, but 6th asset has conflicting drive_file_id
  {
    const db = await createIsolatedDb();
    await seedFixture(db, {
      projectOverrides: {
        '9f9cc14b-b0bd-4b42-9ba6-9940c1681569': { drive_folder_id: '1koVd1dp_1-GhANmgTJ0Ql8WWvRMb9pnV' },
        'd57f384f-ae88-4108-98db-b9a0aa95f7ae': { show_progress: false, drive_folder_id: '1--uFjnwYt2uSQzYr0goYQcbew5Bhk1FL' },
        '86efb486-8224-4167-ab83-5e0899c2b60c': { show_progress: false, allow_feedback: false, drive_folder_id: '1FECwB4AQfXOS_nWqisSU8yOc6jfclYfF' },
      },
      assetOverrides: {
        'ba5dac17-3a8d-413e-ba90-63b0e0bd2058': { drive_file_id: '1Wg3j7fBVgg4JKZ5J5KYvahD0SulcC_t3', drive_folder_id: '1koVd1dp_1-GhANmgTJ0Ql8WWvRMb9pnV', source: 'drive' },
        '685602eb-6f63-40f5-afd0-972116bb6a2f': { drive_file_id: '1d6VQJo-eGCs_adrNSfQ6FPGrtNur_Rn8', drive_folder_id: '1--uFjnwYt2uSQzYr0goYQcbew5Bhk1FL', source: 'drive' },
        'ef0f1b1b-0e44-44c9-82ed-26a2e13a489b': { drive_file_id: '1RrVPhC3PaICyP-ID7PggDJ0nxLjxH0iU', drive_folder_id: '1FECwB4AQfXOS_nWqisSU8yOc6jfclYfF', source: 'drive' },
        'b8e1f656-233d-4f12-9827-9b8742e09cf9': { drive_file_id: '1eeNtvSMGX3ddVxBWNe9Mi3on3aXtwbWW', drive_folder_id: '1FECwB4AQfXOS_nWqisSU8yOc6jfclYfF', source: 'drive' },
        '64c8407d-6b83-44f1-9574-4b852c8bd1e4': { drive_file_id: '1tRou5UwtmZtTDTrOdA4ACySnBE1f_izO', drive_folder_id: '1FECwB4AQfXOS_nWqisSU8yOc6jfclYfF', source: 'drive' },
        '6ce3ea6d-9d5b-41c2-b99f-17a7f5cfa21a': { drive_file_id: 'conflicting-different-id', drive_folder_id: '1FECwB4AQfXOS_nWqisSU8yOc6jfclYfF', source: 'drive' },
      },
    });

    const result = await runBackfillSql(db, backfillSql);
    assert(!result.success, 'Scenario 3C: Aborts with error on conflicting 6th asset');
    assert(
      result.error?.includes('CONFLICT_DETECTED') === true &&
      result.error?.includes('6ce3ea6d') === true,
      'Scenario 3C: Error explicitly identifies 6th asset under CONFLICT_DETECTED',
      result.error
    );
    assert(
      !result.notices.some((n) => n.includes('ALREADY_APPLIED')),
      'Scenario 3C: Strictly forbids announcing completion on conflict'
    );
    await db.close();
  }

  // ==============================================================================
  // SECTION 4: FRESH BACKFILL EXECUTION & TRANSITION TO ALREADY_APPLIED
  // ==============================================================================
  console.log('\n>>> 4. Testing End-to-End Clean Backfill & Transition to ALREADY_APPLIED...');

  {
    const db = await createIsolatedDb();
    // Fresh state: projects exist with NULL drive fields; assets exist with direct/NULL
    await seedFixture(db);

    // Pass 1: Fresh backfill
    const pass1 = await runBackfillSql(db, backfillSql);
    assert(pass1.success, 'Pass 1: Fresh backfill executed without error', pass1.error);
    assert(
      pass1.notices.some((n) => n.includes('SUCCESS: Studio historical data backfill applied')),
      'Pass 1: Emits atomic success notice'
    );

    // Verify all 3 projects updated
    const projRows = (await db.query<any>('SELECT id, show_progress, allow_feedback, drive_folder_id FROM public.projects;')).rows;
    const p1 = projRows.find((r) => r.id === '9f9cc14b-b0bd-4b42-9ba6-9940c1681569');
    const p2 = projRows.find((r) => r.id === 'd57f384f-ae88-4108-98db-b9a0aa95f7ae');
    const p3 = projRows.find((r) => r.id === '86efb486-8224-4167-ab83-5e0899c2b60c');
    assert(p1?.drive_folder_id === '1koVd1dp_1-GhANmgTJ0Ql8WWvRMb9pnV', 'Pass 1: Project 1 drive_folder_id verified');
    assert(p2?.show_progress === false && p2?.drive_folder_id === '1--uFjnwYt2uSQzYr0goYQcbew5Bhk1FL', 'Pass 1: Project 2 show_progress=false and drive_folder_id verified');
    assert(p3?.show_progress === false && p3?.allow_feedback === false && p3?.drive_folder_id === '1FECwB4AQfXOS_nWqisSU8yOc6jfclYfF', 'Pass 1: Project 3 show_progress=false, allow_feedback=false and drive_folder_id verified');

    // Verify all 6 assets updated
    const assetRows = (await db.query<any>('SELECT id, drive_file_id, drive_folder_id, source FROM public.assets;')).rows;
    assert(assetRows.length === 6, 'Pass 1: All 6 assets present');
    assert(assetRows.every((r) => r.source === 'drive'), 'Pass 1: All 6 assets have source="drive"');
    assert(assetRows.every((r) => r.drive_file_id && r.drive_folder_id), 'Pass 1: All 6 assets have populated Drive IDs');

    // Pass 2: Immediate re-run on same database must produce ALREADY_APPLIED
    const pass2 = await runBackfillSql(db, backfillSql);
    assert(pass2.success, 'Pass 2: Re-run executed cleanly');
    assert(
      pass2.notices.some((n) => n.includes('ALREADY_APPLIED')),
      'Pass 2: Re-run produces ALREADY_APPLIED with zero updates'
    );
    assert(
      !pass2.notices.some((n) => n.includes('SUCCESS: Studio historical data backfill applied')),
      'Pass 2: Did not re-execute updates'
    );
    await db.close();
  }

  console.log('\n================================================================');
  console.log(`SUITE 11 RESULTS: ${passed} PASSED | ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runIsolatedSqlTests().catch((err) => {
  console.error('Suite 11 crashed:', err);
  process.exit(1);
});
