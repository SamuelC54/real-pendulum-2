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

  pendulum: {
    /** Shaft encoder quadrature counts per revolution (Arduino + coupled sim). */
    encoderCountsPerRevolution: number;
    /** Gravity for coupled cart–pendulum plant (m/s²). */
    gravityMS2: number;
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
    /** MuJoCo physics HTTP service (`apps/physics-sim`). */
    physicsSimHttpPort: number;
    physicsSimHttpUrl?: string;
    motorSimGrpcUrl?: string;
    sensorSimGrpcUrl?: string;
    /** Plant parameters in `config/coupled-sim.parameters.json` (see `@real-pendulum/app-config/coupled-sim-parameters`). */
    /** Cart position (m) where coupled-sim left/right limit switches assert. */
    limitLeftXM: number;
    limitRightXM: number;
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
    /** Playwright sim stack: isolated ports (no Teknic DLL). */
    physicsSimHttpPort: number;
    coupledGrpcPort: number;
    controlApiPort: number;
    simWebPort: number;
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

  pendulum: {
    encoderCountsPerRevolution: 2400,
    gravityMS2: 9.80665,
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
    physicsSimHttpPort: 58871,
    physicsSimHttpUrl: undefined,
    motorSimGrpcUrl: undefined,
    sensorSimGrpcUrl: undefined,
    limitLeftXM: -0.8,
    limitRightXM: 0.8,
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
    physicsSimHttpPort: 50571,
    coupledGrpcPort: 50552,
    controlApiPort: 14001,
    simWebPort: 4174,
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

export function physicsSimHttpBaseUrl(): string {
  const raw = config.sim.physicsSimHttpUrl?.trim();
  if (raw) return raw.startsWith("http") ? raw : `http://${raw}`;
  return `http://127.0.0.1:${config.sim.physicsSimHttpPort}`;
}

export function webControlApiBaseUrl(): string {
  const raw = config.web.controlApiUrl?.trim();
  if (raw) return raw;
  return `http://127.0.0.1:${config.controlApi.port}`;
}

/** Playwright E2E sim stack — physics-sim HTTP base URL. */
export function e2ePhysicsSimHttpUrl(): string {
  return `http://127.0.0.1:${config.e2e.physicsSimHttpPort}`;
}

/** Playwright E2E sim stack — coupled motor + sensor gRPC base URL. */
export function e2eCoupledGrpcUrl(): string {
  return `http://127.0.0.1:${config.e2e.coupledGrpcPort}`;
}

/** Playwright E2E sim stack — browser tRPC URL (Vite `mode: e2e`). */
export function e2eControlApiTrpcUrl(): string {
  return `http://127.0.0.1:${config.e2e.controlApiPort}/trpc`;
}

/** Playwright real-hardware stack — web dev port. */
export function e2eRealWebPort(): number {
  return config.e2e.webPort ?? config.web.devPort;
}

/** Playwright real-hardware stack — browser tRPC URL (Vite `mode: e2e-real`). */
export function e2eRealControlApiTrpcUrl(): string {
  return `http://127.0.0.1:${config.controlApi.port}/trpc`;
}
