import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { DEFAULT_PROFILE_ACC_RPM_PER_SEC, JOG_RPM_DEFAULT } from "@/lib/jogMath";

export type JogHold = "left" | "right" | null;

/** Active jog direction for UI (pointer hold). */
export const holdingAtom = atom<JogHold>(null);

/** Jog speed magnitude (RPM); sign is chosen by direction buttons. */
export const jogRpmAtom = atomWithStorage("rp-jog-rpm", JOG_RPM_DEFAULT);

/** Jog acceleration cap (`Motion.AccLimit`, RPM/s). */
export const jogAccelRpmPerSecAtom = atomWithStorage(
  "rp-jog-accel-rpm-per-sec",
  DEFAULT_PROFILE_ACC_RPM_PER_SEC,
);
