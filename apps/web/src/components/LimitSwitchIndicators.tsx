type LimitSwitchIndicatorsProps = {
  leftPressed: boolean;
  rightPressed: boolean;
};

/**
 * Limit switches on Arduino **D4** (left) and **D5** (right), INPUT_PULLUP — **`1`** in **`LIM:`** line means pressed (LOW).
 */
export function LimitSwitchIndicators({
  leftPressed,
  rightPressed,
}: LimitSwitchIndicatorsProps) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
      <span className="text-muted-foreground text-xs font-medium">Limit switches</span>
      <div className="grid grid-cols-2 gap-4 sm:gap-8">
        <LimitColumn
          label="Left"
          pin="D4"
          pressed={leftPressed}
        />
        <LimitColumn
          label="Right"
          pin="D5"
          pressed={rightPressed}
        />
      </div>
    </div>
  );
}

function LimitColumn({
  label,
  pin,
  pressed,
}: {
  label: string;
  pin: string;
  pressed: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5 text-center">
      <div className="flex items-center justify-center gap-2">
        <span
          className={`h-2.5 w-2.5 shrink-0 rounded-full ${
            pressed ? "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]" : "bg-muted-foreground/25"
          }`}
          aria-hidden
        />
        <span className="text-foreground text-sm font-medium">{label}</span>
      </div>
      <code className="text-muted-foreground inline-block min-w-[2rem] rounded border border-border bg-background px-2 py-0.5 text-center font-mono text-[11px] leading-none">
        {pin}
      </code>
      <span
        className={`text-xs ${pressed ? "font-medium text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}
      >
        {pressed ? "Pressed" : "Open"}
      </span>
    </div>
  );
}
