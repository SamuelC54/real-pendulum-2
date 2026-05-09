/**
 * Connect **`sensor.v1.SensorService`** over HTTP — talks to Arduino via USB serial.
 */
import * as http from "node:http";
import { create } from "@bufbuild/protobuf";
import type { ConnectRouter } from "@connectrpc/connect";
import { connectNodeAdapter } from "@connectrpc/connect-node";
import {
  ConnectReplySchema,
  DisconnectReplySchema,
  GetStatusReplySchema,
  ListSerialPortsReplySchema,
  ResetEncoderReplySchema,
  SensorService,
  SerialPortInfoSchema,
  ToggleLedReplySchema,
} from "@real-pendulum/motor-proto/gen/sensor_pb.js";
import { SerialPort } from "serialport";
import { ArduinoSerialSession } from "./serial/arduinoSession.js";

const session = new ArduinoSerialSession();

function routes(router: ConnectRouter): void {
  router.service(SensorService, {
    async connect(req) {
      const path =
        req.serialPort?.trim() || process.env.SENSOR_SERIAL_PORT?.trim();
      if (!path) {
        return create(ConnectReplySchema, {
          ok: false,
          errorMessage:
            "Pick a serial port in the UI or set SENSOR_SERIAL_PORT (e.g. COM3 on Windows, /dev/ttyACM0 on Linux).",
        });
      }
      const baud = Number(process.env.SENSOR_SERIAL_BAUD ?? "115200");
      const r = await session.open(path, baud);
      if (!r.ok) {
        return create(ConnectReplySchema, { ok: false, errorMessage: r.error });
      }
      return create(ConnectReplySchema, { ok: true, errorMessage: "" });
    },
    async disconnect() {
      await session.close();
      await new Promise((r) => setTimeout(r, 400));
      return create(DisconnectReplySchema, { ok: true, errorMessage: "" });
    },
    async toggleLed() {
      const r = await session.toggleLed();
      return create(ToggleLedReplySchema, {
        ok: r.ok,
        errorMessage: r.error,
        ledOn: r.ledOn,
      });
    },
    async getStatus() {
      const connected = session.isOpen();
      const portPath = session.getSerialPath();
      const detail = connected
        ? `Serial open (${portPath})`
        : process.env.SENSOR_SERIAL_PORT?.trim()
          ? "Serial closed"
          : "Pick a port in the UI or set SENSOR_SERIAL_PORT";
      return create(GetStatusReplySchema, {
        connected,
        ledOn: session.getLastLedOn(),
        detail,
        serialPort: portPath,
        encoderTicks: session.getEncoderTicks(),
      });
    },
    async listSerialPorts() {
      const list = await SerialPort.list();
      return create(ListSerialPortsReplySchema, {
        ports: list.map((p) =>
          create(SerialPortInfoSchema, {
            path: p.path,
            manufacturer: p.manufacturer ?? "",
            serialNumber: p.serialNumber ?? "",
            friendlyName: (p as { friendlyName?: string }).friendlyName ?? "",
          }),
        ),
      });
    },
    async resetEncoder() {
      const r = await session.resetEncoder();
      return create(ResetEncoderReplySchema, {
        ok: r.ok,
        errorMessage: r.error,
        encoderTicks: session.getEncoderTicks(),
      });
    },
  });
}

const port = Number(process.env.SENSOR_GRPC_PORT ?? "50052");
const bindHost = "0.0.0.0";
const server = http.createServer(
  connectNodeAdapter({
    routes,
  }),
);

server.listen(port, bindHost, () => {
  console.log(
    `[sensor-service] SensorService (Connect + Arduino serial) http://${bindHost}:${port}`,
  );
});

function shutdown(): void {
  void session.close().finally(() => {
    server.close(() => process.exit(0));
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
