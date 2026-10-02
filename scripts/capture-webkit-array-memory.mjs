/** Read a failed synthetic array's raw storage, attaching only AFTER failure.
 * Usage: node scripts/capture-webkit-array-memory.mjs ROOT PROBE control|probe COUNT
 * The cold failure branch retains its private array and describes its address.
 * No engine instructions are patched. Only our fresh WebProcess is inspected.
 */
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { webkit } from "playwright";

function deadline(promise, ms, label) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(label)), ms); })]).finally(() => clearTimeout(timer));
}

export function readColdArrayMemory(child, evidence, variant) {
  if (child.error || child.status !== 0 || child.signal != null) return { outcome: "debugger-error" };
  const rows = child.stdout.split(/\r?\n/).filter(l => l.startsWith("BREDITOR_COLD_MEMORY="));
  let memory;
  try { if (rows.length === 1) memory = JSON.parse(rows[0].slice("BREDITOR_COLD_MEMORY=".length)); } catch { /* Invalid evidence. */ }
  if (!memory?.pointerMatches || !/^[0-9a-f]{80}$/.test(memory.slotsHex ?? "")) return { outcome: "invalid-memory-capture", memory };
  const bits = Array.from({ length: 5 }, (_, i) => memory.slotsHex.slice(i * 16, i * 16 + 16).match(/../g).reverse().join(""));
  if (variant === "control") return { outcome: bits.join(",") === ["40a0000000000000", "0000000000000000", "40a0000000000000", "40a0000000000000", "40a0000000000000"].join(",") ? "control-confirmed" : "control-failed", memory, bits };
  const slot = evidence.representation;
  if (evidence.storage !== "ArrayWithDouble" || !Number.isInteger(slot) || slot < 0 || slot > 4 || evidence.retained !== true ||
      !Array.isArray(evidence.values) || evidence.values.length !== 5 || !evidence.values.every(v => /^[0-9a-f]{16}$/.test(v?.bits ?? ""))) return { outcome: "invalid-failure-evidence", memory, bits };
  const agrees = bits.every((b, i) => b === evidence.values[i].bits);
  const source = ["literal", "typed", "parsed", "converted", "selected"][slot];
  const sourceBits = evidence.staged?.[source]?.bits;
  const knownMismatch = ["3ff0000000000000", "40a0000000000000"].includes(sourceBits) && bits[slot] === "0000000000000000" && evidence.value?.bits === bits[slot];
  return { outcome: agrees && knownMismatch ? "stored-zero-confirmed" : "memory-needs-inspection", memory, bits };
}

