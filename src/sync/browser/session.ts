import Browserbase from "@browserbasehq/sdk";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import { getEnv } from "@/sync/config/env";
import { createChildLogger } from "@/sync/logger";

const log = createChildLogger("browser-session");

export interface BrowserSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  sessionId: string;
}

export async function createBrowserSession(): Promise<BrowserSession> {
  const env = getEnv();
  const bb = new Browserbase({ apiKey: env.BROWSERBASE_API_KEY });

  log.info("Creating Browserbase session...");
  const session = await bb.sessions.create({
    projectId: env.BROWSERBASE_PROJECT_ID,
    keepAlive: false,
  });

  log.info("Connecting Playwright to session", { sessionId: session.id });
  const browser = await chromium.connectOverCDP(session.connectUrl);
  const context = browser.contexts()[0];
  const page = context.pages()[0];

  log.info("Browser session ready", { sessionId: session.id });
  return { browser, context, page, sessionId: session.id };
}

export async function closeBrowserSession(session: BrowserSession): Promise<void> {
  log.info("Closing browser session", { sessionId: session.sessionId });
  try {
    await session.page.close();
    await session.browser.close();
    log.info("Browser session closed", { sessionId: session.sessionId });
  } catch (error) {
    log.warn("Error closing browser session", {
      sessionId: session.sessionId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
