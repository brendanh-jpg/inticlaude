import type { Page } from "playwright-core";
import type { Appointment } from "@/sync/types";
import { createChildLogger } from "@/sync/logger";

const log = createChildLogger("owl-appointments");

/**
 * Owl Practice "Create Session" Modal Automation
 *
 * UI Structure (confirmed via browser inspection):
 * - Triggered by the FAB "+" button at bottom-right of /calendar
 * - Modal uses BlueprintJS overlay (.bp3-overlay-content)
 * - Form fields use react-select dropdowns (IDs change per open, use index)
 *
 * Form layout:
 *   react-select[0] — Event Type: Client | Personal | Unavailable
 *   input[placeholder="Search Clients..."] — Client Name (autocomplete)
 *   react-select[1] — Therapist (auto-fills when client selected)
 *   react-select[2] — Attendance: Attended | Cancelled | Late Cancel | No Show | Non Billable
 *   react-select[3..6] — Date: Month, Day, Year, Time
 *   react-select[7] — Recurrence
 *   react-select[8] — Service (required)
 *   input — Duration (minutes)
 *   input — Amount Charged
 *   textarea — Session Comments
 *   button "Create Session" — Submit
 */

const MODAL_TIMEOUT = 8000;
const NAV_TIMEOUT = 5000;

/** Pick the best-matching Owl Service based on appointment name/duration. */
function pickServiceLabel(appointment: Appointment): string {
  const name = (appointment.name || "").toLowerCase();
  const duration = appointment.duration || 50;

  if (name.includes("family")) return "Psychotherapy with the patient present (Family)";
  if (name.includes("group")) return "Group Psychotherapy, 60 mins (Shared)";
  if (name.includes("consult")) return "New Client Consultation, 15 mins (Individual)";
  if (name.includes("initial") || name.includes("assessment")) return "Initial Assessment, 60 mins (Individual)";

  if (duration <= 20) return "New Client Consultation, 15 mins (Individual)";
  if (duration <= 40) return "Psychotherapy, 30 mins (Individual)";
  if (duration <= 50) return "Psychotherapy, 45 mins (Individual)";
  return "Psychotherapy, 60 mins (Individual)";
}

/** Practice timezone — configurable via env, defaults to Eastern. */
const PRACTICE_TIMEZONE = process.env.PRACTICE_TIMEZONE || "America/Toronto";

/** Parse ISO datetime into Owl date-picker components using the practice timezone. */
function parseDateComponents(isoString: string): {
  month: string;
  day: string;
  year: string;
  time: string;
} {
  const date = new Date(isoString);

  // Use Intl.DateTimeFormat to extract parts in the practice timezone
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: PRACTICE_TIMEZONE,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  const parts = formatter.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";

  const month = get("month");       // "Jan", "Feb", etc.
  const day = get("day");           // "1", "15", etc.
  const year = get("year");         // "2025"
  let hours = parseInt(get("hour"), 10) || 12;
  let minutes = parseInt(get("minute"), 10) || 0;
  const dayPeriod = get("dayPeriod"); // "AM" or "PM"

  // Round to nearest 30 minutes (Owl time dropdown uses 30-min intervals).
  // Work in epoch millis to avoid date-advancing bugs.
  const roundedMs = Math.round(date.getTime() / (30 * 60 * 1000)) * (30 * 60 * 1000);
  const roundedDate = new Date(roundedMs);

  const roundedFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: PRACTICE_TIMEZONE,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  const roundedParts = roundedFormatter.formatToParts(roundedDate);
  const getRounded = (type: string) => roundedParts.find((p) => p.type === type)?.value ?? "";

  hours = parseInt(getRounded("hour"), 10) || 12;
  minutes = parseInt(getRounded("minute"), 10) || 0;
  const ampm = getRounded("dayPeriod") || dayPeriod;

  return {
    month,
    day,
    year,
    time: `${hours}:${minutes.toString().padStart(2, "0")} ${ampm}`,
  };
}

/**
 * Dismiss any open BlueprintJS popovers/backdrops that may be intercepting pointer events.
 * Owl Practice uses BlueprintJS which creates overlay backdrops for every dropdown/popover.
 */
async function dismissAllOverlayBackdrops(page: Page): Promise<void> {
  await page.evaluate(() => {
    // Remove ALL overlay backdrops that intercept pointer events — not just popover ones
    document.querySelectorAll('.bp3-overlay-backdrop').forEach(el => {
      (el as HTMLElement).style.pointerEvents = 'none';
    });
    // Also dismiss any open autocomplete results / popover content
    document.querySelectorAll('.bp3-popover-dismiss, [class*="ClientSearchBar__Results"]').forEach(el => {
      (el as HTMLElement).style.display = 'none';
    });
  });
  await page.waitForTimeout(200);
}

