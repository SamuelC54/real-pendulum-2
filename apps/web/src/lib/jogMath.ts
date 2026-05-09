/** Commanded jog magnitude used by the rail UI (rpm); sign comes from direction. */
export const JOG_RPM = 120;

export function jogRpmForDirection(dir: "left" | "right"): number {
  return dir === "left" ? JOG_RPM : -JOG_RPM;
}
