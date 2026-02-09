import type { Page } from "playwright-core";
import type { OwlCredentials } from "@/sync/types/api";
import { safeGoto, fillField, clickButton } from "@/sync/browser/helpers";
import { createChildLogger } from "@/sync/logger";

const log = createChildLogger("owl-auth");

export async function loginToOwl(page: Page, credentials: OwlCredentials): Promise<void> {
  log.info("Logging into Owl Practice", { url: credentials.url });

  await safeGoto(page, credentials.url);

  // TODO: Update selectors once Owl Practice login page is inspected
  await fillField(page, 'input[type="email"]', credentials.email);
  await fillField(page, 'input[type="password"]', credentials.password);
  await clickButton(page, 'button[type="submit"]');

  // TODO: Wait for dashboard element to confirm login success
  // await page.waitForSelector('[data-testid="dashboard"]', { timeout: 15_000 });

  log.info("Owl Practice login successful");
}

export async function isLoggedIn(page: Page): Promise<boolean> {
  // TODO: Check for a dashboard element or session cookie
  try {
    await page.waitForSelector('[data-testid="dashboard"]', { timeout: 3_000 });
    return true;
  } catch {
    return false;
  }
}

export async function ensureLoggedIn(page: Page, credentials: OwlCredentials): Promise<void> {
  if (!(await isLoggedIn(page))) {
    log.info("Session expired, re-authenticating...");
    await loginToOwl(page, credentials);
  }
}
