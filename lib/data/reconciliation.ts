import { SupabaseClient } from '@supabase/supabase-js';

export interface ProjectSettingsMap {
  [projectId: string]: {
    show_progress?: boolean;
    allow_feedback?: boolean;
    drive_folder_id?: string | null;
    drive_cover_file_id?: string | null;
  };
}

export interface AssetDriveMap {
  [assetId: string]: {
    drive_file_id?: string | null;
    drive_folder_id?: string | null;
    source?: string;
  };
}

export interface DataConflict {
  entityId: string;
  entityType: 'project' | 'asset';
  field: string;
  localValue: any;
  dbValue: any;
  message: string;
}

export interface SchemaColumnAnomaly {
  table: 'projects' | 'assets';
  column: string;
  reason: 'column_missing_in_db';
  affectedEntitiesCount: number;
}

export interface DuplicateDriveIdAnomaly {
  driveFileId: string;
  localAssetIds: string[];
  dbAssetIds: string[];
  message: string;
}

export interface ReconciliationReport {
  ok: boolean;
  canProceedSafely: boolean;
  summary: string;
  missingProjectsInDb: string[];
  missingAssetsInDb: string[];
  conflicts: DataConflict[];
  missingSchemaColumns: SchemaColumnAnomaly[];
  duplicateDriveFileIds: DuplicateDriveIdAnomaly[];
  verifiedMatchesCount: number;
}

/**
 * Reconciles local historical data with database records.
 * 1. Queries all required fields for projects (show_progress, allow_feedback, drive_folder_id, drive_cover_file_id).
 * 2. Queries all required fields for assets (drive_file_id, drive_folder_id, source).
 * 3. Differentiates between a column missing from the DB schema vs a NULL value (unreadable columns are never treated as matching).
 * 4. Checks cross-system duplicates between local mappings and existing database records.
 * 5. Strictly flags any conflicts or missing target records before allowing migration.
 */
