/**
 * Owl Practice - Create Note Form Deep Inspection
 *
 * Navigates to client's Sessions & Notes page, clicks "Create Note" button,
 * and inspects the resulting form/page for automation.
 *
 * Run: npx tsx scripts/inspect-owl-create-note.ts
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
        value: (el as HTMLInputElement).value?.slice(0, 60) || "",
        required: (el as HTMLInputElement).required,
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
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
      `(${inp.x},${inp.y}) ${inp.width}x${inp.height}`,
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
  console.log("🔍 Owl Practice - Create Note Form Inspection\n");

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

    const baseUrl = page.url().split("/").slice(0, 3).join("/");

    // ========== Navigate to client Sessions & Notes ==========
    console.log("\n📋 Navigating to client Sessions & Notes...");
    await page.goto(`${baseUrl}/client/1/sessions`, { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForTimeout(3000);
    console.log(`  URL: ${page.url()}`);
    await saveScreenshot(page, "create-note-01-sessions-page");

    // ========== Click "Create Note" button ==========
    console.log("\n📝 Clicking 'Create Note' button...");

    const createNoteBtn = await page.$('button[aria-label="Create Note"], button:has-text("Create Note")');
    if (createNoteBtn) {
      const visible = await createNoteBtn.isVisible();
      console.log(`  Found Create Note button (visible=${visible})`);
      await createNoteBtn.click();
      await page.waitForTimeout(5000);
      console.log(`  URL after click: ${page.url()}`);
      await saveScreenshot(page, "create-note-02-after-click");

      // Check for dialog/modal
      const dialogs = await page.$$('.bp3-dialog, [role="dialog"], [class*="modal" i], [class*="Modal" i], [class*="overlay" i]');
      console.log(`  Dialogs found: ${dialogs.length}`);
      for (const dialog of dialogs) {
        const visible = await dialog.isVisible();
        if (visible) {
          const text = await dialog.textContent();
          console.log(`    Visible dialog: "${text?.trim().slice(0, 200)}"`);
          const html = await dialog.innerHTML();
          fs.writeFileSync(path.join(OUTPUT_DIR, "create-note-dialog.html"), html);
          console.log("    Dialog HTML saved");
        }
      }

      // Dump all form fields on the page
      await dumpVisibleFormFields(page, "After Create Note Click");

      // Look specifically for rich text editors
      console.log("\n🔍 Looking for rich text editors...");
      const editors = await page.$$('[contenteditable="true"], [class*="editor" i], [class*="Editor" i], [class*="rich-text" i], [class*="RichText" i], [class*="ql-" i], [class*="trix" i], [class*="ProseMirror" i], [class*="note-editor" i], [class*="mce" i], [class*="draft" i], [class*="Draft" i]');
      console.log(`  Rich text editors: ${editors.length}`);
      for (const editor of editors) {
        const tag = await editor.evaluate(el => el.tagName.toLowerCase());
        const cls = await editor.getAttribute("class");
        const role = await editor.getAttribute("role");
        const contentEditable = await editor.getAttribute("contenteditable");
        const visible = await editor.isVisible();
        console.log(`    <${tag}> class="${cls?.slice(0, 80)}" role="${role}" contenteditable="${contentEditable}" visible=${visible}`);
      }

      // Look for iframes (some rich text editors use iframes)
      const iframes = await page.$$("iframe");
      console.log(`  Iframes: ${iframes.length}`);
      for (const iframe of iframes) {
        const src = await iframe.getAttribute("src");
        const cls = await iframe.getAttribute("class");
        const visible = await iframe.isVisible();
        console.log(`    <iframe> src="${src}" class="${cls?.slice(0, 60)}" visible=${visible}`);
      }

      // Look for section headers / labels to understand the form structure
      const headers = await page.$$eval("h1, h2, h3, h4, h5, h6, label, [class*='header' i], [class*='Header' i], [class*='title' i], [class*='Title' i]", (els) =>
        els.filter(el => el.offsetParent !== null && el.textContent?.trim()).map(el => ({
          tag: el.tagName.toLowerCase(),
          text: el.textContent?.trim().slice(0, 100) || "",
          className: el.className?.slice?.(0, 60) || "",
        }))
      );

      if (headers.length > 0) {
        console.log(`\n  Headers/labels (${headers.length}):`);
        for (const h of headers) {
          console.log(`    <${h.tag}> "${h.text}"`);
        }
      }

      // Save full page HTML
      const html = await page.content();
      fs.writeFileSync(path.join(OUTPUT_DIR, "create-note-page.html"), html);
      console.log("\n  Full page HTML saved");

      // Also look for sidebar/tab navigation on the note page
      const sideLinks = await page.$$eval("a", (els) =>
        els.filter(el => {
          const rect = el.getBoundingClientRect();
          return el.offsetParent !== null && rect.x < 300 && rect.y > 50 && rect.y < 700;
        }).map(el => ({
          text: el.textContent?.trim().slice(0, 50) || "",
          href: (el as HTMLAnchorElement).pathname || "",
        }))
      );

      if (sideLinks.length > 0) {
        console.log(`\n  Sidebar links:`);
        for (const link of sideLinks) {
          console.log(`    "${link.text}" → ${link.href}`);
        }
      }

    } else {
      console.log("  ❌ Create Note button not found!");
      // Dump what's visible on the sessions table
      await dumpVisibleFormFields(page, "Sessions Page (no Create Note btn)");
    }

    // ========== Also check "Non-Session Notes" tab ==========
    console.log("\n📑 Checking 'Non-Session Notes' tab...");
    const nonSessionTab = await page.$('button:has-text("Non-Session Notes")');
    if (nonSessionTab) {
      await nonSessionTab.click();
      await page.waitForTimeout(3000);
      await saveScreenshot(page, "create-note-03-non-session-notes");
      await dumpVisibleFormFields(page, "Non-Session Notes Tab");

      // Look for "Add Note" or "Create Note" button in this tab
      const addNoteBtn = await page.$('button:has-text("Add"), button:has-text("Create"), button:has-text("New Note")');
      if (addNoteBtn) {
        const text = await addNoteBtn.textContent();
        console.log(`\n  Found add note button: "${text?.trim()}"`);
      }
    }

    console.log("\n✅ Create Note inspection complete!");
    console.log(`\n📁 Output: ${OUTPUT_DIR}`);
    console.log(`🔗 Session: https://www.browserbase.com/sessions/${session.id}\n`);

  } catch (error) {
    console.error("\n❌ Inspection failed:", error);
    await saveScreenshot(page, "error-create-note");
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
