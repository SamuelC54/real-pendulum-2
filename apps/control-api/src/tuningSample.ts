export type TuningSample = {
  t: number;
  /** Jog command shared by hardware and sim (logged only, not compared). */
  commandedRpm: number;
  realMotorCm: number | null;
  simMotorCm: number | null;
  realEncoderTicks: number;
  simEncoderTicks: number;
};

export type TuningComparePayload = {
  real: {
    motor: { connected: boolean; positionCm?: number; commandedRpm?: number };
    sensor: { encoderTicks: number };
  };
  sim: {
    motor: { connected: boolean; positionCm?: number; commandedRpm?: number };
    sensor: { encoderTicks: number };
  };
};

function sharedCommandedRpm(data: TuningComparePayload): number {
  const rpm = data.real.motor.commandedRpm ?? data.sim.motor.commandedRpm;
  return rpm !== undefined && Number.isFinite(rpm) ? rpm : 0;
}

export function sampleFromCompare(data: TuningComparePayload, t = Date.now()): TuningSample {
  const realPos = data.real.motor.positionCm;
  const simPos = data.sim.motor.positionCm;
  return {
    t,
    commandedRpm: sharedCommandedRpm(data),
    realMotorCm:
      data.real.motor.connected && realPos !== undefined && Number.isFinite(realPos) ? realPos : null,
    simMotorCm:
      data.sim.motor.connected && simPos !== undefined && Number.isFinite(simPos) ? simPos : null,
    realEncoderTicks: data.real.sensor.encoderTicks,
    simEncoderTicks: data.sim.sensor.encoderTicks,
  };
}

export function samplesToCsv(samples: TuningSample[]): string {
  const header = [
    "timestamp_iso",
    "commanded_rpm",
    "real_motor_cm",
    "sim_motor_cm",
    "real_encoder_ticks",
    "sim_encoder_ticks",
  ].join(",");
  const rows = samples.map((s) =>
    [
      new Date(s.t).toISOString(),
      s.commandedRpm,
      s.realMotorCm ?? "",
      s.simMotorCm ?? "",
      s.realEncoderTicks,
      s.simEncoderTicks,
    ].join(","),
  );
  return [header, ...rows].join("\n");
}
