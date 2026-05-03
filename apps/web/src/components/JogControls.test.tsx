import { cleanup, render, screen } from "@testing-library/react";
import { createStore, Provider as JotaiProvider } from "jotai";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JogControls } from "./JogControls";
import { MotorSessionContext, type MotorSessionValue } from "@/services/motorSession";
import { holdingAtom } from "@/stores/jog";

afterEach(() => {
  cleanup();
});

function renderWithMotorSession(
  ui: ReactElement,
  session: Pick<MotorSessionValue, "connected" | "busy" | "applyHold"> &
    Partial<Omit<MotorSessionValue, "connected" | "busy" | "applyHold">>,
) {
  const store = createStore();
  store.set(holdingAtom, null);

  const fullSession = {
    status: {} as MotorSessionValue["status"],
    connect: {} as MotorSessionValue["connect"],
    disconnect: {} as MotorSessionValue["disconnect"],
    setVelocity: {} as MotorSessionValue["setVelocity"],
    stop: {} as MotorSessionValue["stop"],
    connectMotor: vi.fn(),
    disconnectMotor: vi.fn(),
    ...session,
  } as MotorSessionValue;

  return render(
    <MotorSessionContext.Provider value={fullSession}>
      <JotaiProvider store={store}>{ui}</JotaiProvider>
    </MotorSessionContext.Provider>,
  );
}

describe("JogControls", () => {
  it("disables jog and stop when not connected", () => {
    renderWithMotorSession(<JogControls />, {
      connected: false,
      busy: false,
      applyHold: vi.fn(),
    });
    expect(screen.getByRole("button", { name: /jog left/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /jog right/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^stop$/i })).toBeDisabled();
  });

  it("enables jog and stop when connected and not busy", () => {
    renderWithMotorSession(<JogControls />, {
      connected: true,
      busy: false,
      applyHold: vi.fn(),
    });
    expect(screen.getByRole("button", { name: /jog left/i })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: /jog right/i })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: /^stop$/i })).not.toBeDisabled();
  });

  it("disables controls while busy", () => {
    renderWithMotorSession(<JogControls />, {
      connected: true,
      busy: true,
      applyHold: vi.fn(),
    });
    expect(screen.getByRole("button", { name: /jog left/i })).toBeDisabled();
  });
});
