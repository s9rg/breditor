// Raw list Wasm qualification only; no editor DOM, OS clipboard or IME claims.
import assert from "node:assert/strict";
import { realpath } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, firefox, webkit } from "playwright-core";
import { createServer } from "vite";
assert.equal(process.argv.length, 3, "provide the candidate binding directory");
const root = fileURLToPath(new URL("../", import.meta.url));
const directory = await realpath(resolve(process.argv[2]));
const path = relative(await realpath(root), directory);
assert.ok(path.startsWith(`target${sep}`) && !path.split(sep).includes(".."));
const bindingUrl = `/${path.split(sep).map(encodeURIComponent).join("/")}`;
const server = await createServer({configFile: false, root,
  plugins: [{name: "list-wasm-harness", configureServer(instance) {
    instance.middlewares.use((request, response, next) => {
      if (request.url !== "/") return next();
      response.setHeader("Content-Type", "text/html");
      response.end("<!doctype html><title>Flat-list Wasm check</title>");
    });
  }}], optimizeDeps: {noDiscovery: true, entries: []},
  server: {host: "127.0.0.1", port: 0, watch: {ignored: ["**/target/**"]}},
});
try {
  await server.listen();
  const url = `http://127.0.0.1:${server.httpServer.address().port}`;
  for (const [name, type] of Object.entries({chromium, firefox, webkit})) {
    const browser = await type.launch({headless: true});
    try {
      const page = await browser.newPage();
      await page.goto(url);
      const results = await page.evaluate(async bindingUrl => {
        const api = await import(`${bindingUrl}/breditor_wasm.js`);
        api.initSync({module: await (await fetch(`${bindingUrl}/breditor_wasm_bg.wasm`)).arrayBuffer()});
        const {runFlatListWasmScenario} = await import("/scripts/flat-list-wasm-scenario.mjs");
        return Array.from({length: 5}, () => runFlatListWasmScenario(api));
      }, bindingUrl);
      assert.equal(results.length, 5);
      console.log(JSON.stringify({browser: name, version: browser.version(), status: "passed", runs: results.length, scope: results[0].scope}));
    } catch (error) {
      process.exitCode = 1;
      console.log(JSON.stringify({browser: name, version: browser.version(), status: "failed", error: String(error)}));
    } finally { await browser.close(); }
  }
} finally { await server.close(); }
