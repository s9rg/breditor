import { readFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

async function transform(setting: string | undefined) {
  vi.stubEnv("BREDITOR_QUEUE_PROPERTY_SOURCE", setting);
  vi.stubEnv("BREDITOR_QUEUE_PROJECTION", "1");
  vi.stubEnv("BREDITOR_QUEUE_PROJECTION_VALIDATION", "1");
  vi.resetModules();
  const { default: config } = await import("../../../vite.queue-diagnostics.config");
  const plugin = config.plugins?.find(candidate => candidate && "name" in candidate &&
    candidate.name === "breditor-queue-only-diagnostics") as {
      transform(code: string, id: string): { code: string } | null;
    };
  const source = readFileSync(new URL("../../../packages/breditor-browser/dist/projection.js", import.meta.url), "utf8");
  return plugin.transform(source, "/repo/packages/breditor-browser/dist/projection.js");
}

it.each([undefined, "1"])("keeps source capture enabled for setting %s", async setting => {
  expect((await transform(setting))?.code).toContain("formatContract, propertyArray, properties, record)");
});
it("can restore the earlier call layout without disabling required-property diagnostics", async () => {
  const result = await transform("0");
  expect(result?.code).toContain("formatContract, propertyArray, properties)");
  expect(result?.code).not.toContain("formatContract, propertyArray, properties, record)");
});
it("rejects a misspelled source capture setting", async () => {
  await expect(transform("false")).rejects.toThrow("BREDITOR_QUEUE_PROPERTY_SOURCE must be 0 or 1");
});
