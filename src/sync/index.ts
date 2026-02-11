import { randomUUID } from "crypto";
import type { SyncResult, SyncRunSummary, EntityType } from "@/sync/types";
import type { Client, Appointment, SessionNote } from "@/sync/types";
import type { OwlCredentials, PlaySpaceCredentials } from "@/sync/types/api";
import { PlaySpaceClient } from "@/sync/playspace/client";
import { OwlPracticeClient } from "@/sync/owl/client";
import { createChildLogger } from "@/sync/logger";
import { detectChanges } from "@/sync/ledger/change-detector";
import { hashEntity } from "@/sync/ledger/hash";
import { findRecord, markSynced, markFailed, createRun, completeRun } from "@/sync/ledger/repository";
import type { ChangeSet } from "@/sync/ledger/types";

const log = createChildLogger("sync-engine");

export interface SyncOptions {
  dryRun?: boolean;
  entities?: EntityType[];
  mode?: "interactive" | "automated";
  useLedger?: boolean;
}

export interface FetchedData {
  clients: Client[];
  appointments: Appointment[];
  sessionNotes: SessionNote[];
}

export interface DetectedChanges {
  clients: ChangeSet<Client>;
  appointments: ChangeSet<Appointment>;
  sessionNotes: ChangeSet<SessionNote>;
}

/** Fetch all data from PlaySpace API (used by CLI). */
export async function fetchPlaySpaceData(
  credentials: PlaySpaceCredentials,
  dateRange?: { dateFrom?: string; dateTo?: string },
): Promise<FetchedData> {
  const playspace = new PlaySpaceClient(credentials);

  const dateFrom = dateRange?.dateFrom || process.env.SYNC_DATE_FROM;
  const dateTo = dateRange?.dateTo || process.env.SYNC_DATE_TO;

  log.info("Fetching data from PlaySpace...", { dateFrom, dateTo });

  // Fetch clients and appointments in parallel
  const [clients, appointments] = await Promise.all([
    playspace.getClients(),
    playspace.getAppointments({ dateFrom, dateTo }),
  ]);

  // Notes require a clientId — fetch for each client
  const allNotes: SessionNote[] = [];
  for (const client of clients) {
    const notes = await playspace.getSessionNotes({ clientId: client.sourceId });
    allNotes.push(...notes);
  }

  log.info("PlaySpace data fetched", {
    clients: clients.length,
    appointments: appointments.length,
    sessionNotes: allNotes.length,
  });

  return { clients, appointments, sessionNotes: allNotes };
}

/** Compare fetched data against the ledger to find new/changed items. */
export function detectAllChanges(data: FetchedData): DetectedChanges {
  return {
    clients: detectChanges(data.clients, "client"),
    appointments: detectChanges(data.appointments, "appointment"),
    sessionNotes: detectChanges(data.sessionNotes, "sessionNote"),
  };
}

/** Convert raw data to DetectedChanges (treats everything as new — no ledger). */
export function dataAsNewChanges(data: FetchedData): DetectedChanges {
  return {
    clients: { new: data.clients, changed: [], unchanged: [] },
    appointments: { new: data.appointments, changed: [], unchanged: [] },
    sessionNotes: { new: data.sessionNotes, changed: [], unchanged: [] },
  };
}

/**
 * API entry point — accepts data + credentials directly.
 * No ledger, no PlaySpace fetch needed. PlaySpace sends everything.
 */
export async function runSyncFromData(
  data: FetchedData,
  owlCredentials: OwlCredentials,
  options?: SyncOptions,
): Promise<SyncRunSummary> {
  const changes = dataAsNewChanges(data);
  return runSync(changes, owlCredentials, options);
}

/** Run sync for selected entity types, using change-detected data. */
export async function runSync(
  changes: DetectedChanges,
  owlCredentials: OwlCredentials,
  options?: SyncOptions,
): Promise<SyncRunSummary> {
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const results: SyncResult[] = [];
  const dryRun = options?.dryRun ?? false;
  const mode = options?.mode ?? "automated";
  const useLedger = options?.useLedger ?? false;
  const selectedEntities = options?.entities ?? ["client", "appointment", "sessionNote"];

  log.info("Starting sync run", { runId, dryRun, entities: selectedEntities });

  if (useLedger) {
    createRun(runId, mode, dryRun);
  }

  if (dryRun) {
    log.info("Dry run — skipping Owl Practice push");
    const summary = buildSummary(runId, startedAt, results);
    if (useLedger) completeRun(runId, selectedEntities, summary.counts, "completed");
    return summary;
  }

  const owl = new OwlPracticeClient(owlCredentials);

  try {
    await owl.connect();

    if (selectedEntities.includes("client")) {
      const items = [...changes.clients.new, ...changes.clients.changed];

      // Also process unchanged clients whose owlReference is missing in the ledger.
      // This backfills the reference (via Owl name search) so that session notes
      // can resolve the Owl client ID.
      if (useLedger) {
        for (const client of changes.clients.unchanged) {
          const record = findRecord(client.sourceId, "client");
          if (!record?.owlReference) {
            items.push(client);
          }
        }
      }

      for (const client of items) {
        const result = await owl.createOrUpdateClient(client);
        results.push(result);
        if (useLedger) recordResult(result, client);
      }
    }

    if (selectedEntities.includes("appointment")) {
      const items = [...changes.appointments.new, ...changes.appointments.changed];
      for (const appointment of items) {
        const result = await owl.createOrUpdateAppointment(appointment);
        results.push(result);
        if (useLedger) recordResult(result, appointment);
      }
    }

    if (selectedEntities.includes("sessionNote")) {
      const items = [...changes.sessionNotes.new, ...changes.sessionNotes.changed];
      for (const note of items) {
        const result = await owl.pushSessionNote(note);
        results.push(result);
        if (useLedger) recordResult(result, note);
      }
    }

  } catch (error) {
    log.error("Sync run failed", {
      runId,
      error: error instanceof Error ? error.message : String(error),
    });
    const summary = buildSummary(runId, startedAt, results);
    if (useLedger) completeRun(runId, selectedEntities, summary.counts, "failed");
    throw error;
  } finally {
    await owl.disconnect();
  }

  const summary = buildSummary(runId, startedAt, results);
  log.info("Sync run complete", { runId, counts: summary.counts });
  if (useLedger) completeRun(runId, selectedEntities, summary.counts, "completed");
  return summary;
}

function recordResult(result: SyncResult, entity: { sourceId: string }): void {
  const hash = hashEntity(entity as unknown as Record<string, unknown>);
  if (result.action === "created" || result.action === "updated" || result.action === "skipped") {
    markSynced(entity.sourceId, result.entity, hash, result.owlReference);
  } else if (result.action === "failed") {
    markFailed(entity.sourceId, result.entity, hash, result.error ?? "Unknown error");
  }
}

function buildSummary(runId: string, startedAt: string, results: SyncResult[]): SyncRunSummary {
  return {
    runId,
    startedAt,
    completedAt: new Date().toISOString(),
    results,
    counts: {
      created: results.filter((r) => r.action === "created").length,
      updated: results.filter((r) => r.action === "updated").length,
      skipped: results.filter((r) => r.action === "skipped").length,
      failed: results.filter((r) => r.action === "failed").length,
    },
  };
}
