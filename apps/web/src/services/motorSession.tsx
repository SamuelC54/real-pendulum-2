import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { useSetAtom } from "jotai";
import { jogRpmForDirection } from "@/lib/jogMath";
import { holdingAtom, type JogHold } from "@/stores/jog";
import { trpc } from "@/trpc";
import { useConnectMotorMutation } from "./useConnectMotorMutation";
import { useDisconnectMotorMutation } from "./useDisconnectMotorMutation";
import { useJogSetVelocityMutation } from "./useJogSetVelocityMutation";
import { useJogStopMutation } from "./useJogStopMutation";
import { useMotorStatusConnected } from "./useMotorStatusQuery";

export type MotorSessionValue = {
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
  const { data: connected = false } = useMotorStatusConnected();
  const utils = trpc.useUtils();
  const connect = useConnectMotorMutation();
  const disconnect = useDisconnectMotorMutation();
  const setVelocity = useJogSetVelocityMutation();
  const stop = useJogStopMutation();
  const setHolding = useSetAtom(holdingAtom);

  const invalidateMotorQueries = useCallback(() => {
    void utils.status.get.invalidate();
    void utils.twin.status.get.invalidate();
  }, [utils]);

  const busy =
    connect.isPending || disconnect.isPending || setVelocity.isPending || stop.isPending;

  const applyHold = useCallback(
    async (dir: JogHold) => {
      if (!connected && dir) return;
      setHolding(dir);
      if (!dir) {
        await stop.mutateAsync();
        invalidateMotorQueries();
        return;
      }
      await setVelocity.mutateAsync({ rpm: jogRpmForDirection(dir) });
      invalidateMotorQueries();
    },
    [connected, setHolding, stop, setVelocity, invalidateMotorQueries],
  );

  const connectMotor = useCallback(async () => {
    connect.reset();
    try {
      const r = await connect.mutateAsync();
      invalidateMotorQueries();
      if ("real" in r) {
        if (!r.real.ok && r.real.error) {
          console.warn("[jog] motor connect (hardware) failed:", r.real.error);
        }
        if (!r.sim.ok && r.sim.error) {
          console.warn("[jog] motor connect (sim) failed:", r.sim.error);
        }
      } else if (!r.ok && r.error) {
        console.warn("[jog] connect failed:", r.error);
      }
    } catch (e) {
      invalidateMotorQueries();
      throw e;
    }
  }, [connect, invalidateMotorQueries]);

  const disconnectMotor = useCallback(async () => {
    setHolding(null);
    await disconnect.mutateAsync();
    invalidateMotorQueries();
  }, [disconnect, setHolding, invalidateMotorQueries]);

  const value = useMemo<MotorSessionValue>(
    () => ({
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
