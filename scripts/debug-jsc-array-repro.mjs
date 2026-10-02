/** Native post-conversion capture in a disposable JSC child only.
 * node scripts/debug-jsc-array-repro.mjs WEBKIT_ROOT ABSOLUTE_PROBE probe|control|baseline COUNT [0|4] [post-conversion|post-store] [10000|100000]
 * Pins the engine, probe and helpers; leaves the original FCSEL in place.
 * No attaching, on-disk engine changes, signing or debugger-setting changes.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, isAbsolute } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readJscRangeOutcome } from "./run-jsc-range-repro.mjs";

const engineHash = "7f5f6858e7c990f616850c129757548483f56041f9cc7acff2771581ecfa903d";
const probeHash = "efb634fa1e5a8e080e27d177aefcaf181534675c900e60f7649bead66fc5efb9";
const marker = "BREDITOR_ARRAY_CAPTURE=";

export function readArrayCapture(child, variant, iterations = 10000) {
  if (child.error || child.status !== 0 || child.signal != null) return { outcome: "debugger-error" };
  const lines = child.stdout.split(/\r?\n/);
  const captures = lines.filter(line => line.startsWith(marker));
  let capture;
  try { if (captures.length === 1) capture = JSON.parse(captures[0].slice(marker.length)); } catch { /* Invalid evidence. */ }
  if (variant === "baseline") {
    const reports = lines.filter(line => line.startsWith('{"format":"breditor/jsc-range"'));
    if (!capture || capture.guard !== null || capture.stopped || !capture.exited || capture.exitStatus !== 0 || reports.length !== 1) return { outcome: "incomplete-baseline-run", capture };
    const result = readJscRangeOutcome({ stdout: reports[0], status: 0, signal: null }, "no-jit", iterations);
    return { outcome: result.passed ? "baseline-passed" : "baseline-failed", capture, result };
  }
  if (!capture || !["probe", "control"].includes(variant) || capture.guard?.variant !== variant) return { outcome: "missing-or-invalid-guard", capture };
  if (capture.stopped && capture.guardStop) {
    const r = capture.registers;
    if (!["x3", "x9", "x10", "x11", "x12"].every(name => /^0x[0-9a-f]{1,16}$/i.test(r?.[name] ?? ""))) return { outcome: "invalid-registers", capture };
    const input = BigInt(r.x3), limit = BigInt(r.x9);
    const actual = BigInt(r.x10), decoded = BigInt(r.x11);
    const expected = BigInt.asUintN(64, input - 0x2000000000000n);
    const doublePath = input >> 49n && input <= limit && limit === 0xfffdffffffffffffn;
    const sourceConsistent = expected === decoded;
    if (variant === "control") return { outcome: doublePath && sourceConsistent && actual === 0n && decoded !== 0n
      ? "control-confirmed" : "control-stop-needs-inspection", capture };
    return { outcome: doublePath && sourceConsistent && actual !== decoded ? "native-conversion-mismatch" : "native-stop-needs-inspection",
      expectedBits: "0x" + expected.toString(16).padStart(16, "0"), actualBits: r.x10, capture };
  }
  const reports = lines.filter(line => line.startsWith('{"format":"breditor/jsc-range"'));
  if (variant !== "probe" || !capture.exited || capture.exitStatus !== 0 || reports.length !== 1) return { outcome: "incomplete-native-run", capture };
  const result = readJscRangeOutcome({ stdout: reports[0], status: 0, signal: null }, "no-jit", iterations);
  return { outcome: result.passed ? "probe-passed-no-native-stop" : "probe-failed-without-native-stop", capture, result };
}

function main(args) {
  const [root, probe, variant, count, delay = "4", placement = "post-conversion", budgetText = "10000"] = args;
  if (![4, 5, 6, 7].includes(args.length) || process.platform !== "darwin" || process.arch !== "arm64" || !isAbsolute(root) || !isAbsolute(probe) ||
      !["probe", "control", "baseline"].includes(variant) || !/^(?:[1-9]|10)$/.test(count) || !["0", "4"].includes(delay) ||
      !["post-conversion", "post-store"].includes(placement) || !["10000", "100000"].includes(budgetText) ||
      (budgetText === "100000" && delay !== "0")) throw new Error("Expected arm64 macOS, absolute root/probe, probe|control|baseline, count 1..10, optional delay 0|4, placement post-conversion|post-store, budget 10000|100000 (large budget requires zero delay)");
  const framework = resolve(root, "JavaScriptCore.framework/Versions/A/JavaScriptCore");
  const shell = resolve(root, "JavaScriptCore.framework/Versions/A/Helpers/jsc");
  const runner = fileURLToPath(new URL("../tests/browser/diagnostics/jsc_range_runner.js", import.meta.url));
  const helper = fileURLToPath(new URL("../tests/browser/diagnostics/jsc_native_array_capture.py", import.meta.url));
  const hash = path => createHash("sha256").update(readFileSync(path)).digest("hex");
  if (hash(framework) !== engineHash || hash(probe) !== probeHash) throw new Error("Pinned engine or probe differs");
  const sources = [framework, shell, probe, runner, helper].map(path => ({ path, sha256: hash(path) }));
  const q = JSON.stringify;
  const commands = ["target create " + q(shell),
    // Match an ordinary launch's address randomization instead of LLDB's
    // repeatable address layout. This is local to this debugger target.
    "settings set target.disable-aslr false",
    "settings set target.env-vars " + q("DYLD_FRAMEWORK_PATH=" + root) + " " + q("DYLD_LIBRARY_PATH=" + root),
    "target modules add " + q(framework), "command script import " + q(helper),
    ...(variant === "baseline" ? [] : ["breakpoint set --shlib " + q(framework) + " --address 0xf7c074"]),
    "process launch -- " + ["--useJIT=false", runner, "--", probe, delay, budgetText].map(q).join(" "),
    ...(variant === "baseline" ? [] : ["breditor-array-install " + variant + " " + placement, "continue"]), "breditor-array-capture"];
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("JSC_") && !key.startsWith("__XPC_JSC_")));
  env.PYTHONDONTWRITEBYTECODE = "1";
  for (let attempt = 1; attempt <= Number(count); attempt++) {
    for (const source of sources) if (hash(source.path) !== source.sha256) throw new Error("Diagnostic input changed");
    const child = spawnSync("xcrun", ["lldb", "--batch", "--no-lldbinit", ...commands.flatMap(command => ["-o", command])],
      { env, encoding: "utf8", timeout: 45_000, killSignal: "SIGKILL", maxBuffer: 2 * 1024 * 1024 });
    for (const source of sources) if (hash(source.path) !== source.sha256) throw new Error("Diagnostic input changed");
    const result = readArrayCapture(child, variant, Number(budgetText));
    console.log(JSON.stringify({ attempt, variant, placement: variant === "baseline" ? null : placement, minimumTimerDelay: delay, iterations: budgetText, disableAslr: false, sources, ...result, status: child.status, signal: child.signal,
      error: child.error?.message, stdout: child.stdout, stderr: child.stderr }));
    const expected = variant === "baseline" ? "baseline-passed" : variant === "control" ? "control-confirmed" : "probe-passed-no-native-stop";
    if (result.outcome !== expected) { process.exitCode = 1; break; }
  }
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) main(process.argv.slice(2));
