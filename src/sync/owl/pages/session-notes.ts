import type { Page } from "playwright-core";
import type { SessionNote } from "@/sync/types";

// TODO: Implement once Owl Practice session notes pages are inspected via Browserbase

export async function navigateToSessionNotes(_page: Page): Promise<void> {
  throw new Error("Not implemented — need to inspect Owl Practice UI");
}

export async function createSessionNote(_page: Page, _note: SessionNote): Promise<void> {
  throw new Error("Not implemented — need to inspect Owl Practice UI");
}

export async function findExistingNote(
  _page: Page,
  _sourceId: string
): Promise<boolean> {
  throw new Error("Not implemented — need to inspect Owl Practice UI");
}
