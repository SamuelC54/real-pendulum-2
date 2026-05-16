import { atom } from "jotai";
import type { TuningSample } from "@/lib/tuningMath";

/** Twin tuning trace capture — survives Control ↔ Tuning tab switches. */
export const tuningRecordingAtom = atom(false);

export const tuningSamplesAtom = atom<TuningSample[]>([]);

/** Suggestions stay hidden until `tuningSamplesAtom.length` exceeds this (set when a hint is applied). */
export const tuningSuggestionsAfterSampleCountAtom = atom(0);
