/**
 * UI convention for rail position: **left along the rail → negative counts**, **right → positive**
 * (Teknic `PosnMeasured` sign may be the opposite).
 */
export function motorCountsForDisplay(
  teknicMeasured: number | undefined,
): number | undefined {
  if (teknicMeasured === undefined || !Number.isFinite(teknicMeasured)) {
    return undefined;
  }
  return -teknicMeasured;
}
