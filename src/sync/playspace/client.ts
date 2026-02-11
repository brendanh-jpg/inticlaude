import type { Client, Appointment, SessionNote } from "@/sync/types";
import type { PlaySpaceCredentials } from "@/sync/types/api";
import type {
  PlaySpaceListResponse,
  PlaySpaceClientResponse,
  PlaySpaceAppointmentResponse,
  PlaySpaceNoteResponse,
  PlaySpacePractitionerResponse,
} from "./types";
import { mapClient, mapAppointment, mapNote } from "./mappers";
import { createChildLogger } from "@/sync/logger";

const log = createChildLogger("playspace-client");

const DEFAULT_BASE_URL = "https://agentic-ps.playspace.health";
const PAGE_LIMIT = 100;
const DEFAULT_PRACTITIONER_ID = "c28e47bf-2767-479d-bdac-c86a89ab7302"; // brendanh@playspace.health

export class PlaySpaceClient {
  private baseUrl: string;
  private credentials: PlaySpaceCredentials;
  private accessToken: string | null = null;

  constructor(credentials: PlaySpaceCredentials) {
    this.credentials = credentials;
    this.baseUrl = credentials.baseUrl ?? DEFAULT_BASE_URL;
  }

  /** Exchange client credentials for an Auth0 access token. */
  private async authenticate(): Promise<void> {
    if (this.accessToken) return;

    log.info("Authenticating with PlaySpace (Auth0 M2M)...");
    const tokenUrl = `https://${this.credentials.auth0Domain}/oauth/token`;

    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "client_credentials",
        client_id: this.credentials.clientId,
        client_secret: this.credentials.clientSecret,
        audience: this.credentials.audience,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`PlaySpace auth failed: ${response.status} ${body}`);
    }

    const data = await response.json() as { access_token: string };
    this.accessToken = data.access_token;
    log.info("PlaySpace authentication successful");
  }

  /** Make an authenticated GET request to the PlaySpace Partner API. */
  private async request<T>(path: string, params?: Record<string, string>): Promise<T> {
    await this.authenticate();

    const url = new URL(`/api/v1/partner${path}`, this.baseUrl);
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== "") url.searchParams.set(k, v);
      });
    }

    log.debug("PlaySpace API request", { path, params });
    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        Accept: "application/json",
      },
    });

    if (response.status === 401) {
      // Token expired — re-authenticate and retry once
      this.accessToken = null;
      await this.authenticate();
      const retryResponse = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          Accept: "application/json",
        },
      });
      if (!retryResponse.ok) {
        throw new Error(`PlaySpace API error: ${retryResponse.status} ${retryResponse.statusText}`);
      }
      return retryResponse.json() as Promise<T>;
    }

    if (!response.ok) {
      throw new Error(`PlaySpace API error: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<T>;
  }

  /** Fetch all pages of a paginated endpoint. */
  private async fetchAllPages<T>(
    path: string,
    params?: Record<string, string>,
  ): Promise<T[]> {
    const all: T[] = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const response = await this.request<PlaySpaceListResponse<T>>(path, {
        ...params,
        limit: String(PAGE_LIMIT),
        offset: String(offset),
      });

      all.push(...response.data);
      hasMore = response.pagination.hasMore;
      offset += PAGE_LIMIT;
    }

    return all;
  }

  // --- Practitioners ---

  async getPractitioners(): Promise<PlaySpacePractitionerResponse[]> {
    return this.fetchAllPages<PlaySpacePractitionerResponse>("/practitioners");
  }

  // --- Clients ---

  async getClients(options?: { practitionerId?: string }): Promise<Client[]> {
    const practitionerId = options?.practitionerId ?? DEFAULT_PRACTITIONER_ID;

    const raw = await this.fetchAllPages<PlaySpaceClientResponse>("/clients", {
      practitionerId,
    });
    return raw.map(mapClient);
  }

  // --- Appointments ---

  async getAppointments(options?: {
    practitionerId?: string;
    clientId?: string;
    dateFrom?: string;
    dateTo?: string;
  }): Promise<Appointment[]> {
    const params: Record<string, string> = {};
    params.practitionerId = options?.practitionerId ?? DEFAULT_PRACTITIONER_ID;
    if (options?.clientId) params.clientId = options.clientId;
    if (options?.dateFrom) params.dateFrom = options.dateFrom;
    if (options?.dateTo) params.dateTo = options.dateTo;
    params.include = "clients";

    const raw = await this.fetchAllPages<PlaySpaceAppointmentResponse>("/appointments", params);
    return raw.map(mapAppointment);
  }

  // --- Session Notes ---

  async getSessionNotes(options: { clientId: string }): Promise<SessionNote[]> {
    // Step 1: Fetch the list of notes (metadata only — no content)
    const raw = await this.fetchAllPages<PlaySpaceNoteResponse>("/notes", {
      clientId: options.clientId,
    });

    // Step 2: Fetch each note's full content via the detail endpoint
    // The list endpoint doesn't return the `content` field.
    // The detail endpoint requires `includeContent=true` to return it.
    const enriched: PlaySpaceNoteResponse[] = [];
    for (const note of raw) {
      try {
        const detail = await this.request<{ data: PlaySpaceNoteResponse }>(
          `/notes/${note.id}`,
          { includeContent: "true" },
        );
        enriched.push({ ...note, ...detail.data });
      } catch (error) {
        log.warn("Failed to fetch note detail — using list data", {
          noteId: note.id,
          error: error instanceof Error ? error.message : String(error),
        });
        enriched.push(note);
      }
    }

    return enriched.map((n) => mapNote(n, options.clientId));
  }

}
