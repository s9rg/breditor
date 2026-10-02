import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";

const code = readFileSync(new URL("./native_number_runner.js", import.meta.url), "utf8");
const run = new (Object.getPrototypeOf(async function() {}).constructor)("document", "window", "sessionStorage", "location", "navigator", "setTimeout", "clearTimeout", code);

async function fixture(saved: object | null, reject = false) {
  const listeners: Record<string, () => void> = {};
  const elements = Object.fromEntries(["metadata", "report", "start", "stop"].map(id => [id, {
    textContent: id === "metadata" ? JSON.stringify({ variant: "test", bundleSha256: "abc" }) : "",
    disabled: false, addEventListener: (_event: string, callback: () => void) => { listeners[id] = callback; },
  }]));
  const probe = vi.fn(async () => {
    if (reject) throw new Error("fixture rejection");
    return { mode: "tiny-wasm", iterations: 10000, reads: 20000 };
  });
  const reload = vi.fn();
  const storage = { getItem: () => JSON.stringify(saved), setItem: vi.fn() };
  await run({ querySelector: (selector: string) => elements[selector.slice(1)] }, {
    breditorPropertyBoundaryProbe: probe,
    breditorStartupDiagnostics: () => ({ events: [], omitted: 0 }),
  }, storage, { reload }, { userAgent: "test-agent" }, () => 1, vi.fn());
  return { probe, reload, elements, listeners, report: () => JSON.parse(elements["report"]!.textContent) };
}

it("waits for an explicit start and never runs on an idle page", async () => {
  const f = await fixture(null);
  expect(f.probe).not.toHaveBeenCalled();
  f.listeners["start"]!();
  expect(f.reload).toHaveBeenCalledOnce();
  expect(f.report()).toMatchObject({ active: true, passed: 0, outcome: "running" });
});
it("records a completed batch before requesting a fresh page", async () => {
  const f = await fixture({ active: true, passed: 0, outcome: "running" });
  expect(f.probe).toHaveBeenCalledExactlyOnceWith("tiny-wasm", 10000);
  expect(f.report()).toMatchObject({ passed: 1, current: 1 });
  expect(f.reload).toHaveBeenCalledOnce();
});
it("finishes exactly ten batches without another reload", async () => {
  const f = await fixture({ active: true, passed: 9, current: 9, outcome: "running" });
  expect(f.report()).toMatchObject({ active: false, passed: 10, outcome: "passed" });
  expect(f.reload).not.toHaveBeenCalled();
});
it("keeps the first rejection as a failure without retrying", async () => {
  const f = await fixture({ active: true, passed: 2, current: 2, outcome: "running" }, true);
  expect(f.report()).toMatchObject({ active: false, passed: 2, outcome: "failed", error: "Error: fixture rejection" });
  expect(f.reload).not.toHaveBeenCalled();
});
it("treats an interrupted page as failed rather than replaying its batch", async () => {
  const f = await fixture({ active: true, passed: 2, current: 3, outcome: "running" });
  expect(f.report()).toMatchObject({ active: false, passed: 2, outcome: "failed", error: "Previous native batch was interrupted; not retried" });
  expect(f.probe).not.toHaveBeenCalled();
});
