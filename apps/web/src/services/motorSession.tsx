import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { jogRpmForDirection, shouldReleaseJogHoldForTravelLimit } from "@/lib/jogMath";
import { holdingAtom, jogAccelRpmPerSecAtom, jogRpmAtom, type JogHold } from "@/stores/jog";
import { trpc } from "@/trpc";
import { useConnectMotorMutation } from "./useConnectMotorMutation";
import { useDisconnectMotorMutation } from "./useDisconnectMotorMutation";
import { useJogSetVelocityMutation } from "./useJogSetVelocityMutation";
import { useJogStopMutation } from "./useJogStopMutation";
import { useMotorStatusConnected, useSensorStatusQuery } from "./useMotorStatusQuery";

export type MotorSessionValue = {
  connect: ReturnType<typeof useConnectMotorMutation>;
  disconnect: ReturnType<typeof useDisconnectMotorMutation>;
  setVelocity: ReturnType<typeof useJogSetVelocityMutation>;
  stop: ReturnType<typeof useJogStopMutation>;
  connected: boolean;
  busy: boolean;
  connectionBusy: boolean;
  /** Pointer hold on jog buttons (release may keep keyboard jog active). */
  applyPointerHold: (dir: "left" | "right") => void | Promise<void>;
  applyPointerRelease: () => void | Promise<void>;
  /** Arrow-key jog when keyboard jog is enabled. */
  applyKeyboardJog: (dir: JogHold) => void | Promise<void>;
  /** Stop motor and clear pointer + keyboard jog. */
  applyJogStop: () => void | Promise<void>;
  connectMotor: () => Promise<void>;
  disconnectMotor: () => Promise<void>;
};

export const MotorSessionContext = createContext<MotorSessionValue | null>(null);

export function MotorSessionProvider({ children }: { children: ReactNode }) {
  const { data: connected = false } = useMotorStatusConnected();
  const holding = useAtomValue(holdingAtom);
  const jogRpm = useAtomValue(jogRpmAtom);
  const jogAccelRpmPerSec = useAtomValue(jogAccelRpmPerSecAtom);
  const sensor = useSensorStatusQuery();
  const utils = trpc.useUtils();
  const connect = useConnectMotorMutation();
  const disconnect = useDisconnectMotorMutation();
  const setVelocity = useJogSetVelocityMutation();
  const stop = useJogStopMutation();
  const setHolding = useSetAtom(holdingAtom);
  const pointerDirRef = useRef<JogHold>(null);
  const keyboardDirRef = useRef<JogHold>(null);
  const motorDirRef = useRef<JogHold>(null);
  const syncJogRef = useRef<() => void | Promise<void>>(() => {});
  const syncJogQueueRef = useRef(Promise.resolve());

  const invalidateMotorQueries = useCallback(() => {
    void utils.status.get.invalidate();
    void utils.twin.status.get.invalidate();
  }, [utils]);

  const connectionBusy = connect.isPending || disconnect.isPending;
  const busy =
    connectionBusy || setVelocity.isPending || stop.isPending;

  const effectiveJogDirection = useCallback((): JogHold => {
    return pointerDirRef.current ?? keyboardDirRef.current;
  }, []);

  const syncJog = useCallback(async () => {
    const dir = effectiveJogDirection();
    setHolding(dir);
    if (!connected) {
      motorDirRef.current = null;
      return;
    }
    if (dir === motorDirRef.current) return;

    if (!dir) {
      motorDirRef.current = null;
      if (!connected) return;
      await stop.mutateAsync();
      invalidateMotorQueries();
      return;
    }

    motorDirRef.current = dir;
    await setVelocity.mutateAsync({
      rpm: jogRpmForDirection(dir, jogRpm),
      maxAccelerationRpmPerSec: jogAccelRpmPerSec,
    });
    invalidateMotorQueries();
  }, [
    connected,
    effectiveJogDirection,
    setHolding,
    stop,
    setVelocity,
    invalidateMotorQueries,
    jogRpm,
    jogAccelRpmPerSec,
  ]);

  useEffect(() => {
    syncJogRef.current = syncJog;
  }, [syncJog]);

  const runSyncJog = useCallback(() => {
    const next = syncJogQueueRef.current.then(() => syncJog(), () => syncJog());
    syncJogQueueRef.current = next;
    return next;
  }, [syncJog]);

  const applyPointerHold = useCallback(
    async (dir: "left" | "right") => {
      if (!connected) return;
      pointerDirRef.current = dir;
      await runSyncJog();
    },
    [connected, runSyncJog],
  );

  const applyPointerRelease = useCallback(async () => {
    pointerDirRef.current = null;
    await runSyncJog();
  }, [runSyncJog]);

  const applyKeyboardJog = useCallback(
    async (dir: JogHold) => {
      keyboardDirRef.current = dir;
      await runSyncJog();
    },
    [runSyncJog],
  );

  const applyJogStop = useCallback(async () => {
    pointerDirRef.current = null;
    keyboardDirRef.current = null;
    await runSyncJog();
  }, [runSyncJog]);

  /** Stop an in-progress jog as soon as its direction hits a travel limit (sensor poll ~80 ms). */
  useEffect(() => {
    if (!connected || !holding) return;
    const limits = {
      connected: sensor.data?.connected ?? false,
      limitLeftPressed: sensor.data?.limitLeftPressed ?? false,
      limitRightPressed: sensor.data?.limitRightPressed ?? false,
    };
    if (!shouldReleaseJogHoldForTravelLimit(holding, limits)) return;
    pointerDirRef.current = null;
    keyboardDirRef.current = null;
    void syncJogRef.current();
  }, [
    connected,
    holding,
    sensor.data?.connected,
    sensor.data?.limitLeftPressed,
    sensor.data?.limitRightPressed,
  ]);

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
    pointerDirRef.current = null;
    keyboardDirRef.current = null;
    motorDirRef.current = null;
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
      connectionBusy,
      applyPointerHold,
      applyPointerRelease,
      applyKeyboardJog,
      applyJogStop,
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
      connectionBusy,
      applyPointerHold,
      applyPointerRelease,
      applyKeyboardJog,
      applyJogStop,
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
