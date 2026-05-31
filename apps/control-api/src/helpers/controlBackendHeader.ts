import type { ControlMode } from "../control/types.js";

const MODES: ControlMode[] = ["physical", "simulation", "twin"];

export function normalizeControlMode(raw: unknown): ControlMode | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim().toLowerCase();
  if (t === "physical" || t === "hardware") return "physical";
  if (t === "simulation" || t === "sim" || t === "simulator") return "simulation";
  if (t === "twin" || t === "digital-twin") return "twin";
  if ((MODES as string[]).includes(t)) return t as ControlMode;
  return null;
}

export function parseControlBackendHeader(
  header: string | string[] | undefined,
): ControlMode | null {
  const v = Array.isArray(header) ? header[0] : header;
  return normalizeControlMode(v);
}

/** SSE subscriptions pass mode via `connectionParams` query (EventSource cannot set headers). */
export function parseControlBackendFromUrl(search: string | undefined): ControlMode | null {
  if (!search) return null;
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const raw = params.get("connectionParams");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as { backend?: unknown };
    return normalizeControlMode(parsed.backend);
  } catch {
    return null;
  }
}
