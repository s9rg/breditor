// Real-engine check of the opt-in heading projection slice, not native-input qualification.
// Prerequisites: built browser package and target/heading-bridge-smoke bindings.
import { chromium, firefox, webkit } from "playwright-core";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const server = await createServer({ configFile: false, root,
  plugins: [{ name: "heading-harness", configureServer(instance) {
    instance.middlewares.use((request, response, next) => {
      if (request.url !== "/") return next();
      response.setHeader("Content-Type", "text/html");
      response.end("<!doctype html><html><head><title>Heading projection check</title></head><body></body></html>");
    });
  } }],
  optimizeDeps: { noDiscovery: true, entries: [] },
  server: { host: "127.0.0.1", port: 0 },
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
      const results = await page.evaluate(async () => {
        const api = await import("/target/heading-bridge-smoke/breditor_wasm.js");
        api.initSync({ module: await (await fetch("/target/heading-bridge-smoke/breditor_wasm_bg.wasm")).arrayBuffer() });
        const { runHeadingDomScenario } = await import("/scripts/heading-dom-scenario.mjs");
        const results = [];
        for (let attempt = 0; attempt < 5; attempt += 1) {
          const host = document.createElement("div");
          document.body.append(host);
          try { results.push(runHeadingDomScenario(api, host)); } finally { host.remove(); }
        }
        return results;
      });
      console.log(JSON.stringify({ browser: name, version: browser.version(), status: "passed", runs: results.length, result: results[0] }));
    } catch (error) {
      process.exitCode = 1;
      console.log(JSON.stringify({ browser: name, version: browser.version(), status: "failed", error: String(error) }));
    } finally { await browser.close(); }
  }
} finally { await server.close(); }
