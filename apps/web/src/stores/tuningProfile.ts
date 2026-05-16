import { atomWithStorage } from "jotai/utils";
import type { SimConfigForm } from "@/lib/tuningMath";
import { DEFAULT_TUNING_WEIGHTS, type TuningErrorWeights } from "@/lib/tuningMath";

export const tuningErrorWeightsAtom = atomWithStorage<TuningErrorWeights>(
  "rp-tuning-weights",
  DEFAULT_TUNING_WEIGHTS,
);

/** Saved target profile (reference / copy to config); not auto-applied on load. */
export const tuningProfileAtom = atomWithStorage<SimConfigForm | null>("rp-tuning-profile", null);
