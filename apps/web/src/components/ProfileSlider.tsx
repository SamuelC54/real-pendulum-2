import type { ReactNode } from "react";

export function ProfileSlider({
  label,
  labelAddon,
  value,
  onChange,
  min,
  max,
  step,
  disabled,
  suffix,
}: {
  label: string;
  labelAddon?: ReactNode;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
  suffix?: string;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="text-muted-foreground text-xs font-medium">{label}</span>
          {labelAddon}
        </div>
        <span className="font-mono text-sm tabular-nums text-foreground">
          {value}
          {suffix ? (
            <span className="text-muted-foreground ml-1 text-[11px] font-sans">{suffix}</span>
          ) : null}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
        className="accent-primary h-2 w-full cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
      />
    </div>
  );
}
