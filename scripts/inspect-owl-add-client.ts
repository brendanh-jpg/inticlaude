/**
 * Owl Practice - Add Client + Contact & Clinical Inspection
 *
 * Run: npx tsx scripts/inspect-owl-add-client.ts
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
        value: (el as HTMLInputElement).value || "",
        required: (el as HTMLInputElement).required,
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        // Find label
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
          // Check closest label
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
      inp.value ? `val="${inp.value.slice(0, 30)}"` : "",
      inp.required ? "REQUIRED" : "",
      `(${inp.x},${inp.y})`,
    ].filter(Boolean).join(" ");
    console.log(`  ${parts}`);
  }

  // Also get select elements and textareas
  const selects = await page.$$eval("select", (els) =>
    els.filter(el => el.offsetParent !== null).map((el) => ({
      name: el.name || "",
      id: el.id || "",
      options: Array.from(el.options).map(o => `${o.value}:${o.text}`).slice(0, 10).join(", "),
    }))
  );
  if (selects.length > 0) {
    console.log(`  Selects:`);
    for (const s of selects) {
      console.log(`    name="${s.name}" id="${s.id}" options=[${s.options}]`);
    }
  }
}

async function main() {
  console.log("🔍 Owl Practice - Add Client + Contact & Clinical\n");

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

    // ========== Part 1: Click "add client" button from top nav ==========
    console.log("\n📝 Part 1: Clicking 'add client' button...");
    await page.click('button[aria-label="add client"]');
    await page.waitForTimeout(3000);
    console.log(`  URL after click: ${page.url()}`);
    await saveScreenshot(page, "add-client-clicked");

    // Check if a modal/dialog appeared
    const dialogs = await page.$$('[role="dialog"], [class*="modal" i], [class*="Modal" i], [class*="dialog" i], [class*="Dialog" i], [class*="drawer" i], [class*="Drawer" i], .bp3-dialog, .bp3-overlay');
    console.log(`  Dialogs/modals found: ${dialogs.length}`);

    if (dialogs.length > 0) {
      for (const dialog of dialogs) {
        const visible = await dialog.isVisible();
        if (visible) {
          console.log("  ✅ Visible modal/dialog found!");
          // Get inner HTML to understand structure
          const html = await dialog.innerHTML();
          const htmlPath = path.join(OUTPUT_DIR, "add-client-modal.html");
          fs.writeFileSync(htmlPath, html);
          console.log(`  HTML saved: ${htmlPath}`);
        }
      }
    }

    // Dump form fields on current page (might be a new form/modal)
    await dumpVisibleFormFields(page, "After 'add client' click");

    // Check if it's a new page with a form
    if (page.url().includes("client")) {
      console.log("  Navigated to a client-related page");
    }

    // ========== Part 2: Inspect existing client Contact & Clinical ==========
    console.log("\n📋 Part 2: Inspecting Contact & Clinical for existing client...");

    // Navigate to clients list
    await page.click('text=Clients');
    await page.waitForTimeout(3000);

    // Click on existing client
    await page.click('a[title="Hootkins, Hillary"]');
    await page.waitForTimeout(3000);
    console.log(`  Client detail URL: ${page.url()}`);

    // Click "Contact & Clinical" in sidebar
    const contactTab = await page.$('a:has-text("Contact & Clinical"), text=Contact & Clinical');
    if (contactTab) {
      await contactTab.click();
      await page.waitForTimeout(3000);
      console.log(`  URL: ${page.url()}`);
      await saveScreenshot(page, "contact-clinical");
      await dumpVisibleFormFields(page, "Contact & Clinical Page");

      // Save the full HTML for detailed analysis
      const html = await page.content();
      fs.writeFileSync(path.join(OUTPUT_DIR, "contact-clinical.html"), html);
      console.log("  Full HTML saved");

      // Check for edit functionality
      const editButtons = await page.$$('button:has-text("Edit"), a:has-text("Edit"), button[aria-label*="edit" i]');
      console.log(`\n  Edit buttons found: ${editButtons.length}`);
      for (const btn of editButtons) {
        const text = await btn.textContent();
        const ariaLabel = await btn.getAttribute("aria-label");
        console.log(`    "${text?.trim()}" aria="${ariaLabel}"`);
      }

      // Look for field labels and their associated values
      const fieldGroups = await page.$$eval('[class*="FormGroup"], [class*="form-group"], .bp3-form-group, [class*="Field"], [class*="field"]', (els) =>
        els.filter(el => el.offsetParent !== null).map(el => ({
          className: el.className?.slice(0, 80) || "",
          text: el.textContent?.trim().slice(0, 100) || "",
          innerHTML: el.innerHTML?.slice(0, 200) || "",
        }))
      );

      if (fieldGroups.length > 0) {
        console.log(`\n  Form groups/fields (${fieldGroups.length}):`);
        for (const fg of fieldGroups.slice(0, 20)) {
          console.log(`    "${fg.text}"`);
        }
      }

      // Dump all text that looks like labels + values
      const sections = await page.$$eval("h2, h3, h4, h5, label, [class*='SectionHeader'], [class*='section-header']", (els) =>
        els.filter(el => el.offsetParent !== null).map(el => ({
          tag: el.tagName.toLowerCase(),
          text: el.textContent?.trim().slice(0, 80) || "",
        }))
      );

      if (sections.length > 0) {
        console.log(`\n  Section headers/labels:`);
        for (const s of sections) {
          console.log(`    <${s.tag}> "${s.text}"`);
        }
      }

    } else {
      console.log("  ❌ 'Contact & Clinical' link not found");
      // List all sidebar links
      const sideLinks = await page.$$eval('[class*="sidebar" i] a, [class*="Sidebar" i] a, nav a', (els) =>
        els.filter(el => el.offsetParent !== null).map(el => ({
          text: el.textContent?.trim() || "",
          href: (el as HTMLAnchorElement).href || "",
        }))
      );
      console.log("  Sidebar links:");
      for (const link of sideLinks) {
        console.log(`    "${link.text}" → ${link.href}`);
      }
    }

    // ========== Part 3: Try to go back and click "add client" from clients list ==========
    console.log("\n📝 Part 3: Try 'add client' from clients list...");
    await page.goto(`${OWL_URL}/clients/all-clients`, { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForTimeout(3000);

    // Click "add client" top nav button
    await page.click('button[aria-label="add client"]');
    await page.waitForTimeout(4000);
    console.log(`  URL: ${page.url()}`);
    await saveScreenshot(page, "add-client-from-list");

    // Check for any overlay, popup, or new content
    const overlays = await page.$$('.bp3-overlay-content, [class*="overlay" i], [class*="Overlay" i], [class*="popup" i], [class*="Popup" i], [class*="panel" i], [class*="Panel" i], [class*="Slide" i]');
    console.log(`  Overlays/panels: ${overlays.length}`);
    for (const overlay of overlays) {
      const visible = await overlay.isVisible();
      const text = await overlay.textContent();
      console.log(`    visible=${visible} text="${text?.trim().slice(0, 100)}"`);
    }

    await dumpVisibleFormFields(page, "After add client from list");

    console.log("\n✅ Done!");

  } catch (error) {
    console.error("\n❌ Failed:", error);
    await saveScreenshot(page, "error-add-client");
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
