import { memo, useMemo } from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import type { TuningSample } from "@/lib/tuningMath";
import {
  buildTuningChartRows,
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
} from "@/components/ui/chart";

const chartConfig = {
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

type TuningRecordChartProps = {
  samples: TuningSample[];
  recording?: boolean;
};

type MiniChartProps = {
  data: ReturnType<typeof buildTuningChartRows>;
  keys: (keyof typeof chartConfig)[];
  showTimeAxis?: boolean;
  heightClass?: string;
};

function MiniLineChart({ data, keys, showTimeAxis = false, heightClass = "h-[7rem]" }: MiniChartProps) {
  return (
    <ChartContainer config={chartConfig} className={`w-full ${heightClass}`}>
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
        <YAxis tickLine={false} axisLine={false} tickMargin={4} width={44} tickFormatter={(v) => String(v)} />
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
        {keys.length > 1 ? (
          <ChartLegend content={<ChartLegendContent />} />
        ) : null}
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

export const TuningRecordChart = memo(function TuningRecordChart({
  samples,
  recording = false,
}: TuningRecordChartProps) {
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
      <MiniLineChart data={data} keys={["commandedRpm"]} />
      <MiniLineChart data={data} keys={["realMotorCm", "simMotorCm"]} />
      <MiniLineChart data={data} keys={["realEncoderTicks", "simEncoderTicks"]} showTimeAxis />
      <p className="text-muted-foreground text-[10px]">
        {samples.length.toLocaleString()} samples
        {samples.length > TUNING_CHART_MAX_POINTS ? " (downsampled for display)" : ""}
        {recording ? " · updating while recording" : ""}
      </p>
    </div>
  );
});
