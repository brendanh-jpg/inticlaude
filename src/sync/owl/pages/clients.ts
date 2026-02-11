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

  // Close any lingering modals first
  for (let i = 0; i < 3; i++) {
    try {
      const overlay = await page.$('.bp3-overlay-backdrop');
      if (overlay && await overlay.isVisible()) {
        await page.keyboard.press("Escape");
        await page.waitForTimeout(500);
      } else {
        break;
      }
    } catch { break; }
  }

  // If already on the clients page, just wait for it to settle
  if (page.url().includes("/clients/all-clients")) {
    await page.waitForTimeout(1000);
    log.info("Already on clients list page");
    return;
  }

  // Navigate via sidebar link (SPA navigation — preserves session state)
  try {
    await page.click('a:has-text("Clients")', { timeout: 5000 });
    await page.waitForTimeout(2000);
  } catch {
    // Fallback: direct URL navigation if sidebar click fails
    log.warn("Sidebar click failed, trying direct URL navigation");
    const baseUrl = page.url().split("/").slice(0, 3).join("/");
    await page.goto(`${baseUrl}/clients/all-clients`, { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForTimeout(3000);
  }

  // Verify we're on the clients page
  const url = page.url();
  if (!url.includes("/clients")) {
    log.warn("Not on clients page after navigation", { url });
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
export async function createClient(page: Page, client: Client): Promise<string | undefined> {
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

  // Aggressively close any remaining modals/overlays to prevent blocking navigation
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const overlay = await page.$('.bp3-overlay-backdrop, .bp3-dialog');
      if (overlay && await overlay.isVisible()) {
        log.info("Overlay/dialog still visible — closing (attempt " + (attempt + 1) + ")");
        await page.keyboard.press("Escape");
        await page.waitForTimeout(800);
      } else {
        break; // No more overlays
      }
    } catch {
      break; // No overlay found
    }
  }
  // Final check — click the backdrop directly if still present
  try {
    const backdrop = await page.$('.bp3-overlay-backdrop');
    if (backdrop && await backdrop.isVisible()) {
      await backdrop.click();
      await page.waitForTimeout(500);
    }
  } catch { /* clean */ }

  // Try to extract the Owl client ID from the current URL
  // After creation, Owl may redirect to /client/{id}/sessions
  let owlClientId: string | undefined;
  const url = page.url();
  const idMatch = url.match(/\/client\/(\d+)\//);
  if (idMatch) {
    owlClientId = idMatch[1];
    log.info("Client created successfully", { name: `${client.firstName} ${client.lastName}`, owlId: owlClientId });
  } else {
    // If we're not on the client page, search for the newly created client
    owlClientId = (await searchClientByName(page, client.firstName, client.lastName)) ?? undefined;
    log.info("Client created successfully", { name: `${client.firstName} ${client.lastName}`, owlId: owlClientId ?? "unknown" });
  }

  return owlClientId;
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
 * Owl Practice uses styled-components (not <a> links or <table>):
 *   - Client names are <span class="ClientCodeBlock__ClientName-...">
 *   - Names shown as "LastName, FirstName" format
 *   - Search box: input[placeholder="Search..."]
 *   - Clicking a client name navigates to /client/{id}/sessions
 *
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

  // Type into the search box to filter the client list
  const searchInput = await page.$('input[placeholder="Search..."]');
  if (searchInput) {
    // Clear any previous search first
    await searchInput.fill("");
    await page.waitForTimeout(500);
    await searchInput.fill(`${firstName} ${lastName}`);
    await page.waitForTimeout(2000); // Let the list filter
    log.info("Typed search query", { query: `${firstName} ${lastName}` });
  }

  // Client names are <span class="ClientCodeBlock__ClientName-..."> elements,
  // shown as "LastName, FirstName" format.
  // Use evaluate to find the exact match and click it.
  const searchName = `${lastName}, ${firstName}`;
  const found = await page.evaluate((name) => {
    const spans = document.querySelectorAll('span[class*="ClientName"]');
    for (const span of spans) {
      if (span.textContent?.trim() === name) {
        (span as HTMLElement).click();
        return true;
      }
    }
    return false;
  }, searchName);

  if (found) {
    await page.waitForTimeout(3000); // Wait for SPA navigation

    // Extract the client ID from the URL (format: /client/{id}/sessions)
    const url = page.url();
    const match = url.match(/\/client\/(\d+)\//);
    if (match) {
      log.info("Found existing client", { name: searchName, owlId: match[1] });
      return match[1];
    }
    log.warn("Client span clicked but URL did not change to client page", { url });
  }

  log.info("Client not found", { name: searchName });
  return null;
}
