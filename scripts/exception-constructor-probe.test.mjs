import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import {installExceptionConstructorProbe} from "./exception-constructor-probe.mjs";

function context() {
  const realm = vm.createContext({});
  vm.runInContext(`(${installExceptionConstructorProbe.toString()})();`, realm);
  return realm;
}
const snapshot = realm => JSON.parse(vm.runInContext("JSON.stringify(__breditorExceptionProbeSnapshot())", realm));
test("preserves constructed errors, instanceof, arguments and subclass prototypes", () => {
  const realm = context();
  assert.equal(vm.runInContext(`(() => {
    const cause = {};
    class SpecificError extends TypeError {}
    const error = new SpecificError("synthetic", {cause});
    return error instanceof SpecificError && error instanceof TypeError && error instanceof Error && error.cause === cause && error.message === "synthetic";
  })()`, realm), true);
  assert.equal(snapshot(realm).records[0].constructor, "TypeError");
  assert.equal(snapshot(realm).records[0].message, "synthetic");
});
test("bounds records, copies snapshots and counts dropped entries", () => {
  const realm = context();
  vm.runInContext(`for (let i=0;i<40;i++) new RangeError("x".repeat(3000));`, realm);
  const value = snapshot(realm);
  assert.equal(value.records.length, 32); assert.equal(value.dropped, 8);
  assert.equal(value.records[0].message.length, 1024);
  assert.ok(value.records.every(r => r.stack.length <= 4096));
  vm.runInContext(`__breditorExceptionProbeSnapshot().records[0].message = "changed";`, realm);
  assert.equal(snapshot(realm).records[0].message.length, 1024);
});
test("construction throws stay thrown and call-without-new is explicitly outside probe scope", () => {
  const realm = context();
  assert.equal(vm.runInContext(`(() => {
    const marker = {}; try { new Error({toString(){throw marker;}}); } catch(error) { return error === marker; }
  })()`, realm), true);
  assert.equal(vm.runInContext(`Error("called").message`, realm), "called");
  assert.equal(snapshot(realm).records.length, 0);
});
