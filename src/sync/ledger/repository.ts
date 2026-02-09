import { getDatabase } from "./db";
import type { EntityType, SyncRecord, SyncRunRecord } from "./types";

// --- Sync Records ---

export function findRecord(sourceId: string, entityType: EntityType): SyncRecord | undefined {
  const db = getDatabase();
  const row = db
    .prepare("SELECT * FROM sync_records WHERE source_id = ? AND entity_type = ?")
    .get(sourceId, entityType) as RawSyncRow | undefined;
  return row ? toSyncRecord(row) : undefined;
}

export function upsertRecord(
  sourceId: string,
  entityType: EntityType,
  dataHash: string,
  syncStatus: "synced" | "failed" | "pending",
  owlReference?: string | null,
  errorMessage?: string | null,
): void {
  const db = getDatabase();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO sync_records (source_id, entity_type, data_hash, sync_status, owl_reference, error_message, last_synced_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(source_id, entity_type) DO UPDATE SET
      data_hash = excluded.data_hash,
      sync_status = excluded.sync_status,
      owl_reference = COALESCE(excluded.owl_reference, sync_records.owl_reference),
      error_message = excluded.error_message,
      last_synced_at = excluded.last_synced_at,
      updated_at = excluded.updated_at
  `).run(sourceId, entityType, dataHash, syncStatus, owlReference ?? null, errorMessage ?? null, now, now, now);
}

export function markSynced(sourceId: string, entityType: EntityType, dataHash: string, owlReference?: string): void {
  upsertRecord(sourceId, entityType, dataHash, "synced", owlReference);
}

export function markFailed(sourceId: string, entityType: EntityType, dataHash: string, error: string): void {
  upsertRecord(sourceId, entityType, dataHash, "failed", null, error);
}

// --- Sync Runs ---

export function createRun(
  runId: string,
  mode: "interactive" | "automated",
  dryRun: boolean,
): void {
  const db = getDatabase();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO sync_runs (run_id, started_at, mode, dry_run, entities_synced, counts_json, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(runId, now, mode, dryRun ? 1 : 0, "[]", "{}", "running");
}

export function completeRun(
  runId: string,
  entitiesSynced: EntityType[],
  counts: { created: number; updated: number; skipped: number; failed: number },
  status: "completed" | "failed",
): void {
  const db = getDatabase();
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE sync_runs
    SET completed_at = ?, entities_synced = ?, counts_json = ?, status = ?
    WHERE run_id = ?
  `).run(now, JSON.stringify(entitiesSynced), JSON.stringify(counts), status, runId);
}

// --- Internal helpers ---

interface RawSyncRow {
  id: number;
  source_id: string;
  entity_type: string;
  data_hash: string;
  sync_status: string;
  owl_reference: string | null;
  error_message: string | null;
  last_synced_at: string;
  created_at: string;
  updated_at: string;
}

function toSyncRecord(row: RawSyncRow): SyncRecord {
  return {
    id: row.id,
    sourceId: row.source_id,
    entityType: row.entity_type as EntityType,
    dataHash: row.data_hash,
    syncStatus: row.sync_status as SyncRecord["syncStatus"],
    owlReference: row.owl_reference,
    errorMessage: row.error_message,
    lastSyncedAt: row.last_synced_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
