import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {validateOptInManifest, validateTransportPair} from "./build-opt-in-nested-list-package.mjs";

test("assembly transport admission requires exact candidate/pair agreement", () => {
  const legacy = {}, words = {privateScalarWords: true, projectionScalarWordsVersion: 1};
  validateTransportPair(legacy, legacy);
  validateTransportPair(words, words);
  validateTransportPair({privateScalarWords: false, projectionScalarWordsVersion: null}, legacy);
  for (const invalid of [
    {privateScalarWords: true}, {projectionScalarWordsVersion: 1},
    {privateScalarWords: false, projectionScalarWordsVersion: 1},
    {privateScalarWords: "true", projectionScalarWordsVersion: 1},
    {privateScalarWords: true, projectionScalarWordsVersion: 2},
  ]) assert.throws(() => validateTransportPair(invalid, words));
  assert.throws(() => validateTransportPair(legacy, words));
  assert.throws(() => validateTransportPair(words, legacy));
  const bound = {...words, privateWordBindings: true, projectionWordBindingsVersion: 1};
  validateTransportPair(bound, bound);
  assert.throws(() => validateTransportPair(bound, words));
  assert.throws(() => validateTransportPair(words, bound));
  assert.throws(() => validateTransportPair({...bound, privateWordBindings: false}, bound));
  assert.throws(() => validateTransportPair({...bound, projectionWordBindingsVersion: 2}, bound));
  assert.throws(() => validateTransportPair({privateWordBindings: true, projectionWordBindingsVersion: 1}, bound));
});

const json = async path => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const manifest = await json("../packages/breditor-experimental-nested-lists/package.json");
const browser = await json("../packages/breditor-browser/package.json");
const wasm = await json("../packages/breditor-wasm/package.json");
test("opt-in package is private, exactly paired, and independent of the default build", () => validateOptInManifest(manifest, browser, wasm));
for (const [name, change] of [
  ["publication", {private: false}],
  ["wrong name", {name: "@breditor/browser"}],
  ["wrong version", {version: "0.0.0"}],
  ["extra runtime dependency", {dependencies: {...manifest.dependencies, "@breditor/wasm": wasm.version}}],
  ["peer engine", {peerDependencies: {"@breditor/wasm": wasm.version}}],
  ["implicit build", {scripts: {build: "unexpected"}}],
]) test(`rejects ${name}`, () => assert.throws(() => validateOptInManifest({...manifest, ...change}, browser, wasm)));
test("rejects an unpaired source browser and Wasm", () => assert.throws(() => validateOptInManifest(manifest, {...browser, peerDependencies: {"@breditor/wasm": "0.0.0"}}, wasm)));
test("public and advanced entry points use the same browser graph", () => {
  assert.equal(manifest.exports["./advanced"].import, "./dist/browser/advanced.js");
  assert.equal(manifest.exports["./wasm"].import, "./dist/wasm/breditor_wasm.js");
  assert.equal(manifest.exports["./wasm-binary"], "./dist/wasm/breditor_wasm_bg.wasm");
  assert.equal(manifest.exports["./*"], undefined);
});
test("both root entry points export the nested toolbar from its own module", async () => {
  for (const file of ["index.js", "index.d.ts"]) {
    const source = await readFile(new URL(`../packages/breditor-experimental-nested-lists/${file}`, import.meta.url), "utf8");
    assert.ok(source.includes('export { NESTED_LIST_TOOLBAR_MANIFEST } from "./dist/browser/nested_list_toolbar_manifest.js";'));
    assert.ok(!source.includes("flat_list_toolbar_manifest"));
  }
});
