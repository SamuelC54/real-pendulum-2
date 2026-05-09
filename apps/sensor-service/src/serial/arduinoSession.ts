import { ReadlineParser } from "@serialport/parser-readline";
import { SerialPort } from "serialport";

type PendingToggle = ((r: { ok: boolean; error: string; ledOn: boolean }) => void) | null;

/**
 * USB-serial session for the LED-toggle Arduino sketch (`firmware/led_toggle`).
 * Wire protocol: PC sends **`TOGGLE\\n`**, board replies **`LED:0`** or **`LED:1`** per line.
 */
export class ArduinoSerialSession {
  private port: SerialPort | null = null;
  private parser: ReadlineParser | null = null;
  private ledOn = false;
  private pendingToggle: PendingToggle = null;
  private openedPath: string | null = null;

  getLastLedOn(): boolean {
    return this.ledOn;
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

  async close(): Promise<void> {
    this.pendingToggle = null;
    const p = this.port;
    this.port = null;
    this.parser = null;
    this.openedPath = null;
    if (!p) return;
    await new Promise<void>((res) => {
      p.close(() => res());
    });
  }
}
