// Real-engine heading checks plus Playwright-driven input. Not native Safari/IME qualification.
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
        const { runHeadingStartupScenario } = await import("/scripts/heading-startup-scenario.mjs");
        const results = [];
        for (let attempt = 0; attempt < 5; attempt += 1) {
          const host = document.createElement("div");
          document.body.append(host);
          try {
            results.push({ ...runHeadingDomScenario(api, host), startup: runHeadingStartupScenario(api, host) });
          } finally { host.remove(); }
        }
        return results;
      }, bindingUrl);
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await page.evaluate(async ({ bindingUrl, slot, editing }) => {
          const api = await import(`${bindingUrl}/breditor_wasm.js`);
          const { openHeadingEditorFixture } = await import("/scripts/heading-editor-fixture.mjs");
          window.headingFixture = await openHeadingEditorFixture(api, slot, editing);
          window.headingFixture.caret(1);
          window.headingEvents = [];
          window.headingListener = (event) => window.headingEvents.push({ type: event.type, key: event.key,
            inputType: event.inputType, target: event.target.id || event.target.tagName, prevented: event.defaultPrevented });
          for (const type of ["keydown", "beforeinput", "input"]) document.addEventListener(type, window.headingListener);
        }, { bindingUrl, slot: `heading-public-${name}-${attempt}`,
          editing: attempt % 2 === 0 ? "beforeinputPrimary" : "structuralFallback" });
        const host = page.locator("#heading-editor");
        const html = async (expected) => {
          const actual = await host.innerHTML();
          if (actual !== expected) console.log(JSON.stringify(await page.evaluate(() => ({
            diagnostic: "heading-input", events: window.headingEvents, activeElement: document.activeElement.outerHTML,
            snapshot: window.headingFixture.snapshot(), selection: document.getSelection()?.toString(),
          }))));
          assert.equal(actual, expected);
        };
        const state = async () => assert.equal(await page.evaluate(() => window.headingFixture.snapshot().status.phase), "live");
        await page.getByRole("button", { name: "Heading 2", exact: true }).click();
        await html("<h2>a🙂b</h2>");
        assert.equal(await page.getByRole("button", { name: "Heading 2", exact: true }).getAttribute("aria-pressed"), "true");
        await page.keyboard.insertText("X");
        await page.waitForFunction(() => window.headingFixture.ready());
        await html("<h2>aX🙂b</h2>");
        await page.keyboard.press("Delete");
        await html("<h2>aXb</h2>");
        await page.getByRole("button", { name: "undo", exact: true }).click();
        await html("<h2>aX🙂b</h2>");
        await page.keyboard.press("Enter");
        await html("<h2>aX</h2><h2>🙂b</h2>");
        await page.getByRole("button", { name: "undo", exact: true }).click();
        await html("<h2>aX🙂b</h2>");
        await page.evaluate(() => window.headingFixture.caret(5));
        await page.keyboard.press("Enter");
        assert.equal(await host.locator("p").count(), 1);
        await page.keyboard.insertText("Tail");
        await page.waitForFunction(() => window.headingFixture.ready());
        await html("<h2>aX🙂b</h2><p>Tail</p>");
        await page.keyboard.press("Backspace");
        await html("<h2>aX🙂b</h2><p>Tai</p>");
        await page.getByRole("button", { name: "undo", exact: true }).click();
        await html("<h2>aX🙂b</h2><p>Tail</p>");
        await page.getByRole("button", { name: "undo", exact: true }).click();
        const saved = await page.evaluate(() => window.headingFixture.export("sessionCheckpointJson"));
        assert.equal(JSON.parse(saved).formatVersion, 5);
        await page.evaluate(() => window.headingFixture.reload());
        assert.equal(await page.evaluate(() => window.headingFixture.export("sessionCheckpointJson")), saved);
        await page.getByRole("button", { name: "redo", exact: true }).click();
        await html("<h2>aX🙂b</h2><p>Tail</p>");
        await state();
        await page.evaluate(() => {
          window.headingFixture.dispose();
          for (const type of ["keydown", "beforeinput", "input"]) document.removeEventListener(type, window.headingListener);
        });
      }
      console.log(JSON.stringify({ browser: name, version: browser.version(), status: "passed", runs: results.length,
        publicEditorRuns: 5, keyboardPolicies: ["beforeinputPrimary", "structuralFallback"],
        toolbar: true, indexedDbRestore: true, result: results[0] }));
    } catch (error) {
      process.exitCode = 1;
      console.log(JSON.stringify({ browser: name, version: browser.version(), status: "failed", error: String(error) }));
    } finally { await browser.close(); }
  }
} finally { await server.close(); }
