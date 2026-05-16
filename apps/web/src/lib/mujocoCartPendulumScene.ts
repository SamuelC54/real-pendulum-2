import type { SceneConfig } from "mujoco-react";

/** Same MJCF as `apps/physics-sim/models/cart_pendulum.xml` (served from `/mujoco/`). */
export function mujocoCartPendulumSceneConfig(): SceneConfig {
  const base =
    typeof window !== "undefined"
      ? `${window.location.origin}/mujoco/`
      : "/mujoco/";
  return {
    src: base,
    sceneFile: "cart_pendulum.xml",
    homeJoints: [0, 0],
  };
}
