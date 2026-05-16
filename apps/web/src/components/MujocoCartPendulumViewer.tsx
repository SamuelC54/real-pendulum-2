import { OrbitControls } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { memo, Suspense, useState } from "react";
import { MujocoCanvas, useMujoco, useMujocoWasm } from "mujoco-react";
import { encoderTicksPerRadian } from "@/lib/pendulumEncoder";
import { mujocoCartPendulumSceneConfig } from "@/lib/mujocoCartPendulumScene";
import { cn } from "@/lib/utils";

type ViewerProps = {
  /** Cart position along rail (display cm, same sign as motor status). */
  positionCm: number | undefined;
  encoderTicks: number;
  connected: boolean;
  className?: string;
};

function SyncCartPendulumState({
  positionCm,
  encoderTicks,
  enabled,
}: {
  positionCm: number | undefined;
  encoderTicks: number;
  enabled: boolean;
}) {
  const sim = useMujoco();
  const { mujoco } = useMujocoWasm();

  useFrame(() => {
    if (!enabled || !sim.isReady) return;
    const xM = positionCm != null && Number.isFinite(positionCm) ? positionCm / 100 : 0;
    const theta = encoderTicks / encoderTicksPerRadian();
    const qpos = sim.api.getQpos();
    if (qpos.length < 2) return;
    qpos[0] = xM;
    qpos[1] = theta;
    sim.api.setQpos(qpos);

    const model = sim.api.mjModelRef.current;
    const data = sim.api.mjDataRef.current;
    if (model && data && mujoco) {
      mujoco.mj_forward(model, data);
    }
  });

  return null;
}

function MujocoCartPendulumScene({
  positionCm,
  encoderTicks,
  connected,
}: Omit<ViewerProps, "className">) {
  const [loadError, setLoadError] = useState<string | null>(null);

  return (
    <>
      <MujocoCanvas
        config={mujocoCartPendulumSceneConfig()}
        paused
        shadows
        style={{ width: "100%", height: "100%" }}
        camera={{ position: [0.9, 0.55, 0.4], fov: 48, near: 0.01, far: 20 }}
        onError={(err) => setLoadError(err.message)}
      >
        <color attach="background" args={["#0f1419"]} />
        <ambientLight intensity={0.55} />
        <directionalLight position={[2, 4, 3]} intensity={1.1} castShadow />
        <OrbitControls makeDefault enableDamping dampingFactor={0.08} target={[0, 0, 0.05]} />
        <SyncCartPendulumState
          positionCm={positionCm}
          encoderTicks={encoderTicks}
          enabled={connected}
        />
      </MujocoCanvas>
      {loadError ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/85 px-3 text-center text-xs text-destructive">
          MuJoCo failed to load: {loadError}
        </div>
      ) : null}
      {!connected ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/70 text-muted-foreground text-xs">
          Connect simulator to mirror live state
        </div>
      ) : null}
    </>
  );
}

function LoadingFallback() {
  return (
    <div className="flex h-full min-h-48 items-center justify-center text-muted-foreground text-xs">
      Loading MuJoCo…
    </div>
  );
}

/**
 * 3D MuJoCo view of the cart–pendulum (mujoco-js in the browser).
 * Kinematic only: qpos is driven from motor/sensor telemetry, not stepped locally.
 */
export const MujocoCartPendulumViewer = memo(function MujocoCartPendulumViewer({
  positionCm,
  encoderTicks,
  connected,
  className,
}: ViewerProps) {
  return (
    <div
      className={cn(
        "relative h-56 w-full overflow-hidden rounded-md border border-sky-500/35 bg-sky-950/20 dark:bg-sky-950/40",
        className,
      )}
    >
      <Suspense fallback={<LoadingFallback />}>
        <MujocoCartPendulumScene
          positionCm={positionCm}
          encoderTicks={encoderTicks}
          connected={connected}
        />
      </Suspense>
    </div>
  );
});
