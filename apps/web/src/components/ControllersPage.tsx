import { useMemo, useState } from "react";
import { useAtomValue } from "jotai";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { grpcBackendModeAtom } from "@/stores/grpcBackendMode";
import { trpc } from "@/trpc";
import { useMotorStatusQuery, useTwinLinkageStatus } from "@/services/useMotorStatusQuery";

function ParamField({
  label,
  description,
  value,
  onChange,
  disabled,
}: {
  label: string;
  description?: string;
  value: number;
  onChange: (v: number) => void;
  disabled: boolean;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="text-muted-foreground font-medium">{label}</span>
      {description ? (
        <span className="text-muted-foreground/80 text-[10px] leading-snug">{description}</span>
      ) : null}
      <input
        type="number"
        className="border-input bg-background rounded-md border px-2 py-1.5 font-mono text-sm"
        value={Number.isFinite(value) ? value : 0}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

export function ControllersPage() {
  const mode = useAtomValue(grpcBackendModeAtom);
  const motor = useMotorStatusQuery();
  const twinLinkage = useTwinLinkageStatus();
  const connected = motor.data?.connected ?? false;
  const twinMode = mode === "twin";
  const twinReady =
    twinLinkage.motorHardware && twinLinkage.motorSim;

  const listQuery = trpc.controllers.list.useQuery(undefined, { retry: 1 });
  const statusQuery = trpc.controllers.status.useQuery(undefined, {
    refetchInterval: (q) => (q.state.data?.active ? 400 : 2000),
  });

  const start = trpc.controllers.start.useMutation({
    onSuccess: () => void statusQuery.refetch(),
  });
  const stop = trpc.controllers.stop.useMutation({
    onSuccess: () => void statusQuery.refetch(),
  });

  const controllers = listQuery.data ?? [];
  const active = statusQuery.data?.active === true;
  const activeId = statusQuery.data?.id;
  const busy = start.isPending || stop.isPending;

  const [paramsById, setParamsById] = useState<Record<string, Record<string, number>>>({});

  const paramsFor = useMemo(() => {
    return (id: string, defaults: Record<string, number>) => {
      const saved = paramsById[id];
      if (saved) return { ...defaults, ...saved };
      return { ...defaults };
    };
  }, [paramsById]);

  const setParam = (controllerId: string, key: string, value: number, defaults: Record<string, number>) => {
    setParamsById((prev) => ({
      ...prev,
      [controllerId]: { ...defaults, ...prev[controllerId], [key]: value },
    }));
  };

  const canRun =
    !active &&
    !busy &&
    (twinMode ? twinReady : connected);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-lg font-semibold tracking-tight">Controllers</h1>
        <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
          Automated rail routines written in Python (one file per controller under{" "}
          <code className="text-xs">packages/rail-controllers/</code>). The control API
          polls your controller and issues absolute position moves on the motor (and on the MuJoCo
          twin when backend is Twin).
        </p>
      </header>

      {twinMode && !twinReady ? (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-100">
          Connect both <strong>hardware</strong> and <strong>sim</strong> motor on the Control tab
          (twin mode moves Teknic and the MuJoCo cart together).
        </p>
      ) : null}

      <p className="text-muted-foreground max-w-2xl text-xs leading-relaxed">
        <strong className="text-foreground font-medium">LQR balance</strong> also needs the sensor
        board connected (pendulum encoder). Stop the controller with the banner Stop when finished.
      </p>

      {!twinMode && !connected ? (
        <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
          Connect the motor on the Control tab before starting a controller.
        </p>
      ) : null}

      {listQuery.error ? (
        <p className="text-destructive text-sm">
          Cannot load controllers: {listQuery.error.message}. Ensure simulation is running.
        </p>
      ) : null}

      {statusQuery.data?.error ? (
        <p className="text-destructive text-sm">{statusQuery.data.error}</p>
      ) : null}

      {active ? (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm"
          role="status"
        >
          <p>
            Running: <strong>{statusQuery.data?.name ?? activeId ?? "controller"}</strong>
            {statusQuery.data?.stepCount != null ? (
              <span className="text-muted-foreground ml-2">({statusQuery.data.stepCount} ticks)</span>
            ) : null}
          </p>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={busy}
            onClick={() => void stop.mutateAsync()}
          >
            Stop
          </Button>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {controllers.map((c) => {
          const defaults = c.defaultParams;
          const params = paramsFor(c.id, defaults);
          const isThisActive = active && activeId === c.id;
          const paramKeys =
            c.paramOrder?.filter((k) => k in defaults) ??
            Object.keys(defaults);
          const paramLabels = c.paramLabels ?? {};
          const paramDescriptions = c.paramDescriptions ?? {};

          return (
            <Card key={c.id} className="flex flex-col gap-4 p-5">
              <div>
                <h2 className="font-medium">{c.name}</h2>
                <p className="text-muted-foreground mt-1 text-sm leading-relaxed">{c.description}</p>
                <p className="text-muted-foreground mt-2 font-mono text-[10px]">controllers/{c.id}.py</p>
              </div>

              {paramKeys.length > 0 ? (
                <div className="grid grid-cols-2 gap-3">
                  {paramKeys.map((key) => (
                    <ParamField
                      key={key}
                      label={paramLabels[key] ?? key}
                      description={paramDescriptions[key]}
                      value={params[key] ?? defaults[key] ?? 0}
                      disabled={active || busy}
                      onChange={(v) => setParam(c.id, key, v, defaults)}
                    />
                  ))}
                </div>
              ) : null}

              <div className="flex gap-2">
                {isThisActive ? (
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={busy}
                    onClick={() => void stop.mutateAsync()}
                  >
                    Stop
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    disabled={!canRun || (active && activeId !== c.id)}
                    onClick={() =>
                      void start.mutateAsync({
                        id: c.id,
                        params,
                      })
                    }
                  >
                    Start
                  </Button>
                )}
              </div>

              {start.error && start.variables?.id === c.id ? (
                <p className="text-destructive text-xs">{start.error.message}</p>
              ) : null}
            </Card>
          );
        })}
      </div>

      {controllers.length === 0 && !listQuery.isLoading && !listQuery.error ? (
        <p className="text-muted-foreground text-sm">No controllers found.</p>
      ) : null}
    </div>
  );
}
