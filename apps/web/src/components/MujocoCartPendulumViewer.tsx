import { Grid, OrbitControls, Sky } from "@react-three/drei";
import { memo, Suspense, useEffect, useRef, useState } from "react";
import {
  MujocoCanvas,
  useBeforePhysicsStep,
  useCtrl,
  useMujoco,
  useMujocoWasm,
} from "mujoco-react";
import { encoderTicksPerRadian } from "@/lib/pendulumEncoder";
import { mujocoCartPendulumSceneConfig } from "@/lib/mujocoCartPendulumScene";
import { cn } from "@/lib/utils";

/** MuJoCo Z-up: pendulum swings in X–Z; hinge axis is Y — view from +Y (front). */
const CAMERA_UP: [number, number, number] = [0, 0, 1];
const CAMERA_TARGET: [number, number, number] = [0, 0, -0.06];
const CAMERA_POSITION: [number, number, number] = [0, 1.55, 0.12];

type ViewerProps = {
  /** Cart position along rail (display cm, same sign as motor status). */
  positionCm: number | undefined;
  encoderTicks: number;
  connected: boolean;
  className?: string;
};

/** Drive cart from motor telemetry; pendulum is integrated by MuJoCo (gravity + hinge). */
function CartPendulumPhysicsDriver({
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
  const cartVel = useCtrl("cart_vel");
  const prevSample = useRef<{ xM: number; tSec: number } | null>(null);
  const seeded = useRef(false);

  useEffect(() => {
    if (!enabled) {
      seeded.current = false;
      prevSample.current = null;
    }
  }, [enabled]);

  // Align hinge angle once when connected; after that let physics run.
  useEffect(() => {
    if (!enabled || !sim.isReady || seeded.current) return;
    const theta = encoderTicks / encoderTicksPerRadian();
    const qpos = sim.api.getQpos();
    const qvel = sim.api.getQvel();
    if (qpos.length < 2 || qvel.length < 2) return;
    qpos[1] = theta;
    qvel[1] = 0;
    sim.api.setQpos(qpos);
    sim.api.setQvel(qvel);
    const model = sim.api.mjModelRef.current;
    const data = sim.api.mjDataRef.current;
    if (model && data && mujoco) {
      mujoco.mj_forward(model, data);
    }
    seeded.current = true;
  }, [enabled, encoderTicks, mujoco, sim.api, sim.isReady]);

  useBeforePhysicsStep(() => {
    if (!enabled || !sim.isReady) {
      cartVel.write(0);
      return;
    }

    const xM = positionCm != null && Number.isFinite(positionCm) ? positionCm / 100 : 0;
    const tSec = performance.now() / 1000;
    let vCmd = 0;
    const prev = prevSample.current;
    if (prev) {
      const dt = tSec - prev.tSec;
      if (dt > 1e-4 && dt < 0.35) {
        vCmd = (xM - prev.xM) / dt;
      }
    }
    prevSample.current = { xM, tSec };

    const [vMin, vMax] = cartVel.range;
    cartVel.write(Math.max(vMin, Math.min(vMax, vCmd)));
  });

  return null;
}

/** Z-up floor + procedural sky (MuJoCo coords: rail in XY, gravity −Z). */
function ViewerEnvironment() {
  const floorZ = -0.42;

  return (
    <>
      <Sky
        distance={450000}
        sunPosition={[5, 3, 4]}
        inclination={0.49}
        azimuth={0.22}
        mieCoefficient={0.004}
        mieDirectionalG={0.75}
        rayleigh={0.55}
        turbidity={6}
      />
      <mesh position={[0, 0, floorZ]} receiveShadow>
        <planeGeometry args={[10, 10]} />
        <meshStandardMaterial color="#141b24" roughness={0.92} metalness={0.04} />
      </mesh>
      <Grid
        infiniteGrid
        fadeDistance={10}
        fadeStrength={1.1}
        cellSize={0.1}
        sectionSize={0.5}
        cellColor="#243040"
        sectionColor="#3a4d62"
        position={[0, 0, floorZ + 0.001]}
        rotation={[Math.PI / 2, 0, 0]}
      />
    </>
  );
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
        paused={!connected}
        shadows
        style={{ width: "100%", height: "100%" }}
        camera={{
          position: CAMERA_POSITION,
          up: CAMERA_UP,
          fov: 42,
          near: 0.01,
          far: 20,
        }}
        onError={(err) => setLoadError(err.message)}
      >
        <ViewerEnvironment />
        <ambientLight intensity={0.35} />
        <directionalLight
          position={[1.2, 2.5, 3.5]}
          intensity={1.15}
          castShadow
          shadow-mapSize={[1024, 1024]}
          shadow-camera-far={12}
          shadow-camera-left={-3}
          shadow-camera-right={3}
          shadow-camera-top={3}
          shadow-camera-bottom={-3}
        />
        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.08}
          target={CAMERA_TARGET}
          minDistance={0.75}
          maxDistance={3.2}
          minAzimuthAngle={-0.55}
          maxAzimuthAngle={0.55}
          minPolarAngle={1.05}
          maxPolarAngle={1.62}
        />
        <CartPendulumPhysicsDriver
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
 * Cart velocity follows motor position; pendulum swings under gravity in the WASM sim.
 * Encoder angle seeds the hinge on connect only (may drift from coupled-sim ticks).
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
