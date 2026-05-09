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
 * FLASH_UPLOAD_RETRY_MS — delay before a second upload attempt on Windows (default 2500; set 0 to disable).
 * FLASH_UPLOAD_STALL_MS — after com-state failures, wait then try once more (default 5000; set 0 to skip).
 * Loads repository-root `.env` / `.env.local` when present (see run-with-root-env).
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { setTimeout as delay } from "timers/promises";

const LOG = "[flash-sensor-firmware]";

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

/** Runs upload; echoes Arduino CLI output; returns exit status plus combined text for retry heuristics. */
function uploadSketch(serialPort) {
  const r = spawnSync(
    "arduino-cli",
    ["upload", "-p", serialPort, "--fqbn", fqbn, sketch],
    {
      cwd: root,
      encoding: "utf8",
      shell,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const text = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  if (text) process.stderr.write(text);
  const status = r.status === null ? 1 : r.status;
  return { status, text };
}

function looksLikeMissingComPort(log) {
  return /cannot find the file specified|No such file or directory|could not find/i.test(
    log,
  );
}

async function main() {
  run("compile", "arduino-cli", ["compile", "--fqbn", fqbn, sketch]);

  if (!port) {
    console.log(
      `${LOG} Compile OK. To upload, pass your board's COM port (see \`arduino-cli board list\`), e.g. npm run flash:sensor-led -- COM9`,
    );
    return;
  }

  let upload = uploadSketch(port);
  const retryMs = Number(process.env.FLASH_UPLOAD_RETRY_MS ?? "2500");
  const shouldRetryWindows =
    upload.status !== 0 &&
    process.platform === "win32" &&
    Number.isFinite(retryMs) &&
    retryMs > 0 &&
    !looksLikeMissingComPort(upload.text);

  if (shouldRetryWindows) {
    console.error(`
${LOG} First upload failed — waiting ${retryMs} ms for Windows to release ${port},
then retrying once (common after closing serial / sensor-service).
`);
    await delay(retryMs);
    upload = uploadSketch(port);
  }

  const stallMs = Number(process.env.FLASH_UPLOAD_STALL_MS ?? "5000");
  const comStateStuck =
    upload.status !== 0 &&
    process.platform === "win32" &&
    Number.isFinite(stallMs) &&
    stallMs > 0 &&
    /can't set com-state|SetCommState|Access is denied/i.test(upload.text);

  if (comStateStuck) {
    console.error(`
${LOG} Still seeing COM errors — waiting ${stallMs} ms, then one more upload attempt.
If this keeps failing: fully STOP the dev stack (\`npm run dev\`) so sensor-service exits,
or Task Manager → end node.exe holding the port. Disconnect in the UI alone is not always enough.
`);
    await delay(stallMs);
    upload = uploadSketch(port);
  }

  if (upload.status !== 0) {
    console.error(`
${LOG} Upload failed for "${port}".

If avrdude said **cannot find the file specified** for \\\\.\\COMn:
  • That COM port does not exist right now — use the port where your board actually appears.
    Run \`arduino-cli board list\` and pass that Port (README examples like COM3 are placeholders only).

If you see **can't set com-state** / **SetCommState** / **access denied**:
  • Something still owns the COM port. Stop **sensor-service** (quit \`npm run dev\` / the concurrent
    "sensor" process, or kill the Node process). Disconnect in the browser is not enough if that
    process is still running. Close Arduino IDE Serial Monitor and any other serial terminals.

Also check: USB cable, another USB socket, CH340/CP210x drivers on clone boards.

Ports detected right now:
`);
    spawnSync("arduino-cli", ["board", "list"], {
      cwd: root,
      stdio: "inherit",
      shell,
      env: process.env,
    });
    console.error(
      "\nStill stuck on COM9 with com-state? Stop `npm run dev` completely, wait 3s, run flash again.\n",
    );
    process.exit(upload.status ?? 1);
  }

  console.log(`${LOG} Uploaded to ${port} (${fqbn}).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
