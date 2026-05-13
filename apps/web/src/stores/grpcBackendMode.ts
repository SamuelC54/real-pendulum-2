import { atomWithStorage } from "jotai/utils";

/** Matches **`x-pendulum-backend`** on control-api (motor + sensor gRPC targets). */
export type GrpcBackendMode = "hardware" | "sim";

export const grpcBackendModeAtom = atomWithStorage<GrpcBackendMode>("rp-grpc-backend", "hardware");
