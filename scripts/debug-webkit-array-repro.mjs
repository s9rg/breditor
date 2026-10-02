/** Bounded native array capture in an owned, disposable Playwright WebProcess.
 * node scripts/debug-webkit-array-repro.mjs WEBKIT_ROOT ABSOLUTE_STAGED_PROBE baseline|control|probe COUNT [PLACEMENT]
 * Placements: post-store, post-conversion, post-store-near, post-store-pattern;
 * probe-only: select-relocated, select-branch, select-entry-control,
 * select-allocation-control. Passing experiments are not proof of a fix.
 * Attaches only to the PID obtained from this script's fresh loopback page.
 * No existing user browser, installed engine, signing or settings are changed.
 * Both guards preserve the original FCSEL. Post-store also keeps its store
 * in place, but requires a guard allocation within direct-branch range.
 */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { webkit } from "playwright";
import { readArrayCapture } from "./debug-jsc-array-repro.mjs";

export function readBrowserArrayCapture(child, variant, probe, placement = "post-store") {
  const native = readArrayCapture(child, variant);
  if (variant !== "baseline" && native.capture?.guard && native.capture.guard.placement !== placement)
    return { outcome: "unexpected-guard-placement", capture: native.capture };
  if (placement === "post-store-pattern" && native.capture?.guard?.variant === variant && native.capture.stopped && native.capture.guardStop) {
    const c = native.capture, r = c.registers;
    const valid = ["x2", "x3", "x10", "x11"].every(k => /^0x[0-9a-f]{1,16}$/i.test(r?.[k] ?? ""));
    const prefix = "000000000000a040".repeat(4);
    const last = variant === "control" ? "000000000000a040" : "0000000000000000";
    const matches = valid && BigInt(r.x2) === 4n && BigInt(r.x10) === 0n && BigInt(r.x11) === 0x40a0000000000000n &&
      c.storedArray?.littleEndianHex === prefix + last && c.storedSlot?.littleEndianHex === last;
    return { outcome: matches ? (variant === "control" ? "control-confirmed" : "native-array-pattern-captured") : "native-pattern-stop-needs-inspection",
      encodedInput: valid ? r.x3 : null, capture: c };
  }
  const incomplete = variant === "baseline" ? "incomplete-baseline-run" : "incomplete-native-run";
  if (native.outcome !== incomplete) return native;
  const c = native.capture;
  const validGuard = variant === "baseline" ? c?.guard === null
    : variant === "probe" && c?.guard?.variant === "probe" && c.guard.placement === placement;
  if (!validGuard || c.stopped || !c.exited || c.exitStatus !== 0) return native;
  const passed = !probe.error && probe.result?.iterations === "10000" && probe.result?.checks === "150000";
  return { outcome: passed ? "browser-" + variant + "-passed" : "browser-" + variant + "-failed", capture: c, probe };
}

function deadline(promise, ms, label) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(label)), ms);
  })]).finally(() => clearTimeout(timer));
}

