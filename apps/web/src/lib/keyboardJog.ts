import type { JogHold } from "@/stores/jog";

export type ArrowKeyState = { left: boolean; right: boolean };

/** Jog direction from arrow keys (left wins if both are down). */
export function jogDirectionFromArrowKeys(keys: ArrowKeyState): JogHold {
  if (keys.left) return "left";
  if (keys.right) return "right";
  return null;
}

export function isArrowKey(code: string): code is "ArrowLeft" | "ArrowRight" {
  return code === "ArrowLeft" || code === "ArrowRight";
}

/** Skip keyboard jog when the user is typing in a form control. */
export function isKeyboardJogBlockedTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}
