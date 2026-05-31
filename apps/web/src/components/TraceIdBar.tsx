import { ExternalLink } from "lucide-react";
import { useAtomValue } from "jotai";
import { jaegerTraceUrl } from "@real-pendulum/app-config";
import { trpc } from "@/trpc";
import { lastTraceIdAtom } from "@/stores/lastTraceId";

export function TraceIdBar() {
  const traceId = useAtomValue(lastTraceIdAtom);
  const { data: tracing } = trpc.meta.tracing.useQuery(undefined, {
    staleTime: 60_000,
  });

  if (!traceId) return null;

  const jaegerUrl = tracing?.jaegerUiUrl
    ? `${tracing.jaegerUiUrl.replace(/\/$/, "")}/trace/${traceId}`
    : jaegerTraceUrl(traceId);

  return (
    <div className="bg-muted/60 border-border fixed bottom-3 right-3 z-50 flex max-w-md items-center gap-2 rounded-md border px-3 py-1.5 text-[11px] shadow-sm backdrop-blur-sm">
      <span className="text-muted-foreground shrink-0">Trace</span>
      <code className="truncate font-mono text-[10px]" title={traceId}>
        {traceId}
      </code>
      <a
        href={jaegerUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary inline-flex shrink-0 items-center gap-0.5 font-medium hover:underline"
      >
        Jaeger
        <ExternalLink aria-hidden className="h-3 w-3" />
      </a>
    </div>
  );
}
