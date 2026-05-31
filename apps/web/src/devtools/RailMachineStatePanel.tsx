import { useAtomValue } from "jotai";
import { trpc } from "@/trpc";
import { controlBackendModeAtom } from "@/stores/controlBackendMode";

export function RailMachineStateDevtoolsPanel() {
  const mode = useAtomValue(controlBackendModeAtom);
  const { data, isFetching, error } = trpc.machine.state.get.useQuery(undefined, {
    refetchInterval: 500,
  });

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-3 text-xs">
      <div className="text-muted-foreground flex flex-wrap items-center gap-2">
        <span>
          Backend: <strong className="text-foreground">{mode}</strong>
        </span>
        {isFetching ? <span>refreshing…</span> : null}
        {error ? <span className="text-destructive">{error.message}</span> : null}
      </div>
      <pre className="bg-muted/40 min-h-0 flex-1 overflow-auto rounded-md border border-border p-2 font-mono text-[11px] leading-relaxed">
        {JSON.stringify(data ?? null, null, 2)}
      </pre>
    </div>
  );
}
