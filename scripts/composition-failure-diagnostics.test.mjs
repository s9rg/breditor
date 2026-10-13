import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {stripTypeScriptTypes} from "node:module";
import {runInNewContext} from "node:vm";
import {instrumentCompositionModule} from "./composition-failure-diagnostics.mjs";

for (const [name, count] of Object.entries({"composition_controller.ts": 17, "wasm_command_adapter.ts": 29, "command_queue.ts": 7})) {
  test(`${name} diagnostic sites are present and drift fails closed`, () => {
    const source = readFileSync(new URL(`../packages/breditor-browser/src/${name}`, import.meta.url), "utf8");
    const output = instrumentCompositionModule(source, name);
    assert.equal(output.split("catch (imeDiagnosticError)").length - 1, count);
    assert.ok(output.includes(`${name}:`));
    assert.throws(() => instrumentCompositionModule(source.replace("} catch {", "} catch (changed) {"), name));
  });
}
test("diagnostic catches preserve result when errors or logger are hostile", () => {
  const body = "try { callback(); } catch { return 'contained'; }";
  const code = `return function(callback) { ${Array(7).fill(body).join("\n")} return 'ok'; }`;
  for (const logger of [() => {}, () => {throw new Error("logger");}]) {
    const run = new Function("recordImeDiagnostic", instrumentCompositionModule(code, "command_queue.ts"))(logger);
    assert.equal(run(() => {}), "ok");
    assert.equal(run(() => {throw {toString() {throw new Error("string");}};}), "contained");
  }
});

test("instrumented queue catch records the actual thrown exception and source site", () => {
  const messages = [];
  const body = "try { callback(); } catch { return 'contained'; }";
  const code = `return function(callback) { ${Array(7).fill(body).join("\n")} return 'ok'; }`;
  const run = new Function("recordImeDiagnostic", instrumentCompositionModule(code, "command_queue.ts"))((...args) => messages.push(args));
  const error = new TypeError("synthetic queue boundary failure");
  assert.equal(run(() => {throw error;}), "contained");
  assert.equal(messages.length, 1);
  assert.equal(messages[0][0], "command_queue.ts:1:catch");
  assert.equal(messages[0][1], error);
});

test("runtime places exceptions before the event log and bounds hostile error data", () => {
  const output = {value: ""};
  const source = readFileSync(new URL("./fixtures/native-ime-diagnostics/runtime.ts", import.meta.url), "utf8");
  const code = stripTypeScriptTypes(source.replace("export function recordImeDiagnostic", "function recordImeDiagnostic"));
  const record = runInNewContext(`${code}\nrecordImeDiagnostic`, {
    performance: {now: () => 1},
    document: {addEventListener() {}, querySelector: () => output},
    window: {addEventListener() {}},
  });
  record("event:input", undefined, {dataLength: 2});
  record("command_queue.ts:321:catch", {toString() {throw new Error("hostile");}, stack: "s".repeat(8192)});
  const report = JSON.parse(output.value);
  assert.equal(Object.keys(report)[0], "failures");
  assert.equal(report.failures[0].site, "command_queue.ts:321:catch");
  assert.equal(report.failures[0].message, "<unprintable>");
  assert.equal(report.failures[0].stack.length, 4096);
  assert.equal(report.entries.length, 2);
  assert.equal(report.dropped, 0);
});

function metadataFixture() {
  class KeyboardEvent {}
  class InputEvent {}
  class CompositionEvent {}
  const source = readFileSync(new URL("./fixtures/native-ime-diagnostics/runtime.ts", import.meta.url), "utf8");
  const code = stripTypeScriptTypes(source.replace("export function recordImeDiagnostic", "function recordImeDiagnostic"));
  const metadata = runInNewContext(`${code}\ndiagnosticInputMetadata`, {
    KeyboardEvent, InputEvent, CompositionEvent,
    document: {addEventListener() {}}, window: {addEventListener() {}},
  });
  const plain = event => JSON.parse(JSON.stringify(metadata(event)));
  return {KeyboardEvent, InputEvent, CompositionEvent, plain};
}

test("native input metadata distinguishes control-option chords without logging arbitrary keys", () => {
  const {KeyboardEvent, plain} = metadataFixture();
  const event = Object.assign(new KeyboardEvent(), {isTrusted: true, isComposing: false,
    key: "a", code: "KeyA", ctrlKey: true, altKey: true, metaKey: false, shiftKey: false});
  assert.deepEqual(plain(event), {trusted: true, composing: false, key: "other", code: "KeyA",
    modifiers: {control: true, option: true, command: false, shift: false}});
  event.key = "ArrowDown"; event.code = "ArrowDown"; event.shiftKey = true;
  assert.equal(plain(event).key, "ArrowDown");
  assert.equal(plain(event).modifiers.shift, true);
  event.key = "private input"; event.code = "private code";
  const result = plain(event);
  assert.equal(result.key, "other"); assert.equal(result.code, "other");
  assert.ok(!JSON.stringify(result).includes("private"));
});

test("native input metadata detects control units with a bounded text-free sample", () => {
  const {InputEvent, CompositionEvent, plain} = metadataFixture();
  const event = Object.assign(new InputEvent(), {isTrusted: true, isComposing: false,
    inputType: "insertText", data: "private🙂\u0001\u0001\t\n\r\u007f"});
  const result = plain(event);
  assert.deepEqual(result.dataControlSample, {scannedUtf16: event.data.length, truncated: false,
    controlCodeUnits: [1, 9, 10, 13, 127]});
  assert.ok(!JSON.stringify(result).includes("private"));
  assert.ok(!JSON.stringify(result).includes("🙂"));
  event.data = "x".repeat(256) + "\u0001";
  assert.deepEqual(plain(event).dataControlSample, {scannedUtf16: 256, truncated: true, controlCodeUnits: []});
  event.data = null;
  assert.equal(plain(event).dataControlSample, undefined);
  assert.equal(plain(event).dataLength, undefined);
  const composition = Object.assign(new CompositionEvent(), {data: "日本", isTrusted: true});
  assert.equal(plain(composition).dataLength, 2);
  assert.deepEqual(plain(composition).dataControlSample, {scannedUtf16: 2, truncated: false, controlCodeUnits: []});
});

test("native diagnostic listener contains metadata failures without intercepting input", () => {
  class Node {}
  class KeyboardEvent {}
  class InputEvent {}
  class CompositionEvent {}
  const listeners = new Map();
  const host = {contains: () => true};
  const source = readFileSync(new URL("./fixtures/native-ime-diagnostics/runtime.ts", import.meta.url), "utf8");
  const code = stripTypeScriptTypes(source.replace("export function recordImeDiagnostic", "function recordImeDiagnostic"));
  runInNewContext(code, {Node, KeyboardEvent, InputEvent, CompositionEvent,
    document: {addEventListener: (type, callback) => listeners.set(type, callback), querySelector: () => host},
    window: {addEventListener() {}},
  });
  let canceled = false;
  const event = Object.assign(new KeyboardEvent(), {target: new Node(), key: "a",
    preventDefault() {canceled = true;}});
  Object.defineProperty(event, "code", {get() {throw new Error("synthetic metadata read failure");}});
  assert.doesNotThrow(() => listeners.get("keydown")(event));
  assert.equal(canceled, false);
});