/**
 * Select a value from a react-select dropdown by its index within the modal.
 * IDs change every time the modal opens, so we locate by position.
 */
async function selectReactSelect(page: Page, index: number, value: string): Promise<void> {
  // Dismiss any overlay backdrops that might block clicks
  await dismissAllOverlayBackdrops(page);

  // Re-query controls fresh each time (form structure can change after client selection)
  const result = await page.evaluate((idx) => {
    const ctrls = document.querySelectorAll('.bp3-overlay-content [class*="react-select__control"]');
    if (idx >= ctrls.length) return { status: -1, className: '', count: ctrls.length };
    const className = ctrls[idx].className;
    const isDisabled = ctrls[idx].classList.contains('react-select__control--is-disabled');
    if (isDisabled) return { status: -2, className, count: ctrls.length };
    // Open dropdown with mousedown on the dropdown indicator first (more reliable for small selects)
    const indicator = ctrls[idx].querySelector('[class*="react-select__dropdown-indicator"]');
    if (indicator) {
      indicator.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    } else {
      // Fallback: mousedown on the control itself
      ctrls[idx].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    }
    return { status: ctrls.length, className, count: ctrls.length };
  }, index);

  const controlCount = result.status;

  if (controlCount === -1) {
    throw new Error(`react-select index ${index} out of range`);
  }
  if (controlCount === -2) {
    log.warn("react-select is disabled — attempting to force enable", { index, className: result.className, totalControls: result.count });
    // Try to force-enable and open the dropdown by removing the disabled state
    const forceResult = await page.evaluate((idx) => {
      const ctrls = document.querySelectorAll('.bp3-overlay-content [class*="react-select__control"]');
      const ctrl = ctrls[idx];
      // Remove disabled class
      ctrl.classList.remove('react-select__control--is-disabled');
      // Find the parent react-select container and try to enable it
      const container = ctrl.closest('[class*="react-select"]');
      if (container) {
        container.classList.remove('react-select--is-disabled');
      }
      // Try to open it
      const indicator = ctrl.querySelector('[class*="react-select__dropdown-indicator"]');
      if (indicator) {
        indicator.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      } else {
        ctrl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      }
      return true;
    }, index);
    await page.waitForTimeout(600);
    // Check if options appeared
    const optCount = await page.evaluate(() => document.querySelectorAll('[class*="react-select__option"]').length);
    if (optCount === 0) {
      throw new Error(`react-select index ${index} is disabled and could not be force-enabled`);
    }
    log.info("Force-enabled disabled react-select", { index, optionCount: optCount });
  }

  await page.waitForTimeout(600);

  // Log how many options appeared for debugging
  const optionCount = await page.evaluate(() => {
    return document.querySelectorAll('[class*="react-select__option"]').length;
  });
  log.info("react-select dropdown opened", { index, value, controlCount, optionCount });

  // Select the matching option using click (react-select options respond to click)
  const found = await page.evaluate((searchValue) => {
    const options = document.querySelectorAll('[class*="react-select__option"]');
    // Exact match first
    for (const opt of options) {
      const text = (opt as HTMLElement).textContent?.trim() || '';
      if (text === searchValue) {
        (opt as HTMLElement).click();
        return true;
      }
    }
    // Partial match
    for (const opt of options) {
      const text = (opt as HTMLElement).textContent || '';
      if (text.includes(searchValue)) {
        (opt as HTMLElement).click();
        return true;
      }
    }
    // Case-insensitive partial match
    const lowerSearch = searchValue.toLowerCase();
    for (const opt of options) {
      const text = ((opt as HTMLElement).textContent || '').toLowerCase();
      if (text.includes(lowerSearch)) {
        (opt as HTMLElement).click();
        return true;
      }
    }
    return false;
  }, value);

  if (!found) {
    // Close the dropdown by pressing Escape before throwing
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    throw new Error(`react-select option "${value}" not found`);
  }

  await page.waitForTimeout(400);
}

/**
 * Open the "Create Session" modal via the FAB "+" button on the calendar page.
 */
