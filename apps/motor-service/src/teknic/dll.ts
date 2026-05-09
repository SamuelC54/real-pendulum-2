/**
 * **koffi** bindings for **`teknic_motor.dll`** (see **`native/teknic_motor/`** exports).
 */
import fs from "node:fs";
import path from "node:path";
import koffi from "koffi";

/** Loaded **`teknic_motor.dll`** surface used by the gRPC server. */
export type TeknicNative = {
  init(): number;
  shutdown(): void;
  setVelocityRpm(rpm: number): number;
  stop(): number;
  getCommandedRpm(): number;
  /** `Motion.PosnMeasured` counts, or NaN if unavailable. */
  getPosnMeasured(): number;
  /** `Motion.AddToPosition(-PosnMeasured)` — zeros measured position at current location. */
  zeroMeasuredPosition(): number;
  /** `Motion.MovePosnStart(counts, true)` — absolute profile move; stops velocity jog first. Pass NaN for limits to use DLL defaults. */
  movePosnAbsolute(
    positionCounts: number,
    velLimitRpm: number,
    accLimitRpmPerSec: number,
  ): number;
  isConnected(): boolean;
  getDetail(): string;
  /** Returns JSON from Teknic **`IInfo`** or **`null`** if unavailable. */
  getMotorInfoJson(): string | null;
};

function resolveDll(pkgRoot: string): string {
  const fromEnv = process.env.TEKNIC_DLL;
  if (fromEnv) {
    const p = path.resolve(fromEnv);
    if (!fs.existsSync(p)) {
      throw new Error(`TEKNIC_DLL not found: ${p}`);
    }
    return p;
  }
  for (const rel of [
    path.join("native", "build", "Release", "teknic_motor.dll"),
    path.join("native", "build", "Debug", "teknic_motor.dll"),
  ]) {
    const p = path.join(pkgRoot, rel);
    if (fs.existsSync(p)) return p;
  }
  throw new Error(
    `teknic_motor.dll not found under ${pkgRoot}/native/build/{Release,Debug}. Run: npm run build:native -w @real-pendulum/motor-service`,
  );
}

export function loadTeknic(pkgRoot: string): TeknicNative {
  if (process.platform !== "win32") {
    throw new Error("Teknic motor DLL is Windows-only.");
  }

  const dllPath = resolveDll(pkgRoot);
  const lib = koffi.load(dllPath);

  const teknic_init = lib.func("int teknic_init(void)");
  const teknic_shutdown = lib.func("void teknic_shutdown(void)");
  const teknic_set_velocity_rpm = lib.func("int teknic_set_velocity_rpm(double rpm)");
  const teknic_stop = lib.func("int teknic_stop(void)");
  const teknic_get_commanded_rpm = lib.func("double teknic_get_commanded_rpm(void)");
  const teknic_get_posn_measured = lib.func("double teknic_get_posn_measured(void)");
  const teknic_zero_measured_position = lib.func("int teknic_zero_measured_position(void)");
  const teknic_move_posn_absolute = lib.func(
    "int teknic_move_posn_absolute(double position_counts, double vel_limit_rpm, double acc_limit_rpm_per_sec)",
  );
  const teknic_is_connected = lib.func("int teknic_is_connected(void)");
  const teknic_get_detail = lib.func("const char *teknic_get_detail(void)");
  const teknic_get_motor_info_json = lib.func(
    "int teknic_get_motor_info_json(void *out, int cap)",
  );

  return {
    init: () => teknic_init() as number,
    shutdown: () => teknic_shutdown(),
    setVelocityRpm: (rpm: number) => teknic_set_velocity_rpm(rpm) as number,
    stop: () => teknic_stop() as number,
    getCommandedRpm: () => teknic_get_commanded_rpm() as number,
    getPosnMeasured: () => teknic_get_posn_measured() as number,
    zeroMeasuredPosition: () => teknic_zero_measured_position() as number,
    movePosnAbsolute: (
      positionCounts: number,
      velLimitRpm: number,
      accLimitRpmPerSec: number,
    ) =>
      teknic_move_posn_absolute(positionCounts, velLimitRpm, accLimitRpmPerSec) as number,
    isConnected: () => (teknic_is_connected() as number) !== 0,
    getDetail: () => String(teknic_get_detail() ?? ""),
    getMotorInfoJson: () => {
      const buf = Buffer.alloc(16_384);
      const n = teknic_get_motor_info_json(buf, buf.length) as number;
      if (n <= 0) return null;
      return buf.subarray(0, n).toString("utf8");
    },
  };
}
