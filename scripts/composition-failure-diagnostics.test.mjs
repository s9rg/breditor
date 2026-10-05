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
