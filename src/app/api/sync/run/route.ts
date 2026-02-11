import { NextRequest, NextResponse } from "next/server";
import { fetchPlaySpaceData, detectAllChanges, runSync } from "@/sync";
import { createChildLogger } from "@/sync/logger";
import type { EntityType } from "@/sync/types";

const log = createChildLogger("api-run");

// Allow up to 5 minutes for Browserbase sync
export const maxDuration = 300;

/**
 * POST /api/sync/run — Run a full sync using env-configured credentials.
 *
 * Body (optional):
 *   entities?: ("client" | "appointment" | "sessionNote")[]
 *   dryRun?: boolean
 */
export async function POST(request: NextRequest) {
  // Read optional body
  let entities: EntityType[] | undefined;
  let dryRun = false;
  let dateFrom: string | undefined;
  let dateTo: string | undefined;

  try {
    const body = await request.json();
    entities = body.entities;
    dryRun = body.dryRun ?? false;
    dateFrom = body.dateFrom;
    dateTo = body.dateTo;
  } catch {
    // No body or invalid JSON — use defaults (all entities, no dry run)
  }

  // Validate env credentials
  const owlUrl = process.env.OWL_PRACTICE_URL;
  const owlEmail = process.env.OWL_PRACTICE_EMAIL;
  const owlPassword = process.env.OWL_PRACTICE_PASSWORD;
  const psClientId = process.env.PLAYSPACE_CLIENT_ID;
  const psClientSecret = process.env.PLAYSPACE_CLIENT_SECRET;
  const psAuth0Domain = process.env.PLAYSPACE_AUTH0_DOMAIN;
  const psAudience = process.env.PLAYSPACE_AUDIENCE;

  if (!owlUrl || !owlEmail || !owlPassword) {
    return NextResponse.json(
      { error: "Missing Owl Practice credentials in environment" },
      { status: 500 },
    );
  }
  if (!psClientId || !psClientSecret || !psAuth0Domain || !psAudience) {
    return NextResponse.json(
      { error: "Missing PlaySpace credentials in environment" },
      { status: 500 },
    );
  }

  log.info("Full sync triggered via UI", { entities, dryRun, dateFrom, dateTo });

  try {
    // Step 1: Fetch from PlaySpace
    const data = await fetchPlaySpaceData({
      clientId: psClientId,
      clientSecret: psClientSecret,
      auth0Domain: psAuth0Domain,
      audience: psAudience,
      baseUrl: process.env.PLAYSPACE_BASE_URL,
    }, { dateFrom, dateTo });

    // Step 2: Detect changes
    const changes = detectAllChanges(data);

    // Step 3: Push to Owl Practice
    const summary = await runSync(changes, {
      url: owlUrl,
      email: owlEmail,
      password: owlPassword,
    }, {
      dryRun,
      entities,
      mode: "automated",
      useLedger: true,
    });

    log.info("Full sync completed via UI", { counts: summary.counts });

    return NextResponse.json({
      status: summary.counts.failed > 0 ? "completed_with_errors" : "completed",
      summary,
      data: {
        clients: data.clients.length,
        appointments: data.appointments.length,
        sessionNotes: data.sessionNotes.length,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error("Full sync failed via UI", { error: message });
    return NextResponse.json(
      { error: "Sync failed", message },
      { status: 500 },
    );
  }
}
