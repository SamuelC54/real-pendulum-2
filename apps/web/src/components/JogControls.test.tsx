import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JogControls } from "./JogControls";

afterEach(() => {
  cleanup();
});

describe("JogControls", () => {
  it("disables jog and stop when not connected", () => {
    render(
      <JogControls
        busy={false}
        connected={false}
        holding={null}
        applyHold={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /jog left/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /jog right/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^stop$/i })).toBeDisabled();
  });

  it("enables jog and stop when connected and not busy", () => {
    render(
      <JogControls
        busy={false}
        connected={true}
        holding={null}
        applyHold={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /jog left/i })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: /jog right/i })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: /^stop$/i })).not.toBeDisabled();
  });

  it("disables controls while busy", () => {
    render(
      <JogControls busy={true} connected={true} holding={null} applyHold={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: /jog left/i })).toBeDisabled();
  });
});
