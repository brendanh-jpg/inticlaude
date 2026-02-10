/**
 * Owl Practice - Edit Client (Contact & Clinical) Inspection
 *
 * Run: npx tsx scripts/inspect-owl-edit-client.ts
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
      inp.value ? `val="${inp.value}"` : "",
      inp.required ? "REQUIRED" : "",
      `(${inp.x},${inp.y})`,
    ].filter(Boolean).join(" ");
    console.log(`  ${parts}`);
  }
}

async function main() {
  console.log("🔍 Owl Practice - Edit Client Inspection\n");

  const bb = new Browserbase({ apiKey: BROWSERBASE_API_KEY });
  const session = await bb.sessions.create({ projectId: BROWSERBASE_PROJECT_ID, keepAlive: false });
  console.log(`Session: ${session.id}\n`);

  const browser = await chromium.connectOverCDP(session.connectUrl);
  const context = browser.contexts()[0];
  const page = context.pages()[0];

  try {
    // Login
    console.log("🔑 Logging in...");
    await page.goto(OWL_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(2000);
    await page.fill('input[type="email"]', OWL_EMAIL);
    await page.fill('input[type="password"]', OWL_PASSWORD);
    await page.click('button:has-text("Sign In")');
    await page.waitForTimeout(5000);
    console.log(`  ✅ URL: ${page.url()}`);

    // Navigate directly to client detail
    console.log("\n👤 Navigating to client detail...");
    await page.goto(`${OWL_URL}/client/1/contact`, { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForTimeout(3000);
    console.log(`  URL: ${page.url()}`);
    await saveScreenshot(page, "client-contact");
    await dumpVisibleFormFields(page, "Client Contact & Clinical");

    // Get all visible text blocks / sections
    const sections = await page.$$eval("h2, h3, h4, h5, label, [class*='Header'], [class*='header'], [class*='Title'], [class*='title']", (els) =>
      els.filter(el => el.offsetParent !== null && el.textContent?.trim()).map(el => ({
        tag: el.tagName.toLowerCase(),
        text: el.textContent?.trim().slice(0, 80) || "",
        className: el.className?.slice?.(0, 60) || "",
      }))
    );

    console.log(`\n  Section headers/labels (${sections.length}):`);
    for (const s of sections) {
      console.log(`    <${s.tag}> "${s.text}"`);
    }

    // Get all visible buttons
    const buttons = await page.$$eval("button, a.btn, [role='button']", (els) =>
      els.filter(el => el.offsetParent !== null).map(el => ({
        text: el.textContent?.trim().slice(0, 50) || "",
        ariaLabel: el.getAttribute("aria-label") || "",
        className: el.className?.slice?.(0, 60) || "",
      }))
    );

    console.log(`\n  Buttons (${buttons.length}):`);
    for (const btn of buttons) {
      if (btn.text || btn.ariaLabel) {
        console.log(`    "${btn.text}" aria="${btn.ariaLabel}"`);
      }
    }

    // Look for edit/save button
    console.log("\n🔍 Looking for edit controls...");
    const editBtn = await page.$('button:has-text("Edit"), button[aria-label*="edit" i], a:has-text("Edit")');
    if (editBtn) {
      const text = await editBtn.textContent();
      console.log(`  Found Edit: "${text?.trim()}"`);

      // Click it
      await editBtn.click();
      await page.waitForTimeout(2000);
      await saveScreenshot(page, "client-contact-edit-mode");
      await dumpVisibleFormFields(page, "Contact & Clinical - Edit Mode");
    } else {
      console.log("  No edit button found — fields might be directly editable");
    }

    // Save page HTML
    const html = await page.content();
    fs.writeFileSync(path.join(OUTPUT_DIR, "client-contact.html"), html);
    console.log("\n  Full HTML saved");

    // Also check the sidebar nav items on client page
    const navItems = await page.$$eval('a', (els) =>
      els.filter(el => {
        const rect = el.getBoundingClientRect();
        return el.offsetParent !== null && rect.x < 300 && rect.y > 30 && rect.y < 600;
      }).map(el => ({
        text: el.textContent?.trim().slice(0, 50) || "",
        href: (el as HTMLAnchorElement).pathname || "",
      }))
    );

    console.log(`\n  Client page sidebar nav:`);
    for (const nav of navItems) {
      console.log(`    "${nav.text}" → ${nav.href}`);
    }

    console.log("\n✅ Done!");

  } catch (error) {
    console.error("\n❌ Failed:", error);
    await saveScreenshot(page, "error-edit-client");
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
