/** Bounded standalone control for the smaller range/value-transfer probe.
 * node scripts/run-jsc-range-repro.mjs ABSOLUTE_JSC ABSOLUTE_MODULE normal|no-jit 0|4 COUNT [10000|100000]
 * Set DYLD_FRAMEWORK_PATH and DYLD_LIBRARY_PATH to the matching framework root.
 * No installed binaries are modified. Every attempt is reported, with no retries.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export function readJscRangeOutcome(child, mode, iterations = 10000) {
  let report;
  try { report = JSON.parse(child.stdout.trim()); } catch { return { passed: false, reason: "invalid-output" }; }
  const enabled = mode === "normal";
  const matches = options => options && (options.useJIT === enabled || options.useJIT === Number(enabled));
  const passed = [10000, 100000].includes(iterations) && ["normal", "no-jit"].includes(mode) && !child.error && child.status === 0 && child.signal === null &&
    report?.format === "breditor/jsc-range" && report.outcome === "passed" && report.error === null &&
    report.result?.iterations === String(iterations) && report.result?.checks === String(iterations * 15) &&
    Array.isArray(report.events) && report.events.length === 0 &&
    matches(report.initialEngineOptions) && matches(report.finalEngineOptions);
  return { passed: !!passed, report };
}

function main(args) {
  const [jsc, probe, mode, delay, countText, budgetText = "10000"] = args;
  if (![5, 6].includes(args.length) || !isAbsolute(jsc) || !isAbsolute(probe) || !["normal", "no-jit"].includes(mode) ||
      !["0", "4"].includes(delay) || !/^(?:[1-9]|10)$/.test(countText) || !["10000", "100000"].includes(budgetText) ||
      (budgetText === "100000" && delay !== "0")) throw new Error("Expected absolute JSC/module, normal|no-jit, 0|4, count 1..10, optional budget 10000|100000 (large budget requires zero delay)");
  const runner = fileURLToPath(new URL("../tests/browser/diagnostics/jsc_range_runner.js", import.meta.url));
  const hash = path => createHash("sha256").update(readFileSync(path)).digest("hex");
  const sources = [jsc, probe, runner].map(path => ({ path, sha256: hash(path) }));
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("JSC_") && !key.startsWith("__XPC_JSC_")));
  let passed = 0;
  for (let attempt = 1; attempt <= Number(countText); attempt++) {
    for (const source of sources) if (hash(source.path) !== source.sha256) throw new Error("Diagnostic input changed during run");
    const child = spawnSync(jsc, [`--useJIT=${mode === "normal"}`, runner, "--", probe, delay, budgetText],
      { env, timeout: 35_000, killSignal: "SIGKILL", encoding: "utf8", maxBuffer: 1024 * 1024 });
    for (const source of sources) if (hash(source.path) !== source.sha256) throw new Error("Diagnostic input changed during run");
    const outcome = readJscRangeOutcome(child, mode, Number(budgetText));
    if (outcome.passed) passed++;
    console.log(JSON.stringify({ attempt, mode, minimumTimerDelay: delay, iterations: budgetText, sources,
      status: child.status, signal: child.signal, error: child.error?.message, stderr: child.stderr, ...outcome }));
  }
  console.log(JSON.stringify({ summary: { mode, minimumTimerDelay: delay, iterations: budgetText, passed, failed: Number(countText) - passed, total: Number(countText) } }));
  if (passed !== Number(countText)) process.exitCode = 1;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) main(process.argv.slice(2));
