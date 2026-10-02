/** Bounded standalone runner. Prints every result; never retries failed cases.
 * Usage: node scripts/run-jsc-number-repro.mjs JSC BUNDLE MODE DELAY COUNT [COMPARISON]
 * MODE: normal | no-ftl | baseline | no-jit | no-jit-serial-gc |
 * no-jit-polling | no-jit-posix | no-jit-no-gc; DELAY: 0 | 4; COUNT: 1..20.
 * Extra no-jit modes isolate engine context, not production browser settings.
 * Set DYLD_FRAMEWORK_PATH/DYLD_LIBRARY_PATH explicitly for a bundled macOS JSC.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, isAbsolute } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { comparisonVariants, transformJscComparison } from "../tests/browser/diagnostics/jsc_comparison_variants.mjs";

const preservedSha256 = "bb0387bfa73e13eec77611ca9b8cfcb70cbbd51f8f99a18d066ca2ceb88f277b";
const tierOptions = {
  normal: ["--useJIT=true"],
  "no-ftl": ["--useJIT=true", "--useFTLJIT=false"],
  baseline: ["--useJIT=true", "--useDFGJIT=false", "--useFTLJIT=false"],
  "no-jit": ["--useJIT=false"],
  "no-jit-serial-gc": ["--useJIT=false", "--useConcurrentGC=false"],
  "no-jit-polling": ["--useJIT=false", "--usePollingTraps=true"],
  "no-jit-posix": ["--useJIT=false", "--useMachForExceptions=false"],
  "no-jit-no-gc": ["--useJIT=false", "--useGC=false"],
};

/** jsc quit() returns zero even on reported failures. Require complete evidence. */
export function readJscOutcome(child, mode) {
  let report;
  try { report = JSON.parse(child.stdout.trim()); } catch { return { passed: false, reason: "invalid-output" }; }
  const optionsMatch = options => {
    if (!options || !Object.hasOwn(tierOptions, mode)) return false;
    return tierOptions[mode].every(option => {
      const [name, value] = option.slice(2).split("=");
      return value === "true" ? options[name] === true || options[name] === 1 : options[name] === false || options[name] === 0;
    });
  };
  const passed = !child.error && child.status === 0 && child.signal === null &&
    report?.outcome === "passed" && report.result?.mode === "tiny-wasm" &&
    report.result.iterations === 10000 && report.result.reads === 20000 &&
    Array.isArray(report.diagnostic?.events) && report.diagnostic.events.length === 0 &&
    report.diagnostic.omitted === 0 && (mode === undefined ||
      (optionsMatch(report.initialEngineOptions) && optionsMatch(report.finalEngineOptions)));
  return { passed, report };
}

function main(args) {
  const [jsc, bundle, mode, delay, countText, comparison = "original"] = args;
  const count = Number(countText);
  if ((args.length !== 5 && args.length !== 6) || !isAbsolute(jsc) || !isAbsolute(bundle) || !comparisonVariants.includes(comparison) ||
      !Object.hasOwn(tierOptions, mode) || !["0", "4"].includes(delay) ||
      !/^(?:[1-9]|1[0-9]|20)$/.test(countText)) throw new Error("Expected absolute JSC and bundle paths, mode, delay (0|4), and count (1..20)");
  const env = Object.fromEntries(Object.entries(process.env)
    .filter(([key]) => !key.startsWith("JSC_") && !key.startsWith("__XPC_JSC_")));
  const runner = fileURLToPath(new URL("../tests/browser/diagnostics/jsc_number_runner.js", import.meta.url));
  const runnerSha256 = createHash("sha256").update(readFileSync(runner)).digest("hex");
  let passed = 0;
  // Derived diagnostic output only; never overwrite the preserved input.
  const generatedDirectory = comparison === "original" ? null : mkdtempSync(resolve(tmpdir(), "breditor-comparison-"));
  const generatedPath = generatedDirectory === null ? null : resolve(generatedDirectory, "comparison.mjs");
  try {
    for (let batch = 1; batch <= count; batch++) {
      if (createHash("sha256").update(readFileSync(runner)).digest("hex") !== runnerSha256) {
        throw new Error("Standalone host changed during run; refusing mixed evidence");
      }
      const source = readFileSync(bundle, "utf8");
      const sha256 = createHash("sha256").update(source).digest("hex");
      if (sha256 !== preservedSha256) throw new Error("Reproduction bundle changed; refusing mixed evidence");
      const transformed = transformJscComparison(source, comparison);
      const executedSha256 = createHash("sha256").update(transformed).digest("hex");
      if (generatedPath !== null) writeFileSync(generatedPath, transformed);
      const child = spawnSync(jsc, ["--dumpOptions=1", ...tierOptions[mode], runner, "--", generatedPath ?? bundle, delay],
        { env, timeout: 35000, killSignal: "SIGKILL", encoding: "utf8", maxBuffer: 1024 * 1024 });
      const outcome = readJscOutcome(child, mode);
      if (outcome.passed) passed++;
      console.log(JSON.stringify({ mode, batch, comparison, minimumDelay: Number(delay), sha256, executedSha256, runnerSha256,
        status: child.status, signal: child.signal, error: child.error?.message,
        ...outcome, options: child.stderr }));
    }
  } finally {
    if (generatedPath !== null) { try { unlinkSync(generatedPath); } catch (error) { if (error.code !== "ENOENT") throw error; } }
    if (generatedDirectory !== null) rmdirSync(generatedDirectory);
  }
  console.log(JSON.stringify({ summary: { mode, comparison, minimumDelay: Number(delay), passed, failed: count - passed, total: count } }));
  if (passed !== count) process.exitCode = 1;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) main(process.argv.slice(2));
