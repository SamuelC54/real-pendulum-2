import { useEffect, useRef } from "react";
import { useAtomValue } from "jotai";
import {
  isArrowKey,
  isKeyboardJogBlockedTarget,
  jogDirectionFromArrowKeys,
  type ArrowKeyState,
} from "@/lib/keyboardJog";
import { isJogBlockedByTravelLimit } from "@/lib/jogMath";
import { useMotorSession } from "@/services/motorSession";
import { useSensorStatusQuery } from "@/services/useMotorStatusQuery";
import { keyboardJogEnabledAtom } from "@/stores/jog";

export function useKeyboardJog() {
  const enabled = useAtomValue(keyboardJogEnabledAtom);
  const { connected, connectionBusy, applyKeyboardJog } = useMotorSession();
  const sensor = useSensorStatusQuery();
  const keysRef = useRef<ArrowKeyState>({ left: false, right: false });
  const applyKeyboardJogRef = useRef(applyKeyboardJog);
  const limitsRef = useRef({
    connected: false,
    limitLeftPressed: false,
    limitRightPressed: false,
  });

  applyKeyboardJogRef.current = applyKeyboardJog;
  limitsRef.current = {
    connected: sensor.data?.connected ?? false,
    limitLeftPressed: sensor.data?.limitLeftPressed ?? false,
    limitRightPressed: sensor.data?.limitRightPressed ?? false,
  };

  useEffect(() => {
    if (!enabled) {
      keysRef.current = { left: false, right: false };
      void applyKeyboardJogRef.current(null);
      return;
    }

    const sync = () => {
      const limits = limitsRef.current;
      let dir = jogDirectionFromArrowKeys(keysRef.current);
      if (dir === "left" && isJogBlockedByTravelLimit("left", limits)) dir = null;
      if (dir === "right" && isJogBlockedByTravelLimit("right", limits)) dir = null;
      void applyKeyboardJogRef.current(dir);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (!isArrowKey(e.code) || e.repeat || isKeyboardJogBlockedTarget(e.target)) return;
      if (!connected || connectionBusy) return;

      if (e.code === "ArrowLeft") keysRef.current.left = true;
      else keysRef.current.right = true;

      e.preventDefault();
      sync();
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (!isArrowKey(e.code)) return;

      if (e.code === "ArrowLeft") keysRef.current.left = false;
      else keysRef.current.right = false;

      // Always sync on keyup so release stops the motor even if focus moved to an input.
      if (!isKeyboardJogBlockedTarget(e.target)) {
        e.preventDefault();
      }
      sync();
    };

    const releaseAllKeys = () => {
      if (!keysRef.current.left && !keysRef.current.right) return;
      keysRef.current = { left: false, right: false };
      void applyKeyboardJogRef.current(null);
    };

    const opts: AddEventListenerOptions = { capture: true };
    window.addEventListener("keydown", onKeyDown, opts);
    window.addEventListener("keyup", onKeyUp, opts);
    window.addEventListener("blur", releaseAllKeys);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") releaseAllKeys();
    });
    return () => {
      window.removeEventListener("keydown", onKeyDown, opts);
      window.removeEventListener("keyup", onKeyUp, opts);
      window.removeEventListener("blur", releaseAllKeys);
      keysRef.current = { left: false, right: false };
      void applyKeyboardJogRef.current(null);
    };
  }, [enabled, connected, connectionBusy]);
}
