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

const signedSource = source.replace("export class BreditorProjection {", `export class BreditorProjection {
  formatPropertyInteger(index, format_ordinal, property_ordinal) { return wasm.legacy(); }
  formatPropertyIntegerWords(index, ordinal, property) { try {
    const record = wasm.integerWords(this.__wbg_ptr, index, ordinal, property);
    return record;
  } finally { wasm.cleanup(); } }`);
test("signed binding preserves safe limits, absence, receiver, arity and cleanup", () => {
  const calls = []; let record;
  const wasm = {legacy(){throw Error("legacy integer called");},
    integerWords(...args){calls.push(args);return record;},cleanup(){calls.push("cleanup");}};
  const Class = Function("wasm",rewriteProjectionWordBindings(signedSource,{privateIntegerWords:true})
    .replace("export class","class")+";return BreditorProjection;")(wasm);
  const view = new Class(); assert.equal(view.formatPropertyInteger.length,3);
  for (const value of [-9007199254740991n,-4294967296n,-5n,0n,1193046n,4294967296n,9007199254740991n]) {
    const bits=BigInt.asUintN(64,value);
    record=new Uint32Array([1,Number(bits&0xffffffffn),Number(bits>>32n)]);
    assert.equal(view.formatPropertyInteger(4,2,3),Number(value));
    assert.deepEqual(calls.at(-2),[7,4,2,3]);assert.equal(calls.at(-1),"cleanup");
  }
  record=new Uint32Array([0,0,0]); assert.equal(view.formatPropertyInteger(4,2,3),undefined);
  for (const malformed of [new Uint32Array([0,1,0]),new Uint32Array([2,0,0]),
    new Uint32Array([1,0,0x200000]),new Uint32Array([1,0,0xffe00000]),
    new Int32Array([1,0,0]),new Uint32Array(new SharedArrayBuffer(12)),
    new Proxy(new Uint32Array([1,0,0]),{}),new Uint32Array([1,0])]) {
    record=malformed;assert.throws(()=>view.formatPropertyInteger(4,2,3),TypeError);
    assert.equal(calls.at(-1),"cleanup");
  }
});
test("signed rewrite remains explicitly opted in and complete", () => {
  assert.throws(()=>rewriteProjectionWordBindings(source,{privateIntegerWords:true}));
  assert.throws(()=>rewriteProjectionWordBindings(signedSource.replace("formatPropertyIntegerWords(index, ordinal, property)",
    "formatPropertyIntegerWords(index, ordinal)"),{privateIntegerWords:true}));
  assert.throws(()=>rewriteProjectionWordBindings(source,{privateIntegerWords:"true"}));
  assert.ok(!rewriteProjectionWordBindings(signedSource).includes("function __breditorOptionalInteger"));
  assert.ok(rewriteProjectionWordBindings(signedSource).includes("return wasm.legacy();"));
});
