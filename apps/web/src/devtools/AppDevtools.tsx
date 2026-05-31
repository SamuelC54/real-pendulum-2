import { TanStackDevtools } from "@tanstack/react-devtools";
import { ReactQueryDevtoolsPanel } from "@tanstack/react-query-devtools";
import { RailMachineStateDevtoolsPanel } from "./RailMachineStatePanel";

export function AppDevtools() {
  if (!import.meta.env.DEV) return null;

  return (
    <TanStackDevtools
      plugins={[
        {
          name: "RailMachineState",
          render: <RailMachineStateDevtoolsPanel />,
        },
        {
          name: "TanStack Query",
          render: <ReactQueryDevtoolsPanel />,
        },
      ]}
    />
  );
}
