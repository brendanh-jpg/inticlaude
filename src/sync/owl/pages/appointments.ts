import type { Page } from "playwright-core";
import type { Appointment } from "@/sync/types";

// TODO: Implement once Owl Practice appointment pages are inspected via Browserbase

export async function navigateToAppointments(_page: Page): Promise<void> {
  throw new Error("Not implemented — need to inspect Owl Practice UI");
}

export async function createAppointment(_page: Page, _appointment: Appointment): Promise<void> {
  throw new Error("Not implemented — need to inspect Owl Practice UI");
}

export async function updateAppointment(_page: Page, _appointment: Appointment): Promise<void> {
  throw new Error("Not implemented — need to inspect Owl Practice UI");
}

export async function findExistingAppointment(
  _page: Page,
  _sourceId: string
): Promise<string | null> {
  throw new Error("Not implemented — need to inspect Owl Practice UI");
}
