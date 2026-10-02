import { expect, it } from "vitest";
// @ts-expect-error Intentionally a Node-only diagnostic CLI.
import { readBuildComparison } from "../../../scripts/compare-webkit-build.mjs";
const complete = { iterations: "10000", checks: "150000" };
it("requires exact work counters and only the two static browser requests", () => {
  expect(readBuildComparison(complete, undefined, ["/", "/probe.js"]).outcome).toBe("passed");
  expect(readBuildComparison({ ...complete, checks: "149999" }, undefined, ["/", "/probe.js"]).outcome).toBe("incomplete-probe");
  expect(readBuildComparison(complete, undefined, ["/", "/probe.js", "/extra.js"]).outcome).toBe("incomplete-probe");
});
it("distinguishes an actual numeric rejection from a transport or malformed-report error", () => {
  expect(readBuildComparison(undefined, 'page.evaluate: numeric range rejected: {"iteration":1}\nstack', []).outcome).toBe("numeric-failure");
  expect(readBuildComparison(undefined, "page crashed", []).outcome).toBe("transport-error");
  expect(readBuildComparison(undefined, "numeric range rejected: invalid", []).outcome).toBe("transport-error");
  expect(readBuildComparison(complete, "Browser close timeout", ["/", "/probe.js"]).outcome).toBe("transport-error");
});
