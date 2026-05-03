import { atom } from "jotai";

export type JogHold = "left" | "right" | null;

/** Active jog direction for UI (pointer hold). */
export const holdingAtom = atom<JogHold>(null);