async function main(args) {
  const [root, module, variant, count] = args;
  if (args.length !== 4 || process.platform !== "darwin" || process.arch !== "arm64" || !isAbsolute(root) || !isAbsolute(module) ||
      !["control", "probe"].includes(variant) || !/^(?:[1-9]|10)$/.test(count) || resolve(dirname(webkit.executablePath())) !== resolve(root)) throw new Error("Expected pinned arm64 WebKit root, absolute memory probe, control|probe and count 1..10");
  const framework = resolve(root, "JavaScriptCore.framework/Versions/A/JavaScriptCore");
  const hash = p => createHash("sha256").update(readFileSync(p)).digest("hex");
  if (hash(framework) !== "7f5f6858e7c990f616850c129757548483f56041f9cc7acff2771581ecfa903d" || hash(module) !== "7092bdc920bfda12d2882a796b9815242fd46b088e5ab1fd745aef390522b015") throw new Error("Pinned engine or probe differs");
  const sources = [framework, module, fileURLToPath(import.meta.url)].map(path => ({ path, sha256: hash(path) }));
  const bytes = readFileSync(module);
  const server = createServer((req, res) => {
    if (req.method !== "GET" || !["/", "/probe.js"].includes(req.url)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": req.url === "/" ? "text/html" : "text/javascript", "Cache-Control": "no-store" });
    res.end(req.url === "/" ? "<!doctype html><title>Cold array memory diagnostic</title>" : bytes);
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("JSC_") && !k.startsWith("__XPC_JSC_")));
  for (const prefix of ["JSC_", "__XPC_JSC_"]) Object.assign(env, { [prefix + "useJIT"]: "false", [prefix + "useDollarVM"]: "true", [prefix + "dumpOptions"]: "1" });
  env.PYTHONDONTWRITEBYTECODE = "1";
  try {
    for (let attempt = 1; attempt <= Number(count); attempt++) {
      for (const s of sources) if (hash(s.path) !== s.sha256) throw new Error("Diagnostic input changed");
      let browser, pid, evidence, native, result, transportError;
      try {
        browser = await webkit.launch({ env, headless: true, timeout: 15000 });
        const page = await browser.newPage();
        await page.goto("http://127.0.0.1:" + server.address().port, { timeout: 10000 });
        pid = await page.evaluate(() => String(globalThis.$vm.getpid()));
        if (!/^[1-9][0-9]{0,8}$/.test(pid)) throw new Error("Invalid owned WebProcess PID");
        if (variant === "control") {
          evidence = await page.evaluate(() => {
            const a = [0.5, 0.5, 0.5, 0.5, 0.5];
            a[0] = 2048; a[1] = 0; a[2] = 2048; a[3] = 2048; a[4] = 2048;
            globalThis.__breditorFailedArray = a;
            return { nativeDescription: globalThis.$vm.value(a), storage: globalThis.$vm.indexingMode(a) };
          });
        } else {
          try {
            result = await deadline(page.evaluate(async () => (await import("/probe.js")).probeNumericRange(10000)), 20000, "Probe timeout");
          } catch (error) {
            const text = String(error), marker = "numeric range rejected: ";
            const start = text.indexOf(marker);
            if (start < 0) throw error;
            evidence = JSON.parse(text.slice(start + marker.length).split("\n")[0]);
          }
        }
        if (evidence) {
          const addresses = /^Object: (0x[0-9a-f]+) with butterfly (0x[0-9a-f]+)\(/i.exec(evidence.nativeDescription ?? "");
          if (!addresses || evidence.storage !== "ArrayWithDouble") throw new Error("Expected retained synthetic double-array description");
          const commands = ["process attach --pid " + pid,
            "script import json; p = lldb.debugger.GetSelectedTarget().GetProcess(); e = lldb.SBError(); h = p.ReadMemory(" + addresses[1] + ", 16, e); ok = e.Success() and len(h) == 16 and int.from_bytes(h[8:16], 'little') == " + addresses[2] + "; b = p.ReadMemory(" + addresses[2] + ", 40, e) if ok else b''; print('BREDITOR_COLD_MEMORY=' + json.dumps({'pointerMatches': ok, 'headerHex': h.hex(), 'slotsHex': b.hex() if e.Success() else None}))",
            "process detach"];
          const child = spawnSync("xcrun", ["lldb", "--batch", "--no-lldbinit", ...commands.flatMap(c => ["-o", c])], { env, encoding: "utf8", timeout: 15000, killSignal: "SIGKILL", maxBuffer: 1024 * 1024 });
          native = { stdout: child.stdout, stderr: child.stderr, status: child.status, signal: child.signal, error: child.error?.message };
          result = readColdArrayMemory(native, evidence, variant);
        } else result = { outcome: result?.iterations === "10000" && result?.checks === "150000" ? "probe-passed" : "incomplete-probe", result };
      } catch (error) { transportError = String(error); }
      finally {
        if (pid && native?.signal) { try { process.kill(Number(pid), "SIGCONT"); } catch { /* Own child exited. */ } }
        if (browser) await deadline(browser.close(), 15000, "Browser close timeout").catch(error => { transportError ??= String(error); });
      }
      for (const s of sources) if (hash(s.path) !== s.sha256) throw new Error("Diagnostic input changed");
      console.log(JSON.stringify({ attempt, variant, pid, sources, ...(transportError ? { outcome: "transport-error", transportError } : result), evidence, native }));
      if (transportError || result.outcome !== (variant === "control" ? "control-confirmed" : "probe-passed")) { process.exitCode = 1; break; }
    }
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) await main(process.argv.slice(2));
