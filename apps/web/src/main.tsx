import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Provider } from "jotai";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { MotorSessionProvider } from "./services/motorSession";
import { jotaiStore } from "./stores/jotaiStore";
import { createTrpcClient, trpc } from "./trpc";

const queryClient = new QueryClient();
const trpcClient = createTrpcClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Provider store={jotaiStore}>
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          <MotorSessionProvider>
            <App />
          </MotorSessionProvider>
        </QueryClientProvider>
      </trpc.Provider>
    </Provider>
  </StrictMode>,
);
