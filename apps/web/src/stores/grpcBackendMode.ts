import { atomWithStorage, createJSONStorage } from "jotai/utils";

/** Matches **`x-pendulum-backend`** on control-api (motor + sensor gRPC targets). */
export type GrpcBackendMode = "hardware" | "sim" | "twin";

const MODES: GrpcBackendMode[] = ["hardware", "sim", "twin"];

function normalizeGrpcBackendMode(raw: unknown): GrpcBackendMode {
  if (typeof raw === "string" && (MODES as string[]).includes(raw)) {
    return raw as GrpcBackendMode;
  }
  return "hardware";
}

const grpcBackendStorage = createJSONStorage<GrpcBackendMode>(() => localStorage);

export const grpcBackendModeAtom = atomWithStorage<GrpcBackendMode>(
  "rp-grpc-backend",
  "hardware",
  {
    ...grpcBackendStorage,
    getItem: (key, initialValue) =>
      normalizeGrpcBackendMode(grpcBackendStorage.getItem(key, initialValue)),
  },
);
