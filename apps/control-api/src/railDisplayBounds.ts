/**
 * In-memory min/max **display** counts for the rail cart UI (Teknic `PosnMeasured` negated;
 * same convention as web `motorCountsForDisplay`).
 * Updated when **`status.get`** runs with a connected motor and finite measured position.
 */

let bounds: { min: number; max: number } | null = null;

/** Display counts: negated Teknic measured position (see web `motorCountsForDisplay`). */
export function teknicMeasuredToDisplayCounts(teknicMeasured: number): number {
  return -teknicMeasured;
}

export function getRailDisplayBounds(): { min: number; max: number } | null {
  return bounds;
}

/** Called from `status.get` after reading motor status. Clears when disconnected or unreachable. */
export function syncRailDisplayBoundsFromMotorStatus(
  connected: boolean,
  teknicMeasured?: number,
): void {
  if (!connected) {
    bounds = null;
    return;
  }
  if (teknicMeasured === undefined || !Number.isFinite(teknicMeasured)) {
    return;
  }
  const display = teknicMeasuredToDisplayCounts(teknicMeasured);
  if (!bounds) {
    bounds = { min: display, max: display };
    return;
  }
  bounds = {
    min: Math.min(bounds.min, display),
    max: Math.max(bounds.max, display),
  };
}

/** Sets both ends to the given display count (Reset scale in UI). */
export function resetRailDisplayBounds(displayCounts: number): void {
  if (!Number.isFinite(displayCounts)) {
    return;
  }
  bounds = { min: displayCounts, max: displayCounts };
}

/** @internal Vitest */
export function resetRailDisplayBoundsStateForTests(): void {
  bounds = null;
}
