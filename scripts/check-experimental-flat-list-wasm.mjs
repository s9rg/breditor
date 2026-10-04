// Generated-Wasm boundary check under Node; not DOM/native qualification.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { runFlatListWasmScenario } from "./flat-list-wasm-scenario.mjs";
assert.equal(process.argv.length, 3, "provide the candidate binding directory");
const directory = resolve(process.argv[2]);
const api = await import(pathToFileURL(join(directory, "breditor_wasm.js")).href);
api.initSync({ module: await readFile(join(directory, "breditor_wasm_bg.wasm")) });
console.log(JSON.stringify({ environment: "node", ...runFlatListWasmScenario(api) }));
