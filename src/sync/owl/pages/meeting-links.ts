import type { Page } from "playwright-core";
import type { MeetingLink } from "@/sync/types";

// TODO: Implement once Owl Practice meeting link fields are inspected via Browserbase

export async function navigateToMeetingLinks(
  _page: Page,
  _appointmentId: string
): Promise<void> {
  throw new Error("Not implemented — need to inspect Owl Practice UI");
}

export async function setMeetingLink(_page: Page, _link: MeetingLink): Promise<void> {
  throw new Error("Not implemented — need to inspect Owl Practice UI");
}
