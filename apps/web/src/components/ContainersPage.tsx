import { ExternalLink } from "lucide-react";
import { Card } from "@/components/ui/card";
import { trpc } from "@/trpc";

export function ContainersPage() {
  const { data: backends, isLoading, error } = trpc.meta.backends.useQuery();
  const portainerUrl = backends?.portainerUrl ?? "https://127.0.0.1:9443";

  return (
    <div className="flex min-h-[calc(100dvh-7rem)] flex-col gap-4">
      <Card className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-medium">Docker containers</h2>
            <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
              Portainer CE runs with <code className="text-foreground">npm run dev</code>. First
              time: open Portainer in a new tab and accept the self-signed certificate, then reload
              this page if the embed is blank.
            </p>
          </div>
          <a
            href={portainerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary inline-flex items-center gap-1 text-xs font-medium hover:underline"
          >
            Open Portainer
            <ExternalLink aria-hidden className="h-3.5 w-3.5" />
          </a>
        </div>
        {isLoading ? (
          <p className="text-muted-foreground text-xs">Loading Portainer URL…</p>
        ) : null}
        {error ? (
          <p className="text-destructive text-xs">{error.message}</p>
        ) : null}
        <p className="text-muted-foreground text-[10px]">
          URL: <span className="font-mono text-foreground">{portainerUrl}</span>
          {" · "}
          Legacy HTTP: <span className="font-mono text-foreground">http://127.0.0.1:9000</span>
          {" · "}
          Set <code className="text-foreground">PORTAINER_URL</code> on control-api to override.
        </p>
      </Card>
      <iframe
        title="Portainer"
        src={portainerUrl}
        className="min-h-[32rem] flex-1 rounded-lg border border-border bg-background shadow-sm"
        allow="clipboard-read; clipboard-write"
      />
    </div>
  );
}
