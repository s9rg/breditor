import assert from "node:assert/strict";
import test from "node:test";
import {rewriteProjectionWordBindings} from "./projection-word-bindings.mjs";

const names = ["childCount", "childAt", "formatCount", "formatPropertyCount", "headingLevel", "orderedListStart"];
const source = `export class BreditorProjection {
  constructor() { this.__wbg_ptr = 7; }
  ${names.map(name => {
    const two = name === "childAt" || name === "formatPropertyCount";
    const originalParameters = two ? "index, format_ordinal" : "index";
    const wordParameters = two ? "index, ordinal" : "index";
    return `${name}(${originalParameters}) { return wasm.legacy(); }
      ${name}Words(${wordParameters}) { try {
        const record = wasm.breditorprojection_${name}Words(this.__wbg_ptr, ${wordParameters});
        return record;
      } finally { wasm.cleanup(); } }`;
  }).join("\n")}
}`;

test("private binding rewrite preserves signatures, receiver, absence/full u32 and cleanup", () => {
  const calls = [], wasm = {legacy() {throw Error("legacy called");}, cleanup() {calls.push("cleanup");}};
  for (const name of names) wasm[`breditorprojection_${name}Words`] = (...args) => {
    calls.push([name, ...args]);
    return new Uint32Array(args[1] === 0 ? [0, 0] : [1, 0xffffffff]);
  };
  const Class = new Function("wasm", `${rewriteProjectionWordBindings(source).replace("export class", "class")}; return BreditorProjection;`)(wasm);
  const view = new Class();
  for (const name of names) {
    const two = name === "childAt" || name === "formatPropertyCount";
    assert.equal(view[name].length, two ? 2 : 1);
    assert.equal(view[name](1, 9), 0xffffffff);
    assert.deepEqual(calls.at(-2), two ? [name, 7, 1, 9] : [name, 7, 1]);
    assert.equal(calls.at(-1), "cleanup");
    assert.equal(view[name](0, 9), undefined);
  }
  wasm.breditorprojection_childCountWords = () => new Uint32Array([2, 0]);
  assert.throws(() => view.childCount(1), TypeError);
  assert.equal(calls.at(-1), "cleanup");
});

test("rewrite rejects partial classes, changed arity and helper collisions", () => {
  assert.throws(() => rewriteProjectionWordBindings(source.replace("childAtWords", "missing")));
  assert.throws(() => rewriteProjectionWordBindings(source.replace("childAtWords(index, ordinal)", "childAtWords(index)")));
  assert.throws(() => rewriteProjectionWordBindings(source + "\nconst __breditorOptionalU32 = 1;"));
});
