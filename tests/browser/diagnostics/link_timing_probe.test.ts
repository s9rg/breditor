import { expect, it, vi } from "vitest";
import { createLinkTimingProbe } from "../harness/link_timing_probe";

function fixture() {
  let clock = 0;
  let visibility = "visible";
  const callbacks: (() => void)[] = [];
  const emit = vi.fn();
  const probe = createLinkTimingProbe({ monotonic: () => clock, wall: () => 1000 + clock,
    visibility: () => visibility, focused: () => visibility === "visible",
    schedule: callback => { callbacks.push(callback); }, emit });
  return { probe, emit, callbacks, advance: (ms: number) => { clock += ms; },
    hide: () => { visibility = "hidden"; }, read: () => JSON.parse(probe.snapshot()) };
}

it("separates delayed existing timers from work between yields", async () => {
  const f = fixture();
  f.advance(400);
  const task = f.probe.nextTask();
  expect(f.callbacks).toHaveLength(1);
  expect(f.read()).toMatchObject({ scheduled: 1, completed: 0, pending: { monotonic: 400 } });
  f.hide(); f.advance(1000); f.callbacks.shift()!(); await task;
  f.advance(20); f.probe.finish("completed");
  expect(f.read()).toMatchObject({ terminal: "completed", scheduled: 1, completed: 1,
    pending: null, timerMs: 1000, betweenYieldMs: 420, maxTimerMs: 1000, maxBetweenYieldMs: 400 });
  expect(f.read().events).toEqual([
    { kind: "between-yields", yieldIndex: 0, elapsedMs: 400, wallElapsedMs: 400,
      visibilityBefore: "visible", visibilityAfter: "visible", focusedBefore: true, focusedAfter: true },
    { kind: "timer", yieldIndex: 1, elapsedMs: 1000, wallElapsedMs: 1000,
      visibilityBefore: "visible", visibilityAfter: "hidden", focusedBefore: true, focusedAfter: false },
  ]);
});

it("bounds evidence, reports omissions, and records completion only once", async () => {
  const f = fixture();
  for (let index = 0; index < 20; index++) {
    const task = f.probe.nextTask();
    f.advance(300); f.callbacks.shift()!(); await task;
  }
  f.probe.finish("failed");
  const first = f.probe.snapshot();
  f.advance(1000); f.probe.finish("completed");
  expect(f.probe.snapshot()).toBe(first);
  expect(f.read()).toMatchObject({ terminal: "failed", scheduled: 20, completed: 20,
    omitted: 4, timerMs: 6000 });
  expect(f.read().events).toHaveLength(16);
  expect(f.emit).toHaveBeenCalledTimes(16);
});

it("does not emit fast yields or let logging failures prevent resolution", async () => {
  const f = fixture();
  let task = f.probe.nextTask();
  f.advance(4); f.callbacks.shift()!(); await task;
  expect(f.emit).not.toHaveBeenCalled();
  f.emit.mockImplementation(() => { throw new Error("logging unavailable"); });
  task = f.probe.nextTask();
  f.advance(300); f.callbacks.shift()!(); await task;
  expect(f.read()).toMatchObject({ scheduled: 2, completed: 2, timerMs: 304 });
});
