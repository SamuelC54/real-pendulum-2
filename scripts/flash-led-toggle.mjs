#!/usr/bin/env node
/**
 * Compile and upload `apps/sensor-service/firmware/led_toggle` via Arduino CLI.
 *
 * Prerequisites: install https://arduino.github.io/arduino-cli/ and run once:
 *   arduino-cli core install arduino:avr
 *
 * Usage:
 *   npm run flash:sensor-led -- COM3
 *   ARDUINO_PORT=COM3 npm run flash:sensor-led
 *
 * Env (optional): ARDUINO_FQBN (default arduino:avr:uno), ARDUINO_PORT (same as arg).
 * Loads repository-root `.env` / `.env.local` when present (see run-with-root-env).
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const sketch = join(root, "apps/sensor-service/firmware/led_toggle");

const envPath = join(root, ".env");
const envLocalPath = join(root, ".env.local");
if (existsSync(envPath)) {
  config({ path: envPath });
}
if (existsSync(envLocalPath)) {
  config({ path: envLocalPath, override: true });
}

const fqbn = process.env.ARDUINO_FQBN ?? "arduino:avr:uno";
const portArg = process.argv[2]?.trim();
const port = portArg || process.env.ARDUINO_PORT?.trim();

const shell = process.platform === "win32";

function run(label, command, args) {
  const r = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell,
    env: process.env,
  });
  if (r.error) {
    console.error(`${label}: failed to spawn ${command}:`, r.error.message);
    process.exit(1);
  }
  if (r.status !== 0) {
    process.exit(r.status ?? 1);
  }
}

run("compile", "arduino-cli", ["compile", "--fqbn", fqbn, sketch]);

if (port) {
  const upload = spawnSync(
    "arduino-cli",
    ["upload", "-p", port, "--fqbn", fqbn, sketch],
    {
      cwd: root,
      stdio: "inherit",
      shell,
      env: process.env,
    },
  );
  if (upload.status !== 0) {
    console.error(`
[flash-led-toggle] Upload failed for "${port}".
Cannot open serial port usually means one of:
  • Wrong COM number — use the port shown in Device Manager → Ports (COM & LPT), or run:
      arduino-cli board list
    and use the Port column for your USB cable (often COM4, COM5, … not COM3).
  • Port busy — close Arduino IDE Serial Monitor, any serial terminal, and disconnect
    the sensor-service session using that port before flashing.
  • Cable/driver — try another USB cable or USB port; install CH340/CP210x drivers if clone board.

Detected boards / ports right now:
`);
    spawnSync("arduino-cli", ["board", "list"], {
      cwd: root,
      stdio: "inherit",
      shell,
      env: process.env,
    });
    process.exit(upload.status ?? 1);
  }
  console.log(`[flash-led-toggle] Uploaded to ${port} (${fqbn}).`);
} else {
  console.log(
    "[flash-led-toggle] Compile OK. To upload, pass the serial port: npm run flash:sensor-led -- COM3",
  );
}
