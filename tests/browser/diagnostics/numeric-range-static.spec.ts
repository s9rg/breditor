import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

test("the standalone probe runs as identical static browser bytes", async ({ page }, testInfo) => {
  const variant = testInfo.config.metadata["numericRangeVariant"];
  expect(["original", "staged", "tagged", "int32", "indexed", "storage-capture"]).toContain(variant);
  const modulePath = variant === "original" ? "target/numeric-range-shell-20260928/numeric_range_probe.js"
    : variant === "staged" ? "target/numeric-range-staged-20260928/numeric_transfer_staged_probe.js"
    : variant === "tagged" ? "target/numeric-range-tagged-20260928/numeric_transfer_tagged_probe.js"
    : variant === "int32" ? "target/numeric-range-int32-20260928/numeric_transfer_int32_probe.js"
    : variant === "indexed" ? "target/numeric-range-indexed-20260928/numeric_transfer_indexed_probe.js"
    : "target/numeric-range-storage-capture-20260928/numeric_transfer_storage_capture_probe.js";
  const expected = createHash("sha256").update(readFileSync(modulePath)).digest("hex");
  const response = await page.request.get("/probe.js");
  expect(response.ok()).toBe(true);
  expect(createHash("sha256").update(await response.body()).digest("hex")).toBe(expected);
  const urls: string[] = [];
  page.on("request", request => urls.push(new URL(request.url()).pathname));
  let failed = false;
  try {
    await page.goto("/");
    if (variant === "storage-capture") {
      // An unavailable inspector is a setup failure, not a numeric counterexample.
      expect(await page.evaluate(() => typeof (globalThis as typeof globalThis & {
        $vm?: { indexingMode?: unknown };
      }).$vm?.indexingMode)).toBe("function");
    }
    const result = await page.evaluate(async () => {
      const path = "/probe.js";
      const probe = await import(/* @vite-ignore */ path) as typeof import("../harness/numeric_range_probe");
      return probe.probeNumericRange(10_000);
    });
    expect(result).toEqual({ iterations: "10000", checks: "150000" });
    expect(urls).toEqual(["/", "/probe.js"]);
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    // Evidence is retained even when the numerical assertion throws.
    try {
      await testInfo.attach("static-host.json", { body: JSON.stringify({ variant, sha256: expected, urls }), contentType: "application/json" });
    } catch (error) {
      if (!failed) throw error;
    }
  }
});
