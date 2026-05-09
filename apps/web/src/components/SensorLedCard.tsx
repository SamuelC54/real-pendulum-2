import {
  Lightbulb,
  LightbulbOff,
  RefreshCw,
  Unplug,
  Upload,
  Usb,
} from "lucide-react";
import { useState } from "react";
import { EncoderDial } from "@/components/EncoderDial";
import { LimitSwitchIndicators } from "@/components/LimitSwitchIndicators";
import { Button } from "@/components/ui/button";
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
  const utils = trpc.useUtils();
  const [serialPort, setSerialPort] = useState("");

  const portsQuery = trpc.sensor.serial.list.useQuery(undefined, {
    retry: 1,
  });

  const status = trpc.sensor.status.get.useQuery(undefined, {
    refetchInterval: (query) =>
      query.state.data?.connected ? 80 : 1500,
  });
  const connect = trpc.sensor.connection.connect.useMutation({
    onSuccess: () => void utils.sensor.status.get.invalidate(),
  });
  const disconnect = trpc.sensor.connection.disconnect.useMutation({
    onSuccess: () => void utils.sensor.status.get.invalidate(),
  });
  const toggleLed = trpc.sensor.led.toggle.useMutation({
    onSuccess: () => void utils.sensor.status.get.invalidate(),
  });
  const flashFirmware = trpc.sensor.firmware.flash.useMutation({
    onSuccess: async () => {
      await utils.sensor.status.get.invalidate();
      await utils.sensor.serial.list.invalidate();
    },
  });
  const resetEncoder = trpc.sensor.encoder.reset.useMutation({
    onSuccess: () => void utils.sensor.status.get.invalidate(),
  });

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
    (connect.isSuccess && connect.data && !connect.data.ok
      ? connect.data.error
      : undefined);

  const flashPort =
    portToConnect.trim() || status.data?.serialPort?.trim() || "";
  const flashBlocked = !flashPort;

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-muted-foreground text-sm font-medium">
          Arduino test LED
        </span>
        <span className="font-mono text-xs text-muted-foreground">
          {status.data?.serialPort ? (
            <span title={status.data.serialPort}>{status.data.serialPort}</span>
          ) : (
            "serial closed"
          )}
        </span>
      </div>
      <p className="text-muted-foreground text-xs leading-relaxed">
        The port list comes from sensor-service (USB must be visible there). Choose a
        port to connect, or set{" "}
        <code className="text-foreground">SENSOR_SERIAL_PORT</code> on that host when
        the list is empty.{" "}
        <strong className="text-foreground font-medium">Flash firmware</strong> runs
        Arduino CLI on the machine running control-api;{" "}
        <code className="text-foreground">npm run flash:sensor-firmware -- COM3</code> runs
        Arduino CLI wherever you execute npm (repo root, board attached there).
      </p>
      {!connected ? (
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
      {portsQuery.isError ? (
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
      {connected ? (
        <LimitSwitchIndicators
          leftPressed={status.data?.limitLeftPressed ?? false}
          rightPressed={status.data?.limitRightPressed ?? false}
        />
      ) : null}
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
      !resetEncoder.data.ok &&
      resetEncoder.data.error ? (
        <p className="text-destructive text-xs">{resetEncoder.data.error}</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {!connected ? (
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
            Connect Arduino
          </Button>
        ) : (
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
        )}
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
    </section>
  );
}
