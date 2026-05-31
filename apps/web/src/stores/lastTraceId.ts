import { atom } from "jotai";

/** Latest x-trace-id from a control-api response (one trace per tRPC batch). */
export const lastTraceIdAtom = atom<string | null>(null);
