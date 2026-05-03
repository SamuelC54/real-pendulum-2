/** Matches `playwright.config.cjs` / `cross-env E2E_USE_REAL_MOTOR=1`. */
export function isRealMotorE2E(): boolean {
  return (
    process.env.E2E_USE_REAL_MOTOR === "1" ||
    process.env.E2E_USE_REAL_MOTOR === "true"
  );
}

export function connectTimeoutMs(): number {
  if (!isRealMotorE2E()) return 30_000;
  const n = Number(process.env.E2E_CONNECT_TIMEOUT_MS ?? 120_000);
  return Number.isFinite(n) && n > 0 ? n : 120_000;
}
