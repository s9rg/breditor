import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { attachLinkFaults } from "./attach_link_faults";

test.afterEach(async ({ page }, testInfo) => { await attachLinkFaults(page, testInfo); });

test("injected adapter rejection retains its throw site without faulting the mounted editor", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => window.__breditorHarness?.phase === "ready");
  const response = await page.request.get("/link-diagnostic-map.json");
  expect(response.ok()).toBe(true);
  const map = await response.json();
  expect(map.modules.command_queue.mode).toBe("stop");
  expect(map.modules.wasm_command_adapter.throwSitesOnly).toBe(true);
  const adapterUrl = `/@fs${fileURLToPath(new URL("../../../packages/breditor-browser/dist/wasm_command_adapter.js", import.meta.url))}`;
  const result = await page.evaluate(async url => {
    const module = await import(url);
    const read = (window as unknown as { breditorLinkDiagnostics(): { events: unknown[] } }).breditorLinkDiagnostics;
    const before = read().events;
    const shared = {};
    let rejected = false;
    try {
      // Reject before reading any foreign getter or taking ownership. This
      // dummy constructor is unrelated to the mounted editor's real handles.
      Reflect.construct(module.BreditorWasmCommandAdapter, [shared, shared, { profileGeneration: {} }]);
    } catch (error) {
      rejected = error instanceof TypeError && error.message === "Wasm command adapter dependencies are invalid";
    }
    return { before, rejected, after: read().events, phase: window.__breditorHarness!.snapshot().status.phase };
  }, adapterUrl);
  expect(result.before).toEqual([]);
  expect(result.rejected).toBe(true);
  expect(result.phase).toBe("live");
  expect(result.after).toEqual([{ stage: map.modules.wasm_command_adapter.sites[0].stage,
    reason: "unclassified", frames: expect.any(Array) }]);
});

test("injected selection rejection reaches the boundary recorder without touching generated getters", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => window.__breditorHarness?.phase === "ready");
  const response = await page.request.get("/link-diagnostic-map.json");
  expect(response.ok()).toBe(true);
  const map = await response.json();
  expect(map.modules.wasm_selection_adapter.rejectionSitesOnly).toBe(true);
  expect(map.modules.wasm_selection_adapter.numericPredicates).toBe(false);
  const url = `/@fs${fileURLToPath(new URL("../../../packages/breditor-browser/dist/wasm_selection_adapter.js", import.meta.url))}`;
  const result = await page.evaluate(async url => {
    const module = await import(url);
    const read = (window as unknown as { breditorLinkDiagnostics(): { events: unknown[]; projection: { events: unknown[] } } }).breditorLinkDiagnostics;
    const before = read().projection.events;
    let accesses = 0;
    const shared = new Proxy({}, { get() { accesses++; throw new Error("unexpected access"); } });
    // Deliberate view/generation alias: the production ownership guard must
    // reject it before consulting either the projection or any generated getter.
    const rejected = module.consumeSemanticSelectionWithCleanup({}, shared, undefined, shared);
    return { before, ok: rejected.ok, code: rejected.error?.code, accesses,
      after: read().projection.events, queue: read().events,
      phase: window.__breditorHarness!.snapshot().status.phase };
  }, url);
  expect(result).toEqual({ before: [], ok: false, code: "selection.invalid_wasm_view", accesses: 0,
    after: [map.modules.wasm_selection_adapter.sites[0].stage], queue: [], phase: "live" });
});
