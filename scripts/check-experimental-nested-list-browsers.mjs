// Raw generated Wasm only: no DOM, clipboard or IME qualification claims.
import assert from "node:assert/strict";
import { realpath } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, firefox, webkit } from "playwright-core";
import { createServer } from "vite";
assert.equal(process.argv.length, 3, "provide candidate binding directory");
const root = await realpath(fileURLToPath(new URL("../", import.meta.url)));
const directory = await realpath(resolve(process.argv[2]));
const path = relative(root, directory);
assert.ok(path.startsWith(`target${sep}`) && !path.split(sep).includes(".."));
const bindingUrl = `/${path.split(sep).map(encodeURIComponent).join("/")}`;
const server = await createServer({configFile: false, root,
  plugins: [{name: "nested-wasm-harness", configureServer(instance) {
    instance.middlewares.use((request, response, next) => {
      if (request.url !== "/") return next();
      response.setHeader("Content-Type", "text/html");
      response.end("<!doctype html><title>Nested-list Wasm qualification</title>");
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
      const errors = []; page.on("pageerror", error => errors.push(String(error)));
      await page.goto(url);
      const results = await page.evaluate(async bindingUrl => {
        const api = await import(`${bindingUrl}/breditor_wasm.js`);
        api.initSync({module: await (await fetch(`${bindingUrl}/breditor_wasm_bg.wasm`)).arrayBuffer()});
        const {runNestedListWasmScenario} = await import("/scripts/nested-list-wasm-scenario.mjs");
        return Array.from({length: 5}, () => runNestedListWasmScenario(api));
      }, bindingUrl);
      assert.equal(results.length, 5); assert.deepEqual(errors, []);
      console.log(JSON.stringify({browser: name, version: browser.version(), status: "passed", runs: results.length, scope: results[0].scope}));
    } catch (error) {
      process.exitCode = 1;
      console.log(JSON.stringify({browser: name, version: browser.version(), status: "failed", error: String(error)}));
    } finally { await browser.close(); }
  }
} finally { await server.close(); }
