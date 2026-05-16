import type { ReactNode } from "react";
import { MujocoProvider } from "mujoco-react";

/** Loads mujoco-js WASM once for the whole app (required by mujoco-react). */
export function MujocoProviderRoot({ children }: { children: ReactNode }) {
  return <MujocoProvider>{children}</MujocoProvider>;
}
