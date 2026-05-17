import { useMemo, useState } from "react";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "@/components/ui/line-chart";
import { trpc } from "@/trpc";

const chartConfig = {
  meanReward: { label: "Mean episode reward", color: "var(--chart-1)" },
} satisfies ChartConfig;

function fmt(n: number | null | undefined, digits = 0): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toFixed(digits);
}

export function RlPage() {
  const [totalTimesteps, setTotalTimesteps] = useState(200_000);
  const [saveEvery, setSaveEvery] = useState(10_000);
  const [generation, setGeneration] = useState<number | "latest">("latest");

  const statusQuery = trpc.rl.status.useQuery(undefined, {
    refetchInterval: (q) => {
      const d = q.state.data;
      if (d?.training.active || d?.inference.active) return 500;
      return 3000;
    },
  });

  const trainStart = trpc.rl.training.start.useMutation({
    onSuccess: () => void statusQuery.refetch(),
  });
  const trainStop = trpc.rl.training.stop.useMutation({
    onSuccess: () => void statusQuery.refetch(),
  });
  const inferStart = trpc.rl.inference.start.useMutation({
    onSuccess: () => void statusQuery.refetch(),
  });
  const inferStop = trpc.rl.inference.stop.useMutation({
    onSuccess: () => void statusQuery.refetch(),
  });

  const status = statusQuery.data;
  const training = status?.training;
  const inference = status?.inference;
  const generations = status?.generations ?? [];

  const selectedGen = useMemo(() => {
    if (generation === "latest") {
      return generations.length > 0 ? generations[generations.length - 1]! : null;
    }
    return generation;
  }, [generation, generations]);

  const chartData = useMemo(
    () =>
      (status?.metrics ?? []).map((m) => ({
        timesteps: m.timesteps,
        meanReward: m.meanReward,
        generation: m.generation,
      })),
    [status?.metrics],
  );

  const progressPct =
    training?.active && training.totalTimesteps > 0
      ? Math.min(100, (training.timesteps / training.totalTimesteps) * 100)
      : null;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-lg font-semibold tracking-tight">RL training (MuJoCo)</h1>
        <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
          Train a PPO policy in physics-sim, watch mean episode reward over time, then run a saved
          generation on the live plant. Connect the simulator on the Control tab so the 3D twin
          follows the AI.
        </p>
      </header>

      {statusQuery.error ? (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-100">
          Cannot reach RL API: {statusQuery.error.message}. Install{" "}
          <code className="text-xs">pip install -r apps/physics-sim/requirements-rl.txt</code> and
          restart physics-sim.
        </p>
      ) : null}

      <section className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <h2 className="text-sm font-medium">Training</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">Total timesteps</span>
              <input
                type="number"
                min={10000}
                step={10000}
                value={totalTimesteps}
                disabled={training?.active}
                onChange={(e) => setTotalTimesteps(Number(e.target.value))}
                className="border-input bg-background h-9 rounded-md border px-2 font-mono text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">Save generation every</span>
              <input
                type="number"
                min={1000}
                step={1000}
                value={saveEvery}
                disabled={training?.active}
                onChange={(e) => setSaveEvery(Number(e.target.value))}
                className="border-input bg-background h-9 rounded-md border px-2 font-mono text-sm"
              />
            </label>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={training?.active || trainStart.isPending || !!inference?.active}
              onClick={() => trainStart.mutate({ totalTimesteps, saveEvery })}
              className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              Start training
            </button>
            <button
              type="button"
              disabled={!training?.active || trainStop.isPending}
              onClick={() => trainStop.mutate()}
              className="rounded-md border border-border bg-muted/50 px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
            >
              Stop training
            </button>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-2 font-mono text-xs tabular-nums">
            <div>
              <dt className="text-muted-foreground">Status</dt>
              <dd>{training?.active ? "Running" : "Idle"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Timesteps</dt>
              <dd>
                {fmt(training?.timesteps)} / {fmt(training?.totalTimesteps)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Latest generation</dt>
              <dd>{training?.latestGeneration ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Saved runs</dt>
              <dd>{generations.length}</dd>
            </div>
          </dl>
          {progressPct != null ? (
            <div className="mt-3">
              <div className="bg-muted h-2 overflow-hidden rounded-full">
                <div className="bg-primary h-full transition-all" style={{ width: `${progressPct}%` }} />
              </div>
              <p className="text-muted-foreground mt-1 text-xs tabular-nums">{progressPct.toFixed(0)}%</p>
            </div>
          ) : null}
          {training?.error ? (
            <p className="mt-2 text-xs text-red-600 dark:text-red-400">{training.error}</p>
          ) : null}
        </div>

        <div className="rounded-lg border border-sky-500/30 bg-sky-500/5 p-4 shadow-sm dark:bg-sky-500/10">
          <h2 className="text-sm font-medium text-sky-950 dark:text-sky-100">Run AI on simulator</h2>
          <p className="text-muted-foreground mt-1 text-xs">
            Loads a checkpoint and drives the live MuJoCo plant (30 Hz). On Control, connect{" "}
            <strong className="text-foreground font-medium">Sim</strong> motor + sensor so status
            polls show commanded RPM and the digital twin updates. Checkpoints trained before
            swing-up reward shaping may sit near 0 RPM — train a new generation after updating
            physics-sim.
          </p>
          <label className="mt-3 flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">Generation</span>
            <select
              value={generation === "latest" ? "latest" : String(generation)}
              disabled={inference?.active}
              onChange={(e) => {
                const v = e.target.value;
                setGeneration(v === "latest" ? "latest" : Number(v));
              }}
              className="border-input bg-background h-9 rounded-md border px-2 font-mono text-sm"
            >
              <option value="latest">Latest ({generations[generations.length - 1] ?? "none"})</option>
              {generations.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </label>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={selectedGen == null || inference?.active || training?.active || inferStart.isPending}
              onClick={() => selectedGen != null && inferStart.mutate({ generation: selectedGen })}
              className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
            >
              Start AI
            </button>
            <button
              type="button"
              disabled={!inference?.active || inferStop.isPending}
              onClick={() => inferStop.mutate()}
              className="rounded-md border border-sky-500/40 px-4 py-2 text-sm font-medium hover:bg-sky-500/10 disabled:opacity-50"
            >
              Stop AI
            </button>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-2 font-mono text-xs tabular-nums">
            <div>
              <dt className="text-muted-foreground">Status</dt>
              <dd>{inference?.active ? "Running" : "Idle"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">RPM command</dt>
              <dd>{fmt(inference?.rpm, 1)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">v_cmd (m/s)</dt>
              <dd>{fmt(inference?.vCmdMps, 4)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Live score</dt>
              <dd>{fmt(inference?.lastReward, 3)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Steps</dt>
              <dd>{fmt(inference?.stepCount)}</dd>
            </div>
          </dl>
          {inference?.error ? (
            <p className="mt-2 text-xs text-red-600 dark:text-red-400">{inference.error}</p>
          ) : null}
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
        <h2 className="text-sm font-medium">Score over time</h2>
        <p className="text-muted-foreground mt-1 text-xs">
          Mean episode reward per PPO rollout (higher is better for balance).
        </p>
        {chartData.length === 0 ? (
          <p className="text-muted-foreground mt-4 py-16 text-center text-sm">
            Start training to see the learning curve.
          </p>
        ) : (
          <ChartContainer config={chartConfig} className="mt-4 aspect-auto h-[280px] w-full">
            <LineChart data={chartData} margin={{ left: 4, right: 12, top: 8, bottom: 4 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis
                dataKey="timesteps"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`}
              />
              <YAxis tickLine={false} axisLine={false} tickMargin={4} width={48} />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(_, payload) => {
                      const p = payload?.[0]?.payload as {
                        timesteps?: number;
                        generation?: number | null;
                      };
                      const gen =
                        p?.generation != null ? ` · gen ${p.generation}` : "";
                      return p?.timesteps != null
                        ? `${Math.round(p.timesteps / 1000)}k steps${gen}`
                        : "";
                    }}
                  />
                }
              />
              <Line
                type="monotone"
                dataKey="meanReward"
                stroke="var(--color-meanReward)"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ChartContainer>
        )}
      </section>
    </div>
  );
}