import { atom } from "jotai";
import type { TuningSample } from "@/lib/tuningMath";

/** Twin tuning trace capture — survives Control ↔ Tuning tab switches. */
export const tuningRecordingAtom = atom(false);

export const tuningSamplesAtom = atom<TuningSample[]>([]);
