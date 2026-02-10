import type { Page } from "playwright-core";
import type { OwlCredentials } from "@/sync/types/api";
import { createChildLogger } from "@/sync/logger";

const log = createChildLogger("owl-auth");

/**
 * Login to Owl Practice.
 *
 * Owl uses a simple email/password form at the practice subdomain root.
 * The "Sign In" button is a <button> with text (NOT type="submit" — that one is hidden).
 * After login, it redirects to /calendar.
 */
export async function loginToOwl(page: Page, credentials: OwlCredentials): Promise<void> {
  log.info("Logging into Owl Practice", { url: credentials.url });

  await page.goto(credentials.url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(2000); // Let SPA settle

  // Fill login form — selectors confirmed via Browserbase inspection
  await page.fill('input[type="email"]', credentials.email);
  await page.fill('input[type="password"]', credentials.password);
  await page.click('button:has-text("Sign In")');

  // Wait for redirect to /calendar (Owl always lands there after login)
  await page.waitForURL("**/calendar", { timeout: 15000 });
  await page.waitForTimeout(2000); // Let calendar page settle

  log.info("Owl Practice login successful", { url: page.url() });
}

/**
 * Check if we're still logged in by looking for the sidebar nav.
 * The sidebar has navigation links (Calendar, Clients, etc.) that only appear when authenticated.
 */
export async function isLoggedIn(page: Page): Promise<boolean> {
  try {
    // The left sidebar nav with "Calendar" text is only present when logged in
    await page.waitForSelector('a:has-text("Calendar")', { timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

export async function ensureLoggedIn(page: Page, credentials: OwlCredentials): Promise<void> {
  if (!(await isLoggedIn(page))) {
    log.info("Session expired or not logged in, authenticating...");
    await loginToOwl(page, credentials);
  }
}