export async function auditAndReconcileHistoricalData(
  supabase: SupabaseClient,
  localProjectSettings: ProjectSettingsMap,
  localAssetMap: AssetDriveMap
): Promise<ReconciliationReport> {
  const missingProjectsInDb: string[] = [];
  const missingAssetsInDb: string[] = [];
  const conflicts: DataConflict[] = [];
  const missingSchemaColumns: SchemaColumnAnomaly[] = [];

  // -------------------------------------------------------------
  // Step 1: Probe schema columns for projects
  // -------------------------------------------------------------
  const projectColsToProbe = ['show_progress', 'allow_feedback', 'drive_folder_id', 'drive_cover_file_id'];
  const projectAvailableCols = new Set<string>(['id', 'title', 'progress']);

  for (const col of projectColsToProbe) {
    const { error } = await supabase.from('projects').select(col).limit(1);
    if (!error) {
      projectAvailableCols.add(col);
    } else {
      const isColMissing =
        error.code === '42703' ||
        error.code === 'PGRST204' ||
        error.message?.includes('column') ||
        error.message?.includes('schema cache');
      if (isColMissing) {
        // Count how many local projects rely on this column
        const affected = Object.values(localProjectSettings).filter(
          (s) => (s as any)[col] !== undefined
        ).length;
        if (affected > 0) {
          missingSchemaColumns.push({
            table: 'projects',
            column: col,
            reason: 'column_missing_in_db',
            affectedEntitiesCount: affected,
          });
        }
      } else {
        // Unexpected error (e.g. 42501 permission denied, 503 service unavailable, connection drop)
        // Must immediately halt and NOT silently exclude the column
        throw new Error(
          `DB_PROBE_ERROR: Failed to probe column "${col}" on table "projects": [${error.code || 'UNKNOWN'}] ${error.message}`
        );
      }
    }
  }

  // Fetch projects with all available probed columns
  const projSelectQuery = Array.from(projectAvailableCols).join(', ');
  const { data: dbProjects, error: pErr } = await supabase
    .from('projects')
    .select(projSelectQuery);

  if (pErr) {
    throw new Error(`DB_FETCH_ERROR: Failed to fetch projects for reconciliation: ${pErr.message}`);
  }

  const projectList: any[] = (dbProjects as any[]) || [];
  const dbProjectMap = new Map<string, any>(projectList.map((p) => [p.id, p]));

  // Compare project fields
  for (const [projectId, localSettings] of Object.entries(localProjectSettings)) {
    const dbProj = dbProjectMap.get(projectId);
    if (!dbProj) {
      missingProjectsInDb.push(projectId);
      continue;
    }

    // Check allow_feedback
    if (localSettings.allow_feedback !== undefined) {
      if (!projectAvailableCols.has('allow_feedback')) {
        // Column is unreadable from DB schema
      } else if (
        dbProj.allow_feedback !== undefined &&
        dbProj.allow_feedback !== null &&
        dbProj.allow_feedback !== localSettings.allow_feedback
      ) {
        conflicts.push({
          entityId: projectId,
          entityType: 'project',
          field: 'allow_feedback',
          localValue: localSettings.allow_feedback,
          dbValue: dbProj.allow_feedback,
          message: `تعارض في إعداد السماح بالملاحظات (المحلي: ${localSettings.allow_feedback} vs قاعدة البيانات: ${dbProj.allow_feedback})`,
        });
      }
    }

    // Check show_progress
    if (localSettings.show_progress !== undefined) {
      if (!projectAvailableCols.has('show_progress')) {
        // Column is unreadable from DB schema
      } else if (
        dbProj.show_progress !== undefined &&
        dbProj.show_progress !== null &&
        dbProj.show_progress !== localSettings.show_progress
      ) {
        conflicts.push({
          entityId: projectId,
          entityType: 'project',
          field: 'show_progress',
          localValue: localSettings.show_progress,
          dbValue: dbProj.show_progress,
          message: `تعارض في إعداد شريط الإنجاز (المحلي: ${localSettings.show_progress} vs قاعدة البيانات: ${dbProj.show_progress})`,
        });
      }
    }

    // Check drive_folder_id
    if (localSettings.drive_folder_id !== undefined && localSettings.drive_folder_id !== null) {
      if (!projectAvailableCols.has('drive_folder_id')) {
        // Column is unreadable from DB schema
      } else if (
        dbProj.drive_folder_id &&
        dbProj.drive_folder_id !== localSettings.drive_folder_id
      ) {
        conflicts.push({
          entityId: projectId,
          entityType: 'project',
          field: 'drive_folder_id',
          localValue: localSettings.drive_folder_id,
          dbValue: dbProj.drive_folder_id,
          message: `تعارض في معرف مجلد Google Drive (المحلي: ${localSettings.drive_folder_id} vs قاعدة البيانات: ${dbProj.drive_folder_id})`,
        });
      }
    }

    // Check drive_cover_file_id
    if (localSettings.drive_cover_file_id !== undefined && localSettings.drive_cover_file_id !== null) {
      if (!projectAvailableCols.has('drive_cover_file_id')) {
        // Column is unreadable from DB schema
      } else if (
        dbProj.drive_cover_file_id &&
        dbProj.drive_cover_file_id !== localSettings.drive_cover_file_id
      ) {
        conflicts.push({
          entityId: projectId,
          entityType: 'project',
          field: 'drive_cover_file_id',
          localValue: localSettings.drive_cover_file_id,
          dbValue: dbProj.drive_cover_file_id,
          message: `تعارض في معرف غلاف Google Drive (المحلي: ${localSettings.drive_cover_file_id} vs قاعدة البيانات: ${dbProj.drive_cover_file_id})`,
        });
      }
    }
  }

  // -------------------------------------------------------------
  // Step 2: Probe schema columns for assets
  // -------------------------------------------------------------
  const assetColsToProbe = ['drive_file_id', 'drive_folder_id', 'source'];
  const assetAvailableCols = new Set<string>(['id', 'title', 'project_id']);

  for (const col of assetColsToProbe) {
    const { error } = await supabase.from('assets').select(col).limit(1);
    if (!error) {
      assetAvailableCols.add(col);
    } else {
      const isColMissing =
        error.code === '42703' ||
        error.code === 'PGRST204' ||
        error.message?.includes('column') ||
        error.message?.includes('schema cache');
      if (isColMissing) {
        const affected = Object.values(localAssetMap).filter(
          (m) => (m as any)[col] !== undefined
        ).length;
        if (affected > 0) {
          missingSchemaColumns.push({
            table: 'assets',
            column: col,
            reason: 'column_missing_in_db',
            affectedEntitiesCount: affected,
          });
        }
      } else {
        // Unexpected error (e.g. 42501 permission denied, 503 service unavailable, connection drop)
        // Must immediately halt and NOT silently exclude the column
        throw new Error(
          `DB_PROBE_ERROR: Failed to probe column "${col}" on table "assets": [${error.code || 'UNKNOWN'}] ${error.message}`
        );
      }
    }
  }

  // Fetch assets with all available probed columns
  const assetSelectQuery = Array.from(assetAvailableCols).join(', ');
  const { data: dbAssets, error: aErr } = await supabase
    .from('assets')
    .select(assetSelectQuery);

  if (aErr) {
    throw new Error(`DB_FETCH_ERROR: Failed to fetch assets for reconciliation: ${aErr.message}`);
  }

  const assetList: any[] = (dbAssets as any[]) || [];
  const dbAssetMap = new Map<string, any>(assetList.map((a) => [a.id, a]));

  // Compare asset fields
  for (const [assetId, localMapping] of Object.entries(localAssetMap)) {
    const dbAsset = dbAssetMap.get(assetId);
    if (!dbAsset) {
      missingAssetsInDb.push(assetId);
      continue;
    }

    // Check drive_file_id
    if (localMapping.drive_file_id !== undefined && localMapping.drive_file_id !== null) {
      if (!assetAvailableCols.has('drive_file_id')) {
        // Column unreadable
      } else if (
        dbAsset.drive_file_id &&
        dbAsset.drive_file_id !== localMapping.drive_file_id
      ) {
        conflicts.push({
          entityId: assetId,
          entityType: 'asset',
          field: 'drive_file_id',
          localValue: localMapping.drive_file_id,
          dbValue: dbAsset.drive_file_id,
          message: `تعارض في معرف ملف Google Drive (المحلي: ${localMapping.drive_file_id} vs قاعدة البيانات: ${dbAsset.drive_file_id})`,
        });
      }
    }

    // Check drive_folder_id
    if (localMapping.drive_folder_id !== undefined && localMapping.drive_folder_id !== null) {
      if (!assetAvailableCols.has('drive_folder_id')) {
        // Column unreadable
      } else if (
        dbAsset.drive_folder_id &&
        dbAsset.drive_folder_id !== localMapping.drive_folder_id
      ) {
        conflicts.push({
          entityId: assetId,
          entityType: 'asset',
          field: 'drive_folder_id',
          localValue: localMapping.drive_folder_id,
          dbValue: dbAsset.drive_folder_id,
          message: `تعارض في معرف مجلد Google Drive للأصل (المحلي: ${localMapping.drive_folder_id} vs قاعدة البيانات: ${dbAsset.drive_folder_id})`,
        });
      }
    }

    // Check source
    if (localMapping.source !== undefined && localMapping.source !== null) {
      if (!assetAvailableCols.has('source')) {
        // Column unreadable
      } else if (
        dbAsset.source &&
        dbAsset.source !== localMapping.source
      ) {
        conflicts.push({
          entityId: assetId,
          entityType: 'asset',
          field: 'source',
          localValue: localMapping.source,
          dbValue: dbAsset.source,
          message: `تعارض في مصدر تخزين الأصل (المحلي: ${localMapping.source} vs قاعدة البيانات: ${dbAsset.source})`,
        });
      }
    }
  }

  // -------------------------------------------------------------
  // Step 3: Duplicate Drive ID detection across Local & DB records
  // -------------------------------------------------------------
  const driveFileTracker = new Map<string, { localIds: string[]; dbIds: string[] }>();

  // Track local mappings
  for (const [assetId, localMapping] of Object.entries(localAssetMap)) {
    if (localMapping.drive_file_id) {
      const entry = driveFileTracker.get(localMapping.drive_file_id) || { localIds: [], dbIds: [] };
      entry.localIds.push(assetId);
      driveFileTracker.set(localMapping.drive_file_id, entry);
    }
  }

  // Track DB records if column exists
  if (assetAvailableCols.has('drive_file_id')) {
    for (const dbAsset of assetList) {
      if (dbAsset.drive_file_id) {
        const entry = driveFileTracker.get(dbAsset.drive_file_id) || { localIds: [], dbIds: [] };
        if (!entry.dbIds.includes(dbAsset.id)) {
          entry.dbIds.push(dbAsset.id);
        }
        driveFileTracker.set(dbAsset.drive_file_id, entry);
      }
    }
  }

  const duplicateDriveFileIds: DuplicateDriveIdAnomaly[] = [];
  for (const [driveFileId, { localIds, dbIds }] of driveFileTracker.entries()) {
    // Flag if duplicate within local, OR if cross-system collision exists (different local asset ID than DB asset ID)
    const combinedUnique = new Set([...localIds, ...dbIds]);
    if (localIds.length > 1 || combinedUnique.size > 1) {
      duplicateDriveFileIds.push({
        driveFileId,
        localAssetIds: localIds,
        dbAssetIds: dbIds,
        message: `تكرار في معرف ملف Drive (${driveFileId}) عبر أصول محلية (${localIds.join(', ')}) وسجلات بقاعدة البيانات (${dbIds.join(', ')})`,
      });
    }
  }

  // -------------------------------------------------------------
  // Step 4: Final Assessment
  // -------------------------------------------------------------
  const hasConflicts = conflicts.length > 0;
  const hasDuplicates = duplicateDriveFileIds.length > 0;
  const hasMissingTargets = missingProjectsInDb.length > 0 || missingAssetsInDb.length > 0;
  const hasMissingSchemaCols = missingSchemaColumns.length > 0;

  // Unreadable columns are never treated as matching!
  const canProceedSafely =
    !hasConflicts &&
    !hasDuplicates &&
    !hasMissingTargets &&
    !hasMissingSchemaCols;

  let summary = 'الفحص سليم ومطابق تماماً.';
  if (hasMissingSchemaCols) {
    summary = `قاعدة البيانات تفتقر لأعمدة مطلوبة في المخطط (${missingSchemaColumns.map((c) => `${c.table}.${c.column}`).join(', ')}).`;
  } else if (hasConflicts) {
    summary = `تم اكتشاف ${conflicts.length} تعارض(ات) في القيم بين البيانات المحلية وقاعدة البيانات.`;
  } else if (hasDuplicates) {
    summary = `تم اكتشاف تكرار في معرفات ملفات Google Drive عبر ${duplicateDriveFileIds.length} حالة.`;
  } else if (hasMissingTargets) {
    summary = `تم اكتشاف غياب سجلات مستهدفة في قاعدة البيانات (${missingProjectsInDb.length} مشاريع، ${missingAssetsInDb.length} أصول).`;
  }

  // Verified matches count only counts entities where all fields were readable and matched without conflict
  let verifiedMatchesCount = 0;
  if (!hasMissingSchemaCols) {
    const cleanProjects = Object.keys(localProjectSettings).filter(
      (id) => !missingProjectsInDb.includes(id) && !conflicts.some((c) => c.entityId === id)
    ).length;
    const cleanAssets = Object.keys(localAssetMap).filter(
      (id) => !missingAssetsInDb.includes(id) && !conflicts.some((c) => c.entityId === id)
    ).length;
    verifiedMatchesCount = cleanProjects + cleanAssets;
  }

  return {
    ok: !hasConflicts && !hasDuplicates,
    canProceedSafely,
    summary,
    missingProjectsInDb,
    missingAssetsInDb,
    conflicts,
    missingSchemaColumns,
    duplicateDriveFileIds,
    verifiedMatchesCount,
  };
}
