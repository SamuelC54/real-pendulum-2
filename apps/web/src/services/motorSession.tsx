import { createContext, useCallback, useContext, useMemo, useRef, type ReactNode } from "react";
import { useSetAtom } from "jotai";
import { jogRpmForDirection } from "@/lib/jogMath";
import { holdingAtom, type JogHold } from "@/stores/jog";
import { useConnectMotorMutation } from "./useConnectMotorMutation";
import { useDisconnectMotorMutation } from "./useDisconnectMotorMutation";
import { useJogSetVelocityMutation } from "./useJogSetVelocityMutation";
import { useJogStopMutation } from "./useJogStopMutation";
import { useMotorStatusQuery } from "./useMotorStatusQuery";

export type MotorSessionValue = {
  status: ReturnType<typeof useMotorStatusQuery>;
  connect: ReturnType<typeof useConnectMotorMutation>;
  disconnect: ReturnType<typeof useDisconnectMotorMutation>;
  setVelocity: ReturnType<typeof useJogSetVelocityMutation>;
  stop: ReturnType<typeof useJogStopMutation>;
  connected: boolean;
  busy: boolean;
  applyHold: (dir: JogHold) => void | Promise<void>;
  connectMotor: () => Promise<void>;
  disconnectMotor: () => Promise<void>;
};

export const MotorSessionContext = createContext<MotorSessionValue | null>(null);

export function MotorSessionProvider({ children }: { children: ReactNode }) {
  const status = useMotorStatusQuery();
  const connect = useConnectMotorMutation();
  const disconnect = useDisconnectMotorMutation();
  const setVelocity = useJogSetVelocityMutation();
  const stop = useJogStopMutation();
  const setHolding = useSetAtom(holdingAtom);

  const refetchStatus = status.refetch;
  const connected = status.data?.connected ?? false;
  const connectedRef = useRef(connected);
  connectedRef.current = connected;

  const busy =
    connect.isPending || disconnect.isPending || setVelocity.isPending || stop.isPending;

  const applyHold = useCallback(
    async (dir: JogHold) => {
      if (!connectedRef.current && dir) return;
      setHolding(dir);
      if (!dir) {
        await stop.mutateAsync();
        await refetchStatus();
        return;
      }
      await setVelocity.mutateAsync({ rpm: jogRpmForDirection(dir) });
      await refetchStatus();
    },
    [setHolding, stop, setVelocity, refetchStatus],
  );

  const connectMotor = useCallback(async () => {
    connect.reset();
    const r = await connect.mutateAsync();
    await refetchStatus();
    if (!r.ok && r.error) {
      console.warn("[jog] connect failed:", r.error);
    }
  }, [connect, refetchStatus]);

  const disconnectMotor = useCallback(async () => {
    setHolding(null);
    await disconnect.mutateAsync();
    await refetchStatus();
  }, [disconnect, refetchStatus, setHolding]);

  const value = useMemo<MotorSessionValue>(
    () => ({
      status,
      connect,
      disconnect,
      setVelocity,
      stop,
      connected,
      busy,
      applyHold,
      connectMotor,
      disconnectMotor,
    }),
    [
      status,
      connect,
      disconnect,
      setVelocity,
      stop,
      connected,
      busy,
      applyHold,
      connectMotor,
      disconnectMotor,
    ],
  );

  return <MotorSessionContext.Provider value={value}>{children}</MotorSessionContext.Provider>;
}

export function useMotorSession(): MotorSessionValue {
  const ctx = useContext(MotorSessionContext);
  if (!ctx) {
    throw new Error("useMotorSession must be used within <MotorSessionProvider>");
  }
  return ctx;
}
