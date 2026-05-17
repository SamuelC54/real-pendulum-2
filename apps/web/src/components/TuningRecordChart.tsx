import { memo, useMemo } from "react";
import type { TuningErrorWeights } from "@/lib/tuningMath";
import type { TuningSample } from "@/lib/tuningMath";
import {
  buildTuningChartRows,
  buildTuningErrorChartRows,
  formatChartTime,
  TUNING_CHART_MAX_POINTS,
} from "@/lib/tuningRecordChartData";
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "@/components/ui/line-chart";

const traceChartConfig = {
  commandedRpm: {
    label: "Command RPM",
    color: "var(--chart-1)",
  },
  realMotorCm: {
    label: "Real motor (cm)",
    color: "var(--chart-2)",
  },
  simMotorCm: {
    label: "Sim motor (cm)",
    color: "var(--chart-3)",
  },
  realEncoderTicks: {
    label: "Real encoder (ticks)",
    color: "var(--chart-4)",
  },
  simEncoderTicks: {
    label: "Sim encoder (ticks)",
    color: "var(--chart-5)",
  },
} satisfies ChartConfig;

const errorChartConfig = {
  absPositionCm: {
    label: "|Δ position| (cm)",
    color: "var(--chart-2)",
  },
  absEncoderTicks: {
    label: "|Δ encoder| (ticks)",
    color: "var(--chart-4)",
  },
  weightedScore: {
    label: "Weighted score",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

type TraceKey = keyof typeof traceChartConfig;
type ErrorKey = keyof typeof errorChartConfig;

function TraceLineChart({
  data,
  keys,
  showTimeAxis = false,
  heightClass = "h-[7rem]",
}: {
  data: ReturnType<typeof buildTuningChartRows>;
  keys: TraceKey[];
  showTimeAxis?: boolean;
  heightClass?: string;
}) {
  return (
    <ChartContainer config={traceChartConfig} className={`aspect-auto w-full ${heightClass}`}>
      <LineChart data={data} margin={{ left: 4, right: 8, top: 4, bottom: showTimeAxis ? 0 : 4 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="tSec"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          hide={!showTimeAxis}
          tickFormatter={formatChartTime}
        />
        <YAxis tickLine={false} axisLine={false} tickMargin={4} width={44} />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(_, payload) => {
                const t = payload?.[0]?.payload?.tSec;
                return typeof t === "number" ? formatChartTime(t) : "";
              }}
            />
          }
        />
        {keys.length > 1 ? <ChartLegend content={<ChartLegendContent />} /> : null}
        {keys.map((key) => (
          <Line
            key={key}
            type="monotone"
            dataKey={key}
            stroke={`var(--color-${key})`}
            strokeWidth={2}
            dot={false}
            connectNulls={false}
            strokeDasharray={key.startsWith("sim") ? "5 4" : undefined}
          />
        ))}
      </LineChart>
    </ChartContainer>
  );
}

function ErrorLineChart({
  data,
  keys,
  heightClass = "h-[8rem]",
}: {
  data: ReturnType<typeof buildTuningErrorChartRows>;
  keys: ErrorKey[];
  heightClass?: string;
}) {
  return (
    <ChartContainer config={errorChartConfig} className={`aspect-auto w-full ${heightClass}`}>
      <LineChart data={data} margin={{ left: 4, right: 8, top: 4, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="tSec"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          tickFormatter={formatChartTime}
        />
        <YAxis tickLine={false} axisLine={false} tickMargin={4} width={44} />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(_, payload) => {
                const t = payload?.[0]?.payload?.tSec;
                return typeof t === "number" ? formatChartTime(t) : "";
              }}
            />
          }
        />
        {keys.length > 1 ? <ChartLegend content={<ChartLegendContent />} /> : null}
        {keys.map((key) => (
          <Line
            key={key}
            type="monotone"
            dataKey={key}
            stroke={`var(--color-${key})`}
            strokeWidth={2}
            dot={false}
            connectNulls={false}
          />
        ))}
      </LineChart>
    </ChartContainer>
  );
}

export const TuningRecordChart = memo(function TuningRecordChart({
  samples,
  recording = false,
}: {
  samples: TuningSample[];
  recording?: boolean;
}) {
  const data = useMemo(() => buildTuningChartRows(samples), [samples]);

  if (data.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-xs">
        Record a trace to plot command RPM, cart position, and encoder ticks over time.
      </p>
    );
  }

  return (
    <div className="space-y-3" role="img" aria-label="Recorded tuning signals over time">
      <TraceLineChart data={data} keys={["commandedRpm"]} />
      <TraceLineChart data={data} keys={["realMotorCm", "simMotorCm"]} />
      <TraceLineChart data={data} keys={["realEncoderTicks", "simEncoderTicks"]} showTimeAxis />
      <p className="text-muted-foreground text-[10px]">
        {samples.length.toLocaleString()} samples
        {samples.length > TUNING_CHART_MAX_POINTS ? " (downsampled for display)" : ""}
        {recording ? " · updating while recording" : ""}
      </p>
    </div>
  );
});

export const TuningErrorChart = memo(function TuningErrorChart({
  samples,
  weights,
}: {
  samples: TuningSample[];
  weights: TuningErrorWeights;
}) {
  const data = useMemo(() => buildTuningErrorChartRows(samples, weights), [samples, weights]);

  if (data.length === 0) {
    return (
      <p className="text-muted-foreground py-6 text-center text-xs">
        Record a trace to plot twin error over time.
      </p>
    );
  }

  return (
    <div className="space-y-3" role="img" aria-label="Recorded tuning error over time">
      <ErrorLineChart data={data} keys={["absPositionCm", "absEncoderTicks"]} />
      <ErrorLineChart data={data} keys={["weightedScore"]} heightClass="h-[6rem]" />
    </div>
  );
});
