import { expect, it } from "vitest";
import { measureBoundaryCost } from "./boundary_cost";

it("retains paired samples, alternating order and independently checked checksums", () => {
  let time = 0;
  const reports = measureBoundaryCost(32, 3, () => ++time);
  expect(reports.map(report => report.name)).toEqual(["commonIntegers", "mixedNumbers"]);
  for (const report of reports) {
    expect(report.pairs.map(pair => pair.candidateFirst)).toEqual([false, true, false]);
    expect(report.warmupsPerArm).toBe(2);
    expect(report.pairedDeltaMedianNsPerValue).toBe(0);
    expect(report.baselineMedianMs).toBe(1);
    expect(report.candidateMedianMs).toBe(1);
    for (const pair of report.pairs) {
      expect(pair.baseline.checksum).toBe(report.expectedChecksum);
      expect(pair.candidate.checksum).toBe(report.expectedChecksum);
    }
  }
  expect(time).toBe(40);
});
it("rejects invalid or unbounded benchmark work", () => {
  for (const count of [0, -16, 17, 1_000_016, NaN, Infinity]) expect(() => measureBoundaryCost(count, 1)).toThrow("Invalid bounded");
  for (const count of [0, -1, 1.5, 10, NaN]) expect(() => measureBoundaryCost(16, count)).toThrow("Invalid bounded");
});
it("rejects invalid clock readings but does not invent a precision floor", () => {
  expect(() => measureBoundaryCost(16, 1, () => NaN)).toThrow("Invalid benchmark sample");
  let time = 0;
  expect(() => measureBoundaryCost(16, 1, () => --time)).toThrow("Invalid benchmark sample");
  expect(measureBoundaryCost(16, 1, () => 0)[0]!.baselineMedianMs).toBe(0);
});
