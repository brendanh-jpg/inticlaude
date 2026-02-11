import type { Client, Appointment, SessionNote, SyncResult } from "@/sync/types";
import type { OwlCredentials } from "@/sync/types/api";
import { createBrowserSession, closeBrowserSession, type BrowserSession } from "@/sync/browser/session";
import { ensureLoggedIn } from "./auth";
import { createClient, updateClient, findExistingClient, searchClientByName } from "./pages/clients";
import { createAppointment, updateAppointment, findExistingAppointment } from "./pages/appointments";
import { navigateToSessionNotes, createSessionNote, findExistingNote } from "./pages/session-notes";
import { createChildLogger } from "@/sync/logger";
import { findRecord } from "@/sync/ledger/repository";

const log = createChildLogger("owl-client");

export class OwlPracticeClient {
  private session: BrowserSession | null = null;
  private credentials: OwlCredentials;

  constructor(credentials: OwlCredentials) {
    this.credentials = credentials;
  }

  async connect(): Promise<void> {
    log.info("Connecting to Owl Practice...");
    this.session = await createBrowserSession();
    await ensureLoggedIn(this.session.page, this.credentials);
    log.info("Connected to Owl Practice");
  }

  async disconnect(): Promise<void> {
    if (this.session) {
      await closeBrowserSession(this.session);
      this.session = null;
      log.info("Disconnected from Owl Practice");
    }
  }

  private getPage() {
    if (!this.session) {
      throw new Error("Not connected — call connect() first");
    }
    return this.session.page;
  }

  async createOrUpdateClient(client: Client): Promise<SyncResult> {
    const page = this.getPage();
    await ensureLoggedIn(page, this.credentials);

    try {
      // Step 1: Check ledger first (fast — no browser automation)
      const ledgerRecord = findRecord(client.sourceId, "client");
      if (ledgerRecord?.syncStatus === "synced" && ledgerRecord.owlReference) {
        log.info("Client already synced (ledger) — skipping", {
          name: `${client.firstName} ${client.lastName}`,
          owlId: ledgerRecord.owlReference,
        });
        return { entity: "client", sourceId: client.sourceId, action: "skipped", owlReference: ledgerRecord.owlReference, timestamp: new Date().toISOString() };
      }

      // Step 2: Search Owl UI by name (fallback if ledger has no record)
      const existingId = await searchClientByName(page, client.firstName, client.lastName);
      if (existingId) {
        log.info("Client already exists in Owl (name search) — skipping", {
          name: `${client.firstName} ${client.lastName}`,
          owlId: existingId,
        });
        return { entity: "client", sourceId: client.sourceId, action: "skipped", owlReference: existingId, timestamp: new Date().toISOString() };
      }

      // Step 3: Create new client (last resort)
      const newOwlId = await createClient(page, client);
      return { entity: "client", sourceId: client.sourceId, action: "created", owlReference: newOwlId, timestamp: new Date().toISOString() };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error("Failed to sync client", { sourceId: client.sourceId, error: message });
      return { entity: "client", sourceId: client.sourceId, action: "failed", error: message, timestamp: new Date().toISOString() };
    }
  }

  async createOrUpdateAppointment(appointment: Appointment): Promise<SyncResult> {
    const page = this.getPage();
    await ensureLoggedIn(page, this.credentials);

    try {
      const existingId = await findExistingAppointment(page, appointment.sourceId);
      if (existingId) {
        await updateAppointment(page, appointment);
        return { entity: "appointment", sourceId: appointment.sourceId, action: "updated", timestamp: new Date().toISOString() };
      }
      await createAppointment(page, appointment);
      return { entity: "appointment", sourceId: appointment.sourceId, action: "created", timestamp: new Date().toISOString() };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error("Failed to sync appointment", { sourceId: appointment.sourceId, error: message });
      return { entity: "appointment", sourceId: appointment.sourceId, action: "failed", error: message, timestamp: new Date().toISOString() };
    }
  }

  async pushSessionNote(note: SessionNote): Promise<SyncResult> {
    const page = this.getPage();
    await ensureLoggedIn(page, this.credentials);

    try {
      const exists = await findExistingNote(page, note.sourceId);
      if (exists) {
        return { entity: "sessionNote", sourceId: note.sourceId, action: "skipped", timestamp: new Date().toISOString() };
      }

      // Resolve the Owl client ID from the ledger (clients are synced first)
      let owlClientId: string | undefined;
      if (note.clientId) {
        const clientRecord = findRecord(note.clientId, "client");
        if (clientRecord?.owlReference) {
          owlClientId = clientRecord.owlReference;
        }
      }

      if (!owlClientId) {
        log.warn("Cannot find Owl client ID for session note — client may not be synced yet", {
          sourceId: note.sourceId,
          clientId: note.clientId,
        });
        return { entity: "sessionNote", sourceId: note.sourceId, action: "failed", error: "Owl client ID not found — sync clients first", timestamp: new Date().toISOString() };
      }

      // Navigate to the client's Sessions & Notes page
      await navigateToSessionNotes(page, owlClientId);

      await createSessionNote(page, note);
      return { entity: "sessionNote", sourceId: note.sourceId, action: "created", timestamp: new Date().toISOString() };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error("Failed to sync session note", { sourceId: note.sourceId, error: message });
      return { entity: "sessionNote", sourceId: note.sourceId, action: "failed", error: message, timestamp: new Date().toISOString() };
    }
  }

}
