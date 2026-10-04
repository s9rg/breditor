import assert from "node:assert/strict";
import test from "node:test";
import {nonCustomWasmBytes, retainWasmCustomSections, wasmFunctionNames, withWasmFunctionNames} from "./wasm-function-names.mjs";

const header = [0, 97, 115, 109, 1, 0, 0, 0];
const executable = [1, 4, 1, 96, 0, 0, 3, 2, 1, 0, 10, 4, 1, 2, 0, 11];
const string = text => { const bytes = [...Buffer.from(text)]; return [bytes.length, ...bytes]; };
const section = (id, payload) => [id, payload.length, ...payload];
const named = (entries = [[0, "example::🙂"]]) => section(0, [...string("name"),
  ...section(1, [entries.length, ...entries.flatMap(([index, name]) => [index, ...string(name)])])]);
const module = (...extra) => Buffer.from([...header, ...executable, ...extra.flat()]);

test("custom metadata changes do not change executable-section identity", () => {
  const plain = module(), names = module(named(), section(0, string("producers")));
  assert.ok(WebAssembly.validate(plain)); assert.ok(WebAssembly.validate(names));
  assert.deepEqual(nonCustomWasmBytes(plain), nonCustomWasmBytes(names));
  assert.equal(wasmFunctionNames(names).get(0), "example::🙂");
});
test("a real section change changes identity", () => {
  const changed = module(); changed[changed.length - 1] = 0;
  assert.notDeepEqual(nonCustomWasmBytes(module()), nonCustomWasmBytes(changed));
});
test("custom filtering retains names without changing executable bytes", () => {
  const source = module(named(), section(0, [...string("target_features"), 0]));
  const filtered = retainWasmCustomSections(source, new Set(["name"]));
  assert.deepEqual(filtered, module(named()));
  assert.deepEqual(nonCustomWasmBytes(source), nonCustomWasmBytes(filtered));
  assert.equal(wasmFunctionNames(filtered).get(0), "example::🙂");
});
test("replacement function metadata preserves executable bytes and long UTF-8 labels", () => {
  const source = module(named());
  const names = new Map([[0, "long::🙂".repeat(40)]]);
  const result = withWasmFunctionNames(source, names);
  assert.deepEqual(wasmFunctionNames(result), names);
  assert.deepEqual(nonCustomWasmBytes(result), nonCustomWasmBytes(source));
  assert.ok(WebAssembly.validate(result));
});
test("rejects wrong headers and truncated section lengths/payloads", () => {
  for (const bytes of [Buffer.from([0]), Buffer.from([...header, 1, 128]), Buffer.from([...header, 1, 5, 0])]) {
    assert.throws(() => nonCustomWasmBytes(bytes));
  }
});
test("rejects overflowing and unterminated u32 lengths", () => {
  for (const length of [[255, 255, 255, 255, 16], [128, 128, 128, 128, 128]]) {
    assert.throws(() => nonCustomWasmBytes(Buffer.from([...header, 0, ...length])));
  }
});
test("rejects missing/duplicate name sections and duplicate indices", () => {
  assert.throws(() => wasmFunctionNames(module()), /missing Wasm name/);
  assert.throws(() => wasmFunctionNames(module(named(), named())), /duplicate Wasm name/);
  assert.throws(() => wasmFunctionNames(module(named([[0, "a"], [0, "b"]]))), /unique and ordered/);
  assert.throws(() => wasmFunctionNames(module(named([[1, "a"], [0, "b"]]))), /unique and ordered/);
  assert.throws(() => wasmFunctionNames(module(named([]))), /missing function names/);
  assert.throws(() => wasmFunctionNames(module(section(0, [...string("name"),
    ...section(1, [1, 0, 1, 97]), ...section(1, [1, 0, 1, 98])]))), /duplicate function-name/);
});
test("rejects malformed UTF-8 names and trailing function data", () => {
  for (const payload of [[1, 0, 1, 255], [1, 0, 1, 97, 0]]) {
    assert.throws(() => wasmFunctionNames(module(section(0, [...string("name"), ...section(1, payload)]))));
  }
});
