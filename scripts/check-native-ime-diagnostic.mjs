// Synthetic browser checks of the diagnostic fixture, NOT native IME certification.
// Usage: node scripts/check-native-ime-diagnostic.mjs target/native-ime-diagnostic-...
import assert from "node:assert/strict";
import {realpath} from "node:fs/promises";
import {relative, resolve, sep} from "node:path";
import {fileURLToPath} from "node:url";
import {preview} from "vite";
import {chromium, firefox, webkit} from "playwright-core";

assert.equal(process.argv.length, 3, "provide an isolated diagnostic build directory");
const root = fileURLToPath(new URL("../", import.meta.url));
const directory = await realpath(resolve(process.argv[2]));
const path = relative(await realpath(root), directory);
assert.ok(path.startsWith(`target${sep}native-ime-diagnostic-`) && !path.split(sep).includes(".."));
const server = await preview({configFile: false, root, build: {outDir: directory},
  preview: {host: "127.0.0.1", port: 0, open: false}});
try {
  const url = `http://127.0.0.1:${server.httpServer.address().port}/manual-clipboard.html`;
  for (const [name, engine] of Object.entries({chromium, firefox, webkit})) {
    const browser = await engine.launch();
    try {
      const page = await browser.newPage();
      const errors = [];
      page.on("pageerror", error => errors.push(String(error)));
      await page.goto(url);
      await page.getByRole("textbox", {name: "Manual list clipboard editor", exact: true}).waitFor();
      await page.getByRole("button", {name: "Run scripted composition matrix"}).click();
      await page.waitForFunction(() => {
        const output = document.querySelector('[aria-label="Scripted composition results"]');
        if (!output?.value) return false;
        return ["passed", "failed"].includes(JSON.parse(output.value).status);
      });
      const result = JSON.parse(await page.getByRole("textbox", {name: "Scripted composition results"}).inputValue());
      console.log(JSON.stringify({browser: name, version: browser.version(), ...result}));
      assert.equal(result.status, "passed");
      assert.equal(result.rows.length, 30);
      const diagnostics = JSON.parse(await page.getByRole("textbox", {name: "Local IME diagnostics"}).inputValue());
      assert.equal(diagnostics.dropped, 0);
      assert.equal(diagnostics.entries.filter(entry => !entry.site.startsWith("event:")).length, 0);
      assert.deepEqual(errors, []);
    } catch (error) {
      process.exitCode = 1;
      console.error(JSON.stringify({browser: name, error: String(error)}));
    } finally {await browser.close();}
  }
} finally {await new Promise(resolve => server.httpServer.close(resolve));}