async function attempt(bytes, helper, selectHelper, variant, placement) {
  const urls = [];
  const server = createServer((req, res) => {
    urls.push(req.url);
    if (req.method !== "GET" || !["/", "/probe.js"].includes(req.url)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": req.url === "/" ? "text/html" : "text/javascript", "Cache-Control": "no-store" });
    res.end(req.url === "/" ? "<!doctype html><title>Owned numeric diagnostic</title>" : bytes);
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("JSC_") && !k.startsWith("__XPC_JSC_")));
  for (const [key, value] of Object.entries({ useJIT: "false", useDollarVM: "true", dumpOptions: "1" })) {
    env["JSC_" + key] = value; env["__XPC_JSC_" + key] = value;
  }
  env.PYTHONDONTWRITEBYTECODE = "1";
  let browser, debuggerProcess, debuggerDone, pid, native, transportError;
  const probe = {};
  try {
    browser = await webkit.launch({ env, headless: true, timeout: 15000 });
    const page = await browser.newPage();
    await page.goto("http://127.0.0.1:" + server.address().port, { timeout: 10000 });
    pid = await page.evaluate(() => String(globalThis.$vm.getpid()));
    if (!/^[1-9][0-9]{0,8}$/.test(pid)) throw new Error("Invalid owned WebProcess PID");
    const commands = ["process attach --pid " + pid, "image list -f JavaScriptCore",
      "command script import " + JSON.stringify(helper)];
    if (placement.startsWith("select-")) commands.push("command script import " + JSON.stringify(selectHelper));
    if (variant !== "baseline") commands.push(
      "script t = lldb.debugger.GetSelectedTarget(); m = t.FindModule(lldb.SBFileSpec('JavaScriptCore')); t.BreakpointCreateByAddress(m.ResolveFileAddress(0xf7c074).GetLoadAddress(t))");
    commands.push("script print('BREDITOR_BROWSER_READY', flush=True)", "continue");
    if (variant !== "baseline") commands.push(placement.startsWith("select-") ? "breditor-array-select " + placement : "breditor-array-install " + variant + " " + placement, "continue");
    commands.push("breditor-array-capture");
    let stdout = "", stderr = "", readyResolve, readyReject;
    const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
    debuggerProcess = spawn("xcrun", ["lldb", "--batch", "--no-lldbinit", ...commands.flatMap(c => ["-o", c])], { env });
    debuggerProcess.stdout.on("data", b => {
      stdout += b;
      if (/^BREDITOR_BROWSER_READY\r?$/m.test(stdout)) readyResolve();
      if (stdout.length > 2 * 1024 * 1024) debuggerProcess.kill("SIGKILL");
    });
    debuggerProcess.stderr.on("data", b => { stderr += b; if (stderr.length > 2 * 1024 * 1024) debuggerProcess.kill("SIGKILL"); });
    debuggerDone = new Promise(resolve => {
      debuggerProcess.once("error", error => { readyReject(error); resolve({ stdout, stderr, error: error.message, status: null, signal: null }); });
      debuggerProcess.once("close", (status, signal) => { readyReject(new Error("Debugger closed before ready")); resolve({ stdout, stderr, status, signal }); });
    });
    await deadline(ready, 15000, "Debugger readiness timeout");
    try {
      probe.result = await deadline(page.evaluate(async () => {
        const module = await import("/probe.js");
        return module.probeNumericRange(10000);
      }), 20000, "Browser probe timeout");
    } catch (error) { probe.error = String(error); }
    // Closing our browser ends an otherwise passing debugger 'continue'.
    await deadline(browser.close(), 10000, "Browser close timeout");
    native = await deadline(debuggerDone, 10000, "Debugger exit timeout");
  } catch (error) { transportError = String(error); }
  finally {
    if (debuggerProcess && debuggerProcess.exitCode === null && debuggerProcess.signalCode === null) {
      debuggerProcess.kill("SIGKILL");
      // Only the PID returned by our fresh page; never an externally supplied PID.
      if (pid) { try { process.kill(Number(pid), "SIGCONT"); } catch { /* Already exited. */ } }
    }
    if (browser) await deadline(browser.close(), 10000, "Cleanup timeout").catch(error => { transportError ??= String(error); });
    if (debuggerDone && !native) native = await deadline(debuggerDone, 5000, "Debugger cleanup timeout").catch(() => undefined);
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
  const result = transportError || !native ? { outcome: "browser-debugger-transport-error", transportError }
    : readBrowserArrayCapture(native, variant, probe, placement);
  return { variant, placement: variant === "baseline" ? null : placement, pid, urls, ...result, probe, native };
}

async function main(args) {
  const [root, probe, variant, count, placement = "post-store"] = args;
  if (![4, 5].includes(args.length) || process.platform !== "darwin" || process.arch !== "arm64" || !isAbsolute(root) || !isAbsolute(probe) ||
      !["baseline", "control", "probe"].includes(variant) || !/^(?:[1-9]|10)$/.test(count) ||
      !["post-store", "post-conversion", "post-store-near", "post-store-pattern", "select-relocated", "select-branch", "select-entry-control", "select-allocation-control"].includes(placement) ||
      (placement.startsWith("select-") && variant !== "probe")) throw new Error("Expected root, staged probe, baseline|control|probe, count 1..10, and supported placement; select placements require probe");
  if (resolve(dirname(webkit.executablePath())) !== resolve(root)) throw new Error("Playwright browser root differs");
  const framework = resolve(root, "JavaScriptCore.framework/Versions/A/JavaScriptCore");
  const helper = fileURLToPath(new URL("../tests/browser/diagnostics/jsc_native_array_capture.py", import.meta.url));
  const selectHelper = fileURLToPath(new URL("../tests/browser/diagnostics/jsc_native_array_select.py", import.meta.url));
  const hash = path => createHash("sha256").update(readFileSync(path)).digest("hex");
  if (hash(framework) !== "7f5f6858e7c990f616850c129757548483f56041f9cc7acff2771581ecfa903d" ||
      hash(probe) !== "efb634fa1e5a8e080e27d177aefcaf181534675c900e60f7649bead66fc5efb9") throw new Error("Pinned engine or probe differs");
  const paths = [framework, probe, helper, selectHelper, fileURLToPath(import.meta.url), fileURLToPath(new URL("./debug-jsc-array-repro.mjs", import.meta.url))];
  const sources = paths.map(path => ({ path, sha256: hash(path) }));
  for (let i = 1; i <= Number(count); i++) {
    for (const s of sources) if (hash(s.path) !== s.sha256) throw new Error("Diagnostic source changed");
    const result = await attempt(readFileSync(probe), helper, selectHelper, variant, placement);
    for (const s of sources) if (hash(s.path) !== s.sha256) throw new Error("Diagnostic source changed");
    console.log(JSON.stringify({ attempt: i, sources, ...result }));
    const expected = variant === "control" ? "control-confirmed" : "browser-" + variant + "-passed";
    if (result.outcome !== expected) { process.exitCode = 1; break; }
  }
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) await main(process.argv.slice(2));
