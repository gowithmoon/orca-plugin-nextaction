import { describe, expect, it } from "vitest";
import { type ChangeSignal, createChangeSignal } from "./change-signal";

/** A scheduler driven by hand: time moves only when the test advances it. */
function manualTime() {
  let now = 0;
  let timers: { at: number; fn: () => void }[] = [];
  return {
    schedule(fn: () => void, ms: number) {
      const timer = { at: now + ms, fn };
      timers.push(timer);
      return () => {
        timers = timers.filter((t) => t !== timer);
      };
    },
    advance(ms: number) {
      const until = now + ms;
      for (;;) {
        const next = timers
          .filter((t) => t.at <= until)
          .sort((a, b) => a.at - b.at)[0];
        if (!next) break;
        timers = timers.filter((t) => t !== next);
        now = next.at;
        next.fn();
      }
      now = until;
    },
  };
}

/** A signal with the spec's timings (#35: ~150 ms, ~2 s) and the times it was heard. */
function setup() {
  const time = manualTime();
  const signal: ChangeSignal = createChangeSignal({
    schedule: time.schedule,
    settleMs: 150,
    lateMs: 2000,
  });
  let heard = 0;
  signal.subscribe(() => {
    heard += 1;
  });
  return { time, signal, heard: () => heard };
}

describe("change signal", () => {
  it("is heard once a change has settled", () => {
    const { time, signal, heard } = setup();
    signal.changed();
    time.advance(149);
    expect(heard()).toBe(0);
    time.advance(1);
    expect(heard()).toBe(1);
  });

  it("is heard once for changes in quick succession, after the last one settles", () => {
    const { time, signal, heard } = setup();
    signal.changed();
    time.advance(100);
    signal.changed();
    time.advance(100);
    signal.changed();
    time.advance(149);
    expect(heard()).toBe(0);
    time.advance(1);
    expect(heard()).toBe(1);
    time.advance(5000);
    expect(heard()).toBe(1);
  });

  it("is heard again later for a change that takes effect late, like an undo", () => {
    const { time, signal, heard } = setup();
    signal.changed({ late: true });
    time.advance(150);
    expect(heard()).toBe(1);
    time.advance(1849);
    expect(heard()).toBe(1);
    time.advance(1);
    expect(heard()).toBe(2);
    time.advance(5000);
    expect(heard()).toBe(2);
  });

  it("is heard at once when asked to, which also covers changes still settling", () => {
    const { time, signal, heard } = setup();
    signal.changed();
    signal.now();
    expect(heard()).toBe(1);
    time.advance(5000);
    expect(heard()).toBe(1);
  });
});
