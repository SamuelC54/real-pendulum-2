/**
 * Planar point-mass pendulum hanging from a cart on a horizontal rail.
 *
 * State: cart position `x` (m, +right), velocity `v`, pendulum angle `theta` (rad),
 * angular rate `omega` (rad/s). Angle is **counter‑clockwise from straight down** when
 * viewed from the usual “looking along the rail” convention (y up in the plane of swing).
 *
 * Cart follows commanded velocity with first‑order lag (motor proxy):
 *   ẋ = v,  v̇ = α (v_cmd − v)  ⇒  cart acceleration  a = v̇  feeds the pendulum.
 *
 * Point‑mass rod (length L, negligible rod mass) with pivot on the cart:
 *   θ̈ = −(g/L) sin θ − (a/L) cos θ − c ω
 *
 * Encoder ticks accumulate from shaft angle: Δticks ≈ (ω Δt) · (ticksPerRadian).
 */

export type CartPendulumConfig = {
  /** Gravity (m/s²), default Earth. */
  gravity: number;
  /** Pivot–bob distance (m). */
  pendulumLengthM: number;
  /** Cart velocity tracks `vCmd` (m/s) as ẍ = α·(vCmd − v); larger α = snappier “motor”. */
  cartVelocityTrackingPerSec: number;
  /** Linear damping on angular rate (1/s); 0 = undamped. */
  angularDampingPerSec: number;
  /** Encoder quadrature sensitivity (counts per radian of pendulum shaft). */
  encoderTicksPerRadian: number;
  /** Max internal substep (s) for stability when the caller uses large `dt`. */
  maxInternalStepSec: number;
};

export type CartPendulumState = {
  xM: number;
  vMps: number;
  thetaRad: number;
  omegaRps: number;
  /** Commanded cart velocity (m/s), set by caller each frame or held. */
  vCmdMps: number;
  /** Continuous encoder integral (counts); round for proto / UI. */
  encoderTicksFloat: number;
};

export type CartPendulumPlant = {
  readonly config: Readonly<CartPendulumConfig>;
  readonly state: CartPendulumState;
};

const DEFAULT_CONFIG: CartPendulumConfig = {
  gravity: 9.80665,
  pendulumLengthM: 0.35,
  cartVelocityTrackingPerSec: 12,
  angularDampingPerSec: 0.04,
  encoderTicksPerRadian: 2400 / (2 * Math.PI),
  maxInternalStepSec: 1 / 240,
};

export function createCartPendulumPlant(
  partial?: Partial<CartPendulumConfig>,
  initial?: Partial<Pick<CartPendulumState, "xM" | "vMps" | "thetaRad" | "omegaRps" | "vCmdMps">>,
): CartPendulumPlant {
  const config = { ...DEFAULT_CONFIG, ...partial };
  const state: CartPendulumState = {
    xM: initial?.xM ?? 0,
    vMps: initial?.vMps ?? 0,
    thetaRad: initial?.thetaRad ?? 0,
    omegaRps: initial?.omegaRps ?? 0,
    vCmdMps: initial?.vCmdMps ?? 0,
    encoderTicksFloat: 0,
  };
  return { config, state };
}

function derivatives(
  x: number,
  v: number,
  theta: number,
  omega: number,
  vCmd: number,
  cfg: CartPendulumConfig,
): { dx: number; dv: number; dTheta: number; dOmega: number; a: number } {
  const a = cfg.cartVelocityTrackingPerSec * (vCmd - v);
  const L = cfg.pendulumLengthM;
  const g = cfg.gravity;
  const dTheta = omega;
  const dOmega = -(g / L) * Math.sin(theta) - (a / L) * Math.cos(theta) - cfg.angularDampingPerSec * omega;
  return { dx: v, dv: a, dTheta, dOmega, a };
}

function rk4Step(
  s: CartPendulumState,
  vCmd: number,
  dt: number,
  cfg: CartPendulumConfig,
): void {
  const { xM: x0, vMps: v0, thetaRad: t0, omegaRps: w0 } = s;

  const k1 = derivatives(x0, v0, t0, w0, vCmd, cfg);

  const x2 = x0 + 0.5 * dt * k1.dx;
  const v2 = v0 + 0.5 * dt * k1.dv;
  const t2 = t0 + 0.5 * dt * k1.dTheta;
  const w2 = w0 + 0.5 * dt * k1.dOmega;
  const k2 = derivatives(x2, v2, t2, w2, vCmd, cfg);

  const x3 = x0 + 0.5 * dt * k2.dx;
  const v3 = v0 + 0.5 * dt * k2.dv;
  const t3 = t0 + 0.5 * dt * k2.dTheta;
  const w3 = w0 + 0.5 * dt * k2.dOmega;
  const k3 = derivatives(x3, v3, t3, w3, vCmd, cfg);

  const x4 = x0 + dt * k3.dx;
  const v4 = v0 + dt * k3.dv;
  const t4 = t0 + dt * k3.dTheta;
  const w4 = w0 + dt * k3.dOmega;
  const k4 = derivatives(x4, v4, t4, w4, vCmd, cfg);

  s.xM = x0 + (dt / 6) * (k1.dx + 2 * k2.dx + 2 * k3.dx + k4.dx);
  s.vMps = v0 + (dt / 6) * (k1.dv + 2 * k2.dv + 2 * k3.dv + k4.dv);
  s.thetaRad = t0 + (dt / 6) * (k1.dTheta + 2 * k2.dTheta + 2 * k3.dTheta + k4.dTheta);
  s.omegaRps = w0 + (dt / 6) * (k1.dOmega + 2 * k2.dOmega + 2 * k3.dOmega + k4.dOmega);

  /** Midpoint ω for encoder increment (trapezoidal in angle). */
  const wMid = w0 + 0.5 * (s.omegaRps - w0);
  s.encoderTicksFloat += wMid * dt * cfg.encoderTicksPerRadian;
}

/**
 * Advance the plant by `dtSec` (wall-clock or sim time). Substeps internally using `maxInternalStepSec`.
 * Set `plant.state.vCmdMps` before calling (jog / profile velocity in m/s).
 */
export function stepCartPendulum(plant: CartPendulumPlant, dtSec: number): void {
  if (!(dtSec > 0) || !Number.isFinite(dtSec)) return;
  const { config, state } = plant;
  const hMax = Math.max(1e-6, config.maxInternalStepSec);
  let remaining = dtSec;
  while (remaining > 1e-12) {
    const h = Math.min(hMax, remaining);
    rk4Step(state, state.vCmdMps, h, config);
    remaining -= h;
  }
}

/** Integer encoder ticks for gRPC / UI (wrap to sint32 range if needed by caller). */
export function encoderTicksInt(plant: CartPendulumPlant): number {
  return Math.round(plant.state.encoderTicksFloat);
}
