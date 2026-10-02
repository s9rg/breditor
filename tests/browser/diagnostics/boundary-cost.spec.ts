import { expect, test } from "@playwright/test";

test("records isolated boundary conversion cost without a timing pass threshold", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.waitForFunction(() => typeof window.breditorBoundaryCost === "function");
  const report = await page.evaluate(() => ({
    userAgent: navigator.userAgent,
    timeOrigin: performance.timeOrigin,
    workloads: window.breditorBoundaryCost(),
  }));
  expect(report.workloads).toHaveLength(2);
  for (const workload of report.workloads) {
    expect(workload.iterations).toBe(1_000_000);
    expect(workload.pairs).toHaveLength(9);
    for (const pair of workload.pairs) {
      expect(pair.baseline.checksum).toBe(workload.expectedChecksum);
      expect(pair.candidate.checksum).toBe(workload.expectedChecksum);
    }
  }
  await testInfo.attach("boundary-cost", { body: JSON.stringify(report, null, 2), contentType: "application/json" });
});
