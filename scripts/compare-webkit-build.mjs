/** Same pinned JS bytes across independently installed WebKit builds.
 * Usage: node scripts/compare-webkit-build.mjs ABSOLUTE_PLAYWRIGHT_MODULE ABSOLUTE_STAGED_PROBE normal|no-jit COUNT
 * No native debugger, engine patch, transforms or developer VM. Uses fresh
 * disposable browsers and an ephemeral read-only loopback server. Set
 * PLAYWRIGHT_BROWSERS_PATH externally when selecting an isolated installation.
 */
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

function deadline(promise, ms, label) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(label)), ms); })]).finally(() => clearTimeout(timer));
}
export function readBuildComparison(result, error, urls) {
  if (error) {
    const marker = "numeric range rejected: ", start = error.indexOf(marker);
    if (start >= 0) {
      try { return { outcome: "numeric-failure", failure: JSON.parse(error.slice(start + marker.length).split("\n")[0]), error }; } catch { /* Invalid evidence. */ }
    }
    return { outcome: "transport-error", error };
  }
  return { outcome: result?.iterations === "10000" && result?.checks === "150000" && JSON.stringify(urls) === '["/","/probe.js"]' ? "passed" : "incomplete-probe", result };
}
async function main(args) {
  const [library, probe, mode, count] = args;
  if (args.length !== 4 || process.platform !== "darwin" || !isAbsolute(library) || !isAbsolute(probe) || !["normal", "no-jit"].includes(mode) || !/^(?:[1-9]|[1-9][0-9]|100)$/.test(count)) throw new Error("Expected absolute Playwright module, pinned staged probe, normal|no-jit and count 1..100 on macOS");
  const { webkit } = await import(pathToFileURL(library).href);
  const framework = resolve(dirname(webkit.executablePath()), "JavaScriptCore.framework/Versions/A/JavaScriptCore");
  const packagePath = resolve(dirname(library), "package.json");
  const hash = p => createHash("sha256").update(readFileSync(p)).digest("hex");
  if (hash(probe) !== "efb634fa1e5a8e080e27d177aefcaf181534675c900e60f7649bead66fc5efb9") throw new Error("Pinned probe differs");
  const sources = [library, packagePath, framework, probe, fileURLToPath(import.meta.url)].map(path => ({ path, sha256: hash(path) }));
  const version = JSON.parse(readFileSync(packagePath, "utf8")).version;
  const bytes = readFileSync(probe);
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("JSC_") && !k.startsWith("__XPC_JSC_")));
  for (const prefix of ["JSC_", "__XPC_JSC_"]) Object.assign(env, { [prefix + "useJIT"]: mode === "no-jit" ? "false" : "true", [prefix + "dumpOptions"]: "1" });
  const server = createServer((req, res) => {
    if (req.method !== "GET" || !["/", "/probe.js"].includes(req.url)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": req.url === "/" ? "text/html" : "text/javascript", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
    res.end(req.url === "/" ? "<!doctype html><title>WebKit build comparison</title>" : bytes);
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  try {
    for (let attempt = 1; attempt <= Number(count); attempt++) {
      for (const s of sources) if (hash(s.path) !== s.sha256) throw new Error("Comparison input changed");
      let browser, result, error, browserVersion;
      const urls = [];
      try {
        browser = await webkit.launch({ env, headless: true, timeout: 15000 });
        browserVersion = browser.version();
        const page = await browser.newPage();
        page.on("request", r => urls.push(new URL(r.url()).pathname));
        await page.goto("http://127.0.0.1:" + server.address().port, { timeout: 10000 });
        result = await deadline(page.evaluate(async () => (await import("/probe.js")).probeNumericRange(10000)), 20000, "Probe timeout");
      } catch (e) { error = String(e); }
      finally { if (browser) await deadline(browser.close(), 15000, "Browser close timeout").catch(e => { error = String(e); }); }
      for (const s of sources) if (hash(s.path) !== s.sha256) throw new Error("Comparison input changed");
      const observation = readBuildComparison(result, error, urls);
      console.log(JSON.stringify({ attempt, playwrightVersion: version, browserVersion, mode, executable: webkit.executablePath(), sources, urls, ...observation }));
      if (observation.outcome !== "passed") process.exitCode = 1;
      // Preserve all numeric counterexamples, but don't repeat broken setup.
      if (!["passed", "numeric-failure"].includes(observation.outcome)) break;
    }
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) await main(process.argv.slice(2));
