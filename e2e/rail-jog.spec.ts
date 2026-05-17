import { expect, test } from "@playwright/test";
import { connectTimeoutMs, isRealMotorE2E } from "./playwright";
import { assertMotorUiConnected } from "./wait-for-connect";

test.describe(
  isRealMotorE2E() ? "rail jog (real motor stack)" : "rail jog (coupled sim stack)",
  () => {
    test("jog controls disabled before connect", async ({ page }) => {
      await page.goto("/");
      await expect(page.getByRole("heading", { name: /linear rail jog/i })).toBeVisible();
      await expect(page.getByRole("button", { name: /jog left/i })).toBeDisabled();
      await expect(page.getByRole("button", { name: /connect motor/i })).toBeEnabled();
    });

    test("connect reaches motor service and shows commanded rpm", async ({ page }) => {
      await page.goto("/");
      await page.getByRole("button", { name: /connect motor/i }).click();
      await assertMotorUiConnected(page, connectTimeoutMs());
      await expect(page.getByRole("button", { name: /disconnect/i })).toBeVisible();
      await expect(page.getByRole("button", { name: /jog left/i })).toBeEnabled();
    });
  },
);
