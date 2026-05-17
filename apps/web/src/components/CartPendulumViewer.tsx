import { Grid, OrbitControls, Sky } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { memo } from "react";
import { encoderTicksPerRadian } from "@/lib/pendulumEncoder";
import { cn } from "@/lib/utils";

/** Match default `apps/physics-sim/models/cart_pendulum.xml` rod length. */
const PENDULUM_LENGTH_M = 0.35;
const CART_Z_M = 0.05;
const BOB_RADIUS_M = 0.03;
const ROD_RADIUS_M = 0.004;

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
  /** `fill` expands to the parent height (Digital Twin page). */
  variant?: "compact" | "fill";
};

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

/** Rail + cart + pendulum rig (poses mirror physics-sim / coupled-sim telemetry). */
function CartPendulumRig({ xM, thetaRad }: { xM: number; thetaRad: number }) {
  return (
    <group position={[xM, 0, 0]}>
      <mesh position={[0, 0, CART_Z_M]} castShadow receiveShadow>
        <boxGeometry args={[0.12, 0.08, 0.06]} />
        <meshStandardMaterial color="#8b95a8" metalness={0.15} roughness={0.55} />
      </mesh>
      <group position={[0, 0, CART_Z_M]} rotation={[0, thetaRad, 0]}>
        <mesh
          position={[0, 0, -PENDULUM_LENGTH_M / 2]}
          rotation={[Math.PI / 2, 0, 0]}
          castShadow
        >
          <cylinderGeometry args={[ROD_RADIUS_M, ROD_RADIUS_M, PENDULUM_LENGTH_M, 8]} />
          <meshStandardMaterial color="#9aa3b2" metalness={0.2} roughness={0.45} />
        </mesh>
        <mesh position={[0, 0, -PENDULUM_LENGTH_M]} castShadow>
          <sphereGeometry args={[BOB_RADIUS_M, 20, 20]} />
          <meshStandardMaterial color="#6b9fd4" metalness={0.25} roughness={0.35} />
        </mesh>
      </group>
    </group>
  );
}

function CartPendulumScene({
  positionCm,
  encoderTicks,
}: Pick<ViewerProps, "positionCm" | "encoderTicks">) {
  const xM = positionCm != null && Number.isFinite(positionCm) ? positionCm / 100 : 0;
  const thetaRad = encoderTicks / encoderTicksPerRadian();

  return (
    <>
      <ViewerEnvironment />
      <mesh position={[0, 0, 0]} receiveShadow>
        <boxGeometry args={[4, 0.04, 0.02]} />
        <meshStandardMaterial color="#4a5568" metalness={0.1} roughness={0.8} />
      </mesh>
      <CartPendulumRig xM={xM} thetaRad={thetaRad} />
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
    </>
  );
}

/**
 * Three.js view of the cart–pendulum (drei + R3F).
 * Pose is driven from motor/encoder telemetry; physics runs in physics-sim only.
 */
export const CartPendulumViewer = memo(function CartPendulumViewer({
  positionCm,
  encoderTicks,
  connected,
  className,
  variant = "compact",
}: ViewerProps) {
  return (
    <div
      className={cn(
        "relative w-full overflow-hidden rounded-md border border-sky-500/35 bg-sky-950/20 dark:bg-sky-950/40",
        variant === "fill"
          ? "h-full min-h-[min(68vh,40rem)]"
          : "h-56",
        className,
      )}
    >
      <Canvas
        shadows
        style={{ width: "100%", height: "100%" }}
        camera={{
          position: CAMERA_POSITION,
          up: CAMERA_UP,
          fov: 42,
          near: 0.01,
          far: 20,
        }}
      >
        <CartPendulumScene positionCm={positionCm} encoderTicks={encoderTicks} />
      </Canvas>
      {!connected ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/70 text-muted-foreground text-xs">
          Connect simulator to mirror live state
        </div>
      ) : null}
    </div>
  );
});
