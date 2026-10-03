import { expect, test } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { assertCleanBoundaryHistoryEvidence } from "./boundary_history_evidence";

const rustReports = new WeakMap<object, string[]>();
test.beforeEach(async ({ page }) => {
  const reports: string[] = [];
  rustReports.set(page, reports);
  page.on("console", message => {
    const text = message.text();
    if (text.startsWith("BREDITOR_RUST_SELECTION=") && reports.length < 8) reports.push(text);
  });
});

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status === "skipped") return;
  const config = testInfo.config.configFile ?? "";
  if (!config.endsWith("playwright.adapter-reduction.config.ts") &&
      !config.endsWith("playwright.selection-input-diagnostic.config.ts")) return;
  await testInfo.attach("rust-selection-rejections.json", {
    body: JSON.stringify(rustReports.get(page) ?? []), contentType: "application/json" });
  try {
    if (config.endsWith("playwright.selection-input-diagnostic.config.ts")) {
      const map = await page.request.get("/selection-input-diagnostic-map.json");
      const manifest = await map.json() as { mode: "off" | "calls" | "inline"; formatCount: "off" | "inline"; rustFormatCount: "off" | "on"; moduleUrl: string };
      await testInfo.attach("selection-input-diagnostic-map.json", { body: await map.body(), contentType: "application/json" });
      expect(map.ok(), "the isolated diagnostic Wasm module must be installed").toBe(true);
      if (manifest.rustFormatCount === "on") {
        const value = await page.evaluate(async url => {
          const recorder = await import(url) as { debugLastProjectionFormatCount(): string };
          return recorder.debugLastProjectionFormatCount();
        }, manifest.moduleUrl);
        await testInfo.attach("rust-format-count.json", { body: value, contentType: "application/json" });
      }
      if (manifest.formatCount === "inline") {
        const values = await page.evaluate(async url => {
          const recorder = await import(url) as { __breditorReadFormatCounts(): unknown };
          return recorder.__breditorReadFormatCounts();
        }, manifest.moduleUrl);
        await testInfo.attach("wasm-format-counts.json", { body: JSON.stringify(values), contentType: "application/json" });
      }
      if (manifest.mode !== "off") {
        const url = manifest.mode === "inline" ? manifest.moduleUrl :
          `/@fs${fileURLToPath(new URL("./wasm_equality_recorder.ts", import.meta.url))}`;
        const values = await page.evaluate(async ({ url, mode }) => {
          const recorder = await import(url) as { readWasmEqualities(): unknown; __breditorReadWasmEqualities(): unknown };
          return mode === "inline" ? recorder.__breditorReadWasmEqualities() : recorder.readWasmEqualities();
        }, { url, mode: manifest.mode });
        await testInfo.attach("wasm-equality-inputs.json", { body: JSON.stringify(values), contentType: "application/json" });
      }
    }
    const url = `/@fs${fileURLToPath(new URL("./link_fault_recorder.ts", import.meta.url))}`;
    const result = await page.evaluate(async url => {
      const recorder = await import(url) as typeof import("./link_fault_recorder");
      return recorder.readLinkFaults();
    }, url);
    await testInfo.attach("adapter-reduction-faults.json", { body: JSON.stringify(result), contentType: "application/json" });
    const map = await page.request.get("/adapter-reduction-map.json");
    await testInfo.attach("adapter-reduction-map.json", { body: await map.body(), contentType: "application/json" });
    expect(map.ok(), "all three adapter diagnostic modules must be installed").toBe(true);
    // Retain all evidence first. Deliberate invalid-input tests have
    // expected rejections; only the valid history workload requires silence.
    if (testInfo.attachments.some(attachment => attachment.name === "boundary-history-result.json")) {
      assertCleanBoundaryHistoryEvidence(result, rustReports.get(page));
    }
  } catch (error) {
    if (testInfo.status === testInfo.expectedStatus) throw error;
  }
});

test("Rust input observer distinguishes missing nodes and kind mismatches", async ({ page }, testInfo) => {
  test.skip(!testInfo.config.configFile?.endsWith("playwright.selection-input-diagnostic.config.ts") ||
    process.env["BREDITOR_RUST_SELECTION_INPUTS"] === "off", "requires isolated Rust input observer");
  await page.goto("/impact-contract/");
  const result = await page.evaluate(async () => {
    const url = "/boundary_history_adapter_probe.ts";
    const probe = await import(url) as typeof import("../harness/boundary_history_adapter_probe");
    return probe.probeRejectedSelectionInputs();
  });
  expect(result).toEqual(["breditor_wasm.invalid_selection_node", "breditor_wasm.invalid_selection_node", "committed"]);
  expect(rustReports.get(page)).toEqual([
    'BREDITOR_RUST_SELECTION={"kind":"text","nodeIndex":1,"offset":0,"found":"element"}',
    'BREDITOR_RUST_SELECTION={"kind":"children","nodeIndex":99,"offset":0,"found":"missing"}',
  ]);
});

test("Rust input observer preserves errors when the host logger throws", async ({ page }, testInfo) => {
  test.skip(!testInfo.config.configFile?.endsWith("playwright.selection-input-diagnostic.config.ts") ||
    process.env["BREDITOR_RUST_SELECTION_INPUTS"] === "off", "requires isolated Rust input observer");
  await page.goto("/impact-contract/");
  const result = await page.evaluate(async () => {
    const url = "/boundary_history_adapter_probe.ts";
    const probe = await import(url) as typeof import("../harness/boundary_history_adapter_probe");
    const saved = console.debug;
    try {
      console.debug = () => { throw new Error("deliberate logger failure"); };
      return await probe.probeRejectedSelectionInputs();
    } finally { console.debug = saved; }
  });
  expect(result).toEqual(["breditor_wasm.invalid_selection_node", "breditor_wasm.invalid_selection_node", "committed"]);
});

test("Rust format-count observer distinguishes zero, element and missing nodes", async ({ page }, testInfo) => {
  test.skip(!testInfo.config.configFile?.endsWith("playwright.selection-input-diagnostic.config.ts") ||
    process.env["BREDITOR_RUST_FORMAT_COUNT"] !== "on", "requires isolated Rust count observer");
  await page.goto("/impact-contract/");
  const result = await page.evaluate(async () => {
    const url = "/boundary_history_adapter_probe.ts";
    const probe = await import(url) as typeof import("../harness/boundary_history_adapter_probe");
    return probe.probeProjectionCountDiagnostic();
  });
  expect(result).toEqual([
    { value: 0, type: "number", rust: { index: 2, count: 0 } },
    { value: null, type: "undefined", rust: { index: 1, count: null } },
    { value: null, type: "undefined", rust: { index: 99, count: null } },
  ]);
});

for (const schedule of ["sync", "task"] as const) {
  test(`boundary-only backward Undo retains exact selection without DOM (${schedule})`, async ({ page }, testInfo) => {
    await page.goto("/impact-contract/");
    const encoded = await page.evaluate(async schedule => {
      const url = "/boundary_history_adapter_probe.ts";
      const probe = await import(url) as typeof import("../harness/boundary_history_adapter_probe");
      return probe.probeBoundaryHistory(100, schedule);
    }, schedule);
    await testInfo.attach("boundary-history-result.json", { body: encoded, contentType: "application/json" });
    expect(JSON.parse(encoded)).toEqual({ format: "breditor/boundary-history-adapter", schedule,
      cycles: "100", commands: "1900", updates: "1800", selections: "1900", targetChecks: "100" });
  });
}
