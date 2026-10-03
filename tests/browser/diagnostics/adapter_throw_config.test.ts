import { readFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

async function transformAdapter(setting: string) {
  vi.stubEnv("BREDITOR_QUEUE_ADAPTER_THROWS", setting);
  vi.resetModules();
  const { default: config } = await import("../../../vite.queue-diagnostics.config");
  const plugin = config.plugins?.find(candidate => candidate && "name" in candidate &&
    candidate.name === "breditor-queue-only-diagnostics") as {
      transform(code: string, id: string): { code: string } | null;
    };
  expect(plugin).toBeDefined();
  return plugin.transform("export function fail() { throw new Error('test'); }",
    "/repo/packages/breditor-browser/dist/wasm_command_adapter.js");
}

it("keeps adapter source untouched when the new capture is disabled", async () => {
  expect(await transformAdapter("0")).toBeNull();
});

it("installs only the throw observer when selected", async () => {
  const result = await transformAdapter("1");
  expect(result?.code).toContain("throw __breditorAdapterThrow");
  expect(result?.code).not.toContain("catch (__breditorQueueError)");
});

it("rejects a misspelled setting instead of silently losing evidence", async () => {
  await expect(transformAdapter("true")).rejects.toThrow("BREDITOR_QUEUE_ADAPTER_THROWS must be 0 or 1");
});

it("requires a visible boundary recorder for selection capture", async () => {
  vi.stubEnv("BREDITOR_QUEUE_SELECTION", "1");
  vi.stubEnv("BREDITOR_QUEUE_PROJECTION", "0");
  await expect(transformAdapter("0")).rejects.toThrow("Selection rejection capture requires BREDITOR_QUEUE_PROJECTION=1");
});

it("rejects a misspelled selection setting", async () => {
  vi.stubEnv("BREDITOR_QUEUE_SELECTION", "yes");
  await expect(transformAdapter("0")).rejects.toThrow("BREDITOR_QUEUE_SELECTION must be 0 or 1");
});

it("requires selection capture before numeric observation can be enabled", async () => {
  vi.stubEnv("BREDITOR_QUEUE_SELECTION_NUMERIC", "1");
  vi.stubEnv("BREDITOR_QUEUE_SELECTION", "0");
  await expect(transformAdapter("0")).rejects.toThrow("Selection numeric capture requires BREDITOR_QUEUE_SELECTION=1");
});

it("rejects a misspelled numeric observation setting", async () => {
  vi.stubEnv("BREDITOR_QUEUE_SELECTION_NUMERIC", "yes");
  await expect(transformAdapter("0")).rejects.toThrow("BREDITOR_QUEUE_SELECTION_NUMERIC must be 0 or 1");
});

it("requires numeric capture before operand observation can be enabled", async () => {
  vi.stubEnv("BREDITOR_QUEUE_SELECTION_NUMERIC_OPERANDS", "1");
  vi.stubEnv("BREDITOR_QUEUE_SELECTION_NUMERIC", "0");
  await expect(transformAdapter("0")).rejects.toThrow("Selection operand capture requires BREDITOR_QUEUE_SELECTION_NUMERIC=1");
});

it("rejects a misspelled operand observation setting", async () => {
  vi.stubEnv("BREDITOR_QUEUE_SELECTION_NUMERIC_OPERANDS", "yes");
  await expect(transformAdapter("0")).rejects.toThrow("BREDITOR_QUEUE_SELECTION_NUMERIC_OPERANDS must be 0 or 1");
});

it.each(["0", "1"])("makes selection predicate observation explicit (%s)", async setting => {
  vi.stubEnv("BREDITOR_QUEUE_SELECTION", "1");
  vi.stubEnv("BREDITOR_QUEUE_PROJECTION", "1");
  vi.stubEnv("BREDITOR_QUEUE_SELECTION_NUMERIC", setting);
  vi.resetModules();
  const { default: config } = await import("../../../vite.queue-diagnostics.config");
  const plugin = config.plugins?.find(candidate => candidate && "name" in candidate &&
    candidate.name === "breditor-queue-only-diagnostics") as {
      transform(code: string, id: string): { code: string } | null;
    };
  const source = readFileSync(new URL("../../../packages/breditor-browser/dist/wasm_selection_adapter.js", import.meta.url), "utf8");
  const output = plugin.transform(source, "/repo/packages/breditor-browser/dist/wasm_selection_adapter.js")!;
  expect(output.code.includes('return __breditorNumericPredicate("wasm_selection_adapter:numeric:')).toBe(setting === "1");
});
