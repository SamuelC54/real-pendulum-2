import {
  Lightbulb,
  LightbulbOff,
  RefreshCw,
  Unplug,
  Upload,
  Usb,
} from "lucide-react";
import { useCallback } from "react";
import { useAtom, useAtomValue } from "jotai";
import { Card } from "@/components/ui/card";
import { EncoderDial } from "@/components/EncoderDial";
import { LimitSwitchIndicators } from "@/components/LimitSwitchIndicators";
import { Button } from "@/components/ui/button";
import { grpcBackendModeAtom } from "@/stores/grpcBackendMode";
import { sensorSerialPortAtom } from "@/stores/sensorSerialPort";
import { useSimBackendAutoConnect } from "@/services/useSimBackendAutoConnect";
import { useSensorStatusQuery } from "@/services/useMotorStatusQuery";
import { trpc } from "@/trpc";

function portLabel(p: {
  path: string;
  manufacturer: string;
  serialNumber: string;
  friendlyName: string;
}): string {
  const extra = p.friendlyName || p.manufacturer || p.serialNumber;
  return extra ? `${p.path} — ${extra}` : p.path;
}

type SensorConnectResult =
  | { ok: boolean; error: string }
  | { real: { ok: boolean; error: string }; sim: { ok: boolean; error: string } };

function hardwareSensorConnectOk(data: SensorConnectResult, twin: boolean): boolean {
  if (twin) return "real" in data && data.real.ok;
  return "ok" in data && data.ok;
}