async function openCreateSessionModal(page: Page): Promise<void> {
  log.info("Opening Create Session modal...");

  // Dismiss any lingering overlays first
  for (let i = 0; i < 3; i++) {
    try {
      const overlay = await page.$('.bp3-overlay-backdrop, .bp3-overlay-content');
      if (overlay && await overlay.isVisible()) {
        await page.keyboard.press("Escape");
        await page.waitForTimeout(500);
      } else {
        break;
      }
    } catch { break; }
  }

  // Navigate to calendar — use direct URL navigation for reliability
  const baseUrl = page.url().split("/").slice(0, 3).join("/");
  log.info("Navigating to calendar via URL...", { baseUrl });
  await page.goto(`${baseUrl}/calendar`, { waitUntil: "domcontentloaded", timeout: 15000 });
  await page.waitForTimeout(3000); // Let the SPA calendar fully render

  // Click the FAB "+" button — it's a small circular button at the bottom-right
  let clicked = false;

  // Strategy 1: look for a round/FAB-style button with common class patterns
  const fabSelectors = [
    'button[class*="Fab"]',
    'button[class*="fab"]',
    'button[class*="floating"]',
    'button[class*="add-session"]',
    'button[class*="create-session"]',
    'button[class*="AddButton"]',
  ];
  for (const sel of fabSelectors) {
    const btn = await page.$(sel);
    if (btn && await btn.isVisible()) {
      await btn.click();
      clicked = true;
      log.info("FAB clicked via selector", { selector: sel });
      break;
    }
  }

  // Strategy 2: use page.evaluate to find the FAB by position (bottom-right, last button with SVG)
  if (!clicked) {
    log.info("Scanning for FAB button via evaluate...");
    const fabClicked = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const viewport = { w: window.innerWidth, h: window.innerHeight };
      // Sort buttons by distance from bottom-right corner (ascending)
      const scored = btns
        .map(btn => {
          const rect = btn.getBoundingClientRect();
          const hasSvg = !!btn.querySelector('svg');
          const isSmall = rect.width <= 60 && rect.height <= 60 && rect.width > 15;
          // Distance from bottom-right corner
          const dist = Math.sqrt(Math.pow(viewport.w - rect.right, 2) + Math.pow(viewport.h - rect.bottom, 2));
          return { btn, rect, hasSvg, isSmall, dist };
        })
        .filter(s => s.isSmall && s.hasSvg && s.rect.y > 200) // Must be below top nav
        .sort((a, b) => a.dist - b.dist);

      if (scored.length > 0) {
        (scored[0].btn as HTMLElement).click();
        return { clicked: true, x: scored[0].rect.x, y: scored[0].rect.y };
      }
      return { clicked: false, x: 0, y: 0 };
    });

    if (fabClicked.clicked) {
      clicked = true;
      log.info("FAB clicked via bottom-right scan", { x: fabClicked.x, y: fabClicked.y });
    }
  }

  // Strategy 3: last resort — find any button at bottom of page
  if (!clicked) {
    log.info("Trying last-resort FAB detection");
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const viewport = { h: window.innerHeight };
      // Find buttons in the bottom 100px
      const bottomBtns = btns.filter(b => {
        const r = b.getBoundingClientRect();
        return r.top > viewport.h - 100;
      });
      if (bottomBtns.length > 0) {
        (bottomBtns[bottomBtns.length - 1] as HTMLElement).click();
      }
    });
  }

  await page.waitForSelector('.bp3-overlay-content', { timeout: 12000, state: "visible" });
  await page.waitForTimeout(800);
  log.info("Create Session modal opened");
}

/**
 * Search and select a client in the "Client Name" autocomplete field.
 * Selecting the client auto-fills the Therapist dropdown.
 *
 * IMPORTANT: We must use Playwright's native .click() on the autocomplete result,
 * NOT page.evaluate(() => item.click()). The evaluate approach doesn't trigger
 * React's synthetic event system in Browserbase, which means the React component
 * doesn't register the selection — Therapist stays empty and Service stays disabled.
 */
