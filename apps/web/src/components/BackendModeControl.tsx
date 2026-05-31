import { useQueryClient } from "@tanstack/react-query";
import { useAtom } from "jotai";
import { cn } from "@/lib/utils";
import { grpcBackendModeAtom, type GrpcBackendMode } from "@/stores/grpcBackendMode";
import { trpc } from "@/trpc";

export function BackendModeControl() {
  const [mode, setMode] = useAtom(grpcBackendModeAtom);
  const queryClient = useQueryClient();
  const { data: backends } = trpc.meta.backends.useQuery();

  const onChange = (next: GrpcBackendMode) => {
    setMode(next);
    void queryClient.invalidateQueries();
  };

  const simTitle = backends?.physicsSimUrl
    ? `Plant at ${backends.physicsSimUrl} (simulation + controller-service)`
    : undefined;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-1.5 text-[11px] shadow-sm",
        mode === "sim" && "border-amber-500/40 bg-amber-500/5",
        mode === "twin" && "border-sky-500/40 bg-sky-500/5",
      )}
    >
      <span className="font-medium text-muted-foreground">Backend</span>
      <select
        id="rp-backend-mode"
        aria-label="Motor and sensor gRPC backend"
        className="max-w-44 cursor-pointer rounded border border-input bg-background px-1.5 py-0.5 text-[11px] font-medium text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
        value={mode}
        onChange={(e) => onChange(e.target.value as GrpcBackendMode)}
      >
        <option value="hardware">Hardware (MOTOR_GRPC_URL)</option>
        <option value="sim" title={simTitle}>
          Simulator
        </option>
        <option value="twin" title={simTitle}>
          Twin (hardware + sim)
        </option>
      </select>
      {mode === "sim" ? (
        <span className="rounded bg-amber-500/20 px-1.5 py-0.5 font-semibold text-amber-900 dark:text-amber-200">
          SIM
        </span>
      ) : null}
      {mode === "twin" ? (
        <span
          className="max-w-[11rem] rounded bg-sky-500/20 px-1.5 py-0.5 text-[10px] font-semibold leading-tight text-sky-900 dark:text-sky-200"
          title="Requires simulation (npm run dev). Hardware still connects if the plant is down."
        >
          TWIN
        </span>
      ) : null}
    </div>
  );
}
