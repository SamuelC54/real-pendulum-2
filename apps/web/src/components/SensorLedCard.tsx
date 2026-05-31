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
import { controlBackendModeAtom } from "@/stores/controlBackendMode";
import { sensorSerialPortAtom } from "@/stores/sensorSerialPort";
import { useSimulationBackendAutoConnect } from "@/services/useSimulationBackendAutoConnect";
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

export function SensorLedCard() {
  const mode = useAtomValue(controlBackendModeAtom);
  const simAuto = useSimulationBackendAutoConnect();
  const utils = trpc.useUtils();
  const [serialPort, setSerialPort] = useAtom(sensorSerialPortAtom);

  const portsQuery = trpc.sensor.serial.list.useQuery(undefined, {
    retry: 1,
  });

  const status = useSensorStatusQuery();

  const invalidateSensorQueries = useCallback(() => {
    void utils.machine.state.get.invalidate();
  }, [utils]);

  const connect = trpc.sensor.connection.connect.useMutation({
    onSuccess: (data, variables) => {
      invalidateSensorQueries();
      const port = variables.serialPort?.trim();
      if (port && data.ok) {
        setSerialPort(port);
      }
    },
  });

  const disconnect = trpc.sensor.connection.disconnect.useMutation({
    onSuccess: invalidateSensorQueries,
  });

  const setLed = trpc.machine.led.set.useMutation({
    onSuccess: invalidateSensorQueries,
  });

  const flashFirmware = trpc.sensor.firmware.flash.useMutation({
    onSuccess: async () => {
      await utils.machine.state.get.invalidate();
      await utils.sensor.serial.list.invalidate();
    },
  });

  const resetEncoder = trpc.sensor.encoder.reset.useMutation({
    onSuccess: invalidateSensorQueries,
  });

  const ports = portsQuery.data ?? [];
  const busy =
    connect.isPending ||
    disconnect.isPending ||
    setLed.isPending ||
    flashFirmware.isPending ||
    resetEncoder.isPending;
  const connected = status.data?.connection.sensor ?? false;

  /** When exactly one device is present, use it; otherwise the user must choose. */
  const portToConnect =
    ports.length === 1 ? ports[0].path : serialPort.trim();
  const connectBlocked = ports.length > 1 && !serialPort.trim();
  const selectValue = ports.length === 1 ? ports[0].path : serialPort;

  const connectError =
    connect.error?.message ??
    (connect.isSuccess && connect.data && !connect.data.ok ? connect.data.error : undefined);

  const flashPort = portToConnect.trim() || serialPort.trim() || "";
  const flashBlocked = !flashPort;

  return (
    <Card className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-muted-foreground text-sm font-medium">
          Sensor Board
        </span>
        <span className="font-mono text-xs text-muted-foreground">
          {connected ? "connected" : "serial closed"}
        </span>
      </div>
      <p className="text-muted-foreground text-[11px] leading-snug">
        {mode === "simulation" ? (
          <>
            Simulator mode: sensor limits and encoder come from the simulation plant (no USB). Motor and
            sensor connect automatically.
          </>
        ) : (
          <>
            USB list via physical-sensor-service — pick a port or{" "}
            <code className="text-foreground">SENSOR_SERIAL_PORT</code>.{" "}
            <strong className="text-foreground font-medium">Flash</strong>: CLI on control-api.{" "}
            <code className="text-foreground">npm run flash:sensor-firmware -- COM3</code>: CLI where npm
            runs.
          </>
        )}
      </p>
      {connected ? (
        <LimitSwitchIndicators
          leftPressed={status.data?.limitSwitch.leftPressed ?? false}
          rightPressed={status.data?.limitSwitch.rightPressed ?? false}
        />
      ) : (
        <div className="rounded-lg border border-dashed border-border bg-muted/20 px-3 py-2.5 text-muted-foreground text-xs">
          <span className="font-medium text-foreground">Travel limits</span> (Sensor Board D4 left,
          D5 right): connect to see switch state and where the cart is against the stops.
        </div>
      )}
      {connected && status.data && "twinSim" in status.data && status.data.twinSim ? (
        <p className="text-muted-foreground text-[10px] leading-snug">
          <span className="font-medium text-sky-900 dark:text-sky-200">Simulation</span> (same command
          mirrored): encoder {status.data.twinSim.pendulum.encoderTicks} ticks · limits L
          {status.data.twinSim.limitSwitch.leftPressed ? " on" : " off"} · R
          {status.data.twinSim.limitSwitch.rightPressed ? " on" : " off"}
        </p>
      ) : null}
      {!connected && mode !== "simulation" ? (
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
                      ? "No devices detected — set config.sensor.serialPort"
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
      {mode !== "simulation" ? (
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
      {portsQuery.isError && mode !== "simulation" ? (
        <p className="text-destructive text-xs">
          Could not list serial ports: {portsQuery.error.message}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm">
          {connected ? (
            status.data?.led.on ? (
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
      {status.data?.error ? (
        <p className="text-muted-foreground text-xs">{status.data.error}</p>
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
      {resetEncoder.isSuccess && resetEncoder.data && !resetEncoder.data.ok && resetEncoder.data.error ? (
        <p className="text-destructive text-xs">{resetEncoder.data.error}</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {!connected && mode === "simulation" ? (
          <p className="text-muted-foreground text-xs leading-relaxed">
            {simAuto.pending
              ? "Connecting to simulationulator…"
              : (simAuto.lastError ??
                "Auto-connect pending — start the stack with npm run dev (Docker).")}
          </p>
        ) : null}
        {!connected && mode !== "simulation" ? (
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
              onClick={() =>
                void setLed.mutateAsync({ on: !(status.data?.led.on ?? false) })
              }
            >
              Toggle LED
            </Button>
          </>
        ) : null}
      </div>
      <div className="mt-6 flex flex-col gap-3 border-t border-border pt-4">
        <EncoderDial
          connected={connected}
          ticks={status.data?.pendulum.encoderTicks ?? 0}
          onReset={
            connected ? () => void resetEncoder.mutateAsync() : undefined
          }
          resetBusy={resetEncoder.isPending}
        />
      </div>
    </Card>
  );
}