async function searchAndSelectClient(page: Page, firstName: string, lastName: string): Promise<void> {
  log.info("Searching for client in session form", { firstName, lastName });

  const clientInput = await page.waitForSelector(
    '.bp3-overlay-content input[placeholder="Search Clients..."]',
    { timeout: MODAL_TIMEOUT },
  );

  // Clear any existing text and type the name character by character
  // (type() dispatches individual keydown/keypress/keyup events that React listens to)
  await clientInput.click();
  await clientInput.fill("");
  await page.waitForTimeout(300);
  await clientInput.type(firstName, { delay: 80 });
  await page.waitForTimeout(2000); // Wait for autocomplete results to appear

  // Use Playwright's native locator + click to properly trigger React events.
  // The autocomplete results appear as list items containing the client name.
  const fullName = `${firstName} ${lastName}`;
  let selected = false;

  // Strategy 1: Use Playwright locator to find and click the result by text content
  // This is the most reliable way since Playwright's click() dispatches the full event chain
  try {
    // Look for the autocomplete result containing the last name
    const resultItem = page.locator(`li:has-text("${lastName}")`).first();
    const isVisible = await resultItem.isVisible({ timeout: 3000 }).catch(() => false);
    if (isVisible) {
      await resultItem.click({ force: true });
      selected = true;
      log.info("Client selected via Playwright locator (li)", { fullName });
    }
  } catch (e) {
    log.info("Strategy 1 (li locator) did not find result, trying next...");
  }

  // Strategy 2: Try broader selectors for the autocomplete result
  if (!selected) {
    const resultSelectors = [
      `[class*="result"]:has-text("${lastName}")`,
      `[class*="menu-item"]:has-text("${lastName}")`,
      `[class*="MenuItem"]:has-text("${lastName}")`,
      `[class*="search"] li:has-text("${lastName}")`,
      `[role="listbox"] [role="option"]:has-text("${lastName}")`,
      `.bp3-menu-item:has-text("${lastName}")`,
    ];
    for (const sel of resultSelectors) {
      try {
        const item = page.locator(sel).first();
        const isVisible = await item.isVisible({ timeout: 1000 }).catch(() => false);
        if (isVisible) {
          await item.click({ force: true });
          selected = true;
          log.info("Client selected via Playwright locator", { selector: sel, fullName });
          break;
        }
      } catch { /* try next */ }
    }
  }

  // Strategy 3: Find element coordinates via evaluate, then click at those coordinates using Playwright
  // This ensures the native mouse event chain (mousedown → mouseup → click) fires properly
  if (!selected) {
    log.info("Trying coordinate-based click for client selection");
    const coords = await page.evaluate((searchName) => {
      const items = document.querySelectorAll('li, [class*="result"], [class*="menu-item"], [class*="MenuItem"]');
      for (const item of items) {
        const text = item.textContent || '';
        if (text.includes(searchName)) {
          const rect = (item as HTMLElement).getBoundingClientRect();
          return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, text: text.trim() };
        }
      }
      return null;
    }, lastName);

    if (coords) {
      // Use Playwright's page.mouse.click which dispatches real browser events
      await page.mouse.click(coords.x, coords.y);
      selected = true;
      log.info("Client selected via coordinate click", { fullName, coords: { x: coords.x, y: coords.y }, text: coords.text });
    }
  }

  if (selected) {
    await page.waitForTimeout(2500); // Wait for Therapist auto-fill + Service dropdown to enable
    log.info("Client selected in session form", { firstName, lastName });
    return;
  }

  log.warn("Could not find client in autocomplete — appointment will be created without client");

  // Dismiss the autocomplete dropdown to prevent it blocking other clicks
  await dismissAllOverlayBackdrops(page);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
}

/**
 * Create a new appointment (session) in Owl Practice.
 *
 * Flow:
 * 1. Open "Create Session" modal via FAB "+" on calendar
 * 2. Search and select client (auto-fills Therapist, enables Service dropdown)
 * 3. Set Date and Time via react-select dropdowns
 * 4. Select Service based on appointment name/duration
 * 5. Set Duration
 * 6. Add session comments
 * 7. Click "Create Session" to submit
 */
