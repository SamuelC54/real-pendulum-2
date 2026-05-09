import { ReadlineParser } from "@serialport/parser-readline";
import { SerialPort } from "serialport";

type PendingToggle = ((r: { ok: boolean; error: string; ledOn: boolean }) => void) | null;
type PendingReset = ((r: { ok: boolean; error: string }) => void) | null;

/**
 * USB-serial session for the LED / encoder Arduino sketch (`firmware/led_toggle`).
 * Wire protocol: PC sends **`TOGGLE\\n`**, board replies **`LED:0`** or **`LED:1`** per line;
 * board may push **`ENC:&lt;ticks&gt;\\n`** when the quadrature encoder moves.
 * PC **`RESET_ENC\\n`** → **`ZERO:OK\\n`** then **`ENC:0\\n`** (see firmware).
 */
export class ArduinoSerialSession {
  private port: SerialPort | null = null;
  private parser: ReadlineParser | null = null;
  private ledOn = false;
  private encoderTicks = 0;
  private pendingToggle: PendingToggle = null;
  private pendingReset: PendingReset = null;
  private openedPath: string | null = null;

  getLastLedOn(): boolean {
    return this.ledOn;
  }

  /** Latest signed quadrature tick count from **`ENC:`** lines (falls back to 0 before first line). */
  getEncoderTicks(): number {
    return this.encoderTicks;
  }

  getSerialPath(): string {
    return this.openedPath ?? "";
  }

  isOpen(): boolean {
    return this.port !== null && this.port.isOpen;
  }

  async open(path: string, baudRate: number): Promise<{ ok: boolean; error: string }> {
    await this.close();
    return new Promise((resolve) => {
      const p = new SerialPort({ path, baudRate }, (err) => {
        if (err) {
          resolve({ ok: false, error: err.message });
          return;
        }
        this.port = p;
        this.openedPath = path;
        const parser = p.pipe(new ReadlineParser({ delimiter: "\n" }));
        this.parser = parser;
        parser.on("data", (line: string) => {
          this.onLine(String(line));
        });
        // Many boards reset on serial open; give the sketch time to boot.
        setTimeout(() => resolve({ ok: true, error: "" }), 400);
      });
    });
  }

  private onLine(line: string): void {
    const trimmed = line.replace(/\r/g, "").trim();
    const zeroOk = /^ZERO:OK$/i.exec(trimmed);
    if (zeroOk) {
      this.encoderTicks = 0;
      if (this.pendingReset) {
        const fn = this.pendingReset;
        this.pendingReset = null;
        fn({ ok: true, error: "" });
      }
      return;
    }
    const enc = /^ENC:(-?\d+)$/i.exec(trimmed);
    if (enc) {
      const v = Number(enc[1]);
      if (Number.isSafeInteger(v)) {
        this.encoderTicks = v;
      }
      return;
    }
    const m = /^LED:([01])$/i.exec(trimmed);
    if (!m) return;
    this.ledOn = m[1] === "1";
    if (this.pendingToggle) {
      const fn = this.pendingToggle;
      this.pendingToggle = null;
      fn({ ok: true, error: "", ledOn: this.ledOn });
    }
  }

  async toggleLed(): Promise<{ ok: boolean; error: string; ledOn: boolean }> {
    if (!this.port?.isOpen) {
      return { ok: false, error: "serial port not open", ledOn: this.ledOn };
    }
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        if (this.pendingToggle) {
          this.pendingToggle = null;
          resolve({ ok: false, error: "timeout waiting for LED: line from Arduino", ledOn: this.ledOn });
        }
      }, 3000);
      this.pendingToggle = (r) => {
        clearTimeout(timeout);
        resolve(r);
      };
      this.port!.write("TOGGLE\n", (err) => {
        if (err) {
          clearTimeout(timeout);
          this.pendingToggle = null;
          resolve({ ok: false, error: err.message, ledOn: this.ledOn });
        }
      });
    });
  }

  async resetEncoder(): Promise<{ ok: boolean; error: string }> {
    if (!this.port?.isOpen) {
      return { ok: false, error: "serial port not open" };
    }
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        if (this.pendingReset) {
          this.pendingReset = null;
          resolve({ ok: false, error: "timeout waiting for ZERO:OK from Arduino" });
        }
      }, 3000);
      this.pendingReset = () => {
        clearTimeout(timeout);
        resolve({ ok: true, error: "" });
      };
      this.port!.write("RESET_ENC\n", (err) => {
        if (err) {
          clearTimeout(timeout);
          this.pendingReset = null;
          resolve({ ok: false, error: err.message });
        }
      });
    });
  }

  async close(): Promise<void> {
    this.pendingToggle = null;
    this.pendingReset = null;
    this.encoderTicks = 0;
    const p = this.port;
    const parser = this.parser;
    this.port = null;
    this.parser = null;
    this.openedPath = null;
    if (!p) return;

    await new Promise<void>((resolve) => {
      try {
        if (parser) {
          parser.removeAllListeners();
          try {
            p.unpipe(parser as NodeJS.WritableStream);
          } catch {
            /* ignore */
          }
          if (typeof (parser as { destroy?: () => void }).destroy === "function") {
            (parser as { destroy: () => void }).destroy();
          }
        }
      } catch {
        /* ignore */
      }

      if (!p.isOpen) {
        resolve();
        return;
      }

      p.drain(() => {
        p.close(() => resolve());
      });
    });
  }
}
