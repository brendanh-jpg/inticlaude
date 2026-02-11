/**
 * Quick inspection: What does the Owl Practice clients list look like?
 * Check search input, client links format, and search behavior.
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
  await page.waitForTimeout(5000);
  console.log("Logged in:", page.url());

  // Navigate to clients
  await page.goto("https://brendanherjtherapy.owlpractice.ca/clients/all-clients", {
    waitUntil: "domcontentloaded",
    timeout: 15000,
  });
  await page.waitForTimeout(3000);

  // Dump all inputs
  const inputs = await page.$$eval("input", (els) =>
    els.map((e) => ({
      type: e.type,
      name: e.name,
      placeholder: e.placeholder,
      className: e.className.substring(0, 80),
      value: e.value,
    }))
  );
  console.log("Inputs on page:", JSON.stringify(inputs, null, 2));

  // Dump all client links
  const links = await page.$$eval("a", (els) =>
    els
      .filter((e) => e.href.includes("/client/"))
      .map((e) => ({
        href: e.href,
        text: e.textContent?.trim().substring(0, 50),
        title: e.getAttribute("title"),
      }))
  );
  console.log("Client links:", JSON.stringify(links, null, 2));

  // Dump the table structure
  const tableHTML = await page.$eval("table", (el) => el.outerHTML.substring(0, 3000)).catch(() => "No table found");
  console.log("Table HTML (first 3000 chars):", tableHTML);

  // Dump all rows with text content
  const rows = await page.$$eval("tr", (els) =>
    els.slice(0, 10).map((e) => ({
      text: e.textContent?.trim().substring(0, 100),
      innerHTML: e.innerHTML.substring(0, 300),
    }))
  );
  console.log("First 10 table rows:", JSON.stringify(rows, null, 2));

  // Look for clickable client name elements
  const clientCells = await page.$$eval("td", (els) =>
    els.filter((e) => {
      const text = e.textContent?.trim() || "";
      return text.includes("Smith") || text.includes("Billy") || text.includes("Client") || text.includes("Sample");
    }).map((e) => ({
      text: e.textContent?.trim().substring(0, 80),
      innerHTML: e.innerHTML.substring(0, 300),
      tag: e.tagName,
    }))
  );
  console.log("Client cells found:", JSON.stringify(clientCells, null, 2));

  // Also look for any element containing client names
  const nameElements = await page.$$eval("*", (els) =>
    els.filter((e) => {
      const text = e.textContent?.trim() || "";
      return (text === "Smith, Billy" || text === "Billy Smith") && e.children.length === 0;
    }).map((e) => ({
      tag: e.tagName,
      text: e.textContent?.trim().substring(0, 80),
      className: e.className?.toString().substring(0, 80),
      parentTag: e.parentElement?.tagName,
      parentClass: e.parentElement?.className?.toString().substring(0, 80),
    }))
  );
  console.log("Name elements:", JSON.stringify(nameElements, null, 2));

  // Now try the search
  const searchInput = await page.$('input[placeholder="Search..."]');
  if (searchInput) {
    await searchInput.fill("Billy");
    await page.waitForTimeout(2000);

    const rowsAfter = await page.$$eval("tr", (els) =>
      els.slice(0, 5).map((e) => ({
        text: e.textContent?.trim().substring(0, 100),
      }))
    );
    console.log("Rows after search:", JSON.stringify(rowsAfter, null, 2));
  }

  await browser.close();
}

main().catch(console.error);
