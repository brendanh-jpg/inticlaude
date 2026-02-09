import { createHash } from "crypto";

/**
 * Hash an entity's sync-relevant data for change detection.
 * Strips metadata fields (id, source, sourceId) and sorts keys
 * so the hash is stable regardless of property order.
 */
export function hashEntity(entity: Record<string, unknown>): string {
  const { id, source, sourceId, ...relevant } = entity;
  const sorted = stableSortKeys(relevant);
  return createHash("sha256").update(JSON.stringify(sorted)).digest("hex");
}

function stableSortKeys(obj: Record<string, unknown>): Record<string, unknown> {
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    const val = obj[key];
    sorted[key] = val ?? null;
  }
  return sorted;
}
