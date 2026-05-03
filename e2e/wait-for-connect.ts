import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

/** Waits until status shows **commanded … rpm** (Connect succeeded). On failure, dumps the Status card text. */
export async function assertMotorUiConnected(
  page: Page,
  timeoutMs: number,
): Promise<void> {
  try {
    await expect(page.getByText(/commanded/i)).toBeVisible({ timeout: timeoutMs });
  } catch (err) {
    const statusCard = page.locator("section").filter({ hasText: "Status" });
    const txt = (await statusCard.count()) > 0 ? await statusCard.first().innerText() : await page.innerText("body");
    throw new Error(
      `Motor UI never reached connected state within ${timeoutMs}ms.\n\nStatus card:\n${txt.slice(0, 4000)}\n\n(${String(err)})`,
    );
  }
}
