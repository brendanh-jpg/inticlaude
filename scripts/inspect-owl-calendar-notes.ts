/**
 * Inspect the Owl Practice calendar to understand how to add notes to a session.
 * Also check the client/4/sessions page to see what's actually there.
 */
import Browserbase from "@browserbasehq/sdk";
import { chromium } from "playwright-core";

async function main() {
  const bb = new Browserbase({ apiKey: process.env.BROWSERBASE_API_KEY! });
  const session = await bb.sessions.create({ projectId: process.env.BROWSERBASE_PROJECT_ID! });
  console.log("Session:", session.id);

  const browser = await chromium.connectOverCDP(session.connectUrl);
  const ctx = browser.contexts()[0];
  const page = ctx.pages()[0];

  // Login
  await page.goto(process.env.OWL_PRACTICE_URL!, { waitUntil: "domcontentloaded", timeout: 15000 });
  await page.waitForTimeout(2000);
  await page.fill('input[type="email"]', process.env.OWL_PRACTICE_EMAIL!);
  await page.fill('input[type="password"]', process.env.OWL_PRACTICE_PASSWORD!);
  await page.click('button:has-text("Sign In")');
  await page.waitForURL("**/calendar", { timeout: 15000 });
  await page.waitForTimeout(3000);
  console.log("Logged in:", page.url());

  // ============ PART 1: Check client/4/sessions page ============
  console.log("\n=== PART 1: Client Sessions Page ===");
  await page.goto("https://brendanherjtherapy.owlpractice.ca/client/4/sessions", {
    waitUntil: "domcontentloaded",
    timeout: 15000,
  });
  await page.waitForTimeout(3000);
  console.log("On page:", page.url());

  // Look for all buttons
  const buttons = await page.$$eval("button", (els) =>
    els.map((e) => ({
      text: e.textContent?.trim().substring(0, 60),
      ariaLabel: e.getAttribute("aria-label"),
      className: e.className?.substring(0, 80),
      visible: e.offsetParent !== null,
    })).filter(b => b.visible)
  );
  console.log("Visible buttons:", JSON.stringify(buttons, null, 2));

  // Look for "Create Note" or "Note" anywhere
  const noteElements = await page.$$eval("*", (els) =>
    els.filter((e) => {
      const text = e.textContent?.trim() || "";
      return (text.includes("Create Note") || text.includes("Note")) && e.children.length === 0;
    }).slice(0, 20).map((e) => ({
      tag: e.tagName,
      text: e.textContent?.trim().substring(0, 60),
      ariaLabel: e.getAttribute("aria-label"),
      className: e.className?.toString().substring(0, 80),
    }))
  );
  console.log("Note-related elements:", JSON.stringify(noteElements, null, 2));

  // Check if there are any sessions listed
  const sessionRows = await page.$$eval('[class*="Session"], [class*="session"], [class*="Row"], [class*="row"]', (els) =>
    els.slice(0, 5).map((e) => ({
      tag: e.tagName,
      text: e.textContent?.trim().substring(0, 120),
      className: e.className?.toString().substring(0, 80),
    }))
  );
  console.log("Session-like rows:", JSON.stringify(sessionRows, null, 2));

  // ============ PART 2: Calendar page ============
  console.log("\n=== PART 2: Calendar Page ===");
  await page.goto("https://brendanherjtherapy.owlpractice.ca/calendar", {
    waitUntil: "domcontentloaded",
    timeout: 15000,
  });
  await page.waitForTimeout(3000);

  // Look for any appointments on the calendar
  const calEvents = await page.$$eval('[class*="event"], [class*="Event"], [class*="appointment"], [class*="Appointment"], [class*="session"], [class*="Session"]', (els) =>
    els.slice(0, 10).map((e) => ({
      tag: e.tagName,
      text: e.textContent?.trim().substring(0, 80),
      className: e.className?.toString().substring(0, 100),
    }))
  );
  console.log("Calendar events:", JSON.stringify(calEvents, null, 2));

  // Try clicking on a calendar event (Billy's appointment)
  const billyEvent = await page.$('*:has-text("Billy")');
  if (billyEvent) {
    console.log("Found Billy event, clicking...");
    await billyEvent.click();
    await page.waitForTimeout(2000);

    // Check what opened - popover, modal, etc.
    const popovers = await page.$$eval('.bp3-popover, .bp3-overlay-content, .bp3-dialog, [class*="Popover"], [class*="popover"], [class*="Detail"]', (els) =>
      els.map((e) => ({
        tag: e.tagName,
        text: e.textContent?.trim().substring(0, 200),
        className: e.className?.toString().substring(0, 100),
        visible: (e as HTMLElement).offsetParent !== null,
      })).filter(e => e.visible)
    );
    console.log("Popovers/overlays after click:", JSON.stringify(popovers, null, 2));

    // Look for note-related buttons in popover
    const popoverButtons = await page.$$eval('.bp3-popover button, .bp3-overlay-content button, .bp3-dialog button', (els) =>
      els.map((e) => ({
        text: e.textContent?.trim().substring(0, 60),
        ariaLabel: e.getAttribute("aria-label"),
      })).filter(b => b.text || b.ariaLabel)
    );
    console.log("Buttons in popover:", JSON.stringify(popoverButtons, null, 2));

    // Look for links in popover
    const popoverLinks = await page.$$eval('.bp3-popover a, .bp3-overlay-content a', (els) =>
      els.map((e) => ({
        text: e.textContent?.trim().substring(0, 60),
        href: e.getAttribute("href"),
      })).filter(a => a.text || a.href)
    );
    console.log("Links in popover:", JSON.stringify(popoverLinks, null, 2));
  } else {
    console.log("No Billy event found on calendar");

    // Dump all text on the calendar to see what's there
    const calText = await page.$eval("main, #root, body", (el) => el.textContent?.substring(0, 1000));
    console.log("Calendar page text (first 1000 chars):", calText);
  }

  await browser.close();
}

main().catch(console.error);
