import { memo, useEffect, useState, useCallback } from "react";
import { useAtomValue } from "jotai";
import { Flag, Home, LocateFixed } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useSimBackendAutoConnect } from "@/services/useSimBackendAutoConnect";
import { grpcBackendModeAtom } from "@/stores/grpcBackendMode";
import { trpc } from "@/trpc";
import {
  useMotorStatusConnected,
  useMotorStatusQuery,
  useSensorStatusConnected,
} from "@/services/useMotorStatusQuery";

type RailHomingRow = {
  ok: boolean;
  error?: string;
  motorSpanCm?: number;
  midPositionCm?: number;
  motorAbsRevolutions?: number;
  motorPositionZeroedAtMid?: boolean;
  log?: string[];
};

function HomingResultDetail({ title, railHomeResult }: { title: string; railHomeResult: RailHomingRow }) {
  const [homingDetailOpen, setHomingDetailOpen] = useState(true);

  useEffect(() => {
    setHomingDetailOpen(true);
  }, [railHomeResult]);

  return (
    <div
      className={
        railHomeResult.ok ? "text-muted-foreground text-xs" : "text-destructive text-xs"
      }
    >
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">
          {title}: {railHomeResult.ok ? "Homing finished" : "Homing failed"}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 shrink-0 px-2 text-[11px]"
          aria-expanded={homingDetailOpen}
          onClick={() => setHomingDetailOpen((o) => !o)}
        >
          {homingDetailOpen ? "Hide detail" : "Show detail"}
        </Button>
      </div>
      {homingDetailOpen ? (
        <>
          {railHomeResult.motorSpanCm != null ? (
            <p>
              Motor span:{" "}
              <span className="font-mono text-foreground">{railHomeResult.motorSpanCm.toFixed(2)}</span>{" "}
              cm · mid target:{" "}
              <span className="font-mono text-foreground">
                {railHomeResult.midPositionCm != null
                  ? railHomeResult.midPositionCm.toFixed(2)
                  : "—"}{" "}
                cm
              </span>
            </p>
          ) : null}
          {railHomeResult.motorAbsRevolutions != null ? (
            <p>
              Motor Board ∫|rpm|·dt/60 ≈{" "}
              <span className="font-mono text-foreground">
                {railHomeResult.motorAbsRevolutions.toFixed(2)}
              </span>{" "}
              rev (commanded-velocity estimate)
            </p>
          ) : null}
          {railHomeResult.motorPositionZeroedAtMid != null ? (
            <p>
              Motor Board position at center:{" "}
              {railHomeResult.motorPositionZeroedAtMid ? (
                <span className="text-foreground">zeroed (Teknic)</span>
              ) : (
                <span className="text-destructive">zero failed — see log</span>
              )}
            </p>
          ) : null}
          {railHomeResult.log?.length ? (
            <pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap wrap-break-word rounded-md border border-border bg-muted/40 p-2 font-mono text-[10px] leading-relaxed">
              {railHomeResult.log.join("\n")}
            </pre>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function TwinWireErrors({
  label,
  data,
}: {
  label: string;
  data: { real: { ok: boolean; error?: string }; sim: { ok: boolean; error?: string } } | undefined;
}) {
  if (!data) return null;
  const lines: string[] = [];
  if (!data.real.ok && data.real.error) lines.push(`${label} hardware: ${data.real.error}`);
  if (!data.sim.ok && data.sim.error) lines.push(`${label} simulation: ${data.sim.error}`);
  if (lines.length === 0) return null;
  return (
    <div className="text-destructive flex flex-col gap-1 text-xs">
      {lines.map((line) => (
        <p key={line}>{line}</p>
      ))}
    </div>
  );
}

export const HomingControls = memo(function HomingControls() {
  const mode = useAtomValue(grpcBackendModeAtom);
  const simAuto = useSimBackendAutoConnect();
  const utils = trpc.useUtils();
  const motorStatus = useMotorStatusQuery();
  const motorConnected = useMotorStatusConnected().data ?? false;
  const sensorConnected = useSensorStatusConnected().data ?? false;

  const invalidateMotor = () => {
    void utils.status.get.invalidate();
    void utils.twin.status.get.invalidate();
  };

  const homeSingle = trpc.controllers.start.useMutation({
    onSuccess: () => {
      invalidateMotor();
      void utils.sensor.status.get.invalidate();
      void utils.controllers.status.invalidate();
    },
  });
  const homeTwin = trpc.controllers.start.useMutation({
    onSuccess: () => {
      invalidateMotor();
      void utils.sensor.status.get.invalidate();
      void utils.controllers.status.invalidate();
    },
  });
  const home = mode === "twin" ? homeTwin : homeSingle;
  const controllerStatus = trpc.controllers.status.useQuery(undefined, {
    refetchInterval: (q) =>
      q.state.data?.active || home.isPending ? 500 : false,
  });

  const startHoming = useCallback(() => {
    void home.mutateAsync({ id: "rail_homing", params: {} });
  }, [home]);

  const zeroSingle = trpc.rail.zeroAtCurrent.useMutation({ onSuccess: invalidateMotor });
  const zeroTwin = trpc.twin.rail.zeroAtCurrent.useMutation({ onSuccess: invalidateMotor });
  const zeroAtCurrent = mode === "twin" ? zeroTwin : zeroSingle;

  const recordSingle = trpc.rail.limits.record.useMutation({ onSuccess: invalidateMotor });
  const recordTwin = trpc.twin.rail.limits.record.useMutation({ onSuccess: invalidateMotor });
  const recordLimit = mode === "twin" ? recordTwin : recordSingle;

  const spanSingle = trpc.rail.limits.setSymmetricSpan.useMutation({ onSuccess: invalidateMotor });
  const spanTwin = trpc.twin.rail.limits.setSymmetricSpan.useMutation({ onSuccess: invalidateMotor });
  const setSymmetricSpan = mode === "twin" ? spanTwin : spanSingle;

  const [switchDistanceCm, setSwitchDistanceCm] = useState(20);

  const autoHomeReady = motorConnected && sensorConnected;
  const autoHomeDisabled = !autoHomeReady || home.isPending;
  const manualBusy =
    zeroAtCurrent.isPending || recordLimit.isPending || setSymmetricSpan.isPending;
  const manualDisabled = !motorConnected || manualBusy;

  const applySymmetricSpan = useCallback(() => {
    const halfSpan = Number(switchDistanceCm);
    if (!Number.isFinite(halfSpan) || halfSpan <= 0) return;
    void setSymmetricSpan.mutateAsync({ halfSpanCm: halfSpan });
  }, [setSymmetricSpan, switchDistanceCm]);

  const railHomeResult = controllerStatus.data?.homingResult ?? undefined;
  const positionCm = motorStatus.data?.positionCm;
  const travelLimits = motorStatus.data?.travelLimits;
  const leftStopCm = travelLimits?.leftCm;
  const rightStopCm = travelLimits?.rightCm;

  return (
    <Card className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-muted-foreground text-sm font-medium">Homing</span>
      </div>
      <p className="text-muted-foreground text-xs leading-relaxed">
        Uses Teknic <strong className="text-foreground font-medium">measured motor position</strong>{" "}
        for rail travel; the Sensor Board only supplies travel limit switches (the rotary encoder there is
        for the pendulum). Optional slow final approach, then zeros Teknic position at center by
        default.
      </p>
      <Button
        type="button"
        variant="secondary"
        size="lg"
        className="w-full touch-manipulation sm:w-auto"
        disabled={autoHomeDisabled}
        onClick={startHoming}
      >
        <Home
          aria-hidden
          className={home.isPending ? "mr-2 h-5 w-5 animate-pulse" : "mr-2 h-5 w-5"}
        />
        Home rail
      </Button>
      {!motorConnected ? (
        <p className="text-muted-foreground text-xs">
          {mode === "sim"
            ? simAuto.pending
              ? "Connecting to simulator (motor)…"
              : simAuto.lastError ?? "Waiting for simulation — run npm run dev (simulation + controller-service)."
            : "Connect the Motor Board first."}
        </p>
      ) : null}
      {!sensorConnected ? (
        <p className="text-muted-foreground text-xs">
          {mode === "sim"
            ? simAuto.pending
              ? "Connecting to simulator (sensor)…"
              : simAuto.lastError ?? "Waiting for simulation — limits and encoder come from the plant."
            : "Connect the Sensor Board first."}
        </p>
      ) : null}
      {home.error ? (
        <p className="text-destructive text-xs">{home.error.message}</p>
      ) : null}
      {railHomeResult && "real" in railHomeResult ? (
        <div className="flex flex-col gap-4">
          <HomingResultDetail title="Hardware" railHomeResult={railHomeResult.real} />
          <HomingResultDetail title="Simulation" railHomeResult={railHomeResult.sim} />
        </div>
      ) : null}
      {railHomeResult && !("real" in railHomeResult) ? (
        <HomingResultDetail title="Rail" railHomeResult={railHomeResult} />
      ) : null}

      <div className="border-border flex flex-col gap-3 border-t pt-4">
        <span className="text-muted-foreground text-sm font-medium">Manual</span>
        <p className="text-muted-foreground text-xs leading-relaxed">
          Park the cart where you want <strong className="text-foreground font-medium">0 cm</strong>, then
          zero Teknic measured position here. Record each travel limit at the switch, set both stops from a
          distance (current position ± cm), or capture at the cart while a switch is pressed.
        </p>
        {positionCm != null && Number.isFinite(positionCm) ? (
          <p className="text-muted-foreground text-xs">
            Current position:{" "}
            <span className="font-mono text-foreground">{positionCm.toFixed(2)}</span> cm
          </p>
        ) : null}
        <p className="text-muted-foreground text-[10px] leading-snug">
          Left stop{" "}
          {leftStopCm != null ? (
            <span className="font-mono text-foreground">{leftStopCm.toFixed(2)}</span>
          ) : (
            "—"
          )}{" "}
          cm · Right stop{" "}
          {rightStopCm != null ? (
            <span className="font-mono text-foreground">{rightStopCm.toFixed(2)}</span>
          ) : (
            "—"
          )}{" "}
          cm
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full touch-manipulation sm:w-auto"
          disabled={manualDisabled}
          onClick={() => void zeroAtCurrent.mutateAsync()}
        >
          <LocateFixed
            aria-hidden
            className={zeroAtCurrent.isPending ? "mr-2 h-4 w-4 animate-pulse" : "mr-2 h-4 w-4"}
          />
          Set position to 0 cm
        </Button>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground">Switch distance from current position (cm)</span>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="number"
              min={0.01}
              step={0.1}
              className="border-input bg-background h-9 w-full rounded-md border px-2 font-mono text-sm tabular-nums sm:max-w-[8rem]"
              value={Number.isFinite(switchDistanceCm) ? switchDistanceCm : ""}
              disabled={manualDisabled}
              onChange={(e) => setSwitchDistanceCm(Number(e.target.value))}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full touch-manipulation sm:w-auto"
              disabled={
                manualDisabled ||
                !Number.isFinite(switchDistanceCm) ||
                switchDistanceCm <= 0
              }
              onClick={applySymmetricSpan}
            >
              Set left &amp; right limits
            </Button>
          </div>
          {positionCm != null && Number.isFinite(positionCm) && switchDistanceCm > 0 ? (
            <span className="text-muted-foreground text-[10px] leading-snug">
              → left{" "}
              <span className="font-mono text-foreground">
                {(positionCm - switchDistanceCm).toFixed(2)}
              </span>{" "}
              cm · right{" "}
              <span className="font-mono text-foreground">
                {(positionCm + switchDistanceCm).toFixed(2)}
              </span>{" "}
              cm
            </span>
          ) : null}
        </label>
        <div className="flex w-full flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-w-0 flex-1 touch-manipulation"
            disabled={manualDisabled}
            onClick={() => void recordLimit.mutateAsync({ side: "left" })}
          >
            <Flag aria-hidden className="mr-2 h-4 w-4 shrink-0" />
            Set left limit
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-w-0 flex-1 touch-manipulation"
            disabled={manualDisabled}
            onClick={() => void recordLimit.mutateAsync({ side: "right" })}
          >
            <Flag aria-hidden className="mr-2 h-4 w-4 shrink-0" />
            Set right limit
          </Button>
        </div>
        {zeroAtCurrent.error ? (
          <p className="text-destructive text-xs">{zeroAtCurrent.error.message}</p>
        ) : null}
        {recordLimit.error ? (
          <p className="text-destructive text-xs">{recordLimit.error.message}</p>
        ) : null}
        {setSymmetricSpan.error ? (
          <p className="text-destructive text-xs">{setSymmetricSpan.error.message}</p>
        ) : null}
        {mode === "twin" && zeroAtCurrent.data && "real" in zeroAtCurrent.data ? (
          <TwinWireErrors label="Zero" data={zeroAtCurrent.data} />
        ) : null}
        {mode === "twin" && recordLimit.data && "real" in recordLimit.data ? (
          <TwinWireErrors label="Limit" data={recordLimit.data} />
        ) : null}
        {mode === "twin" && setSymmetricSpan.data && "real" in setSymmetricSpan.data ? (
          <TwinWireErrors label="Span" data={setSymmetricSpan.data} />
        ) : null}
      </div>
    </Card>
  );
});
