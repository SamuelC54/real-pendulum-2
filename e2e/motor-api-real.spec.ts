import { expect, test } from "@playwright/test";
import { connectTimeoutMs, isRealMotorE2E } from "./env";
import { assertMotorUiConnected } from "./wait-for-connect";

/**
 * Exercises the live stack: **Connect** → **GetStatus** (polled UI) → **SetJogVelocity** / **Stop**
 * → **Disconnect**, which maps to **motor service** gRPC RPCs and **`teknic_*`** in the DLL.
 *
 * When **`E2E_USE_REAL_MOTOR`** is unset, the suite is **`describe.skip`** so **`npm run test:e2e`**
 * stays fast and hardware-free. Use **`npm run test:e2e:real`** for real motion (supervise travel).
 */
(isRealMotorE2E() ? test.describe : test.describe.skip)(
  "Motor API smoke (real hardware — Connect / status / jog / Stop / Disconnect)",
  () => {
    test.describe.configure({ mode: "serial" });

    const connectMs = connectTimeoutMs();

    test.beforeEach(async ({ page }) => {
      await page.goto("/");
      await page.getByRole("button", { name: /connect motor/i }).click();
      await assertMotorUiConnected(page, connectMs);
    });

    test.afterEach(async ({ page }) => {
      const disconnect = page.getByRole("button", { name: /disconnect/i });
      if (await disconnect.isVisible()) {
        await disconnect.click();
        await expect(page.getByText(/not connected/i)).toBeVisible({ timeout: 15_000 });
      }
    });

    test("GetStatus — status strip shows numeric commanded rpm when connected", async ({
      page,
    }) => {
      await expect(
        page.locator("section").filter({ hasText: "Status" }).getByText(/\d+\.\d+/),
      ).toBeVisible();
    });

    test("SetJogVelocity + Stop — brief jog right then Stop zeros commanded rpm", async ({
      page,
    }) => {
      const jogRight = page.getByRole("button", { name: /jog right/i });
      const box = await jogRight.boundingBox();
      expect(box, "jog right button visible").not.toBeNull();
      await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(400);
      await page.mouse.up();

      await expect
        .poll(
          async () => {
            const sec = page.locator("section").filter({ hasText: "Status" });
            const num = sec.getByText(/^-?\d+\.\d+$/);
            const t = await num.first().textContent();
            return Math.abs(parseFloat(t ?? "0"));
          },
          { timeout: 12_000 },
        )
        .toBeGreaterThan(0.5);

      await page.getByRole("button", { name: /^stop$/i }).click();

      await expect
        .poll(
          async () => {
            const sec = page.locator("section").filter({ hasText: "Status" });
            const num = sec.getByText(/^-?\d+\.\d+$/);
            const t = await num.first().textContent();
            return Math.abs(parseFloat(t ?? "0"));
          },
          { timeout: 10_000 },
        )
        .toBeLessThan(0.05);
    });

    test("Disconnect — returns UI to not connected", async ({ page }) => {
      await page.getByRole("button", { name: /disconnect/i }).click();
      await expect(page.getByText(/not connected/i)).toBeVisible();
      await expect(page.getByRole("button", { name: /connect motor/i })).toBeEnabled();
    });
  },
);
