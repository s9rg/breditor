/** Version-pinned native debugger for our standalone numeric reproduction.
 * Usage: node scripts/debug-jsc-number-repro.mjs WEBKIT_ROOT BUNDLE TIER SCENARIO COUNT
 * TIER: normal|baseline|no-jit; SCENARIO: probe|negative-control|
 * probe-conversion|probe-conversion-slow|conversion-control|probe-replay|
 * probe-guard|guard-control|probe-unconditional|probe-select-control|
 * probe-select-swap|probe-select-relocated|probe-select-branch|
 * probe-select-snapshot|select-branch-conformance; COUNT: 1..10.
 * probe-replay captures the original fault BEFORE single-stepping the numeric
 * path again in the disposable child. A successful replay is NOT a fix/pass.
 * probe-guard instruments only the child's memory after first conversion;
 * never changes the installed engine. Timing/layout are changed by the guard.
 * The slow scenario permits 120 seconds under always-hit breakpoints only;
 * ordinary qualification keeps its 30-second watchdog.
 * Requires macOS debugger authorization. Never enables it, resigns a binary,
 * attaches to existing processes, or rewrites the preserved bundle.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, isAbsolute } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readJscOutcome } from "./run-jsc-number-repro.mjs";

const frameworkSha256 = "7f5f6858e7c990f616850c129757548483f56041f9cc7acff2771581ecfa903d";
const bundleSha256 = "bb0387bfa73e13eec77611ca9b8cfcb70cbbd51f8f99a18d066ca2ceb88f277b";
const tiers = { normal: ["--useJIT=true"], baseline: ["--useJIT=true", "--useDFGJIT=false", "--useFTLJIT=false"], "no-jit": ["--useJIT=false"] };
// All four false-return blocks in the hash-pinned arm64 objectConstructorIs.
const falseReturnAddresses = ["0x112cee0", "0x112cf28", "0x112cf60", "0x112cf78"];
const quote = value => JSON.stringify(value);
const hash = bytes => createHash("sha256").update(bytes).digest("hex");

/** Decode only a tagged int/double for this pinned JSValue64 representation. */
export function decodeNativeNumber(encoded) {
  if (typeof encoded !== "string" || !/^0x[0-9a-f]{1,16}$/i.test(encoded)) return null;
  const bits = BigInt(encoded);
  if (bits >= 0xfffe000000000000n) return Number(BigInt.asIntN(32, bits));
  if ((bits >> 49n) === 0n) return null;
  const view = new DataView(new ArrayBuffer(8));
  view.setBigUint64(0, BigInt.asUintN(64, bits - 0x2000000000000n), false);
  return view.getFloat64(0, false);
}

/** Analyze only the first FCSEL with independently saved before/after state.
 * HI means carry set and zero clear. This diagnoses a captured mismatch, not
 * whether its underlying cause is in the engine, OS, CPU, or instrumentation.
 */
export function analyzeSelectSnapshot(capture) {
  if (capture?.selectPatch?.variant !== "snapshot") return null;
  const registers = capture.registers;
  const required = ["x4", "x5", "x7", "x11", "x12", "x13"];
  if (required.some(name => !/^0x[0-9a-f]{1,16}$/i.test(registers?.[name] ?? ""))) return null;
  const before = BigInt(registers.x7), after = BigInt(registers.x11);
  const hi = (before & 0x20000000n) !== 0n && (before & 0x40000000n) === 0n;
  const expected = registers[hi ? "x5" : "x4"];
  return { originalInstructionAddress: "0x112ce98", condition: "hi", conditionWasTrue: hi,
    flagsBefore: registers.x7, flagsAfter: registers.x11, flagsUnchanged: before === after,
    doubleSourceUnchanged: BigInt(registers.x4) === BigInt(registers.x13),
    integerCandidateBits: registers.x5, doubleCandidateBits: registers.x4,
    expectedBits: expected, actualBits: registers.x12,
    resultMatchesCondition: BigInt(expected) === BigInt(registers.x12) };
}

