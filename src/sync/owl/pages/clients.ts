import type { Page } from "playwright-core";
import type { Client } from "@/sync/types";

// TODO: Implement once Owl Practice client pages are inspected via Browserbase

export async function navigateToClients(_page: Page): Promise<void> {
  throw new Error("Not implemented — need to inspect Owl Practice UI");
}

export async function createClient(_page: Page, _client: Client): Promise<void> {
  throw new Error("Not implemented — need to inspect Owl Practice UI");
}

export async function updateClient(_page: Page, _client: Client): Promise<void> {
  throw new Error("Not implemented — need to inspect Owl Practice UI");
}

export async function findExistingClient(
  _page: Page,
  _sourceId: string
): Promise<string | null> {
  throw new Error("Not implemented — need to inspect Owl Practice UI");
}

export async function searchClientByName(
  _page: Page,
  _firstName: string,
  _lastName: string
): Promise<string | null> {
  throw new Error("Not implemented — need to inspect Owl Practice UI");
}
