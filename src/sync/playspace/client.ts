import type { Client, Appointment, SessionNote, MeetingLink } from "@/sync/types";
import { getEnv } from "@/sync/config/env";
import { createChildLogger } from "@/sync/logger";

const log = createChildLogger("playspace-client");

export class PlaySpaceClient {
  private baseUrl: string;
  private apiKey: string;

  constructor() {
    const env = getEnv();
    this.baseUrl = env.PLAYSPACE_API_BASE_URL;
    this.apiKey = env.PLAYSPACE_API_KEY;
  }

  private async request<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(path, this.baseUrl);
    if (params) {
      Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    }

    log.debug("PlaySpace API request", { path, params });
    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`PlaySpace API error: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<T>;
  }

  // TODO: Implement once PlaySpace API endpoints and response shapes are known

  async getClients(_options?: { since?: Date; limit?: number }): Promise<Client[]> {
    throw new Error("Not implemented — awaiting PlaySpace API documentation");
  }

  async getClient(_id: string): Promise<Client> {
    throw new Error("Not implemented — awaiting PlaySpace API documentation");
  }

  async getAppointments(_options?: { since?: Date; clientId?: string }): Promise<Appointment[]> {
    throw new Error("Not implemented — awaiting PlaySpace API documentation");
  }

  async getAppointment(_id: string): Promise<Appointment> {
    throw new Error("Not implemented — awaiting PlaySpace API documentation");
  }

  async getSessionNotes(_options?: { since?: Date; clientId?: string }): Promise<SessionNote[]> {
    throw new Error("Not implemented — awaiting PlaySpace API documentation");
  }

  async getSessionNote(_id: string): Promise<SessionNote> {
    throw new Error("Not implemented — awaiting PlaySpace API documentation");
  }

  async getMeetingLinks(_options?: { appointmentId?: string }): Promise<MeetingLink[]> {
    throw new Error("Not implemented — awaiting PlaySpace API documentation");
  }
}