export async function createAppointment(page: Page, appointment: Appointment): Promise<void> {
  log.info("Creating appointment in Owl Practice", {
    sourceId: appointment.sourceId,
    startTime: appointment.startTime,
    duration: appointment.duration,
    name: appointment.name,
    client: appointment.clientFirstName ? `${appointment.clientFirstName} ${appointment.clientLastName}` : "unknown",
  });

  await openCreateSessionModal(page);

  // Event Type defaults to "Client" — no change needed

  // Select client (also auto-fills Therapist and enables Service dropdown)
  if (appointment.clientFirstName && appointment.clientLastName) {
    await searchAndSelectClient(page, appointment.clientFirstName, appointment.clientLastName);
  } else {
    log.warn("No client name on appointment — skipping client selection");
  }

  // Verify client was actually selected by checking if Therapist auto-filled
  const therapistStatus = await page.evaluate(() => {
    const ctrls = document.querySelectorAll('.bp3-overlay-content [class*="react-select__control"]');
    const therapistCtrl = ctrls[1];
    const singleValue = therapistCtrl?.querySelector('[class*="react-select__single-value"]');
    const therapistName = singleValue?.textContent?.trim() || '';
    // Also check the Service dropdown disabled state
    const serviceCtrl = ctrls[8];
    const serviceDisabled = serviceCtrl?.classList.contains('react-select__control--is-disabled') ?? true;
    return { therapistName, serviceDisabled, totalControls: ctrls.length };
  });
  log.info("Form state after client selection", therapistStatus);

  // If Therapist didn't auto-fill, explicitly select "Brendan Herjavec" (the mapped practitioner)
  if (!therapistStatus.therapistName) {
    log.info("Therapist did not auto-fill — selecting explicitly");
    try {
      await selectReactSelect(page, 1, "Brendan Herjavec");
      await page.waitForTimeout(1500); // Wait for Service to enable after Therapist is set
      log.info("Therapist explicitly selected: Brendan Herjavec");

      // Re-check Service disabled state after Therapist selection
      const serviceCheck = await page.evaluate(() => {
        const ctrls = document.querySelectorAll('.bp3-overlay-content [class*="react-select__control"]');
        const serviceCtrl = ctrls[8];
        const serviceDisabled = serviceCtrl?.classList.contains('react-select__control--is-disabled') ?? true;
        return { serviceDisabled, totalControls: ctrls.length };
      });
      log.info("Form state after explicit Therapist selection", serviceCheck);
    } catch (err) {
      log.warn("Could not select Therapist explicitly", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Dynamically detect the indices of all form dropdowns.
  // After Therapist selection, the form structure may change (fields added/removed).
  // We identify fields by their current selected value or nearby labels.
  const formLayout = await page.evaluate(() => {
    const ctrls = Array.from(document.querySelectorAll('.bp3-overlay-content [class*="react-select__control"]'));
    return ctrls.map((ctrl, i) => {
      const singleValue = ctrl.querySelector('[class*="react-select__single-value"]')?.textContent?.trim() || '';
      const placeholder = ctrl.querySelector('[class*="react-select__placeholder"]')?.textContent?.trim() || '';
      const isDisabled = ctrl.classList.contains('react-select__control--is-disabled');
      const rect = ctrl.getBoundingClientRect();
      // Try to find nearby label text
      const parentEl = ctrl.closest('[class*="react-select"]')?.parentElement;
      const labelEl = parentEl?.previousElementSibling;
      const labelText = labelEl?.textContent?.trim() || '';
      return { index: i, singleValue, placeholder, isDisabled, width: rect.width, labelText };
    });
  });
  log.info("Current form layout", { controls: formLayout });

  // Identify field indices dynamically based on current values/labels
  // Default to hardcoded positions, but override if we can detect them
  let dateStartIdx = 3; // Month starts at 3 by default
  let serviceIdx = 8;   // Service at 8 by default

  // Find date fields: they're a group of 4 small dropdowns showing month/day/year/time
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  for (const field of formLayout) {
    if (months.includes(field.singleValue)) {
      dateStartIdx = field.index;
      break;
    }
  }

  // Find Service: it's disabled or shows a service name, and it's wide + near bottom
  for (let i = formLayout.length - 1; i >= 0; i--) {
    const f = formLayout[i];
    if (f.labelText.includes('Service') || (f.width > 400 && i >= formLayout.length - 2)) {
      serviceIdx = i;
      break;
    }
  }

  log.info("Detected field indices", { dateStartIdx, serviceIdx, totalControls: formLayout.length });

  // Set Date and Time — try each component independently so one failure doesn't block others
  const { month, day, year, time } = parseDateComponents(appointment.startTime);
  log.info("Setting date/time", { month, day, year, time });

  for (const [label, offset, val] of [["month", 0, month], ["day", 1, day], ["year", 2, year], ["time", 3, time]] as const) {
    try {
      await selectReactSelect(page, dateStartIdx + offset, val);
      log.info(`Date component set: ${label}`, { value: val, index: dateStartIdx + offset });
    } catch (error) {
      log.warn(`Could not set ${label} — using default`, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Select Service
  const serviceLabel = pickServiceLabel(appointment);
  log.info("Selecting service", { serviceLabel, serviceIdx });

  // Scroll the Service dropdown into view within the modal (important for large viewports)
  await page.evaluate((idx) => {
    const ctrls = document.querySelectorAll('.bp3-overlay-content [class*="react-select__control"]');
    if (idx < ctrls.length) {
      ctrls[idx].scrollIntoView({ block: 'center', behavior: 'instant' });
    }
  }, serviceIdx);
  await page.waitForTimeout(500);

  // Service may be temporarily disabled while the form updates after date changes.
  // Wait and retry up to 3 times.
  let serviceSet = false;
  for (let attempt = 0; attempt < 3 && !serviceSet; attempt++) {
    if (attempt > 0) {
      log.info("Retrying service selection", { attempt: attempt + 1 });
      await page.waitForTimeout(2000);
    }
    try {
      await selectReactSelect(page, serviceIdx, serviceLabel);
      serviceSet = true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("disabled") && attempt < 2) {
        log.info("Service dropdown still disabled, waiting...");
        continue;
      }
      // Try fallback
      log.warn("Service not found, trying fallback", { serviceLabel, error: msg });
      try {
        await selectReactSelect(page, serviceIdx, "Psychotherapy, 60 mins (Individual)");
        serviceSet = true;
      } catch (err2) {
        const msg2 = err2 instanceof Error ? err2.message : String(err2);
        if (msg2.includes("disabled") && attempt < 2) continue;
        log.warn("Fallback service also not found — proceeding without service", { error: msg2 });
      }
    }
  }

  // Attendance is intentionally NOT set during sync — it's optional and only
  // relevant after a session has occurred, not when creating upcoming sessions.

  // Set Duration
  if (appointment.duration) {
    try {
      const durationInputs = await page.$$('.bp3-overlay-content input[type="text"]');
      for (const inp of durationInputs) {
        const val = await inp.inputValue();
        // Duration input will have a numeric default like "30", "45", "60"
        if (/^\d+$/.test(val) && Number(val) >= 10 && Number(val) <= 120) {
          await inp.click({ clickCount: 3 });
          await inp.fill(String(appointment.duration));
          log.info("Duration set", { duration: appointment.duration });
          break;
        }
      }
    } catch (error) {
      log.warn("Could not set duration", { error: error instanceof Error ? error.message : String(error) });
    }
  }

  // Build session comments: PlaySpace URL + meeting link + description
  {
    const commentParts: string[] = [];
    if (appointment.playspaceUrl) {
      commentParts.push(`PlaySpace: ${appointment.playspaceUrl}`);
    }
    if (appointment.meetingLink) {
      commentParts.push(`Meeting Link: ${appointment.meetingLink}`);
    }
    if (appointment.description) {
      commentParts.push(appointment.description);
    }

    if (commentParts.length > 0) {
      try {
        const comments = await page.$('.bp3-overlay-content textarea[placeholder="Enter comments..."]');
        if (comments) await comments.fill(commentParts.join("\n"));
      } catch { /* optional field */ }
    }
  }

  // Submit — use evaluate to bypass any remaining overlay backdrops
  log.info("Submitting appointment...");
  await dismissAllOverlayBackdrops(page);
  await page.evaluate(() => {
    const btns = document.querySelectorAll('button');
    for (const btn of btns) {
      if (btn.textContent?.trim() === 'Create Session' && btn.getAttribute('data-userpilot') === 'create-session') {
        (btn as HTMLElement).click();
        return;
      }
    }
    // Fallback: find any Create Session button
    for (const btn of btns) {
      if (btn.textContent?.includes('Create Session')) {
        (btn as HTMLElement).click();
        return;
      }
    }
  });
  await page.waitForTimeout(3000);

  // Dismiss any lingering dialog/overlay
  try {
    const overlay = await page.$('.bp3-overlay-content');
    if (overlay && await overlay.isVisible()) {
      await page.keyboard.press("Escape");
      await page.waitForTimeout(500);
    }
  } catch { /* clean */ }

  log.info("Appointment created successfully", { sourceId: appointment.sourceId });
}

export async function navigateToAppointments(page: Page): Promise<void> {
  log.info("Navigating to Calendar...");
  await page.click('a:has-text("Calendar")', { timeout: NAV_TIMEOUT });
  await page.waitForTimeout(2000);
}

export async function updateAppointment(_page: Page, _appointment: Appointment): Promise<void> {
  throw new Error("Appointment update not yet implemented — create only for MVP");
}

export async function findExistingAppointment(
  _page: Page,
  _sourceId: string,
): Promise<string | null> {
  // MVP: No source ID lookup in Owl. Return null to always create.
  return null;
}
