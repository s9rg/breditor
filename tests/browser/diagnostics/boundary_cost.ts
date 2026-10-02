import { normalizeBoundaryNumber } from "./normalize_boundary_number";

/** Isolated incremental cost, not editor latency or a correctness workaround.
 * Both arms consume the same runtime-loaded doubles and retain their checksum.
 * Fixed work, alternating order, warmup, raw paired samples, no timing gate.
 */
export function measureBoundaryCost(
  iterations = 1_000_000,
  samples = 9,
  now: () => number = () => performance.now(),
) {
  if (!Number.isInteger(iterations) || iterations < 16 || iterations > 1_000_000 || iterations % 16 !== 0 ||
      !Number.isInteger(samples) || samples < 1 || samples > 9) throw new Error("Invalid bounded benchmark work");
  const workloads = {
    commonIntegers: [0, 1, 2, 3, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 65535],
    mixedNumbers: [0, -0, 1, -1, 2048, 1.5, 0.1, 1 / 3, -0.1, 100.25, 65535, 0xffff_ffff, 2 ** -30, -(2 ** -30), 2048 + 2 ** -41, 123456.789],
  };
  const identity = (value: unknown) => value;
  const run = (values: Float64Array, convert: (value: unknown) => unknown) => {
    let checksum = 0;
    const start = now();
    for (let i = 0; i < iterations; i++) checksum += convert(values[i & 15]!) as number;
    const elapsedMs = now() - start;
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0 || !Number.isFinite(checksum)) throw new Error("Invalid benchmark sample");
    return { elapsedMs, checksum };
  };
  const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;
  return Object.entries(workloads).map(([name, input]) => {
    const values = Float64Array.from(input);
    // Same independent addition order as timed arms; never time this oracle.
    let expectedChecksum = 0;
    for (let i = 0; i < iterations; i++) expectedChecksum += input[i & 15]!;
    const check = (sample: { checksum: number }) => {
      if (sample.checksum !== expectedChecksum) throw new Error("Benchmark checksum differs");
    };
    for (let warmup = 0; warmup < 2; warmup++) {
      check(run(values, identity));
      check(run(values, normalizeBoundaryNumber));
    }
    const pairs = Array.from({ length: samples }, (_, index) => {
      const candidateFirst = index % 2 === 1;
      const first = run(values, candidateFirst ? normalizeBoundaryNumber : identity);
      const second = run(values, candidateFirst ? identity : normalizeBoundaryNumber);
      check(first); check(second);
      const baseline = candidateFirst ? second : first;
      const candidate = candidateFirst ? first : second;
      return { candidateFirst, baseline, candidate, deltaNsPerValue: (candidate.elapsedMs - baseline.elapsedMs) * 1e6 / iterations };
    });
    return {
      name, iterations, samples, warmupsPerArm: 2, input, expectedChecksum, pairs,
      baselineMedianMs: median(pairs.map(pair => pair.baseline.elapsedMs)),
      candidateMedianMs: median(pairs.map(pair => pair.candidate.elapsedMs)),
      pairedDeltaMedianNsPerValue: median(pairs.map(pair => pair.deltaNsPerValue)),
    };
  });
}
