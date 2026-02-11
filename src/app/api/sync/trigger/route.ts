import { NextRequest, NextResponse } from "next/server";
import { syncRequestSchema } from "@/sync/types/api";
import { runSyncFromData } from "@/sync";
import { createChildLogger } from "@/sync/logger";

const log = createChildLogger("api-trigger");

// Allow up to 5 minutes for Browserbase sync (Vercel Pro plan)
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON in request body" },
      { status: 400 },
    );
  }

  const parsed = syncRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const { practiceId, owlPractice, data, options } = parsed.data;

  log.info("Sync triggered via API", {
    practiceId,
    clients: data.clients.length,
    appointments: data.appointments.length,
    sessionNotes: data.sessionNotes.length,
    dryRun: options?.dryRun ?? false,
  });

  try {
    const summary = await runSyncFromData(data, owlPractice, {
      dryRun: options?.dryRun,
      entities: options?.entities,
      mode: "automated",
    });

    log.info("Sync completed via API", { practiceId, counts: summary.counts });

    return NextResponse.json(
      {
        jobId: summary.runId,
        status: summary.counts.failed > 0 ? "completed_with_errors" : "completed",
        summary,
      },
      { status: summary.counts.failed > 0 ? 207 : 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error("Sync failed via API", { practiceId, error: message });

    return NextResponse.json(
      { error: "Sync failed", message },
      { status: 500 },
    );
  }
}
