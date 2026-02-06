import type { Page } from "playwright-core";
import { getEnv } from "@/sync/config/env";
import { safeGoto, fillField, clickButton } from "@/sync/browser/helpers";
import { createChildLogger } from "@/sync/logger";

const log = createChildLogger("owl-auth");

export async function loginToOwl(page: Page): Promise<void> {
  const env = getEnv();
  log.info("Logging into Owl Practice", { url: env.OWL_PRACTICE_URL });

  await safeGoto(page, env.OWL_PRACTICE_URL);

  // TODO: Update selectors once Owl Practice login page is inspected
  await fillField(page, 'input[type="email"]', env.OWL_PRACTICE_EMAIL);
  await fillField(page, 'input[type="password"]', env.OWL_PRACTICE_PASSWORD);
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

export async function ensureLoggedIn(page: Page): Promise<void> {
  if (!(await isLoggedIn(page))) {
    log.info("Session expired, re-authenticating...");
    await loginToOwl(page);
  }
}
