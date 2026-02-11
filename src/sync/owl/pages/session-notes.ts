import type { Page } from "playwright-core";
import type { SessionNote } from "@/sync/types";
import { createChildLogger } from "@/sync/logger";

const log = createChildLogger("owl-session-notes");

/**
 * Owl Practice Session Notes Automation — Non-Session Notes approach
 *
 * UI Structure (confirmed via Browserbase inspection):
 * - Session notes live on the client's "Sessions & Notes" page: /client/{id}/sessions
 * - Three tabs: "Sessions & Notes", "Non-Session Notes", "Deleted Notes"
 *
 * We use the "Non-Session Notes" tab because:
 * - Appointments created via the calendar FAB don't appear as session rows
 * - The "Sessions & Notes" tab may show 0 sessions, making "Create Note" unavailable
 * - Non-Session Notes allows creating standalone notes for a client
 *
 * Non-Session Notes tab:
 *   - "Create Note" button (visible when tab is selected)
 *   - Table columns: Created, Author, Therapist, Title, Modified, Actions
 *
 * Note Editor Modal (bp3-dialog):
 *   Header: "Client note for [avatar] [Client Name]"
 *   Left sidebar (Summary):
 *     - Title input: input[placeholder="Title"]
 *     - ACTIONS:
 *       - "Choose a Template" react-select dropdown
 *       - Print Note, PDF, Handwritten Note, Associate Documents
 *   Main area: CKEditor rich text editor
 *     - Accessed via iframe.cke_wysiwyg_frame (contentEditable body inside)
 *     - Full toolbar: Bold, Italic, Underline, lists, tables, etc.
 *   Bottom buttons: "Close", "Save" (green), "Save and Close" (teal)
 *   Top right: "Start Over", "Clear Content"
 */

const MODAL_TIMEOUT = 8000;
const NAV_TIMEOUT = 10000;

/**
 * Navigate to a client's Sessions & Notes page.
 * Uses sidebar click first, falling back to direct URL navigation.
 */
export async function navigateToSessionNotes(page: Page, clientOwlId?: string): Promise<void> {
  log.info("Navigating to Sessions & Notes...", { clientOwlId });

  if (clientOwlId) {
    const baseUrl = page.url().split("/").slice(0, 3).join("/");
    const targetUrl = `${baseUrl}/client/${clientOwlId}/sessions`;

    // If already on the right page, just wait for it to settle
    if (page.url().includes(`/client/${clientOwlId}/sessions`)) {
      await page.waitForTimeout(1000);
      log.info("Already on Sessions & Notes page");
      return;
    }

    // Try sidebar navigation first (preserves SPA state)
    try {
      // First navigate to the client profile via sidebar
      const clientLink = await page.$(`a[href*="/client/${clientOwlId}"]`);
      if (clientLink) {
        await clientLink.click();
        await page.waitForTimeout(2000);
      }
    } catch {
      // Fallback: direct URL
    }

    // If not on the right page, use direct URL
    if (!page.url().includes(`/client/${clientOwlId}/sessions`)) {
      await page.goto(targetUrl, {
        waitUntil: "domcontentloaded",
        timeout: 15000,
      });
      await page.waitForTimeout(3000);
    }

    const url = page.url();
    if (!url.includes("/client/") || !url.includes("/sessions")) {
      throw new Error(`Failed to navigate to sessions — landed on: ${url}`);
    }
    log.info("On Sessions & Notes page", { url });
  }
}

/**
 * Create a non-session note in Owl Practice.
 *
 * Flow:
 * 1. Navigate to the client's Sessions & Notes page
 * 2. Click the "Non-Session Notes" tab
 * 3. Click "Create Note" button
 * 4. Fill the Title field
 * 5. Type note content into the CKEditor rich text editor (iframe)
 * 6. Click "Save and Close"
 * 7. Wait for modal to close
 */
