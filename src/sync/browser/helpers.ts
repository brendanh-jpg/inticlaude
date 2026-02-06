import type { Page, ElementHandle } from "playwright-core";

export async function safeGoto(
  page: Page,
  url: string,
  options?: { timeout?: number }
): Promise<void> {
  const timeout = options?.timeout ?? 30_000;
  await page.goto(url, { waitUntil: "networkidle", timeout });
}

export async function waitForSelector(
  page: Page,
  selector: string,
  options?: { timeout?: number; state?: "visible" | "attached" }
): Promise<ElementHandle> {
  const timeout = options?.timeout ?? 30_000;
  const state = options?.state ?? "visible";
  const element = await page.waitForSelector(selector, { timeout, state });
  if (!element) {
    throw new Error(`Element not found: ${selector}`);
  }
  return element;
}

export async function fillField(
  page: Page,
  selector: string,
  value: string
): Promise<void> {
  const element = await waitForSelector(page, selector);
  await element.click({ clickCount: 3 });
  await element.fill(value);
}

export async function selectOption(
  page: Page,
  selector: string,
  value: string
): Promise<void> {
  await waitForSelector(page, selector);
  await page.selectOption(selector, value);
}

export async function clickButton(
  page: Page,
  selector: string
): Promise<void> {
  const element = await waitForSelector(page, selector);
  await element.click();
}

export async function getTextContent(
  page: Page,
  selector: string
): Promise<string> {
  const element = await waitForSelector(page, selector);
  const text = await element.textContent();
  return text?.trim() ?? "";
}

export async function getInputValue(
  page: Page,
  selector: string
): Promise<string> {
  const element = await waitForSelector(page, selector);
  return (await element.inputValue()) ?? "";
}

export async function retryAction<T>(
  action: () => Promise<T>,
  options?: { maxAttempts?: number; delayMs?: number }
): Promise<T> {
  const maxAttempts = options?.maxAttempts ?? 3;
  const baseDelay = options?.delayMs ?? 1000;

  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await action();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < maxAttempts) {
        const delay = baseDelay * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

export async function takeDebugScreenshot(
  page: Page,
  label: string
): Promise<Buffer> {
  const buffer = await page.screenshot({ fullPage: true });
  return Buffer.from(buffer);
}
