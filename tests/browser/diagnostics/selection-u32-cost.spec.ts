import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { selectionU32BitsCandidate } from "./selection_u32_bits_candidate";

test("records paired u32 predicate cost without a timing pass threshold", async ({ page }, info) => {
  const source = readFileSync(new URL("../../../packages/breditor-browser/dist/wasm_selection_adapter.js", import.meta.url), "utf8");
  const original = source.match(/function isU32\(value\) \{\n[^}]+\}/g);
  expect(original).toHaveLength(1);
  await page.goto("about:blank");
  const report = await page.evaluate(({ original, candidate }) => {
    // Compile both exact bodies the same way before warming or timing them.
    // This is isolated predicate cost, not production editor latency.
    const baseline = new Function(`${original}; return isU32;`)() as (value: number) => boolean;
    const bits = new Function(`${candidate}; return isU32;`)() as (value: number) => boolean;
    const iterations = 1000000;
    const median = (values: number[]) => [...values].sort((a, b) => a - b)[4]!;
    const workloads = [
      { name: "commonCoordinates", input: [0, 1, 2, 3, 4, 6, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 65535], accepted: 16 },
      { name: "mixedBoundaries", input: [0, -0, 1, 6, 0x7fffffff, 0x80000000, 0xfffffffe, 0xffffffff,
        -1, 0.5, 1.5, 0xffffffff + 0.5, 0x100000000, Number.MIN_VALUE, Infinity, NaN], accepted: 8 },
    ].map(({ name, input, accepted }) => {
      const values = Float64Array.from(input);
      const expectedChecksum = iterations / 16 * accepted;
      const run = (predicate: (value: number) => boolean) => {
        let checksum = 0;
        const start = performance.now();
        for (let index = 0; index < iterations; index++) if (predicate(values[index & 15]!)) checksum++;
        const elapsedMs = performance.now() - start;
        if (checksum !== expectedChecksum || !Number.isFinite(elapsedMs) || elapsedMs < 0) {
          throw new Error(JSON.stringify({ kind: "invalid-u32-cost-sample", name,
            arm: predicate === baseline ? "original" : "bits", expectedChecksum, checksum, elapsedMs }));
        }
        return { elapsedMs, checksum };
      };
      for (let i = 0; i < 2; i++) { run(baseline); run(bits); }
      const pairs = Array.from({ length: 9 }, (_, index) => {
        const candidateFirst = index % 2 === 1;
        const first = run(candidateFirst ? bits : baseline);
        const second = run(candidateFirst ? baseline : bits);
        const original = candidateFirst ? second : first;
        const candidate = candidateFirst ? first : second;
        return { candidateFirst, original, candidate, deltaNsPerValue: (candidate.elapsedMs - original.elapsedMs) * 1e6 / iterations };
      });
      return { name, iterations, expectedChecksum, pairs, warmupsPerArm: 2,
        originalMedianMs: median(pairs.map(pair => pair.original.elapsedMs)),
        candidateMedianMs: median(pairs.map(pair => pair.candidate.elapsedMs)),
        pairedDeltaMedianNsPerValue: median(pairs.map(pair => pair.deltaNsPerValue)) };
    });
    return { userAgent: navigator.userAgent, workloads };
  }, { original: original![0]!, candidate: selectionU32BitsCandidate });
  await info.attach("selection-u32-cost.json", { body: JSON.stringify(report), contentType: "application/json" });
  expect(report.workloads).toHaveLength(2);
  for (const workload of report.workloads) {
    expect(workload.pairs).toHaveLength(9);
    for (const pair of workload.pairs) {
      expect(pair.original.checksum).toBe(workload.expectedChecksum);
      expect(pair.candidate.checksum).toBe(workload.expectedChecksum);
    }
  }
});
