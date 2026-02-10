import type { Page } from "playwright-core";
import type { Client } from "@/sync/types";
import { createChildLogger } from "@/sync/logger";

const log = createChildLogger("owl-clients");

/**
 * Owl Practice Client Page Automation
 *
 * UI Structure (confirmed via Browserbase inspection):
 * - Clients list: /clients/all-clients (SPA route, must click sidebar nav)
 * - Add Client: Modal dialog triggered by button[aria-label="add client"] in top nav
 * - Modal uses BlueprintJS (.bp3-overlay, .bp3-dialog)
 * - Client detail: /client/{id}/sessions (click client name link)
 * - Edit client: /client/{id}/contact → "Contact & Clinical" sidebar link
 *
 * Add Client Modal Form Fields:
 *   input[name="first_name"]    — First Name (required)
 *   input[name="last_name"]     — Last Name (required)
 *   input[name="middle_name"]   — Middle Name
 *   input[name="nickname"]      — Preferred Name / Nickname
 *   input[name="email"]         — Email
 *   input[type="tel"]           — Phone Number
 *   input[name="street_address"] — Street Address
 *   input[name="city"]          — City
 *   input[name="postal_code"]   — Postal Code
 *   input[name="gender_identity"] — Gender Identity
 *   input[name="preferred_pronoun"] — Pronouns
 *   textarea[name="priority_comments"] — Priority Comments
 *   Country/Province: react-select dropdowns (defaults to Canada/Ontario)
 *
 * Submit: button:has-text("Add Client") (teal button in modal footer)
 *         button:has-text("Add and Edit") (green button — opens edit page after)
 */

const MODAL_TIMEOUT = 5000;
const NAV_TIMEOUT = 5000;

/**
 * Navigate to the Clients list page via sidebar nav click.
 * Owl is a SPA — direct URL navigation often redirects to /calendar.
 */
export async function navigateToClients(page: Page): Promise<void> {
  log.info("Navigating to Clients list...");

  // Click "Clients" in the left sidebar nav
  await page.click('a:has-text("Clients")', { timeout: NAV_TIMEOUT });
  await page.waitForTimeout(2000);

  // Verify we're on the clients page
  const url = page.url();
  if (!url.includes("/clients")) {
    throw new Error(`Failed to navigate to clients — landed on: ${url}`);
  }

  log.info("On clients list page", { url });
}

/**
 * Open the "Add Client" modal by clicking the add client button in the top nav.
 * This button has aria-label="add client" and is always present in the top nav bar.
 */
async function openAddClientModal(page: Page): Promise<void> {
  log.info("Opening Add Client modal...");

  await page.click('button[aria-label="add client"]', { timeout: NAV_TIMEOUT });

  // Wait for the BlueprintJS modal to appear
  await page.waitForSelector('.bp3-dialog', { timeout: MODAL_TIMEOUT, state: "visible" });
  await page.waitForTimeout(500); // Let animation finish

  log.info("Add Client modal opened");
}

/**
 * Close any open modal by clicking outside it or pressing Escape.
 */
async function closeModal(page: Page): Promise<void> {
  try {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
  } catch {
    // Modal might already be closed
  }
}

/**
 * Fill in the Add Client modal form fields from a Client object.
 * Only fills fields that have values — leaves others empty.
 */
async function fillClientForm(page: Page, client: Client): Promise<void> {
  log.info("Filling client form", { firstName: client.firstName, lastName: client.lastName });

  // Required fields
  await page.fill('input[name="first_name"]', client.firstName);
  await page.fill('input[name="last_name"]', client.lastName);

  // Optional fields — only fill if we have data
  if (client.preferredName) {
    await page.fill('input[name="nickname"]', client.preferredName);
  }

  if (client.email) {
    await page.fill('input[name="email"]', client.email);
  }

  if (client.phone) {
    await page.fill('input[type="tel"]', client.phone);
  }

  if (client.city) {
    await page.fill('input[name="city"]', client.city);
  }

  // Notes go into priority comments if available
  if (client.notes) {
    await page.fill('textarea[name="priority_comments"]', client.notes);
  }

  log.info("Client form filled");
}