export function readNativeOutcome(child, scenario, tier) {
  const lines = (child.stdout ?? "").split(/\r?\n/);
  let capture;
  try {
    const snapshots = lines.filter(line => line.startsWith("BREDITOR_NATIVE_CAPTURE="));
    if (snapshots.length !== 1) return { outcome: "incomplete-debugger-run" };
    capture = JSON.parse(snapshots[0].slice("BREDITOR_NATIVE_CAPTURE=".length));
    if (capture === null || typeof capture !== "object" || Array.isArray(capture)) return { outcome: "invalid-debugger-output" };
  } catch { return { outcome: "invalid-debugger-output" }; }
  if (child.error || child.status !== 0 || child.signal != null) return { outcome: "debugger-error", capture };
  // A failed installation or a different experiment must not be attributed to
  // the requested variant, even when the child stopped rather than completed.
  if (scenario.startsWith("probe-select-") && capture.selectPatch?.variant !== scenario.slice("probe-select-".length)) {
    return { outcome: "missing-or-invalid-select-variant", capture };
  }
  if (capture.stopped && ((capture.breakpointStop && capture.breakpointHits > 0) ||
      (["probe-guard", "guard-control"].includes(scenario) && capture.guardStop === true))) {
    const operands = [decodeNativeNumber(capture.registers?.x0), decodeNativeNumber(capture.registers?.x2)];
    if (scenario === "guard-control" && capture.guard?.control === true && capture.guardStop &&
        capture.guardPhase === "first" && operands[0] === 2048 && operands[1] === 2048 &&
        capture.registers?.x3 === "0x0000000000000000" && capture.registers?.x4 === "0x40a0000000000000") {
      return { outcome: "guard-control-confirmed", operands, capture };
    }
    if (scenario === "conversion-control" && capture.fileAddress === "0x112ce9c" &&
        operands[0] === 2048 && operands[1] === 2048 &&
        Number(capture.registers?.d0) === 2048 && Number(capture.registers?.d1) === 2048) {
      return { outcome: "conversion-control-confirmed", operands, capture };
    }
    return { outcome: scenario === "negative-control" && operands[0] === 2049 && operands[1] === 2048
      ? "negative-control-confirmed" : "native-stop-needs-inspection", operands, capture,
      selectSnapshot: analyzeSelectSnapshot(capture) };
  }
  const reports = lines.filter(line => line.startsWith('{"outcome":'));
  if (scenario === "select-branch-conformance") {
    let report;
    try { if (reports.length === 1) report = JSON.parse(reports[0]); } catch { /* Reject malformed output. */ }
    const match = value => value && tiers[tier]?.every(option => {
      const [name, requested] = option.slice(2).split("=");
      return value[name] === (requested === "true" ? 1 : 0) || value[name] === (requested === "true");
    });
    const passed = capture.exited && capture.exitStatus === 0 && capture.breakpointHits === 0 &&
      capture.selectPatch?.variant === "branch" && report?.outcome === "passed" && report.checks === 1300 &&
      match(report.initialEngineOptions) && match(report.finalEngineOptions);
    return { outcome: passed ? "select-branch-conformance-confirmed" : "select-branch-conformance-failed", capture, report };
  }
  if (scenario === "probe-guard" && (!capture.guard || capture.guard.control !== false)) {
    return { outcome: "missing-or-invalid-guard", capture };
  }
  if (!scenario.startsWith("probe") || !capture.exited || capture.exitStatus !== 0 || capture.breakpointHits !== 0 || reports.length !== 1) {
    return { outcome: "unconfirmed-control-or-stop", capture };
  }
  const probe = readJscOutcome({ stdout: reports[0], status: 0, signal: null }, tier);
  if (/^Standalone probe exceeded (?:30|120) seconds$/.test(probe.report?.error ?? "")) {
    return { outcome: "probe-timeout-inconclusive", capture, probe };
  }
  return { outcome: probe.passed ? "probe-passed-no-native-stop" : "probe-failed-without-native-stop", capture, probe };
}

