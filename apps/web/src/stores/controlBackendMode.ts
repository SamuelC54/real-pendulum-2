import { atom } from "jotai";

/** Sent to control-api as `x-control-backend` (tRPC) or SSE `connectionParams`. */
export type ControlBackendMode = "physical" | "simulation" | "twin";

export const controlBackendModeAtom = atom<ControlBackendMode>("simulation");
