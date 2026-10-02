import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";

const source = readFileSync(new URL("./native_boundary_runner.js", import.meta.url), "utf8");
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
const execute = new AsyncFunction("document", "window", "sessionStorage", "location", "navigator", "setTimeout", "clearTimeout", source);
function fixture(saved: unknown, result: unknown = { iterations: 10000, reads: 30000 }) {
  const listeners = new Map<string, () => void>();
  const report = { textContent: "" };
  const buttons = (name: string) => ({ disabled: false, addEventListener: (_: string, fn: () => void) => listeners.set(name, fn) });
  const elements: Record<string, unknown> = {
    "#metadata": { textContent: JSON.stringify({ variant: "normalized", bundleSha256: "fixture" }) },
    "#report": report, "#start": buttons("start"), "#stop": buttons("stop"),
  };
  const probe = vi.fn(async () => result);
  const reload = vi.fn();
  const writes: string[] = [];
  const run = () => execute({ querySelector: (key: string) => elements[key] }, { breditorSelectionProbe: probe },
    { getItem: () => JSON.stringify(saved), setItem: (_: string, value: string) => writes.push(value) },
    { reload }, { userAgent: "test" }, setTimeout, clearTimeout);
  return { run, probe, reload, listeners, writes, report: () => JSON.parse(report.textContent) };
}
it("starts a fresh run only through the visible start control", async () => {
  const f = fixture(null);
  await f.run();
  expect(f.probe).not.toHaveBeenCalled();
  f.listeners.get("start")!();
  expect(f.reload).toHaveBeenCalledOnce();
  expect(f.report()).toMatchObject({ active: true, passed: 0, outcome: "running" });
});
it("records an exact completed batch before requesting a fresh-page continuation", async () => {
  const f = fixture({ active: true, passed: 0, outcome: "running" });
  await f.run();
  expect(f.probe).toHaveBeenCalledExactlyOnceWith(10000);
  expect(f.report()).toMatchObject({ passed: 1, current: 1, active: true });
  expect(JSON.parse(f.writes.at(-1)!)).toMatchObject({ passed: 1 });
  expect(f.reload).toHaveBeenCalledOnce();
});
it("stops after five complete batches", async () => {
  const f = fixture({ active: true, passed: 4, current: 4, outcome: "running" });
  await f.run();
  expect(f.report()).toMatchObject({ passed: 5, active: false, outcome: "passed" });
  expect(f.reload).not.toHaveBeenCalled();
});
it("does not count wrong results or interrupted batches as passes", async () => {
  const wrong = fixture({ active: true, passed: 0, outcome: "running" }, { iterations: 10000, reads: 3 });
  await wrong.run();
  expect(wrong.report()).toMatchObject({ passed: 0, active: false, outcome: "failed" });
  expect(wrong.reload).not.toHaveBeenCalled();
  const interrupted = fixture({ active: true, passed: 2, current: 3, outcome: "running" });
  await interrupted.run();
  expect(interrupted.report()).toMatchObject({ passed: 2, active: false, outcome: "failed" });
  expect(interrupted.probe).not.toHaveBeenCalled();
});
it("does not execute malformed stored progress", async () => {
  for (const saved of [
    { active: true, passed: 999, outcome: "running" },
    { active: true, passed: 5, outcome: "running" },
    { active: true, passed: 1, outcome: "passed" },
    { active: true, passed: 1, current: -1, outcome: "running" },
  ]) {
    const f = fixture(saved);
    await f.run();
    expect(f.report()).toMatchObject({ active: false, passed: 0, outcome: "idle" });
    expect(f.probe).not.toHaveBeenCalled();
  }
});
it("reports the unchanged 30-second watchdog as a failure without retrying", async () => {
  vi.useFakeTimers();
  try {
    const f = fixture({ active: true, passed: 0, outcome: "running" });
    f.probe.mockImplementation(() => new Promise(() => {}));
    const running = f.run();
    await vi.advanceTimersByTimeAsync(30000);
    await running;
    expect(f.report()).toMatchObject({ passed: 0, active: false, outcome: "failed", error: "Error: Native batch exceeded 30 seconds" });
    expect(f.reload).not.toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
  }
});
