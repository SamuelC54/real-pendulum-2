import { useQueryClient } from "@tanstack/react-query";
import { useAtom } from "jotai";
import { cn } from "@/lib/utils";
import { controlBackendModeAtom, type ControlBackendMode } from "@/stores/controlBackendMode";
import { trpc } from "@/trpc";

export function BackendModeControl() {
  const [mode, setMode] = useAtom(controlBackendModeAtom);
  const queryClient = useQueryClient();
  const { data: backends } = trpc.meta.backends.useQuery();

  const onChange = (next: ControlBackendMode) => {
    setMode(next);
    void queryClient.invalidateQueries();
  };

  const simulationTitle = backends?.physicsSimUrl
    ? `Plant at ${backends.physicsSimUrl} (simulation + controller-service)`
    : undefined;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-1.5 text-[11px] shadow-sm",
        mode === "simulation" && "border-amber-500/40 bg-amber-500/5",
        mode === "twin" && "border-sky-500/40 bg-sky-500/5",
      )}
    >
      <span className="font-medium text-muted-foreground">Backend</span>
      <select
        id="rp-backend-mode"
        aria-label="Control backend (physical bench, simulation, or twin)"
        className="max-w-44 cursor-pointer rounded border border-input bg-background px-1.5 py-0.5 text-[11px] font-medium text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
        value={mode}
        onChange={(e) => onChange(e.target.value as ControlBackendMode)}
      >
        <option value="physical">Physical bench</option>
        <option value="simulation" title={simulationTitle}>
          Simulation
        </option>
        <option value="twin" title={simulationTitle}>
          Twin (physical + simulation)
        </option>
      </select>
      {mode === "simulation" ? (
        <span className="rounded bg-amber-500/20 px-1.5 py-0.5 font-semibold text-amber-900 dark:text-amber-200">
          SIM
        </span>
      ) : null}
      {mode === "twin" ? (
        <span
          className="max-w-[11rem] rounded bg-sky-500/20 px-1.5 py-0.5 text-[10px] font-semibold leading-tight text-sky-900 dark:text-sky-200"
          title="Requires simulation (npm run dev — Docker stack). Physical bench still connects if the plant is down."
        >
          TWIN
        </span>
      ) : null}
    </div>
  );
}
