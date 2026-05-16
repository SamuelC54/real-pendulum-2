declare module "fmin" {
  export function nelderMead(
    f: (x: number[]) => number,
    x0: number[],
    parameters?: { maxIterations?: number; minErrorDelta?: number },
  ): { x: number[]; fx: number };
}
