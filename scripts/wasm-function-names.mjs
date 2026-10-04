// Local profiling helper, not a runtime parser or general Wasm validator.
// Metadata format: https://webassembly.github.io/spec/core/appendix/custom.html
import assert from "node:assert/strict";

const HEADER = Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]);
class Reader {
  constructor(bytes) { this.bytes = bytes; this.offset = 0; }
  take(size) {
    assert.ok(Number.isSafeInteger(size) && size >= 0 && size <= this.bytes.length - this.offset, "truncated Wasm metadata");
    const result = this.bytes.subarray(this.offset, this.offset + size); this.offset += size; return result;
  }
  byte() { return this.take(1)[0]; }
  u32() {
    let value = 0;
    for (let index = 0; index < 5; index++) {
      const byte = this.byte(); value += (byte & 127) * 2 ** (index * 7);
      assert.ok(value <= 0xffffffff, "Wasm u32 overflow");
      if (byte < 128) return value;
    }
    throw new Error("unterminated Wasm u32");
  }
  string() { return new TextDecoder("utf-8", {fatal: true}).decode(this.take(this.u32())); }
  get remaining() { return this.bytes.length - this.offset; }
}
function sections(bytes, module = true) {
  const reader = new Reader(Buffer.from(bytes));
  if (module) assert.deepEqual(reader.take(8), HEADER, "expected Wasm version 1");
  const result = [];
  while (reader.remaining) {
    const start = reader.offset, id = reader.byte(), payload = reader.take(reader.u32());
    result.push({id, payload, encoded: reader.bytes.subarray(start, reader.offset)});
  }
  return result;
}
/** Exact bytes of header and all non-custom sections, preserving section order. */
export function nonCustomWasmBytes(bytes) {
  return Buffer.concat([HEADER, ...sections(bytes).filter(section => section.id !== 0).map(section => section.encoded)]);
}
/** Retain explicitly selected custom metadata, copying executable sections verbatim. */
export function retainWasmCustomSections(bytes, allowed) {
  return Buffer.concat([HEADER, ...sections(bytes).filter(section => section.id !== 0
    || allowed.has(new Reader(section.payload).string())).map(section => section.encoded)]);
}
function u32(value) {
  assert.ok(Number.isInteger(value) && value >= 0 && value <= 0xffffffff);
  const bytes = [];
  do { const next = value % 128; value = Math.floor(value / 128); bytes.push(next | (value ? 128 : 0)); } while (value);
  return Buffer.from(bytes);
}
function encodedString(text) {
  const bytes = Buffer.from(text, "utf8"); return Buffer.concat([u32(bytes.length), bytes]);
}
/** Replace only name metadata with a sorted function-index map; other bytes stay intact. */
export function withWasmFunctionNames(bytes, names) {
  const entries = [...names].sort(([left], [right]) => left - right);
  const map = Buffer.concat([u32(entries.length), ...entries.flatMap(([index, name]) => [u32(index), encodedString(name)])]);
  const payload = Buffer.concat([encodedString("name"), Buffer.from([1]), u32(map.length), map]);
  const kept = sections(bytes).filter(section => section.id !== 0 || new Reader(section.payload).string() !== "name");
  return Buffer.concat([HEADER, ...kept.map(section => section.encoded), Buffer.from([0]), u32(payload.length), payload]);
}
/** Extract the unique function-index map from one retained name custom section. */
export function wasmFunctionNames(bytes) {
  let payload;
  for (const section of sections(bytes)) {
    if (section.id !== 0) continue;
    const reader = new Reader(section.payload);
    if (reader.string() !== "name") continue;
    assert.equal(payload, undefined, "duplicate Wasm name sections");
    payload = reader.take(reader.remaining);
  }
  assert.notEqual(payload, undefined, "missing Wasm name section");
  let names;
  for (const section of sections(payload, false)) {
    if (section.id !== 1) continue;
    assert.equal(names, undefined, "duplicate function-name subsections");
    names = new Map();
    const reader = new Reader(section.payload), count = reader.u32();
    assert.ok(count <= reader.remaining, "impossible function-name count");
    let previous = -1;
    for (let index = 0; index < count; index++) {
      const functionIndex = reader.u32();
      assert.ok(functionIndex > previous, "function-name indices must be unique and ordered");
      names.set(functionIndex, reader.string()); previous = functionIndex;
    }
    assert.equal(reader.remaining, 0, "trailing function-name bytes");
  }
  assert.ok(names?.size > 0, "missing function names");
  return names;
}
