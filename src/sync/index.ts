import { randomUUID } from "crypto";
import type { SyncResult, SyncRunSummary } from "@/sync/types";
import { PlaySpaceClient } from "@/sync/playspace/client";
import { OwlPracticeClient } from "@/sync/owl/client";
import { createChildLogger } from "@/sync/logger";

const log = createChildLogger("sync-engine");

export async function runSync(options?: { dryRun?: boolean }): Promise<SyncRunSummary> {
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const results: SyncResult[] = [];
  const dryRun = options?.dryRun ?? false;

  log.info("Starting sync run", { runId, dryRun });

  const playspace = new PlaySpaceClient();
  const owl = new OwlPracticeClient();

  try {
    // 1. Fetch data from PlaySpace API
    log.info("Fetching data from PlaySpace...");
    const clients = await playspace.getClients();
    const appointments = await playspace.getAppointments();
    const sessionNotes = await playspace.getSessionNotes();
    const meetingLinks = await playspace.getMeetingLinks();

    log.info("PlaySpace data fetched", {
      clients: clients.length,
      appointments: appointments.length,
      sessionNotes: sessionNotes.length,
      meetingLinks: meetingLinks.length,
    });

    if (dryRun) {
      log.info("Dry run — skipping Owl Practice push");
      return buildSummary(runId, startedAt, results);
    }

    // 2. Connect to Owl Practice
    await owl.connect();

    // 3. Sync clients first (other entities reference them)
    for (const client of clients) {
      const result = await owl.createOrUpdateClient(client);
      results.push(result);
    }

    // 4. Sync appointments
    for (const appointment of appointments) {
      const result = await owl.createOrUpdateAppointment(appointment);
      results.push(result);
    }

    // 5. Sync session notes
    for (const note of sessionNotes) {
      const result = await owl.pushSessionNote(note);
      results.push(result);
    }

    // 6. Sync meeting links
    for (const link of meetingLinks) {
      const result = await owl.pushMeetingLink(link);
      results.push(result);
    }
  } catch (error) {
    log.error("Sync run failed", {
      runId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    await owl.disconnect();
  }

  const summary = buildSummary(runId, startedAt, results);
  log.info("Sync run complete", { runId, counts: summary.counts });
  return summary;
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