function main(args) {
  const [root, bundle, tier, scenario, countText] = args;
  if (process.platform !== "darwin" || process.arch !== "arm64" || args.length !== 5 || !isAbsolute(root) || !isAbsolute(bundle) ||
      !Object.hasOwn(tiers, tier) || !["probe", "probe-unconditional", "probe-replay", "probe-guard", "guard-control", "probe-select-control", "probe-select-swap", "probe-select-relocated", "probe-select-branch", "probe-select-snapshot", "select-branch-conformance", "negative-control", "probe-conversion", "probe-conversion-slow", "conversion-control"].includes(scenario) || !/^(?:[1-9]|10)$/.test(countText)) {
    throw new Error("Expected arm64 macOS, absolute WebKit root/bundle, tier, scenario and count 1..10");
  }
  const framework = resolve(root, "JavaScriptCore.framework/Versions/A/JavaScriptCore");
  const shell = resolve(root, "JavaScriptCore.framework/Versions/A/Helpers/jsc");
  if (hash(readFileSync(framework)) !== frameworkSha256 || hash(readFileSync(bundle)) !== bundleSha256) throw new Error("Pinned binary or bundle changed; refusing address-based debugging");
  const runner = fileURLToPath(new URL("../tests/browser/diagnostics/jsc_number_runner.js", import.meta.url));
  const capture = fileURLToPath(new URL("../tests/browser/diagnostics/jsc_native_capture.py", import.meta.url));
  const runnerSha256 = hash(readFileSync(runner));
  const captureSha256 = hash(readFileSync(capture));
  const selectHelper = fileURLToPath(new URL("../tests/browser/diagnostics/jsc_native_select_patch.py", import.meta.url));
  const selectHelperSha256 = hash(readFileSync(selectHelper));
  const conformance = scenario === "select-branch-conformance";
  const conformanceRunner = fileURLToPath(new URL("../tests/browser/diagnostics/jsc_select_conformance.js", import.meta.url));
  const conformanceSha256 = hash(readFileSync(conformanceRunner));
  const condition = "($x0==0x40a2000000000000ULL||$x2==0x40a2000000000000ULL||$x0==0xfffe000000000800ULL||$x2==0xfffe000000000800ULL)";
  const negative = 'const view=new DataView(new ArrayBuffer(8));view.setFloat64(0,2049,true);print(Object.is(view.getFloat64(0,true),2048));';
  const conversion = scenario.startsWith("probe-conversion") || scenario === "conversion-control";
  const slow = scenario === "probe-conversion-slow";
  // At +120, the first fcsel has executed, but the right operand has not yet
  // overwritten d1. For the pinned double-encoded left input, d0 must equal d1.
  const conversionCondition = `($x0==0x40a2000000000000ULL&&$x2==0xfffe000000000800ULL${scenario.startsWith("probe-conversion") ? "&&$d0!=$d1" : ""})`;
  const addresses = conformance ? [] : conversion ? ["0x112ce9c"] : falseReturnAddresses;
  const runArgs = conformance ? [...tiers[tier], conformanceRunner] : scenario.startsWith("probe") ? [...tiers[tier], runner, "--", bundle, "4", ...(slow ? ["debug-slow"] : [])]
    : [...tiers[tier], "-e", ["conversion-control", "guard-control"].includes(scenario) ? negative.replace("setFloat64(0,2049", "setFloat64(0,2048") : negative];
  const guarded = ["probe-guard", "guard-control"].includes(scenario);
  const selectVariant = conformance ? "branch" : scenario.startsWith("probe-select-") ? scenario.slice("probe-select-".length) : null;
  const commands = [
    `target create ${quote(shell)}`,
    `settings set target.env-vars ${quote(`DYLD_FRAMEWORK_PATH=${root}`)} ${quote(`DYLD_LIBRARY_PATH=${root}`)}`,
    `target modules add ${quote(framework)}`,
    `command script import ${quote(capture)}`,
    ...(selectVariant ? [`command script import ${quote(selectHelper)}`] : []),
    ...addresses.map(address => `breakpoint set --shlib ${quote(framework)} --address ${address}${["probe-unconditional", "probe-select-snapshot"].includes(scenario) ? "" : ` --condition ${quote(conversion ? conversionCondition : condition)}`}`),
    ...(guarded || selectVariant ? [`breakpoint set --shlib ${quote(framework)} --address 0x112ce24`] : []),
    `process launch -- ${["--dumpOptions=1", ...runArgs].map(quote).join(" ")}`,
    ...(guarded ? [`breditor-install-native-guard${scenario === "guard-control" ? " control" : ""}`, "continue"] : []),
    ...(selectVariant ? [`breditor-native-select ${selectVariant}`, "continue"] : []),
    "process status", "breakpoint list", `breditor-native-capture${scenario === "probe-replay" ? " replay" : ""}`,
  ];
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("JSC_") && !key.startsWith("__XPC_JSC_")));
  // Prevent LLDB's Python import from writing bytecode into the source tree.
  env.PYTHONDONTWRITEBYTECODE = "1";
  for (let batch = 1; batch <= Number(countText); batch++) {
    if (hash(readFileSync(framework)) !== frameworkSha256 || hash(readFileSync(bundle)) !== bundleSha256) {
      throw new Error("Pinned binary or bundle changed during batch; refusing mixed-input results");
    }
    if (hash(readFileSync(runner)) !== runnerSha256 || hash(readFileSync(capture)) !== captureSha256 ||
        hash(readFileSync(selectHelper)) !== selectHelperSha256 || hash(readFileSync(conformanceRunner)) !== conformanceSha256) {
      throw new Error("Diagnostic source changed during batch; refusing mixed-instrumentation results");
    }
    const child = spawnSync("xcrun", ["lldb", "--batch", "--no-lldbinit", ...commands.flatMap(command => ["-o", command])],
      { env, encoding: "utf8", timeout: slow ? 135000 : 45000, killSignal: "SIGKILL", maxBuffer: 2 * 1024 * 1024 });
    const observation = readNativeOutcome(child, scenario, tier);
    console.log(JSON.stringify({ batch, tier, scenario, watchdogSeconds: slow ? 120 : 30, frameworkSha256, bundleSha256, runnerSha256, captureSha256, selectHelperSha256, conformanceSha256, ...observation,
      processStatus: child.status, error: child.error?.message, stdout: child.stdout, stderr: child.stderr }));
    const expected = scenario.startsWith("probe") ? "probe-passed-no-native-stop" : `${scenario}-confirmed`;
    if (observation.outcome !== expected) {
      process.exitCode = 1;
      break; // Preserve first native stop/failure rather than replaying it.
    }
  }
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) main(process.argv.slice(2));