export async function createSessionNote(page: Page, note: SessionNote): Promise<void> {
  log.info("Creating non-session note in Owl Practice", {
    sourceId: note.sourceId,
    appointmentId: note.appointmentId,
    clientId: note.clientId,
  });

  // Step 1: Click the "Non-Session Notes" tab
  try {
    const nonSessionTab = await page.waitForSelector(
      'button:has-text("Non-Session Notes")',
      { timeout: NAV_TIMEOUT, state: "visible" }
    );
    await nonSessionTab.click();
    await page.waitForTimeout(1500);
    log.info("Clicked Non-Session Notes tab");
  } catch (error) {
    throw new Error(`Non-Session Notes tab not found: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Step 2: Click "Create Note" button
  // The "Create Note" button appears on the Non-Session Notes tab.
  // It does NOT have an aria-label — select by text content.
  // Be specific: exclude the table header "Created" column button.
  let createNoteBtn;
  try {
    // Wait for the button to appear after tab switch
    createNoteBtn = await page.waitForSelector(
      'button:has-text("Create Note")',
      { timeout: MODAL_TIMEOUT, state: "visible" }
    );
  } catch {
    throw new Error("Create Note button not found on Non-Session Notes tab");
  }

  await createNoteBtn.click();
  log.info("Clicked Create Note button");

  // Step 3: Wait for the note editor modal to appear (bp3-dialog with CKEditor)
  await page.waitForSelector("iframe.cke_wysiwyg_frame", {
    timeout: MODAL_TIMEOUT,
    state: "visible",
  });
  await page.waitForTimeout(1000); // Let CKEditor fully initialize

  log.info("Note editor modal opened");

  // Step 4: Fill the Title field
  const noteTitle = note.name || `PlaySpace Note — ${note.date}`;
  try {
    const titleInput = await page.waitForSelector('input[placeholder="Title"]', {
      timeout: 5000,
      state: "visible",
    });
    await titleInput.fill(noteTitle);
    log.info("Title filled", { title: noteTitle });
  } catch {
    log.warn("Could not fill title input — continuing with default");
  }

  // Step 5: Enter content into the CKEditor rich text editor via iframe
  if (note.content) {
    log.info("Entering note content into CKEditor", {
      contentLength: note.content.length,
      contentPreview: note.content.substring(0, 100),
    });

    const editorFrame = page.frameLocator("iframe.cke_wysiwyg_frame");
    const editorBody = editorFrame.locator("body");

    // Wait for the editor body to be ready
    await editorBody.waitFor({ state: "visible", timeout: 5000 });

    // Use direct DOM manipulation for reliable content insertion.
    // This bypasses all focus/keyboard routing issues with CKEditor iframes.
    try {
      await editorBody.evaluate((body, text) => {
        body.innerHTML = text;
        body.dispatchEvent(new Event("input", { bubbles: true }));
      }, note.content);

      // Verify content was set
      const actualContent = await editorBody.evaluate((body) => body.innerHTML);
      if (!actualContent || actualContent.length === 0) {
        log.warn("CKEditor content appears empty after evaluate — falling back to keyboard.type()");
        await editorBody.click();
        await page.waitForTimeout(300);
        await page.keyboard.press("Control+a");
        await page.keyboard.press("Backspace");
        await page.waitForTimeout(200);
        await page.keyboard.type(note.content, { delay: 5 });
      }
    } catch (evalError) {
      log.warn("CKEditor evaluate failed — falling back to keyboard.type()", {
        error: evalError instanceof Error ? evalError.message : String(evalError),
      });
      await editorBody.click();
      await page.waitForTimeout(300);
      await page.keyboard.press("Control+a");
      await page.keyboard.press("Backspace");
      await page.waitForTimeout(200);
      await page.keyboard.type(note.content, { delay: 5 });
    }

    log.info("Note content entered into CKEditor", {
      contentLength: note.content.length,
    });
  } else {
    log.warn("Session note has empty/falsy content — skipping CKEditor entry", {
      sourceId: note.sourceId,
      name: note.name,
    });
  }

  // Step 6: Click "Save and Close" button
  const saveAndCloseBtn = await page.waitForSelector(
    'button:has-text("Save and Close")',
    { timeout: NAV_TIMEOUT, state: "visible" }
  );

  if (!saveAndCloseBtn) {
    throw new Error("Save and Close button not found");
  }

  await saveAndCloseBtn.click();
  log.info("Clicked Save and Close");

  // Step 7: Wait for the modal to close
  await page.waitForTimeout(3000);

  // Dismiss any remaining overlays
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const overlay = await page.$(".bp3-overlay-backdrop");
      if (overlay && await overlay.isVisible()) {
        log.info("Overlay still visible — pressing Escape");
        await page.keyboard.press("Escape");
        await page.waitForTimeout(800);
      } else {
        break;
      }
    } catch {
      break;
    }
  }

  log.info("Non-session note created successfully", { sourceId: note.sourceId });
}

/**
 * Check if a note with the given title already exists in the Non-Session Notes table.
 *
 * Scans the currently-visible Non-Session Notes tab for a row whose Title column
 * matches the note's name. This prevents duplicates when the ledger is cleared
 * or lost.
 *
 * IMPORTANT: The page must already be on the client's Sessions & Notes page
 * (navigateToSessionNotes must have been called).
 */
export async function findExistingNote(
  page: Page,
  noteTitle: string,
): Promise<boolean> {
  log.info("Checking for existing note in Non-Session Notes table", { noteTitle });

  try {
    // Click the "Non-Session Notes" tab to make sure it's active
    const nonSessionTab = await page.waitForSelector(
      'button:has-text("Non-Session Notes")',
      { timeout: 5000, state: "visible" },
    );
    await nonSessionTab.click();
    await page.waitForTimeout(1500);

    // Scan table rows for a matching title
    const found = await page.evaluate((searchTitle) => {
      // Non-Session Notes table has columns: Created, Author, Therapist, Title, Modified, Actions
      // Title is typically the 4th column (index 3)
      const rows = document.querySelectorAll("table tbody tr");
      for (const row of rows) {
        const cells = row.querySelectorAll("td");
        // Check all cells for the title (position may vary)
        for (const cell of cells) {
          const text = (cell.textContent || "").trim();
          if (text === searchTitle) {
            return true;
          }
        }
      }
      return false;
    }, noteTitle);

    log.info("Duplicate note check result", { noteTitle, found });
    return found;
  } catch (error) {
    log.warn("Could not check for existing note — assuming not found", {
      noteTitle,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}
