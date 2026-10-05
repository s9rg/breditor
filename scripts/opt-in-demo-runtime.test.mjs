import {test} from "node:test";
import assert from "node:assert/strict";
import {assertOptInRuntimeModules, loadOptInConsumer} from "./opt-in-demo-runtime.mjs";

const root = "/repo", installed = "/consumer/node_modules/@breditor/experimental-flat-lists";
const owner = `${installed}/dist/browser/browser_editor.js`, wasm = `${installed}/dist/wasm/breditor_wasm.js`;
test("accepts only the installed runtime graph alongside application code", () => {
  assert.deepEqual(assertOptInRuntimeModules([owner, `${wasm}?query`, "/repo/examples/lists/main.tsx"], root, installed), ["dist/browser/browser_editor.js", "dist/wasm/breditor_wasm.js"]);
});
for (const [name, ids] of [
  ["workspace source", [owner, wasm, "/repo/packages/breditor-browser/src/browser_editor.ts"]],
  ["default browser dist", [owner, wasm, "/repo/packages/breditor-browser/dist/index.js"]],
  ["default Wasm dist", [owner, wasm, "/repo/packages/breditor-wasm/dist/breditor_wasm.js"]],
  ["another candidate engine", [owner, wasm, "/repo/target/candidate/breditor_wasm.js"]],
  ["another installed owner", [owner, wasm, "/consumer/node_modules/@breditor/browser/dist/browser_editor.js"]],
  ["missing owner", [wasm]],
  ["missing engine", [owner]],
]) test(`rejects ${name}`, () => assert.throws(() => assertOptInRuntimeModules(ids, root, installed)));
test("missing consumer record fails before build", async () => { await assert.rejects(loadOptInConsumer(undefined), /BREDITOR_OPT_IN_CONSUMER_RECORD/); });
test("normalizes Windows roots against Vite's slash-separated module IDs", () => {
  const runtime = "C:/consumer/node_modules/@breditor/experimental-flat-lists";
  const ids = [`${runtime}/dist/browser/browser_editor.js`, `${runtime}/dist/wasm/breditor_wasm.js`];
  assert.equal(assertOptInRuntimeModules(ids, "C:\\repo", runtime.replaceAll("/", "\\")).length, 2);
  assert.throws(() => assertOptInRuntimeModules([...ids, "C:/repo/packages/breditor-browser/src/index.ts"], "C:\\repo", runtime));
});
