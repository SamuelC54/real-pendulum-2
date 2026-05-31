/**
 * Display counts: negated Teknic measured position (same convention as web `motorCountsForDisplay`).
 */
export function teknicMeasuredToDisplayCounts(teknicMeasured: number): number {
  return -teknicMeasured;
}
