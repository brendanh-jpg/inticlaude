export type EntityType = "client" | "appointment" | "sessionNote" | "meetingLink";

export type SyncStatus = "synced" | "failed" | "pending";

export interface SyncRecord {
  id: number;
  sourceId: string;
  entityType: EntityType;
  dataHash: string;
  syncStatus: SyncStatus;
  owlReference: string | null;
  errorMessage: string | null;
  lastSyncedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface SyncRunRecord {
  id: number;
  runId: string;
  startedAt: string;
  completedAt: string | null;
  mode: "interactive" | "automated";
  dryRun: boolean;
  entitiesSynced: EntityType[];
  counts: { created: number; updated: number; skipped: number; failed: number };
  status: "running" | "completed" | "failed";
}

export interface ChangeSet<T> {
  new: T[];
  changed: T[];
  unchanged: T[];
}
