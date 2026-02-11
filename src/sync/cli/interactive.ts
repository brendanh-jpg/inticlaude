import * as p from "@clack/prompts";
import { fetchPlaySpaceData, detectAllChanges, runSync } from "@/sync";
import type { DetectedChanges } from "@/sync";
import type { EntityType } from "@/sync/types";
import type { OwlCredentials, PlaySpaceCredentials } from "@/sync/types/api";
import type { ChangeSet } from "@/sync/ledger/types";
import { closeDatabase } from "@/sync/ledger/db";
import { getEnv } from "@/sync/config/env";

interface CategoryInfo {
  key: EntityType;
  label: string;
  newCount: number;
  changedCount: number;
}

function getCategoryInfo(changes: DetectedChanges): CategoryInfo[] {
  return [
    { key: "client", label: "Clients", ...counts(changes.clients) },
    { key: "appointment", label: "Appointments", ...counts(changes.appointments) },
    { key: "sessionNote", label: "Session Notes", ...counts(changes.sessionNotes) },
  ];
}

function counts(cs: ChangeSet<unknown>): { newCount: number; changedCount: number } {
  return { newCount: cs.new.length, changedCount: cs.changed.length };
}

function formatCategoryLine(cat: CategoryInfo): string {
  const total = cat.newCount + cat.changedCount;
  if (total === 0) return `${cat.label}: no changes`;
  const parts: string[] = [];
  if (cat.newCount > 0) parts.push(`${cat.newCount} new`);
  if (cat.changedCount > 0) parts.push(`${cat.changedCount} updated`);
  return `${cat.label}: ${parts.join(", ")}`;
}

function getCliCredentials(): { owl: OwlCredentials; playspace: PlaySpaceCredentials } {
  const env = getEnv();
  if (!env.OWL_PRACTICE_URL || !env.OWL_PRACTICE_EMAIL || !env.OWL_PRACTICE_PASSWORD) {
    throw new Error("OWL_PRACTICE_URL, OWL_PRACTICE_EMAIL, and OWL_PRACTICE_PASSWORD must be set in .env.local for CLI mode.");
  }
  if (!env.PLAYSPACE_CLIENT_ID || !env.PLAYSPACE_CLIENT_SECRET || !env.PLAYSPACE_AUTH0_DOMAIN || !env.PLAYSPACE_AUDIENCE) {
    throw new Error("PLAYSPACE_CLIENT_ID, PLAYSPACE_CLIENT_SECRET, PLAYSPACE_AUTH0_DOMAIN, and PLAYSPACE_AUDIENCE must be set in .env.local for CLI mode.");
  }
  return {
    owl: { url: env.OWL_PRACTICE_URL, email: env.OWL_PRACTICE_EMAIL, password: env.OWL_PRACTICE_PASSWORD },
    playspace: {
      clientId: env.PLAYSPACE_CLIENT_ID,
      clientSecret: env.PLAYSPACE_CLIENT_SECRET,
      auth0Domain: env.PLAYSPACE_AUTH0_DOMAIN,
      audience: env.PLAYSPACE_AUDIENCE,
      baseUrl: env.PLAYSPACE_BASE_URL,
    },
  };
}

export async function runInteractiveSync(dryRun: boolean): Promise<void> {
  p.intro("Inti Sync");

  let credentials: ReturnType<typeof getCliCredentials>;
  try {
    credentials = getCliCredentials();
  } catch (error) {
    p.log.error(error instanceof Error ? error.message : String(error));
    p.outro("Set up your .env.local file and try again.");
    return;
  }

  const fetchSpinner = p.spinner();
  fetchSpinner.start("Checking PlaySpace for updates...");

  let changes: DetectedChanges;
  try {
    const data = await fetchPlaySpaceData(credentials.playspace);
    changes = detectAllChanges(data);
    fetchSpinner.stop("Data checked.");
  } catch (error) {
    fetchSpinner.stop("Failed to fetch data.");
    p.log.error(error instanceof Error ? error.message : String(error));
    p.outro("Sync could not start. Check your settings and try again.");
    return;
  }

  const categories = getCategoryInfo(changes);
  const withChanges = categories.filter((c) => c.newCount + c.changedCount > 0);

  if (withChanges.length === 0) {
    p.log.success("Everything is up to date!");
    p.outro("Nothing to sync.");
    closeDatabase();
    return;
  }

  // Show what was found
  p.log.info("Changes detected:");
  for (const cat of categories) {
    p.log.message(`  ${formatCategoryLine(cat)}`);
  }

  // Ask which categories to sync
  const selected = await p.multiselect({
    message: "What would you like to sync?",
    options: withChanges.map((cat) => ({
      value: cat.key,
      label: `${cat.label} (${cat.newCount + cat.changedCount} items)`,
    })),
    initialValues: withChanges.map((c) => c.key),
  });

  if (p.isCancel(selected)) {
    p.outro("Sync cancelled.");
    closeDatabase();
    return;
  }

  const selectedEntities = selected as EntityType[];

  if (dryRun) {
    p.log.warn("Dry run — no data will be pushed to Owl Practice.");
  }

  // Run sync with progress
  const syncSpinner = p.spinner();
  syncSpinner.start("Syncing...");

  try {
    const summary = await runSync(changes, credentials.owl, {
      dryRun,
      entities: selectedEntities,
      mode: "interactive",
      useLedger: true,
    });

    syncSpinner.stop("Sync finished.");

    // Show results
    const { created, updated, failed } = summary.counts;
    const total = created + updated;

    if (failed > 0) {
      p.log.warn(`${total} synced, ${failed} failed. Check the log for details.`);
    } else if (total > 0) {
      p.log.success(`${total} items synced successfully.`);
    } else {
      p.log.info("No items were synced.");
    }

    // Per-category breakdown
    for (const entity of selectedEntities) {
      const cat = categories.find((c) => c.key === entity)!;
      const entityResults = summary.results.filter((r) => r.entity === entity);
      const c = entityResults.filter((r) => r.action === "created").length;
      const u = entityResults.filter((r) => r.action === "updated").length;
      const f = entityResults.filter((r) => r.action === "failed").length;
      const parts: string[] = [];
      if (c > 0) parts.push(`${c} created`);
      if (u > 0) parts.push(`${u} updated`);
      if (f > 0) parts.push(`${f} failed`);
      if (parts.length > 0) {
        p.log.message(`  ${cat.label}: ${parts.join(", ")}`);
      }
    }
  } catch (error) {
    syncSpinner.stop("Sync failed.");
    p.log.error(error instanceof Error ? error.message : String(error));
  }

  closeDatabase();
  p.outro("Done!");
}
