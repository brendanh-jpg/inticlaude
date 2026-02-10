/**
 * Owl Practice UI Inspection Script
 *
 * Connects via Browserbase, logs into Owl Practice, and inspects the UI
 * to gather CSS selectors and page structure for automation.
 *
 * Run: npx tsx scripts/inspect-owl.ts
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
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  const filePath = path.join(OUTPUT_DIR, `${name}.png`);
  await page.screenshot({ fullPage: true, path: filePath });
  console.log(`  📸 Screenshot saved: ${filePath}`);
}

async function dumpPageInfo(page: Page, label: string) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`📄 ${label}`);
  console.log(`URL: ${page.url()}`);
  console.log(`Title: ${await page.title()}`);
  console.log(`${"=".repeat(60)}`);

  // Dump all form inputs
  const inputs = await page.$$eval("input, select, textarea", (els) =>
    els.map((el) => ({
      tag: el.tagName.toLowerCase(),
      type: (el as HTMLInputElement).type || "",
      name: (el as HTMLInputElement).name || "",
      id: el.id || "",
      placeholder: (el as HTMLInputElement).placeholder || "",
      className: el.className || "",
      label: el.closest("label")?.textContent?.trim() || "",
      ariaLabel: el.getAttribute("aria-label") || "",
    }))
  );

  if (inputs.length > 0) {
    console.log(`\n🔤 Form Fields (${inputs.length}):`);
    for (const input of inputs) {
      const identifiers = [
        input.id ? `id="${input.id}"` : "",
        input.name ? `name="${input.name}"` : "",
        input.type ? `type="${input.type}"` : "",
        input.placeholder ? `placeholder="${input.placeholder}"` : "",
        input.ariaLabel ? `aria-label="${input.ariaLabel}"` : "",
        input.label ? `label="${input.label}"` : "",
      ].filter(Boolean).join(", ");
      console.log(`  <${input.tag}> ${identifiers}`);
    }
  }

  // Dump all buttons and links
  const buttons = await page.$$eval("button, a[role='button'], a.btn, [type='submit']", (els) =>
    els.map((el) => ({
      tag: el.tagName.toLowerCase(),
      text: el.textContent?.trim().slice(0, 50) || "",
      id: el.id || "",
      className: el.className?.slice?.(0, 80) || "",
      href: (el as HTMLAnchorElement).href || "",
      type: (el as HTMLButtonElement).type || "",
    }))
  );

  if (buttons.length > 0) {
    console.log(`\n🔘 Buttons/Actions (${buttons.length}):`);
    for (const btn of buttons) {
      const identifiers = [
        btn.id ? `id="${btn.id}"` : "",
        btn.type ? `type="${btn.type}"` : "",
        btn.text ? `"${btn.text}"` : "",
      ].filter(Boolean).join(", ");
      console.log(`  <${btn.tag}> ${identifiers}`);
    }
  }

  // Dump navigation links
  const navLinks = await page.$$eval("nav a, aside a, [class*='nav'] a, [class*='sidebar'] a, [class*='menu'] a", (els) =>
    els.map((el) => ({
      text: el.textContent?.trim().slice(0, 50) || "",
      href: (el as HTMLAnchorElement).href || "",
      className: el.className?.slice?.(0, 60) || "",
    }))
  );

  if (navLinks.length > 0) {
    console.log(`\n🧭 Navigation Links (${navLinks.length}):`);
    for (const link of navLinks) {
      console.log(`  "${link.text}" → ${link.href}`);
    }
  }

  await saveScreenshot(page, label.replace(/\s+/g, "-").toLowerCase());
}

async function main() {
  console.log("🔍 Owl Practice UI Inspection");
  console.log("============================\n");

  // Validate env
  if (!BROWSERBASE_API_KEY || !BROWSERBASE_PROJECT_ID) {
    throw new Error("BROWSERBASE_API_KEY and BROWSERBASE_PROJECT_ID required in .env.local");
  }
  if (!OWL_URL || !OWL_EMAIL || !OWL_PASSWORD) {
    throw new Error("OWL_PRACTICE_URL, OWL_PRACTICE_EMAIL, OWL_PRACTICE_PASSWORD required in .env.local");
  }

  console.log(`Owl URL: ${OWL_URL}`);
  console.log(`Owl Email: ${OWL_EMAIL}`);
  console.log(`Browserbase Project: ${BROWSERBASE_PROJECT_ID}\n`);

  // Create Browserbase session
  console.log("🌐 Creating Browserbase session...");
  const bb = new Browserbase({ apiKey: BROWSERBASE_API_KEY });
  const session = await bb.sessions.create({
    projectId: BROWSERBASE_PROJECT_ID,
    keepAlive: false,
  });
  console.log(`Session ID: ${session.id}`);
  console.log(`Debug URL: https://www.browserbase.com/sessions/${session.id}\n`);

  const browser = await chromium.connectOverCDP(session.connectUrl);
  const context = browser.contexts()[0];
  const page = context.pages()[0];

  try {
    // ========== STEP 1: Login Page ==========
    console.log("🔑 Step 1: Navigating to Owl Practice login...");
    await page.goto(OWL_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(2000); // Let page settle
    await dumpPageInfo(page, "01-login-page");

    // ========== STEP 2: Attempt Login ==========
    console.log("\n🔑 Step 2: Attempting login...");

    // Try common email field selectors
    const emailSelectors = [
      'input[type="email"]',
      'input[name="email"]',
      'input[name="username"]',
      'input[id="email"]',
      'input[id="username"]',
      '#identifierId',
      'input[autocomplete="email"]',
      'input[autocomplete="username"]',
    ];

    let emailField = null;
    for (const sel of emailSelectors) {
      try {
        emailField = await page.waitForSelector(sel, { timeout: 2000 });
        if (emailField) {
          console.log(`  ✅ Email field found: ${sel}`);
          break;
        }
      } catch {}
    }

    if (!emailField) {
      console.log("  ❌ Could not find email field. Dumping all inputs...");
      await dumpPageInfo(page, "01b-login-no-email-field");
    } else {
      await emailField.fill(OWL_EMAIL);
    }

    // Try common password field selectors
    const passwordSelectors = [
      'input[type="password"]',
      'input[name="password"]',
      '#password',
    ];

    let passwordField = null;
    for (const sel of passwordSelectors) {
      try {
        passwordField = await page.waitForSelector(sel, { timeout: 2000 });
        if (passwordField) {
          console.log(`  ✅ Password field found: ${sel}`);
          break;
        }
      } catch {}
    }

    if (!passwordField) {
      console.log("  ❌ Could not find password field");
      // Maybe it's a multi-step login — check if there's a "Next" button
      const nextButton = await page.$('button:has-text("Next"), button:has-text("Continue"), [type="submit"]');
      if (nextButton) {
        console.log("  🔄 Found a 'Next' button — might be multi-step login");
        await nextButton.click();
        await page.waitForTimeout(2000);
        await dumpPageInfo(page, "01c-login-step2");
        // Try password again
        for (const sel of passwordSelectors) {
          try {
            passwordField = await page.waitForSelector(sel, { timeout: 2000 });
            if (passwordField) {
              console.log(`  ✅ Password field found after next: ${sel}`);
              break;
            }
          } catch {}
        }
      }
    }

    if (passwordField) {
      await passwordField.fill(OWL_PASSWORD);
    }

    // Find and click submit — use visible "Sign In" button, not hidden submit
    const submitSelectors = [
      'button:has-text("Sign In")',
      'button:has-text("Sign in")',
      'button:has-text("Log in")',
      'button:has-text("Login")',
      'button[type="submit"]:visible',
      'input[type="submit"]',
    ];

    let submitButton = null;
    for (const sel of submitSelectors) {
      try {
        submitButton = await page.waitForSelector(sel, { timeout: 2000 });
        if (submitButton) {
          console.log(`  ✅ Submit button found: ${sel}`);
          break;
        }
      } catch {}
    }

    if (submitButton) {
      await submitButton.click();
      console.log("  ⏳ Waiting for navigation after login...");
      await page.waitForTimeout(5000); // Wait for redirect
      await page.waitForLoadState("domcontentloaded");
    }

    await dumpPageInfo(page, "02-after-login");

    // ========== STEP 3: Dashboard / Main Navigation ==========
    console.log("\n🏠 Step 3: Inspecting dashboard & navigation...");

    // Look for sidebar/nav structure
    const navStructure = await page.$$eval("*", (els) => {
      const navEls = els.filter(el => {
        const tag = el.tagName.toLowerCase();
        const cls = el.className?.toLowerCase?.() || "";
        const role = el.getAttribute("role") || "";
        return tag === "nav" || tag === "aside" ||
               cls.includes("sidebar") || cls.includes("nav") || cls.includes("menu") ||
               role === "navigation" || role === "menu";
      });
      return navEls.map(el => ({
        tag: el.tagName.toLowerCase(),
        className: el.className?.slice?.(0, 100) || "",
        role: el.getAttribute("role") || "",
        childLinks: Array.from(el.querySelectorAll("a")).map(a => ({
          text: a.textContent?.trim().slice(0, 50) || "",
          href: a.href || "",
        })),
      }));
    });

    if (navStructure.length > 0) {
      console.log("\n📋 Navigation Structure:");
      for (const nav of navStructure) {
        console.log(`  <${nav.tag}> class="${nav.className}" role="${nav.role}"`);
        for (const link of nav.childLinks) {
          console.log(`    → "${link.text}" (${link.href})`);
        }
      }
    }

    // ========== STEP 4: Navigate to Clients ==========
    console.log("\n👥 Step 4: Navigating to Clients...");

    // Try to find and click "Clients" in nav
    const clientsLink = await page.$('a:has-text("Clients"), a:has-text("clients"), [href*="client"], [href*="Client"]');
    if (clientsLink) {
      const href = await clientsLink.getAttribute("href");
      const text = await clientsLink.textContent();
      console.log(`  ✅ Found clients link: "${text?.trim()}" → ${href}`);
      await clientsLink.click();
      await page.waitForTimeout(3000);
      await page.waitForLoadState("domcontentloaded");
    } else {
      console.log("  ❌ Could not find 'Clients' nav link. Trying direct URL...");
      // Try common URL patterns
      const clientUrls = [
        `${OWL_URL}/clients`,
        `${OWL_URL}/contacts`,
        `${OWL_URL}/patients`,
      ];
      for (const url of clientUrls) {
        try {
          await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
          const title = await page.title();
          console.log(`  Tried ${url} → title: "${title}"`);
          if (!page.url().includes("login") && !page.url().includes("sign")) {
            console.log(`  ✅ Clients page found at: ${url}`);
            break;
          }
        } catch {}
      }
    }

    await dumpPageInfo(page, "03-clients-list");

    // Look for search functionality
    const searchInputs = await page.$$('input[type="search"], input[placeholder*="earch"], input[placeholder*="Find"], input[aria-label*="earch"]');
    if (searchInputs.length > 0) {
      console.log(`\n🔍 Search inputs found: ${searchInputs.length}`);
    }

    // Look for "Add Client" / "New Client" button
    const addClientButton = await page.$('a:has-text("Add"), button:has-text("Add"), a:has-text("New Client"), button:has-text("New Client"), a:has-text("Create"), button:has-text("Create")');
    if (addClientButton) {
      const text = await addClientButton.textContent();
      console.log(`\n➕ Found add button: "${text?.trim()}"`);
    }

    // ========== STEP 5: Add Client Form ==========
    console.log("\n📝 Step 5: Opening Add Client form...");

    if (addClientButton) {
      await addClientButton.click();
      await page.waitForTimeout(3000);
      await page.waitForLoadState("domcontentloaded");
      await dumpPageInfo(page, "04-add-client-form");
    } else {
      // Try direct URL patterns
      const addClientUrls = [
        `${OWL_URL}/clients/new`,
        `${OWL_URL}/clients/add`,
        `${OWL_URL}/contacts/new`,
      ];
      for (const url of addClientUrls) {
        try {
          await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
          if (!page.url().includes("login")) {
            console.log(`  Trying ${url}...`);
            await dumpPageInfo(page, "04-add-client-form");
            break;
          }
        } catch {}
      }
    }

    // ========== STEP 6: Dump full page HTML for deep inspection ==========
    console.log("\n📄 Step 6: Saving page HTML for detailed analysis...");
    const html = await page.content();
    const htmlPath = path.join(OUTPUT_DIR, "current-page.html");
    fs.writeFileSync(htmlPath, html);
    console.log(`  HTML saved: ${htmlPath}`);

    console.log("\n✅ Inspection complete!");
    console.log(`\n📁 All output saved to: ${OUTPUT_DIR}`);
    console.log(`\n🔗 Browserbase session (keep-alive): https://www.browserbase.com/sessions/${session.id}`);
    console.log("   You can view the live session in the Browserbase dashboard.\n");

  } catch (error) {
    console.error("\n❌ Inspection failed:", error);
    await saveScreenshot(page, "error-state");
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
