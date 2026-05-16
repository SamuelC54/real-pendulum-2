import { describe, expect, it } from "vitest";
import {
  isArrowKey,
  isKeyboardJogBlockedTarget,
  jogDirectionFromArrowKeys,
} from "./keyboardJog";

describe("keyboardJog", () => {
  it("maps arrow keys to jog direction", () => {
    expect(jogDirectionFromArrowKeys({ left: true, right: false })).toBe("left");
    expect(jogDirectionFromArrowKeys({ left: false, right: true })).toBe("right");
    expect(jogDirectionFromArrowKeys({ left: false, right: false })).toBe(null);
    expect(jogDirectionFromArrowKeys({ left: true, right: true })).toBe("left");
  });

  it("recognizes arrow key codes", () => {
    expect(isArrowKey("ArrowLeft")).toBe(true);
    expect(isArrowKey("ArrowRight")).toBe(true);
    expect(isArrowKey("KeyA")).toBe(false);
  });

  it("blocks jog when typing in inputs", () => {
    const input = document.createElement("input");
    expect(isKeyboardJogBlockedTarget(input)).toBe(true);
    expect(isKeyboardJogBlockedTarget(document.createElement("motion"))).toBe(false);
  });
});
