import { ExternalLink } from "lucide-react";
import { Card } from "@/components/ui/card";
import { trpc } from "@/trpc";

export function SystemArchitecturePage() {
  const { data: backends, isLoading, error } = trpc.meta.backends.useQuery();
  const mapUrl = backends?.jaegerDependenciesUrl ?? "/jaeger/dependencies";
  const jaegerOpenUrl = mapUrl.startsWith("/")
    ? `${typeof window !== "undefined" ? window.location.origin : "http://127.0.0.1:5173"}${mapUrl}`
    : mapUrl;

  return (
    <div className="flex min-h-[calc(100dvh-7rem)] flex-col gap-4">
      <Card className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-medium">System architecture</h2>
            <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
              Jaeger service dependency graph from OpenTelemetry traces. Generate traffic in the
              Control tab, then refresh this view.
            </p>
          </div>
          <a
            href={jaegerOpenUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary inline-flex items-center gap-1 text-xs font-medium hover:underline"
          >
            Open in Jaeger
            <ExternalLink aria-hidden className="h-3.5 w-3.5" />
          </a>
        </div>
        {isLoading ? (
          <p className="text-muted-foreground text-xs">Loading map URL…</p>
        ) : null}
        {error ? (
          <p className="text-destructive text-xs">{error.message}</p>
        ) : null}
        <p className="text-muted-foreground text-[10px]">
          Embed: <span className="font-mono text-foreground">{mapUrl}</span>
          {" · "}
          Direct:{" "}
          <span className="font-mono text-foreground">http://127.0.0.1:16686/dependencies</span>
        </p>
      </Card>
      <iframe
        title="Jaeger service dependencies"
        src={mapUrl}
        className="min-h-[32rem] flex-1 rounded-lg border border-border bg-background shadow-sm"
      />
    </div>
  );
}
