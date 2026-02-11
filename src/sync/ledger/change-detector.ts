import { hashEntity } from "./hash";
import { findRecord } from "./repository";
import type { EntityType, ChangeSet } from "./types";

/**
 * Compare a list of fetched entities against the ledger to find
 * what's new, what's changed, and what's unchanged.
 */
export function detectChanges<T extends { sourceId: string }>(
  entities: T[],
  entityType: EntityType,
): ChangeSet<T> {
  const result: ChangeSet<T> = { new: [], changed: [], unchanged: [] };

  for (const entity of entities) {
    const hash = hashEntity(entity as unknown as Record<string, unknown>);
    const existing = findRecord(entity.sourceId, entityType);

    if (!existing) {
      result.new.push(entity);
    } else if (existing.dataHash !== hash || existing.syncStatus === "pending") {
      // Re-sync if data changed OR if a previous sync was interrupted (pending)
      result.changed.push(entity);
    } else {
      result.unchanged.push(entity);
    }
  }

  return result;
}