/**
 * Create a new client in Owl Practice.
 *
 * Flow:
 * 1. Click the "add client" button in the top nav → opens modal
 * 2. Fill in form fields
 * 3. Click "Add Client" button to save
 * 4. Wait for modal to close
 */
export async function createClient(page: Page, client: Client): Promise<void> {
  log.info("Creating client in Owl Practice", {
    firstName: client.firstName,
    lastName: client.lastName,
    sourceId: client.sourceId,
  });

  await openAddClientModal(page);
  await fillClientForm(page, client);

  // Click "Add Client" button (teal button in modal footer)
  // Use a more specific selector to avoid matching "Add Client List" or other buttons
  await page.click('.bp3-dialog button:has-text("Add Client")', { timeout: NAV_TIMEOUT });

  // After clicking "Add Client", Owl may:
  // 1. Close the modal and show a success toast
  // 2. Open a second dialog (e.g., "Client Created" confirmation)
  // 3. Keep the modal open with validation errors
  // Wait for the form submission to be processed
  await page.waitForTimeout(3000);

  // Close any remaining modals by pressing Escape
  try {
    const dialog = await page.$('.bp3-dialog');
    if (dialog && await dialog.isVisible()) {
      log.info("Dialog still visible after submit — closing it");
      await page.keyboard.press("Escape");
      await page.waitForTimeout(1000);
    }
  } catch {
    // No dialog found — that's fine
  }

  log.info("Client created successfully", { name: `${client.firstName} ${client.lastName}` });
}

/**
 * Update an existing client in Owl Practice.
 *
 * Flow:
 * 1. Navigate to clients list
 * 2. Click on the client row to open their detail page
 * 3. Click "Contact & Clinical" in the sidebar
 * 4. Update the editable fields
 * 5. Save
 *
 * NOTE: This is a basic implementation. Editing in Owl requires navigating
 * through the SPA, finding the client, and updating inline-editable fields.
 * For MVP, we log a warning and skip — creating new clients is the priority.
 */
export async function updateClient(page: Page, client: Client): Promise<void> {
  log.warn("Client update not yet fully implemented — skipping", {
    firstName: client.firstName,
    lastName: client.lastName,
    sourceId: client.sourceId,
  });

  // For MVP: skip updates. Creating is the priority.
  // The orchestrator in owl/client.ts will handle this as "skipped".
  throw new Error("Client update not yet implemented — creating new clients only for MVP");
}

/**
 * Search for an existing client by source ID.
 *
 * Owl Practice doesn't have a concept of "source ID" — it uses its own internal IDs.
 * This would require maintaining a mapping between PlaySpace IDs and Owl IDs.
 * For MVP, always returns null (treat as "not found" → create new).
 */
export async function findExistingClient(
  _page: Page,
  _sourceId: string
): Promise<string | null> {
  // MVP: No source ID lookup in Owl. Return null to always create.
  return null;
}

/**
 * Search for a client by name on the clients list page.
 *
 * Uses the search/filter on the All Clients table.
 * Returns the Owl client ID if found, null if not.
 */
export async function searchClientByName(
  page: Page,
  firstName: string,
  lastName: string
): Promise<string | null> {
  log.info("Searching for client by name", { firstName, lastName });

  // Navigate to clients list first
  await navigateToClients(page);

  // Look for a matching client name in the table
  // Owl shows names as "LastName, FirstName" in the client table
  const searchName = `${lastName}, ${firstName}`;
  const clientLink = await page.$(`a[title="${searchName}"], a:has-text("${searchName}")`);

  if (clientLink) {
    // Extract the client ID from the href (format: /client/{id}/sessions)
    const href = await clientLink.getAttribute("href");
    const match = href?.match(/\/client\/(\d+)\//);
    if (match) {
      log.info("Found existing client", { name: searchName, owlId: match[1] });
      return match[1];
    }
  }

  log.info("Client not found", { name: searchName });
  return null;
}
