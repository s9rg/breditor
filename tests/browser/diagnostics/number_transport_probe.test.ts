import { expect, it } from "vitest";
import { numberTransportModes, probeNumberTransport, type NumberTransportMode } from "./number_transport_probe";
import { readStartupRejections } from "./startup_recorder";

it.each(numberTransportModes)("the %s fixture compares the exact declared values", async mode => {
  expect(await probeNumberTransport(mode, 20)).toEqual({ mode, iterations: 20, comparisons: 200 });
  expect(readStartupRejections().events).toEqual([]);
});

it("rejects unbounded or unknown probe requests before running", async () => {
  for (const iterations of [0, -1, 1.5, 10_001, NaN, Infinity]) {
    await expect(probeNumberTransport("f64", iterations)).rejects.toThrow("Invalid bounded");
  }
  await expect(probeNumberTransport("unknown" as NumberTransportMode, 1)).rejects.toThrow("Invalid bounded");
});
