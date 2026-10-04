// Real-engine check of the opt-in heading projection slice, not native-input qualification.
// Prerequisites: built browser package and an explicit generated binding directory.
import assert from "node:assert/strict";
import { realpath } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { chromium, firefox, webkit } from "playwright-core";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
assert.equal(process.argv.length, 3, "provide experimental binding directory");
const directory = await realpath(resolve(process.argv[2]));
const bindingPath = relative(await realpath(root), directory);
assert.ok(bindingPath.startsWith(`target${sep}`) && !bindingPath.split(sep).includes(".."),
  "bindings must be generated beneath this repository's target directory");
const bindingUrl = `/${bindingPath.split(sep).map(encodeURIComponent).join("/")}`;
const server = await createServer({ configFile: false, root,
  plugins: [{ name: "heading-harness", configureServer(instance) {
    instance.middlewares.use((request, response, next) => {
      if (request.url !== "/") return next();
      response.setHeader("Content-Type", "text/html");
      response.end("<!doctype html><html><head><title>Heading projection check</title></head><body></body></html>");
    });
  } }],
  optimizeDeps: { noDiscovery: true, entries: [] },
  server: { host: "127.0.0.1", port: 0, watch: { ignored: ["**/target/**"] } },
});
try {
  await server.listen();
  const address = server.httpServer.address();
  const url = `http://127.0.0.1:${address.port}`;
  for (const [name, type] of Object.entries({ chromium, firefox, webkit })) {
    const browser = await type.launch({ headless: true });
    try {
      const page = await browser.newPage();
      const health = await fetch(url);
      if (!health.ok) throw new Error(`local harness returned ${health.status}`);
      await page.goto(url);
      const results = await page.evaluate(async (bindingUrl) => {
        const api = await import(`${bindingUrl}/breditor_wasm.js`);
        api.initSync({ module: await (await fetch(`${bindingUrl}/breditor_wasm_bg.wasm`)).arrayBuffer() });
        const { runHeadingDomScenario } = await import("/scripts/heading-dom-scenario.mjs");
        const results = [];
        for (let attempt = 0; attempt < 5; attempt += 1) {
          const host = document.createElement("div");
          document.body.append(host);
          try { results.push(runHeadingDomScenario(api, host)); } finally { host.remove(); }
        }
        return results;
      }, bindingUrl);
      console.log(JSON.stringify({ browser: name, version: browser.version(), status: "passed", runs: results.length, result: results[0] }));
    } catch (error) {
      process.exitCode = 1;
      console.log(JSON.stringify({ browser: name, version: browser.version(), status: "failed", error: String(error) }));
    } finally { await browser.close(); }
  }
} finally { await server.close(); }
