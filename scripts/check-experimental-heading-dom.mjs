// Developer-only generated Wasm -> browser projection -> jsdom integration.
// Usage: node scripts/check-experimental-heading-dom.mjs <binding-directory>
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";
import { runHeadingDomScenario } from "./heading-dom-scenario.mjs";

assert.equal(process.argv.length, 3, "provide experimental binding directory");
const directory = resolve(process.argv[2]);
const api = await import(pathToFileURL(join(directory, "breditor_wasm.js")).href);
api.initSync({ module: await readFile(join(directory, "breditor_wasm_bg.wasm")) });
const dom = new JSDOM("<!doctype html><div id='editor'></div>");
for (const name of ["Node", "NodeList", "Element", "HTMLElement", "Document", "Window", "Selection", "Range", "AbstractRange"])
  globalThis[name] = dom.window[name];
try {
  const result = runHeadingDomScenario(api, dom.window.document.getElementById("editor"));
  console.log(JSON.stringify({ status: "passed", environment: "jsdom", ...result }));
} finally {
  dom.window.close();
}
