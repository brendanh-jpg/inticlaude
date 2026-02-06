import type { Client, Appointment, SessionNote, MeetingLink, SyncResult } from "@/sync/types";
import { createBrowserSession, closeBrowserSession, type BrowserSession } from "@/sync/browser/session";
import { ensureLoggedIn } from "./auth";
import { createClient, updateClient, findExistingClient, searchClientByName } from "./pages/clients";
import { createAppointment, updateAppointment, findExistingAppointment } from "./pages/appointments";
import { createSessionNote, findExistingNote } from "./pages/session-notes";
import { setMeetingLink } from "./pages/meeting-links";
import { createChildLogger } from "@/sync/logger";

const log = createChildLogger("owl-client");

export class OwlPracticeClient {
  private session: BrowserSession | null = null;

  async connect(): Promise<void> {
    log.info("Connecting to Owl Practice...");
    this.session = await createBrowserSession();
    await ensureLoggedIn(this.session.page);
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
    await ensureLoggedIn(page);

    try {
      const existingId = await searchClientByName(page, client.firstName, client.lastName);
      if (existingId) {
        await updateClient(page, client);
        return { entity: "client", sourceId: client.sourceId, action: "updated", timestamp: new Date().toISOString() };
      }
      await createClient(page, client);
      return { entity: "client", sourceId: client.sourceId, action: "created", timestamp: new Date().toISOString() };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error("Failed to sync client", { sourceId: client.sourceId, error: message });
      return { entity: "client", sourceId: client.sourceId, action: "failed", error: message, timestamp: new Date().toISOString() };
    }
  }

  async createOrUpdateAppointment(appointment: Appointment): Promise<SyncResult> {
    const page = this.getPage();
    await ensureLoggedIn(page);

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
    await ensureLoggedIn(page);

    try {
      const exists = await findExistingNote(page, note.sourceId);
      if (exists) {
        return { entity: "sessionNote", sourceId: note.sourceId, action: "skipped", timestamp: new Date().toISOString() };
      }
      await createSessionNote(page, note);
      return { entity: "sessionNote", sourceId: note.sourceId, action: "created", timestamp: new Date().toISOString() };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error("Failed to sync session note", { sourceId: note.sourceId, error: message });
      return { entity: "sessionNote", sourceId: note.sourceId, action: "failed", error: message, timestamp: new Date().toISOString() };
    }
  }

  async pushMeetingLink(link: MeetingLink): Promise<SyncResult> {
    const page = this.getPage();
    await ensureLoggedIn(page);

    try {
      await setMeetingLink(page, link);
      return { entity: "meetingLink", sourceId: link.sourceId, action: "created", timestamp: new Date().toISOString() };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error("Failed to sync meeting link", { sourceId: link.sourceId, error: message });
      return { entity: "meetingLink", sourceId: link.sourceId, action: "failed", error: message, timestamp: new Date().toISOString() };
    }
  }
}
