/**
 * Inspect the "Non-Session Notes" tab on a client's Sessions & Notes page.
 * We need to understand:
 * 1. What buttons/actions exist on the Non-Session Notes tab
 * 2. How to create a new non-session note
 * 3. What the note creation form looks like
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

  // Go to client 4's sessions page
  await page.goto("https://brendanherjtherapy.owlpractice.ca/client/4/sessions", {
    waitUntil: "domcontentloaded",
    timeout: 15000,
  });
  await page.waitForTimeout(3000);
  console.log("On page:", page.url());

  // ============ PART 1: Find and click "Non-Session Notes" tab ============
  console.log("\n=== PART 1: Click Non-Session Notes tab ===");

  // Find all tab-like buttons
  const tabs = await page.$$eval("button", (els) =>
    els
      .filter((e) => {
        const text = e.textContent?.trim() || "";
        return (
          text.includes("Session") ||
          text.includes("Note") ||
          text.includes("Delete")
        );
      })
      .map((e) => ({
        text: e.textContent?.trim().substring(0, 60),
        ariaLabel: e.getAttribute("aria-label"),
        className: e.className?.substring(0, 100),
        ariaSelected: e.getAttribute("aria-selected"),
        role: e.getAttribute("role"),
        visible: (e as HTMLElement).offsetParent !== null,
      }))
  );
  console.log("Tab-like buttons:", JSON.stringify(tabs, null, 2));

  // Click the "Non-Session Notes" tab
  try {
    await page.click('button:has-text("Non-Session Notes")', { timeout: 5000 });
    console.log("Clicked Non-Session Notes tab");
    await page.waitForTimeout(2000);
  } catch (e) {
    console.log("Could not click Non-Session Notes tab:", (e as Error).message);
  }

  // ============ PART 2: Inspect what's on the Non-Session Notes tab ============
  console.log("\n=== PART 2: Non-Session Notes tab content ===");

  // Look for all buttons on this tab view
  const allButtons = await page.$$eval("button", (els) =>
    els
      .filter((e) => (e as HTMLElement).offsetParent !== null)
      .map((e) => ({
        text: e.textContent?.trim().substring(0, 60),
        ariaLabel: e.getAttribute("aria-label"),
        className: e.className?.substring(0, 100),
      }))
  );
  console.log("All visible buttons:", JSON.stringify(allButtons, null, 2));

  // Look for any "Create" or "Add" or "New" button
  const createButtons = await page.$$eval("button, a", (els) =>
    els
      .filter((e) => {
        const text = (e.textContent?.trim() || "").toLowerCase();
        return (
          (text.includes("create") ||
            text.includes("add") ||
            text.includes("new")) &&
          (e as HTMLElement).offsetParent !== null
        );
      })
      .map((e) => ({
        tag: e.tagName,
        text: e.textContent?.trim().substring(0, 60),
        ariaLabel: e.getAttribute("aria-label"),
        className: e.className?.toString().substring(0, 100),
        href: e.getAttribute("href"),
      }))
  );
  console.log("Create/Add/New buttons:", JSON.stringify(createButtons, null, 2));

  // Check for any content/list on the tab
  const tabContent = await page.evaluate(() => {
    // Find the main content area (after tabs)
    const main = document.querySelector("main") || document.querySelector("#root") || document.body;
    return main?.textContent?.substring(0, 2000);
  });
  console.log("Page text (first 2000):", tabContent);

  // ============ PART 3: Try clicking "Create Note" or similar ============
  console.log("\n=== PART 3: Try clicking Create Note ===");

  // Look for icon buttons (like a + icon)
  const iconButtons = await page.$$eval('button svg, button [class*="icon"], button [class*="Icon"]', (els) =>
    els.map((e) => {
      const btn = e.closest("button");
      return {
        buttonText: btn?.textContent?.trim().substring(0, 60),
        buttonAriaLabel: btn?.getAttribute("aria-label"),
        buttonClass: btn?.className?.substring(0, 100),
        svgClass: e.className?.toString().substring(0, 80),
      };
    })
  );
  console.log("Icon buttons:", JSON.stringify(iconButtons.slice(0, 15), null, 2));

  // Try to find a create/add button and click it
  let clicked = false;
  try {
    const createBtn = await page.$('button:has-text("Create Note")');
    if (createBtn && await createBtn.isVisible()) {
      await createBtn.click();
      clicked = true;
      console.log("Clicked 'Create Note' button");
    }
  } catch { /* ignore */ }

  if (!clicked) {
    try {
      const addBtn = await page.$('button:has-text("Add Note")');
      if (addBtn && await addBtn.isVisible()) {
        await addBtn.click();
        clicked = true;
        console.log("Clicked 'Add Note' button");
      }
    } catch { /* ignore */ }
  }

  if (!clicked) {
    try {
      const newBtn = await page.$('button:has-text("New Note")');
      if (newBtn && await newBtn.isVisible()) {
        await newBtn.click();
        clicked = true;
        console.log("Clicked 'New Note' button");
      }
    } catch { /* ignore */ }
  }

  if (!clicked) {
    // Try aria-label based
    try {
      const ariaBtn = await page.$('button[aria-label*="note" i], button[aria-label*="Note"], button[aria-label*="create" i], button[aria-label*="add" i]');
      if (ariaBtn && await ariaBtn.isVisible()) {
        const label = await ariaBtn.getAttribute("aria-label");
        await ariaBtn.click();
        clicked = true;
        console.log(`Clicked button with aria-label: ${label}`);
      }
    } catch { /* ignore */ }
  }

  if (clicked) {
    await page.waitForTimeout(3000);

    // Check what opened
    console.log("\n=== After clicking create button ===");

    // Check for CKEditor
    const hasCKEditor = await page.$("iframe.cke_wysiwyg_frame");
    console.log("Has CKEditor iframe:", !!hasCKEditor);

    // Check for textareas
    const textareas = await page.$$eval("textarea", (els) =>
      els
        .filter((e) => (e as HTMLElement).offsetParent !== null)
        .map((e) => ({
          name: e.name,
          placeholder: e.placeholder,
          className: e.className?.substring(0, 80),
          maxLength: e.maxLength,
        }))
    );
    console.log("Visible textareas:", JSON.stringify(textareas, null, 2));

    // Check for input fields
    const inputs = await page.$$eval("input", (els) =>
      els
        .filter((e) => (e as HTMLElement).offsetParent !== null)
        .map((e) => ({
          type: e.type,
          name: e.name,
          placeholder: e.placeholder,
          className: e.className?.substring(0, 80),
        }))
    );
    console.log("Visible inputs:", JSON.stringify(inputs, null, 2));

    // Check for save/submit buttons
    const saveButtons = await page.$$eval("button", (els) =>
      els
        .filter((e) => {
          const text = (e.textContent?.trim() || "").toLowerCase();
          return (
            (text.includes("save") ||
              text.includes("submit") ||
              text.includes("close")) &&
            (e as HTMLElement).offsetParent !== null
          );
        })
        .map((e) => ({
          text: e.textContent?.trim().substring(0, 60),
          className: e.className?.substring(0, 100),
        }))
    );
    console.log("Save/Submit buttons:", JSON.stringify(saveButtons, null, 2));

    // Check for overlays/modals
    const overlays = await page.$$eval(
      '.bp3-overlay-content, .bp3-dialog, [class*="Modal"], [class*="modal"], [class*="Overlay"]',
      (els) =>
        els
          .filter((e) => (e as HTMLElement).offsetParent !== null)
          .map((e) => ({
            tag: e.tagName,
            className: e.className?.toString().substring(0, 100),
            text: e.textContent?.trim().substring(0, 300),
          }))
    );
    console.log("Overlays/modals:", JSON.stringify(overlays, null, 2));

    // Check for select/dropdown for templates
    const selects = await page.$$eval('select, [class*="select"], [class*="Select"]', (els) =>
      els
        .filter((e) => (e as HTMLElement).offsetParent !== null)
        .map((e) => ({
          tag: e.tagName,
          className: e.className?.toString().substring(0, 100),
          text: e.textContent?.trim().substring(0, 100),
        }))
    );
    console.log("Select/dropdown elements:", JSON.stringify(selects, null, 2));
  } else {
    console.log("No create button found — dumping full page structure");

    // Get all unique class names containing "note" or "Note"
    const noteClasses = await page.evaluate(() => {
      const all = document.querySelectorAll("*");
      const classes = new Set<string>();
      for (const el of all) {
        const cls = el.className?.toString() || "";
        if (cls.toLowerCase().includes("note")) {
          classes.add(cls.substring(0, 100));
        }
      }
      return Array.from(classes);
    });
    console.log("Elements with 'note' in class:", JSON.stringify(noteClasses, null, 2));
  }

  await browser.close();
}

main().catch(console.error);
