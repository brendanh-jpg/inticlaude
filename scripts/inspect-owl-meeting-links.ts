/**
 * Owl Practice - Meeting Links UI Inspection
 *
 * Connects via Browserbase, logs into Owl Practice, navigates to appointments
 * and inspects where meeting link / telehealth URL fields are located.
 *
 * Run: npx tsx scripts/inspect-owl-meeting-links.ts
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
  console.log("🔍 Owl Practice - Meeting Links UI Inspection\n");

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

    const baseUrl = page.url().split("/").slice(0, 3).join("/");

    // ========== Step 1: Navigate to Calendar ==========
    console.log("\n📅 Step 1: Navigating to calendar...");

    // After login, Owl usually lands on the calendar
    await saveScreenshot(page, "meeting-links-01-calendar");

    // Look for calendar entries / appointments
    const calendarEntries = await page.$$eval("[class*='event' i], [class*='Event' i], [class*='appointment' i], [class*='Appointment' i], [class*='calendar' i] a, [class*='Calendar' i] a", (els) =>
      els.filter(el => el.offsetParent !== null).map(el => ({
        tag: el.tagName.toLowerCase(),
        text: el.textContent?.trim().slice(0, 80) || "",
        className: el.className?.slice(0, 80) || "",
        href: (el as HTMLAnchorElement).href || "",
      })).slice(0, 10)
    );

    console.log(`  Calendar entries: ${calendarEntries.length}`);
    for (const entry of calendarEntries) {
      console.log(`    <${entry.tag}> "${entry.text}" class="${entry.className}"`);
    }

    // ========== Step 2: Try clicking on an appointment ==========
    console.log("\n🖱️ Step 2: Clicking on an appointment...");

    // Try to find and click on any calendar event/appointment
    const appointmentSelectors = [
      "[class*='event' i]",
      "[class*='Event' i]",
      "[class*='appointment' i]",
      ".fc-event",           // FullCalendar events
      ".fc-event-container",
      "a[href*='appointment']",
      "a[href*='session']",
    ];

    let appointmentClicked = false;
    for (const sel of appointmentSelectors) {
      try {
        const el = await page.$(sel);
        if (el && await el.isVisible()) {
          const text = await el.textContent();
          console.log(`  Found appointment via ${sel}: "${text?.trim().slice(0, 50)}"`);
          await el.click();
          appointmentClicked = true;
          await page.waitForTimeout(3000);
          break;
        }
      } catch {}
    }

    if (appointmentClicked) {
      console.log(`  URL after click: ${page.url()}`);
      await saveScreenshot(page, "meeting-links-02-appointment-clicked");

      // Check if a dialog/popover/panel appeared
      const dialogs = await page.$$('[role="dialog"], .bp3-dialog, .bp3-overlay-content, [class*="popover" i], [class*="Popover" i], [class*="panel" i], [class*="Panel" i], [class*="modal" i], [class*="Modal" i]');
      console.log(`  Dialogs/popovers: ${dialogs.length}`);

      for (const dialog of dialogs) {
        const visible = await dialog.isVisible();
        if (visible) {
          const text = await dialog.textContent();
          console.log(`    Visible dialog: "${text?.trim().slice(0, 150)}"`);

          // Save dialog HTML
          const html = await dialog.innerHTML();
          fs.writeFileSync(path.join(OUTPUT_DIR, "appointment-dialog.html"), html);
          console.log("    Dialog HTML saved");
        }
      }

      await dumpVisibleFormFields(page, "After Appointment Click");

      // Look for meeting link / telehealth fields specifically
      console.log("\n🔗 Searching for meeting link fields...");
      const linkFields = await page.$$('input[name*="link" i], input[name*="url" i], input[name*="meeting" i], input[name*="telehealth" i], input[name*="video" i], input[placeholder*="link" i], input[placeholder*="url" i], input[placeholder*="meeting" i], input[type="url"], a:has-text("meeting link"), a:has-text("telehealth")');
      console.log(`  Meeting link fields: ${linkFields.length}`);
      for (const field of linkFields) {
        const tag = await field.evaluate(el => el.tagName.toLowerCase());
        const name = await field.getAttribute("name");
        const placeholder = await field.getAttribute("placeholder");
        const value = await field.getAttribute("value");
        console.log(`    <${tag}> name="${name}" ph="${placeholder}" val="${value?.slice(0, 40)}"`);
      }

    } else {
      console.log("  No clickable appointments found on calendar");
    }

    // ========== Step 3: Try the "New Session" / appointment creation form ==========
    console.log("\n📝 Step 3: Looking at appointment creation form...");

    // Navigate back to calendar
    await page.goto(`${baseUrl}/calendar`, { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForTimeout(3000);

    // Try to create a new appointment to see if meeting link is in the creation form
    const newApptButtons = await page.$$('button:has-text("New"), button:has-text("Add"), button[aria-label*="add" i], button[aria-label*="new" i], button[aria-label*="create" i], a:has-text("New Session"), a:has-text("New Appointment")');
    console.log(`  New appointment buttons: ${newApptButtons.length}`);

    for (const btn of newApptButtons) {
      const text = await btn.textContent();
      const ariaLabel = await btn.getAttribute("aria-label");
      const visible = await btn.isVisible();
      console.log(`    "${text?.trim()}" aria="${ariaLabel}" visible=${visible}`);
    }

    // Try clicking the "create session" button (used in existing appointments.ts automation)
    const createSessionBtn = await page.$('button[aria-label="create session"]');
    if (createSessionBtn && await createSessionBtn.isVisible()) {
      console.log("  Found 'create session' button, clicking...");
      await createSessionBtn.click();
      await page.waitForTimeout(3000);
      console.log(`  URL: ${page.url()}`);
      await saveScreenshot(page, "meeting-links-03-create-session");
      await dumpVisibleFormFields(page, "Create Session Form");

      // Search specifically for meeting/telehealth/link fields
      const meetingFields = await page.$$('input[name*="link" i], input[name*="url" i], input[name*="meeting" i], input[name*="telehealth" i], input[name*="video" i], input[placeholder*="link" i], input[placeholder*="url" i], input[placeholder*="zoom" i], input[type="url"], textarea[name*="link" i]');
      console.log(`\n  Meeting/telehealth fields in create form: ${meetingFields.length}`);
      for (const field of meetingFields) {
        const tag = await field.evaluate(el => el.tagName.toLowerCase());
        const name = await field.getAttribute("name");
        const ph = await field.getAttribute("placeholder");
        console.log(`    <${tag}> name="${name}" ph="${ph}"`);
      }

      // Also look for labels containing "meeting", "link", "telehealth", "video"
      const meetingLabels = await page.$$eval("label, [class*='label' i], [class*='Label']", (els) =>
        els.filter(el => {
          const text = el.textContent?.toLowerCase() || "";
          return el.offsetParent !== null && (text.includes("meeting") || text.includes("link") || text.includes("telehealth") || text.includes("video") || text.includes("zoom") || text.includes("url"));
        }).map(el => ({
          text: el.textContent?.trim().slice(0, 80) || "",
          className: el.className?.slice(0, 60) || "",
        }))
      );

      console.log(`  Labels with meeting/link keywords: ${meetingLabels.length}`);
      for (const lbl of meetingLabels) {
        console.log(`    "${lbl.text}"`);
      }

      // Close the form
      await page.keyboard.press("Escape");
      await page.waitForTimeout(1000);
    }

    // ========== Step 4: Check appointment detail/edit page ==========
    console.log("\n📋 Step 4: Trying appointment detail via direct URL...");

    // Try navigating to an appointment detail page
    const apptUrls = [
      `${baseUrl}/appointment/1`,
      `${baseUrl}/session/1`,
      `${baseUrl}/sessions/1`,
      `${baseUrl}/calendar/appointment/1`,
    ];

    for (const url of apptUrls) {
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 10000 });
        await page.waitForTimeout(2000);
        const currentUrl = page.url();
        console.log(`  ${url} → ${currentUrl}`);
        if (!currentUrl.includes("login") && !currentUrl.includes("calendar")) {
          console.log(`  ✅ Found appointment detail page!`);
          await saveScreenshot(page, "meeting-links-04-appointment-detail");
          await dumpVisibleFormFields(page, `Appointment Detail: ${url}`);

          // Search for meeting link fields
          const linkFields = await page.$$('input[name*="link" i], input[name*="url" i], input[name*="meeting" i], input[type="url"]');
          console.log(`  Meeting link fields: ${linkFields.length}`);
          break;
        }
      } catch {
        console.log(`  ${url} → error/timeout`);
      }
    }

    // ========== Step 5: Check Settings for telehealth configuration ==========
    console.log("\n⚙️ Step 5: Checking settings for telehealth config...");

    const settingsUrls = [
      `${baseUrl}/settings`,
      `${baseUrl}/settings/telehealth`,
      `${baseUrl}/settings/integrations`,
      `${baseUrl}/settings/video`,
    ];

    for (const url of settingsUrls) {
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 10000 });
        await page.waitForTimeout(2000);
        const currentUrl = page.url();
        if (!currentUrl.includes("login") && !currentUrl.includes("calendar")) {
          console.log(`  ${url} → ${currentUrl}`);

          // Check for telehealth/meeting link settings
          const meetingText = await page.$$eval("*", (els) =>
            els.filter(el => {
              const text = el.textContent?.toLowerCase() || "";
              return el.offsetParent !== null && el.children.length === 0 &&
                (text.includes("telehealth") || text.includes("meeting link") || text.includes("video") || text.includes("zoom"));
            }).map(el => ({
              tag: el.tagName.toLowerCase(),
              text: el.textContent?.trim().slice(0, 80) || "",
            })).slice(0, 20)
          );

          if (meetingText.length > 0) {
            console.log(`  Found telehealth-related content:`);
            for (const item of meetingText) {
              console.log(`    <${item.tag}> "${item.text}"`);
            }
            await saveScreenshot(page, "meeting-links-05-settings");
          }
        }
      } catch {
        console.log(`  ${url} → error/timeout`);
      }
    }

    // ========== Step 6: Save final HTML ==========
    console.log("\n📄 Step 6: Saving page HTML...");
    const html = await page.content();
    fs.writeFileSync(path.join(OUTPUT_DIR, "meeting-links-page.html"), html);
    console.log("  HTML saved");

    console.log("\n✅ Meeting links inspection complete!");
    console.log(`\n📁 Output: ${OUTPUT_DIR}`);
    console.log(`🔗 Session: https://www.browserbase.com/sessions/${session.id}\n`);

  } catch (error) {
    console.error("\n❌ Inspection failed:", error);
    await saveScreenshot(page, "error-meeting-links");
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
