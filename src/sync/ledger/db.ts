import Database from "better-sqlite3";
import path from "path";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sync_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  data_hash TEXT NOT NULL,
  sync_status TEXT NOT NULL DEFAULT 'pending',
  owl_reference TEXT,
  error_message TEXT,
  last_synced_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(source_id, entity_type)
);

CREATE INDEX IF NOT EXISTS idx_source_entity ON sync_records(source_id, entity_type);
CREATE INDEX IF NOT EXISTS idx_entity_status ON sync_records(entity_type, sync_status);

CREATE TABLE IF NOT EXISTS sync_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL UNIQUE,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  mode TEXT NOT NULL,
  dry_run INTEGER NOT NULL DEFAULT 0,
  entities_synced TEXT NOT NULL,
  counts_json TEXT NOT NULL,
  status TEXT NOT NULL
);
`;

let _db: Database.Database | null = null;

export function getDatabase(): Database.Database {
  if (!_db) {
    const dbPath = process.env.SYNC_LEDGER_PATH
      ? path.resolve(process.env.SYNC_LEDGER_PATH)
      : path.resolve(process.cwd(), "sync_ledger.db");

    _db = new Database(dbPath);
    _db.pragma("journal_mode = WAL");
    _db.exec(SCHEMA);
  }
  return _db;
}

export function closeDatabase(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
