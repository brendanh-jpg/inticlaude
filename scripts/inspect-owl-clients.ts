/**
 * Owl Practice - Focused Client Page Inspection
 *
 * Inspects the "Add Client" flow specifically.
 * Run: npx tsx scripts/inspect-owl-clients.ts
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

async function dumpFormFields(page: Page, label: string) {
  console.log(`\n--- ${label} ---`);
  const inputs = await page.$$eval("input, select, textarea", (els) =>
    els.map((el) => ({
      tag: el.tagName.toLowerCase(),
      type: (el as HTMLInputElement).type || "",
      name: (el as HTMLInputElement).name || "",
      id: el.id || "",
      placeholder: (el as HTMLInputElement).placeholder || "",
      ariaLabel: el.getAttribute("aria-label") || "",
      // Walk up to find label text
      labelText: (() => {
        // Check for associated label
        const id = el.id;
        if (id) {
          const label = el.ownerDocument.querySelector(`label[for="${id}"]`);
          if (label) return label.textContent?.trim() || "";
        }
        // Check parent label
        const parentLabel = el.closest("label");
        if (parentLabel) return parentLabel.textContent?.trim() || "";
        // Check preceding sibling or parent for label-like text
        const parent = el.parentElement;
        if (parent) {
          const prev = parent.previousElementSibling;
          if (prev && (prev.tagName === "LABEL" || prev.tagName === "SPAN" || prev.tagName === "DIV")) {
            return prev.textContent?.trim() || "";
          }
        }
        return "";
      })(),
      visible: el.offsetParent !== null,
      required: (el as HTMLInputElement).required,
    }))
  );

  for (const inp of inputs.filter(i => i.visible)) {
    const parts = [
      `<${inp.tag}>`,
      inp.type ? `type="${inp.type}"` : "",
      inp.name ? `name="${inp.name}"` : "",
      inp.id ? `id="${inp.id}"` : "",
      inp.placeholder ? `placeholder="${inp.placeholder}"` : "",
      inp.ariaLabel ? `aria="${inp.ariaLabel}"` : "",
      inp.labelText ? `label="${inp.labelText}"` : "",
      inp.required ? "REQUIRED" : "",
    ].filter(Boolean).join(" ");
    console.log(`  ${parts}`);
  }

  // Also dump visible buttons
  const buttons = await page.$$eval("button", (els) =>
    els.filter(el => el.offsetParent !== null).map((el) => ({
      text: el.textContent?.trim().slice(0, 60) || "",
      type: el.type || "",
      className: el.className?.slice(0, 80) || "",
      ariaLabel: el.getAttribute("aria-label") || "",
    }))
  );
  if (buttons.length > 0) {
    console.log(`  Visible buttons (${buttons.length}):`);
    for (const btn of buttons) {
      console.log(`    <button> type="${btn.type}" text="${btn.text}" aria="${btn.ariaLabel}"`);
    }
  }
}

async function main() {
  console.log("🔍 Owl Practice - Client Page Deep Inspection\n");

  const bb = new Browserbase({ apiKey: BROWSERBASE_API_KEY });
  const session = await bb.sessions.create({ projectId: BROWSERBASE_PROJECT_ID, keepAlive: false });
  console.log(`Session: ${session.id}`);
  console.log(`Debug: https://www.browserbase.com/sessions/${session.id}\n`);

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
    console.log(`  Logged in. URL: ${page.url()}`);

    // Navigate to Clients
    console.log("\n👥 Navigating to Clients...");
    await page.click('text=Clients');
    await page.waitForTimeout(3000);
    console.log(`  URL: ${page.url()}`);
    await saveScreenshot(page, "clients-list");

    // Find the ⊕ (Add) button — it's likely an icon button in the top right
    console.log("\n🔍 Looking for Add Client button...");

    // Dump ALL buttons on clients page with their positions
    const allButtons = await page.$$eval("button, a", (els) =>
      els.filter(el => el.offsetParent !== null).map((el) => {
        const rect = el.getBoundingClientRect();
        return {
          tag: el.tagName.toLowerCase(),
          text: el.textContent?.trim().slice(0, 60) || "",
          ariaLabel: el.getAttribute("aria-label") || "",
          title: el.getAttribute("title") || "",
          className: el.className?.slice?.(0, 100) || "",
          href: (el as HTMLAnchorElement).href || "",
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          innerHTML: el.innerHTML?.slice(0, 100) || "",
        };
      })
    );

    console.log(`\n  All clickable elements on clients page:`);
    for (const el of allButtons) {
      const pos = `(${el.x}, ${el.y}) ${el.width}x${el.height}`;
      const info = [
        el.text ? `"${el.text}"` : "",
        el.ariaLabel ? `aria="${el.ariaLabel}"` : "",
        el.title ? `title="${el.title}"` : "",
        el.href ? `href="${el.href.slice(-60)}"` : "",
      ].filter(Boolean).join(" ");
      console.log(`  <${el.tag}> ${pos} ${info}`);
      // Show innerHTML for icon-only buttons
      if (!el.text && el.innerHTML) {
        console.log(`    inner: ${el.innerHTML.slice(0, 120)}`);
      }
    }

    // Try clicking the ⊕ button (the icon in top right of clients list)
    // Based on screenshot, there's a ⊕ icon and a filter icon near top-right
    console.log("\n🔍 Looking for add/create icons...");

    // Look for SVG/icon buttons that might be "add"
    const iconButtons = await page.$$('button svg, button [class*="icon"], button [class*="Icon"], a svg');
    console.log(`  Found ${iconButtons.length} icon buttons`);

    // Try to find and click the + / add button
    // The ⊕ icon in the screenshot is likely an <svg> inside a <button>
    const addButtons = await page.$$('button[aria-label*="add" i], button[aria-label*="new" i], button[aria-label*="create" i], button[title*="add" i], button[title*="new" i], button[title*="create" i]');
    console.log(`  Add-related buttons: ${addButtons.length}`);

    for (const btn of addButtons) {
      const text = await btn.textContent();
      const ariaLabel = await btn.getAttribute("aria-label");
      const title = await btn.getAttribute("title");
      console.log(`    Found: text="${text?.trim()}" aria="${ariaLabel}" title="${title}"`);
    }

    // Try clicking the ⊕ icon — let's look at the button near coordinates based on screenshot
    // The ⊕ icon appears to be around x=1410, y=57 in the screenshot
    // Let's try finding it by looking for plus/add SVG path
    const plusButtons = await page.$$eval("button", (els) =>
      els.filter(el => {
        const svg = el.querySelector("svg");
        if (!svg) return false;
        const html = svg.innerHTML.toLowerCase();
        // Common plus icon patterns: "M12 5v14M5 12h14" or similar
        return html.includes("plus") || html.includes("add") ||
               (html.includes("m") && html.includes("h") && html.includes("v")) ||
               el.getAttribute("aria-label")?.toLowerCase().includes("add") ||
               el.getAttribute("title")?.toLowerCase().includes("add");
      }).map(el => ({
        text: el.textContent?.trim() || "",
        ariaLabel: el.getAttribute("aria-label") || "",
        title: el.getAttribute("title") || "",
        className: el.className?.slice(0, 100) || "",
        rect: el.getBoundingClientRect(),
        svgPaths: Array.from(el.querySelectorAll("svg path")).map(p => p.getAttribute("d")?.slice(0, 60) || ""),
      }))
    );

    console.log(`\n  Potential add/plus buttons: ${plusButtons.length}`);
    for (const btn of plusButtons) {
      console.log(`    class="${btn.className}" rect=(${Math.round(btn.rect.x)},${Math.round(btn.rect.y)})`);
      console.log(`    SVG paths: ${btn.svgPaths.join(", ")}`);
    }

    // Let's just try clicking on the client row to see the client detail/edit page
    console.log("\n👤 Clicking on existing client 'Hootkins, Hillary'...");
    const clientLink = await page.$('a:has-text("Hootkins"), td:has-text("Hootkins"), tr:has-text("Hootkins")');
    if (clientLink) {
      await clientLink.click();
      await page.waitForTimeout(3000);
      console.log(`  URL after click: ${page.url()}`);
      await saveScreenshot(page, "client-detail");
      await dumpFormFields(page, "Client Detail Page");

      // Check for tabs on client page
      const tabs = await page.$$eval('[role="tab"], [class*="tab" i] a, [class*="Tab" i] a, [class*="tab" i] button', (els) =>
        els.filter(el => el.offsetParent !== null).map(el => ({
          text: el.textContent?.trim() || "",
          className: el.className?.slice(0, 60) || "",
          href: (el as HTMLAnchorElement).href || "",
        }))
      );
      if (tabs.length > 0) {
        console.log(`\n  Tabs on client page:`);
        for (const tab of tabs) console.log(`    "${tab.text}" ${tab.href || ""}`);
      }

      // Look for Edit button on client detail
      const editBtn = await page.$('button:has-text("Edit"), a:has-text("Edit"), button[aria-label*="edit" i]');
      if (editBtn) {
        console.log(`\n  ✅ Found Edit button`);
      }
    } else {
      console.log("  ❌ Could not find client row");
    }

    // Go back to clients list and try to find "New Client" or "Add Client"
    console.log("\n🔙 Going back to clients list...");
    await page.goto(`${OWL_URL}/clients/all-clients`, { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForTimeout(3000);

    // Try clicking the ⊕ circle icon button near top-right
    // Look for it via position — it should be near the top right of the content area
    const topRightButtons = await page.$$eval("button", (els) =>
      els.filter(el => {
        const rect = el.getBoundingClientRect();
        return el.offsetParent !== null && rect.x > 1300 && rect.y < 80 && rect.width < 50;
      }).map(el => ({
        text: el.textContent?.trim() || "",
        ariaLabel: el.getAttribute("aria-label") || "",
        title: el.getAttribute("title") || "",
        className: el.className?.slice(0, 100) || "",
        innerHTML: el.innerHTML?.slice(0, 200) || "",
        x: Math.round(el.getBoundingClientRect().x),
        y: Math.round(el.getBoundingClientRect().y),
      }))
    );

    console.log(`\n  Top-right small buttons:`);
    for (const btn of topRightButtons) {
      console.log(`    (${btn.x},${btn.y}) text="${btn.text}" aria="${btn.ariaLabel}" title="${btn.title}"`);
      console.log(`    inner: ${btn.innerHTML.slice(0, 150)}`);
    }

    // Also check for a floating action button (FAB) — the + in bottom right of first screenshot
    const fabButtons = await page.$$eval("button, a", (els) =>
      els.filter(el => {
        const rect = el.getBoundingClientRect();
        return el.offsetParent !== null && rect.x > 1400 && rect.y > 700;
      }).map(el => ({
        tag: el.tagName.toLowerCase(),
        text: el.textContent?.trim() || "",
        ariaLabel: el.getAttribute("aria-label") || "",
        title: el.getAttribute("title") || "",
        className: el.className?.slice(0, 100) || "",
        innerHTML: el.innerHTML?.slice(0, 200) || "",
        x: Math.round(el.getBoundingClientRect().x),
        y: Math.round(el.getBoundingClientRect().y),
      }))
    );

    console.log(`\n  Bottom-right buttons (FAB):`);
    for (const btn of fabButtons) {
      console.log(`    <${btn.tag}> (${btn.x},${btn.y}) text="${btn.text}" aria="${btn.ariaLabel}" title="${btn.title}"`);
      console.log(`    inner: ${btn.innerHTML.slice(0, 150)}`);
    }

    // Also look at the ⊕ icon near filter — it's the add icon on clients page
    // From screenshot it's near the filter icon at top right of the table area
    const tableAreaButtons = await page.$$eval("button", (els) =>
      els.filter(el => {
        const rect = el.getBoundingClientRect();
        // Table header area, right side
        return el.offsetParent !== null && rect.x > 1350 && rect.y > 40 && rect.y < 100;
      }).map(el => ({
        text: el.textContent?.trim() || "",
        ariaLabel: el.getAttribute("aria-label") || "",
        title: el.getAttribute("title") || "",
        className: el.className?.slice(0, 150) || "",
        innerHTML: el.innerHTML?.slice(0, 300) || "",
        x: Math.round(el.getBoundingClientRect().x),
        y: Math.round(el.getBoundingClientRect().y),
        width: Math.round(el.getBoundingClientRect().width),
        height: Math.round(el.getBoundingClientRect().height),
      }))
    );

    console.log(`\n  Table-area right buttons:`);
    for (const btn of tableAreaButtons) {
      console.log(`    (${btn.x},${btn.y}) ${btn.width}x${btn.height} aria="${btn.ariaLabel}" title="${btn.title}"`);
      console.log(`    class: ${btn.className}`);
      console.log(`    inner: ${btn.innerHTML.slice(0, 200)}`);
    }

    // Try clicking the ⊕ icon specifically
    // The ⊕ appears to be an SVG circle-plus icon
    console.log("\n🖱️ Trying to click the ⊕ icon...");

    // Try aria-label or just click by coordinates from the screenshot
    // In the 03-clients-list screenshot, the ⊕ is approximately at (1406, 57)
    // But Browserbase viewport might differ, so let's try selector first
    let addClientClicked = false;

    // Try various selectors for the add button
    const addSelectors = [
      '[aria-label="Add Client"]',
      '[aria-label="Add"]',
      '[aria-label="Create Client"]',
      '[title="Add Client"]',
      '[title="Add"]',
      'button:has(svg circle)',  // Circle plus icon
    ];

    for (const sel of addSelectors) {
      try {
        const btn = await page.$(sel);
        if (btn && await btn.isVisible()) {
          console.log(`  Found via: ${sel}`);
          await btn.click();
          addClientClicked = true;
          break;
        }
      } catch {}
    }

    if (!addClientClicked) {
      // Click by text content that has a + symbol
      const plusTextBtn = await page.$('button:has-text("+"), a:has-text("+")');
      if (plusTextBtn && await plusTextBtn.isVisible()) {
        console.log("  Found + text button");
        await plusTextBtn.click();
        addClientClicked = true;
      }
    }

    if (addClientClicked) {
      await page.waitForTimeout(3000);
      console.log(`  URL after clicking add: ${page.url()}`);
      await saveScreenshot(page, "after-add-click");
      await dumpFormFields(page, "After Add Click");
    } else {
      console.log("  ❌ Could not find add button by selector");
      console.log("  Trying direct URL patterns...");

      // Try navigating to common "new client" URLs
      const newClientUrls = [
        `${OWL_URL}/clients/new`,
        `${OWL_URL}/clients/create`,
        `${OWL_URL}/clients/add`,
        `${OWL_URL}/client/new`,
      ];

      for (const url of newClientUrls) {
        try {
          await page.goto(url, { waitUntil: "domcontentloaded", timeout: 10000 });
          await page.waitForTimeout(2000);
          const currentUrl = page.url();
          console.log(`  ${url} → ${currentUrl}`);
          if (!currentUrl.includes("login") && !currentUrl.includes("all-clients")) {
            console.log(`  ✅ Found new client page!`);
            await saveScreenshot(page, "new-client-form");
            await dumpFormFields(page, "New Client Form");
            break;
          }
        } catch (e) {
          console.log(`  ${url} → error`);
        }
      }
    }

    console.log("\n✅ Client inspection complete!");

  } catch (error) {
    console.error("\n❌ Failed:", error);
    await saveScreenshot(page, "error-clients");
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
