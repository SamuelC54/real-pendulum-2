/**
 * Repository-wide configuration — edit values here for local dev, E2E, and tooling.
 * Committed defaults apply to local dev, tests, and production builds unless overridden in code.
 */

export type AppConfig = {
  /** Optional absolute repo root (flash script, control-api). */
  repoRoot?: string;

  controlApi: {
    port: number;
    /** Pause after sensor disconnect before Arduino CLI flash (ms). */
    flashAfterDisconnectMs: number;
  };

  web: {
    devPort: number;
    /** Full control-api URL for browser; default proxies `/trpc` to localhost:controlApi.port */
    controlApiUrl?: string;
  };

  motor: {
    grpcPort: number;
    /** Full gRPC base URL; default `http://127.0.0.1:${grpcPort}` */
    grpcUrl?: string;
    /** Absolute path to `teknic_motor.dll`; omit for native build default */
    teknicDll?: string;
    teknicSdkRoot?: string;
    cmakeBin?: string;
    cmakeGenerator?: string;
    cmakePrefixPath?: string;
  };

  sensor: {
    grpcPort: number;
    grpcUrl?: string;
    /** Default serial when UI / auto-connect does not pass a port */
    serialPort: string;
    baud: number;
  };

  rail: {
    /** Display motor counts per centimeter (1 cm = N counts). */
    displayCountsPerCm: number;
  };

  homing: {
    jogRpm: number;
    pollMs: number;
    phaseTimeoutMs: number;
    midPositionTolerance: number;
    approachPosition: number;
    approachRpm: number;
    zeroMotorPositionAtMid: boolean;
    minTravelForLimitCounts: number;
  };

  sim: {
    /** Coupled motor+sensor gRPC (default when sim URLs unset). */
    coupledGrpcPort: number;
    motorSimGrpcUrl?: string;
    sensorSimGrpcUrl?: string;
    /** Plant tuning lives in `config/coupled-sim.parameters.json` (see `@real-pendulum/app-config/coupled-sim-parameters`). */
  };

  flash: {
    arduinoFqbn: string;
    arduinoPort?: string;
    uploadRetryMs: number;
    uploadStallMs: number;
  };

  e2e: {
    /** `true` for hardware Playwright runs (`playwright.real.config.cjs`). */
    useRealMotor: boolean;
    connectTimeoutMs: number;
    /** Fake stack: isolated ports (no Teknic DLL). */
    fakeMotorGrpcPort: number;
    fakeControlApiPort: number;
    fakeWebPort: number;
    /** Real-hardware E2E web dev port; default `web.devPort`. */
    webPort?: number;
    /** `true` in CI Playwright runs (`playwright.ci.config.cjs`). */
    continuousIntegration: boolean;
  };
};

export const config: AppConfig = {
  repoRoot: undefined,

  controlApi: {
    port: 4000,
    flashAfterDisconnectMs: 2000,
  },

  web: {
    devPort: 5173,
    controlApiUrl: undefined,
  },

  motor: {
    grpcPort: 50051,
    grpcUrl: undefined,
    teknicDll: undefined,
    teknicSdkRoot: undefined,
    cmakeBin: undefined,
    cmakeGenerator: undefined,
    cmakePrefixPath: undefined,
  },

  sensor: {
    grpcPort: 50052,
    grpcUrl: undefined,
    serialPort: "",
    baud: 115200,
  },

  rail: {
    displayCountsPerCm: 232.8,
  },

  homing: {
    jogRpm: 60,
    pollMs: 50,
    phaseTimeoutMs: 120_000,
    midPositionTolerance: 2,
    approachPosition: 48,
    approachRpm: 22,
    zeroMotorPositionAtMid: true,
    minTravelForLimitCounts: 48,
  },

  sim: {
    coupledGrpcPort: 58870,
    motorSimGrpcUrl: undefined,
    sensorSimGrpcUrl: undefined,
  },

  flash: {
    arduinoFqbn: "arduino:avr:uno",
    arduinoPort: undefined,
    uploadRetryMs: 2500,
    uploadStallMs: 5000,
  },

  e2e: {
    useRealMotor: false,
    connectTimeoutMs: 120_000,
    fakeMotorGrpcPort: 50552,
    fakeControlApiPort: 14001,
    fakeWebPort: 4174,
    webPort: undefined,
    continuousIntegration: false,
  },
};

export function motorGrpcBaseUrl(): string {
  const raw = config.motor.grpcUrl?.trim();
  if (raw) return raw.startsWith("http") ? raw : `http://${raw}`;
  return `http://127.0.0.1:${config.motor.grpcPort}`;
}

export function sensorGrpcBaseUrl(): string {
  const raw = config.sensor.grpcUrl?.trim();
  if (raw) return raw.startsWith("http") ? raw : `http://${raw}`;
  return `http://127.0.0.1:${config.sensor.grpcPort}`;
}

export function coupledSimGrpcBaseUrl(): string {
  return `http://127.0.0.1:${config.sim.coupledGrpcPort}`;
}

export function webControlApiBaseUrl(): string {
  const raw = config.web.controlApiUrl?.trim();
  if (raw) return raw;
  return `http://127.0.0.1:${config.controlApi.port}`;
}

/** Playwright fake stack — motor gRPC base URL. */
export function e2eFakeMotorGrpcUrl(): string {
  return `http://127.0.0.1:${config.e2e.fakeMotorGrpcPort}`;
}

/** Playwright fake stack — browser tRPC URL (Vite `mode: e2e`). */
export function e2eFakeControlApiTrpcUrl(): string {
  return `http://127.0.0.1:${config.e2e.fakeControlApiPort}/trpc`;
}

/** Playwright real-hardware stack — web dev port. */
export function e2eRealWebPort(): number {
  return config.e2e.webPort ?? config.web.devPort;
}

/** Playwright real-hardware stack — browser tRPC URL (Vite `mode: e2e-real`). */
export function e2eRealControlApiTrpcUrl(): string {
  return `http://127.0.0.1:${config.controlApi.port}/trpc`;
}
