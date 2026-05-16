import { config } from "@real-pendulum/app-config";

export function isRealMotorE2E(): boolean {
  return config.e2e.useRealMotor;
}

export function connectTimeoutMs(): number {
  if (!isRealMotorE2E()) return 30_000;
  return config.e2e.connectTimeoutMs;
}
