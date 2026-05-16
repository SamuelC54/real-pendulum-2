import "mujoco-react";

declare module "mujoco-react" {
  interface Register {
    actuators: "cart_vel";
    joints: "cart_slide" | "pendulum_hinge";
    bodies: "cart" | "pendulum" | "world";
    geoms: "rail" | "cart_geom" | "rod" | "bob";
  }
}
