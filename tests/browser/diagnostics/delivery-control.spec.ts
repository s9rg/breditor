import { expect, test } from "@playwright/test";

test("a deliberately detached owner records the original failed delivery edge", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.waitForFunction(() => window.__breditorHarness?.phase === "ready" || window.__breditorStartupError !== undefined);
  expect(await page.evaluate(() => window.__breditorStartupError)).toBeUndefined();
  const result = await page.evaluate(async () => {
    const url = "/delivery_fault_control.ts";
    const probe = await import(url) as typeof import("../harness/delivery_fault_control");
    return probe.probeDetachedDelivery();
  });
  expect(result).toEqual({ outcome: "failed", owner: { phase: "faulted", reason: "queueUncertain" } });
  const diagnostic = await page.evaluate(() => {
    const fixture = window as unknown as { breditorLinkDiagnostics: () => unknown };
    return fixture.breditorLinkDiagnostics();
  });
  expect(diagnostic).toEqual({ format: "breditor/queue-faults", version: 1, events: [],
    deliveries: [{ stage: expect.stringMatching(/^browser_editor:delivery:\d+$/) }] });
  const mapping = await page.request.get("/link-diagnostic-map.json");
  expect(mapping.ok()).toBe(true);
  const manifest = await mapping.json() as { modules: Record<string, { sites?: { stage: string }[] }> };
  expect(Object.keys(manifest.modules)).toHaveLength(7);
  const firstStage = manifest.modules["browser_editor"]?.sites?.[0]?.stage;
  expect(diagnostic).toHaveProperty("deliveries", [{ stage: firstStage }]);
  await testInfo.attach("deliberate-failure-control.json", { body: JSON.stringify({ result, diagnostic }), contentType: "application/json" });
});
