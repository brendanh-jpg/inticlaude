/**
 * Owl Practice - Session Notes UI Inspection
 *
 * Connects via Browserbase, logs into Owl Practice, navigates to a client's
 * session notes area, and inspects the UI structure for automation.
 *
 * Run: npx tsx scripts/inspect-owl-session-notes.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });
import Browserbase from "@browserbasehq/sdk";
import { chromium, type Page } from "playwright-core";
import * as fs from "fs";
import * as path from "path";

const BROWSERBASE_API_KEY = process.env.BROWSERBASE_API_KEY?.trim().replace(/^"|"$/g, "") ?? "";
const BROWSERBASE_PROJECT_ID = process.env.BROWSERBASE_PROJECT_ID?.trim().replace(/^"|"$/g, "") ?? "";
const OWL_URL = process.env.OWL_PRACTICE_URL?.trim().replace(/^"|"$/g, "") ?? "";
const OWL_EMAIL = process.env.OWL_PRACTICE_EMAIL?.trim().replace(/^"|"$/g, "") ?? "";
const OWL_PASSWORD = process.env.OWL_PRACTICE_PASSWORD?.trim().replace(/^"|"$/g, "") ?? "";

const OUTPUT_DIR = path.join(__dirname, "..", "inspection-output");

async function saveScreenshot(page: Page, name: string) {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const filePath = path.join(OUTPUT_DIR, `${name}.png`);
  await page.screenshot({ fullPage: true, path: filePath });
  console.log(`  📸 ${filePath}`);
}

async function dumpVisibleFormFields(page: Page, label: string) {
  console.log(`\n--- ${label} ---`);
  const inputs = await page.$$eval("input, select, textarea", (els) =>
    els.filter(el => el.offsetParent !== null).map((el) => {
      const rect = el.getBoundingClientRect();
      return {
        tag: el.tagName.toLowerCase(),
        type: (el as HTMLInputElement).type || "",
        name: (el as HTMLInputElement).name || "",
        id: el.id || "",
        placeholder: (el as HTMLInputElement).placeholder || "",
        ariaLabel: el.getAttribute("aria-label") || "",
        value: (el as HTMLInputElement).value?.slice(0, 40) || "",
        required: (el as HTMLInputElement).required,
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        labelText: (() => {
          const id = el.id;
          if (id) {
            const lbl = el.ownerDocument.querySelector(`label[for="${id}"]`);
            if (lbl) return lbl.textContent?.trim() || "";
          }
          const parent = el.closest(".bp3-form-group, .form-group, [class*='FormField'], [class*='formField'], [class*='Field']");
          if (parent) {
            const lbl = parent.querySelector("label, [class*='label' i], [class*='Label']");
            if (lbl) return lbl.textContent?.trim() || "";
          }
          const closestLabel = el.closest("label");
          if (closestLabel) return closestLabel.textContent?.trim() || "";
          return "";
        })(),
      };
    })
  );

  for (const inp of inputs) {
    const parts = [
      `<${inp.tag}>`,
      inp.type ? `type="${inp.type}"` : "",
      inp.name ? `name="${inp.name}"` : "",
      inp.id ? `id="${inp.id}"` : "",
      inp.placeholder ? `ph="${inp.placeholder}"` : "",
      inp.ariaLabel ? `aria="${inp.ariaLabel}"` : "",
      inp.labelText ? `label="${inp.labelText}"` : "",
      inp.value ? `val="${inp.value}"` : "",
      inp.required ? "REQUIRED" : "",
      `(${inp.x},${inp.y})`,
    ].filter(Boolean).join(" ");
    console.log(`  ${parts}`);
  }

  // Visible buttons
  const buttons = await page.$$eval("button, a.btn, [role='button'], [type='submit']", (els) =>
    els.filter(el => el.offsetParent !== null).map(el => ({
      tag: el.tagName.toLowerCase(),
      text: el.textContent?.trim().slice(0, 60) || "",
      ariaLabel: el.getAttribute("aria-label") || "",
      className: el.className?.slice?.(0, 80) || "",
      type: (el as HTMLButtonElement).type || "",
    }))
  );

  if (buttons.length > 0) {
    console.log(`  Buttons (${buttons.length}):`);
    for (const btn of buttons) {
      if (btn.text || btn.ariaLabel) {
        console.log(`    <${btn.tag}> "${btn.text}" aria="${btn.ariaLabel}"`);
      }
    }
  }
}

async function main() {
  console.log("🔍 Owl Practice - Session Notes UI Inspection\n");

  if (!BROWSERBASE_API_KEY || !BROWSERBASE_PROJECT_ID) {
    throw new Error("BROWSERBASE_API_KEY and BROWSERBASE_PROJECT_ID required in .env.local");
  }
  if (!OWL_URL || !OWL_EMAIL || !OWL_PASSWORD) {
    throw new Error("OWL_PRACTICE_URL, OWL_PRACTICE_EMAIL, OWL_PRACTICE_PASSWORD required in .env.local");
  }

  const bb = new Browserbase({ apiKey: BROWSERBASE_API_KEY });
  const session = await bb.sessions.create({ projectId: BROWSERBASE_PROJECT_ID, keepAlive: false });
  console.log(`Session: ${session.id}`);
  console.log(`Debug: https://www.browserbase.com/sessions/${session.id}\n`);

  const browser = await chromium.connectOverCDP(session.connectUrl);
  const context = browser.contexts()[0];
  const page = context.pages()[0];

  try {
    // ========== Login ==========
    console.log("🔑 Logging in...");
    await page.goto(OWL_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(2000);
    await page.fill('input[type="email"]', OWL_EMAIL);
    await page.fill('input[type="password"]', OWL_PASSWORD);
    await page.click('button:has-text("Sign In")');
    await page.waitForTimeout(5000);
    console.log(`  ✅ URL: ${page.url()}`);

    // ========== Step 1: Navigate to Clients List ==========
    console.log("\n👥 Step 1: Navigating to clients list...");
    const baseUrl = page.url().split("/").slice(0, 3).join("/");
    await page.goto(`${baseUrl}/clients/all-clients`, { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForTimeout(3000);
    console.log(`  URL: ${page.url()}`);

    // ========== Step 2: Click on first client to get to detail page ==========
    console.log("\n👤 Step 2: Clicking on first client...");

    // Find any client link in the table
    const clientLinks = await page.$$eval("a[href*='/client/']", (els) =>
      els.filter(el => el.offsetParent !== null).map(el => ({
        text: el.textContent?.trim().slice(0, 50) || "",
        href: (el as HTMLAnchorElement).pathname || "",
      })).slice(0, 5)
    );

    console.log(`  Client links found: ${clientLinks.length}`);
    for (const link of clientLinks) {
      console.log(`    "${link.text}" → ${link.href}`);
    }

    if (clientLinks.length > 0) {
      // Click the first client link
      const firstClient = await page.$(`a[href*='/client/']`);
      if (firstClient) {
        await firstClient.click();
        await page.waitForTimeout(3000);
        console.log(`  Client detail URL: ${page.url()}`);
        await saveScreenshot(page, "session-notes-01-client-detail");
      }
    } else {
      // Try direct URL to client 1
      console.log("  No client links found, trying /client/1/sessions...");
      await page.goto(`${baseUrl}/client/1/sessions`, { waitUntil: "domcontentloaded", timeout: 15000 });
      await page.waitForTimeout(3000);
    }

    // ========== Step 3: Inspect client page sidebar navigation ==========
    console.log("\n🧭 Step 3: Inspecting client page sidebar...");

    const sidebarLinks = await page.$$eval("a", (els) =>
      els.filter(el => {
        const rect = el.getBoundingClientRect();
        return el.offsetParent !== null && rect.x < 300 && rect.y > 50 && rect.y < 700;
      }).map(el => ({
        text: el.textContent?.trim().slice(0, 50) || "",
        href: (el as HTMLAnchorElement).pathname || "",
        className: el.className?.slice(0, 60) || "",
      }))
    );

    console.log(`  Sidebar links (${sidebarLinks.length}):`);
    for (const link of sidebarLinks) {
      console.log(`    "${link.text}" → ${link.href}`);
    }

    // ========== Step 4: Look for "Sessions" or "Notes" tab/link ==========
    console.log("\n📝 Step 4: Looking for sessions/notes navigation...");

    // Search for links/tabs related to notes or sessions
    const noteRelatedLinks = await page.$$('a:has-text("Note"), a:has-text("note"), a:has-text("Session"), a:has-text("session"), a[href*="note"], a[href*="session"]');
    console.log(`  Note/session related links: ${noteRelatedLinks.length}`);

    for (const link of noteRelatedLinks) {
      const text = await link.textContent();
      const href = await link.getAttribute("href");
      const visible = await link.isVisible();
      console.log(`    "${text?.trim()}" → ${href} (visible=${visible})`);
    }

    // Check if we're on a "sessions" page already (common client detail landing)
    const currentUrl = page.url();
    console.log(`  Current URL: ${currentUrl}`);

    // ========== Step 5: Navigate to sessions page if not already there ==========
    console.log("\n📋 Step 5: Checking sessions page...");

    if (!currentUrl.includes("/sessions")) {
      // Try clicking "Sessions" link
      const sessionsLink = await page.$('a:has-text("Sessions"), a[href*="/sessions"]');
      if (sessionsLink) {
        await sessionsLink.click();
        await page.waitForTimeout(3000);
        console.log(`  Navigated to: ${page.url()}`);
      }
    }

    await saveScreenshot(page, "session-notes-02-sessions-page");
    await dumpVisibleFormFields(page, "Sessions Page");

    // Look for individual session rows / entries that we can click into
    const sessionRows = await page.$$eval("tr, [class*='session' i], [class*='Session' i], [class*='row' i], [class*='Row' i], [class*='card' i], [class*='Card' i]", (els) =>
      els.filter(el => {
        const text = el.textContent?.toLowerCase() || "";
        return el.offsetParent !== null && (text.includes("note") || text.includes("session") || text.includes("appointment"));
      }).map(el => ({
        tag: el.tagName.toLowerCase(),
        text: el.textContent?.trim().slice(0, 100) || "",
        className: el.className?.slice(0, 80) || "",
      })).slice(0, 10)
    );

    if (sessionRows.length > 0) {
      console.log(`\n  Session-related rows/cards (${sessionRows.length}):`);
      for (const row of sessionRows) {
        console.log(`    <${row.tag}> "${row.text}"`);
      }
    }

    // ========== Step 6: Look for "New Note" or "Add Note" button ==========
    console.log("\n➕ Step 6: Looking for 'New Note' / 'Add Note' button...");

    const addNoteButtons = await page.$$('button:has-text("Note"), button:has-text("note"), a:has-text("New Note"), a:has-text("Add Note"), button[aria-label*="note" i], button[aria-label*="Note" i], button:has-text("New Session"), a:has-text("New Session")');
    console.log(`  Add note buttons: ${addNoteButtons.length}`);

    for (const btn of addNoteButtons) {
      const text = await btn.textContent();
      const ariaLabel = await btn.getAttribute("aria-label");
      const visible = await btn.isVisible();
      console.log(`    "${text?.trim()}" aria="${ariaLabel}" visible=${visible}`);
    }

    // Also look for any "+" or "add" button on this page
    const addButtons = await page.$$('button[aria-label*="add" i], button[aria-label*="create" i], button[aria-label*="new" i], button:has-text("+"), a:has-text("Create")');
    console.log(`  General add/create buttons: ${addButtons.length}`);
    for (const btn of addButtons) {
      const text = await btn.textContent();
      const ariaLabel = await btn.getAttribute("aria-label");
      const visible = await btn.isVisible();
      console.log(`    "${text?.trim()}" aria="${ariaLabel}" visible=${visible}`);
    }

    // ========== Step 7: Try clicking into a session to see note fields ==========
    console.log("\n📄 Step 7: Trying to click into a session...");

    // Look for clickable session entries (table rows with links, or card elements)
    const sessionEntries = await page.$$('a[href*="/session"], a[href*="/note"], tr a, [class*="session" i] a, [class*="Session" i] a');
    if (sessionEntries.length > 0) {
      const firstEntry = sessionEntries[0];
      const text = await firstEntry.textContent();
      const href = await firstEntry.getAttribute("href");
      console.log(`  Clicking session entry: "${text?.trim()}" → ${href}`);
      await firstEntry.click();
      await page.waitForTimeout(3000);
      console.log(`  URL: ${page.url()}`);
      await saveScreenshot(page, "session-notes-03-session-detail");
      await dumpVisibleFormFields(page, "Session Detail Page");

      // Look for note-related fields
      const noteFields = await page.$$('textarea, [contenteditable="true"], [class*="editor" i], [class*="Editor" i], [class*="note" i], [class*="Note" i], [class*="rich-text" i], [class*="RichText" i]');
      console.log(`\n  Note-related fields/editors: ${noteFields.length}`);
      for (const field of noteFields) {
        const tag = await field.evaluate(el => el.tagName.toLowerCase());
        const cls = await field.getAttribute("class");
        const visible = await field.isVisible();
        console.log(`    <${tag}> class="${cls?.slice(0, 60)}" visible=${visible}`);
      }

      // Save HTML for this page
      const html = await page.content();
      fs.writeFileSync(path.join(OUTPUT_DIR, "session-detail.html"), html);
      console.log("  Session detail HTML saved");

    } else {
      console.log("  No clickable session entries found");

      // Try finding sessions via table rows
      const tableRows = await page.$$("tbody tr");
      console.log(`  Table rows found: ${tableRows.length}`);
      if (tableRows.length > 0) {
        await tableRows[0].click();
        await page.waitForTimeout(3000);
        console.log(`  URL after clicking first row: ${page.url()}`);
        await saveScreenshot(page, "session-notes-03-clicked-row");
        await dumpVisibleFormFields(page, "After clicking first table row");
      }
    }

    // ========== Step 8: Try direct URL patterns for notes ==========
    console.log("\n🔗 Step 8: Trying direct URL patterns...");

    const noteUrls = [
      `${baseUrl}/notes`,
      `${baseUrl}/session-notes`,
      `${baseUrl}/client/1/notes`,
      `${baseUrl}/client/1/session-notes`,
    ];

    for (const url of noteUrls) {
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 10000 });
        await page.waitForTimeout(2000);
        const currentUrl = page.url();
        const title = await page.title();
        console.log(`  ${url} → ${currentUrl} (title: "${title}")`);
        if (!currentUrl.includes("login") && !currentUrl.includes("calendar")) {
          console.log(`  ✅ Found notes-related page!`);
          await saveScreenshot(page, "session-notes-04-direct-url");
          await dumpVisibleFormFields(page, `Direct URL: ${url}`);
          break;
        }
      } catch {
        console.log(`  ${url} → error/timeout`);
      }
    }

    // ========== Step 9: Save full page HTML for analysis ==========
    console.log("\n📄 Step 9: Saving page HTML...");
    const html = await page.content();
    fs.writeFileSync(path.join(OUTPUT_DIR, "session-notes-page.html"), html);
    console.log("  HTML saved");

    console.log("\n✅ Session notes inspection complete!");
    console.log(`\n📁 Output: ${OUTPUT_DIR}`);
    console.log(`🔗 Session: https://www.browserbase.com/sessions/${session.id}\n`);

  } catch (error) {
    console.error("\n❌ Inspection failed:", error);
    await saveScreenshot(page, "error-session-notes");
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