export function SensorLedCard() {
  const mode = useAtomValue(grpcBackendModeAtom);
  const simAuto = useSimBackendAutoConnect();
  const utils = trpc.useUtils();
  const [serialPort, setSerialPort] = useAtom(sensorSerialPortAtom);

  const portsQuery = trpc.sensor.serial.list.useQuery(undefined, {
    retry: 1,
  });

  const status = useSensorStatusQuery();

  const invalidateSensorQueries = useCallback(() => {
    void utils.sensor.status.get.invalidate();
    void utils.twin.sensor.status.get.invalidate();
  }, [utils]);

  const onSensorConnectSuccess = useCallback(
    (data: SensorConnectResult, variables: { serialPort?: string }) => {
      invalidateSensorQueries();
      const port = variables.serialPort?.trim();
      if (port && hardwareSensorConnectOk(data, mode === "twin")) {
        setSerialPort(port);
      }
    },
    [invalidateSensorQueries, mode, setSerialPort],
  );

  const connectSingle = trpc.sensor.connection.connect.useMutation({
    onSuccess: onSensorConnectSuccess,
  });
  const connectTwin = trpc.twin.sensor.connection.connect.useMutation({
    onSuccess: onSensorConnectSuccess,
  });
  const connect = mode === "twin" ? connectTwin : connectSingle;

  const disconnectSingle = trpc.sensor.connection.disconnect.useMutation({
    onSuccess: invalidateSensorQueries,
  });
  const disconnectTwin = trpc.twin.sensor.connection.disconnect.useMutation({
    onSuccess: invalidateSensorQueries,
  });
  const disconnect = mode === "twin" ? disconnectTwin : disconnectSingle;

  const toggleSingle = trpc.sensor.led.toggle.useMutation({
    onSuccess: invalidateSensorQueries,
  });
  const toggleTwin = trpc.twin.sensor.led.toggle.useMutation({
    onSuccess: invalidateSensorQueries,
  });
  const toggleLed = mode === "twin" ? toggleTwin : toggleSingle;

  const flashFirmware = trpc.sensor.firmware.flash.useMutation({
    onSuccess: async () => {
      await utils.sensor.status.get.invalidate();
      await utils.twin.sensor.status.get.invalidate();
      await utils.sensor.serial.list.invalidate();
    },
  });

  const resetSingle = trpc.sensor.encoder.reset.useMutation({
    onSuccess: invalidateSensorQueries,
  });
  const resetTwin = trpc.twin.sensor.encoder.reset.useMutation({
    onSuccess: invalidateSensorQueries,
  });
  const resetEncoder = mode === "twin" ? resetTwin : resetSingle;

  const ports = portsQuery.data ?? [];
  const busy =
    connect.isPending ||
    disconnect.isPending ||
    toggleLed.isPending ||
    flashFirmware.isPending ||
    resetEncoder.isPending;
  const connected = status.data?.connected ?? false;

  /** When exactly one device is present, use it; otherwise the user must choose. */
  const portToConnect =
    ports.length === 1 ? ports[0].path : serialPort.trim();
  const connectBlocked = ports.length > 1 && !serialPort.trim();
  const selectValue = ports.length === 1 ? ports[0].path : serialPort;

  const connectError =
    connect.error?.message ??
    (connect.isSuccess && connect.data && "real" in connect.data
      ? [
          !connect.data.real.ok ? connect.data.real.error : null,
          !connect.data.sim.ok ? connect.data.sim.error : null,
        ]
          .filter(Boolean)
          .join(" · ")
      : connect.isSuccess && connect.data && "ok" in connect.data && !connect.data.ok
        ? connect.data.error
        : undefined);

  const flashPort =
    portToConnect.trim() || status.data?.serialPort?.trim() || "";
  const flashBlocked = !flashPort;

  return (
    <Card className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-muted-foreground text-sm font-medium">
          Sensor Board
        </span>
        <span className="font-mono text-xs text-muted-foreground">
          {status.data?.serialPort ? (
            <span title={status.data.serialPort}>{status.data.serialPort}</span>
          ) : (
            "serial closed"
          )}
        </span>
      </div>
      <p className="text-muted-foreground text-[11px] leading-snug">
        {mode === "sim" ? (
          <>
            Simulator mode: sensor limits and encoder come from the coupled plant (no USB). Motor and
            sensor connect automatically.
          </>
        ) : (
          <>
            USB list via sensor-service — pick a port or{" "}
            <code className="text-foreground">SENSOR_SERIAL_PORT</code>.{" "}
            <strong className="text-foreground font-medium">Flash</strong>: CLI on control-api.{" "}
            <code className="text-foreground">npm run flash:sensor-firmware -- COM3</code>: CLI where npm
            runs.
          </>
        )}
      </p>
      {connected ? (
        <LimitSwitchIndicators
          leftPressed={status.data?.limitLeftPressed ?? false}
          rightPressed={status.data?.limitRightPressed ?? false}
        />
      ) : (
        <div className="rounded-lg border border-dashed border-border bg-muted/20 px-3 py-2.5 text-muted-foreground text-xs">
          <span className="font-medium text-foreground">Travel limits</span> (Sensor Board D4 left,
          D5 right): connect to see switch state and where the cart is against the stops.
        </div>
      )}
      {connected && status.data && "twinSimSensor" in status.data && status.data.twinSimSensor ? (
        <p className="text-muted-foreground text-[10px] leading-snug">
          <span className="font-medium text-sky-900 dark:text-sky-200">Simulation</span> (same command
          mirrored): encoder {status.data.twinSimSensor.encoderTicks} ticks · limits L
          {status.data.twinSimSensor.limitLeftPressed ? " on" : " off"} · R
          {status.data.twinSimSensor.limitRightPressed ? " on" : " off"}
        </p>
      ) : null}
      {!connected && mode !== "sim" ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <label className="flex min-w-[200px] flex-1 flex-col gap-1 text-xs">
            <span className="text-muted-foreground">Serial port</span>
            <div className="flex gap-2">
              <select
                className="border-input bg-background text-foreground focus-visible:ring-ring h-9 w-full min-w-0 flex-1 rounded-md border px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={selectValue}
                onChange={(e) => setSerialPort(e.target.value)}
                disabled={busy || portsQuery.isPending}
              >
                <option value="">
                  {portsQuery.isPending
                    ? "Loading ports…"
                    : ports.length === 0
                      ? "No devices detected — use .env on server"
                      : "Choose serial port…"}
                </option>
                {serialPort &&
                !ports.some((p) => p.path === serialPort) &&
                ports.length !== 1 ? (
                  <option value={serialPort}>{serialPort} (last used)</option>
                ) : null}
                {ports.map((p) => (
                  <option key={p.path} value={p.path}>
                    {portLabel(p)}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9 shrink-0"
                disabled={busy || portsQuery.isFetching}
                onClick={() => void portsQuery.refetch()}
                title="Refresh serial port list"
              >
                <RefreshCw
                  aria-hidden
                  className={
                    portsQuery.isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"
                  }
                />
              </Button>
            </div>
          </label>
        </div>
      ) : null}
      {mode !== "sim" ? (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-9 w-fit"
        disabled={busy || flashBlocked}
        title={
          flashBlocked
            ? "Select a serial port (or connect so the active port is known)"
            : "Compile and upload sketch via Arduino CLI on the API server (disconnects serial first)"
        }
        onClick={() => void flashFirmware.mutateAsync({ serialPort: flashPort })}
      >
        <Upload
          aria-hidden
          className={
            flashFirmware.isPending ? "mr-2 h-4 w-4 animate-pulse" : "mr-2 h-4 w-4"
          }
        />
        Flash firmware
      </Button>
      ) : null}
      {portsQuery.isError && mode !== "sim" ? (
        <p className="text-destructive text-xs">
          Could not list serial ports: {portsQuery.error.message}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm">
          {connected ? (
            status.data?.ledOn ? (
              <span className="flex items-center gap-2 text-amber-500">
                <Lightbulb aria-hidden className="h-5 w-5" />
                LED on
              </span>
            ) : (
              <span className="flex items-center gap-2 text-muted-foreground">
                <LightbulbOff aria-hidden className="h-5 w-5" />
                LED off
              </span>
            )
          ) : (
            <span className="text-muted-foreground">Not connected</span>
          )}
        </span>
      </div>
      {status.data?.detail ? (
        <p className="text-muted-foreground text-xs">{status.data.detail}</p>
      ) : null}
      {connectError ? (
        <p className="text-destructive text-xs">{connectError}</p>
      ) : null}
      {flashFirmware.error ? (
        <p className="text-destructive text-xs">{flashFirmware.error.message}</p>
      ) : null}
      {flashFirmware.isSuccess && flashFirmware.data ? (
        <div
          className={
            flashFirmware.data.ok
              ? "text-muted-foreground"
              : "text-destructive"
          }
        >
          <p className="mb-1 text-xs font-medium">
            {flashFirmware.data.ok ? "Flash completed" : "Flash failed"}
          </p>
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-muted/40 p-2 font-mono text-[10px] leading-relaxed">
            {flashFirmware.data.log}
          </pre>
        </div>
      ) : null}
      {resetEncoder.error ? (
        <p className="text-destructive text-xs">{resetEncoder.error.message}</p>
      ) : null}
      {resetEncoder.isSuccess &&
      resetEncoder.data &&
      "real" in resetEncoder.data &&
      (!resetEncoder.data.real.ok || !resetEncoder.data.sim.ok) ? (
        <p className="text-destructive text-xs">
          {!resetEncoder.data.real.ok && resetEncoder.data.real.error
            ? resetEncoder.data.real.error
            : null}
          {!resetEncoder.data.sim.ok && resetEncoder.data.sim.error
            ? `${!resetEncoder.data.real.ok ? " · " : ""}Sim: ${resetEncoder.data.sim.error}`
            : null}
        </p>
      ) : null}
      {resetEncoder.isSuccess &&
      resetEncoder.data &&
      !("real" in resetEncoder.data) &&
      !resetEncoder.data.ok &&
      resetEncoder.data.error ? (
        <p className="text-destructive text-xs">{resetEncoder.data.error}</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {!connected && mode === "sim" ? (
          <p className="text-muted-foreground text-xs leading-relaxed">
            {simAuto.pending
              ? "Connecting to coupled simulator…"
              : (simAuto.lastError ??
                "Auto-connect pending — start coupled sim (included in npm run dev).")}
          </p>
        ) : null}
        {!connected && mode !== "sim" ? (
          <Button
            type="button"
            variant="default"
            size="sm"
            disabled={busy || connectBlocked}
            onClick={() =>
              void connect.mutateAsync({
                serialPort: portToConnect || undefined,
              })
            }
          >
            <Usb aria-hidden className="mr-2 h-4 w-4" />
            Connect Sensor Board
          </Button>
        ) : null}
        {connected ? (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => void disconnect.mutateAsync()}
            >
              <Unplug aria-hidden className="mr-2 h-4 w-4" />
              Disconnect
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => void toggleLed.mutateAsync()}
            >
              Toggle LED
            </Button>
          </>
        ) : null}
      </div>
      <div className="mt-6 flex flex-col gap-3 border-t border-border pt-4">
        <EncoderDial
          connected={connected}
          ticks={status.data?.encoderTicks ?? 0}
          onReset={
            connected ? () => void resetEncoder.mutateAsync() : undefined
          }
          resetBusy={resetEncoder.isPending}
        />
      </div>
    </Card>
  );
}
