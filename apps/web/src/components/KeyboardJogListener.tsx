import { useKeyboardJog } from "@/hooks/useKeyboardJog";

/** Window-level arrow-key jog when the feature toggle is on. */
export function KeyboardJogListener() {
  useKeyboardJog();
  return null;
}
