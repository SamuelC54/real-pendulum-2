import { useAtom, useAtomValue } from "jotai";
import { useEffect, useRef } from "react";
import { sampleFromCompare } from "@/lib/tuningMath";
import { grpcBackendModeAtom } from "@/stores/grpcBackendMode";
import { tuningRecordingAtom, tuningSamplesAtom } from "@/stores/tuningSession";
import { trpc } from "@/trpc";

/**
 * Keeps twin compare polling and sample capture alive while the user uses the Control tab.
 * Mount once in AppShell (not inside TuningPage).
 */
export function TuningRecorder() {
  const mode = useAtomValue(grpcBackendModeAtom);
  const recording = useAtomValue(tuningRecordingAtom);
  const [, setSamples] = useAtom(tuningSamplesAtom);
  const lastSampleT = useRef(0);

  const compare = trpc.tuning.compare.useQuery(undefined, {
    enabled: mode === "twin",
    refetchInterval: recording ? 120 : 400,
  });

  useEffect(() => {
    if (!recording || !compare.data) return;
    const now = Date.now();
    if (now - lastSampleT.current < 80) return;
    lastSampleT.current = now;
    const row = sampleFromCompare(compare.data, now);
    setSamples((prev) => {
      const next = [...prev, row];
      return next.length > 5000 ? next.slice(-5000) : next;
    });
  }, [recording, compare.data, setSamples]);

  return null;
}
