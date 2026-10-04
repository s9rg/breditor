import assert from "node:assert/strict";
import test from "node:test";
import {summarizeGeckoProfile} from "./gecko-profile-summary.mjs";

const mark = (edge, time, extra = {}) => [0, time, 0, 0, 0, {type: "UserTiming", entryType: "mark",
  name: `breditor-perf:500:0:editMs:${edge}`, innerWindowID: 7, ...extra}];
const content = () => ({name: "GeckoMain", processType: "tab", pid: 2, tid: 3,
  markers: {schema: {name: 0, startTime: 1, endTime: 2, phase: 3, category: 4, data: 5}, data: [mark("start", 10), mark("end", 20)]},
  samples: {schema: {stack: 0, time: 1}, data: [[2, 9], [2, 10], [3, 15], [null, 19], [2, 20]]},
  stackTable: {schema: {prefix: 0, frame: 1}, data: [[null, 0], [0, 1], [1, 2], [2, 1]]},
  frameTable: {schema: {location: 0}, data: [[0], [1], [2]]},
  stringTable: ["outer (http://127.0.0.1:1234/assets/index-test.js:10:2)[4]",
    "inner (http://127.0.0.1:1234/assets/index-test.js:20:2)[4]", "0x123abc"],
});
const profile = thread => ({meta: {version: 34}, threads: [], processes: [{meta: {version: 34}, threads: [thread]}]});

test("clips to half-open operation intervals and counts recursion once, not native self time", () => {
  const result = summarizeGeckoProfile(profile(content()));
  assert.equal(result.spans.length, 1);
  const span = result.spans[0];
  assert.equal(span.durationMs, 10); assert.equal(span.sampleCount, 3);
  assert.equal(span.withoutFixtureFrame, 1);
  assert.deepEqual(span.inclusive, [{frame: "inner:20", samples: 2}, {frame: "outer:10", samples: 2}]);
  assert.deepEqual(span.innermostFixtureFrame, [{frame: "inner:20", samples: 2}]);
  assert.doesNotMatch(JSON.stringify(result), /127\.0\.0\.1|123abc/u);
});

test("does not mix process clocks, parent threads, other thread names or non-mark payloads", () => {
  const r = profile(content());
  const parent = content(); parent.processType = "default";
  const other = content(); other.name = "Compositor";
  r.threads.push(parent, other);
  r.processes[0].threads[0].markers.data.push(mark("start", 90, {entryType: "measure"}), mark("start", 99, {type: "Other"}));
  assert.equal(summarizeGeckoProfile(r).spans.length, 1);
});

test("rejects missing, reversed, incomplete and repeated fixture intervals", () => {
  for (const marks of [[mark("end", 20)], [mark("start", 20), mark("end", 10)],
    [mark("start", 10)], [mark("start", 10), mark("start", 11)],
    [mark("start", 10), mark("end", 20), mark("start", 30)],
    [mark("start", NaN), mark("end", 20)],
    [mark("start", 10, {innerWindowID: 7}), mark("end", 20, {innerWindowID: 8})]]) {
    const t = content(); t.markers.data = marks;
    assert.throws(() => summarizeGeckoProfile(profile(t)));
  }
});

test("rejects malformed or cyclic selected stacks, frames and sample ordering", () => {
  for (const mutate of [t => { t.stackTable.data[2][0] = 2; }, t => { t.stackTable.data[2][1] = 50; },
    t => { t.frameTable.data[2][0] = -1; }, t => { t.samples.data[1][0] = 999; },
    t => { t.samples.data[1][1] = NaN; }, t => { t.samples.data[2][1] = 8; }]) {
    const t = content(); mutate(t);
    assert.throws(() => summarizeGeckoProfile(profile(t)));
  }
});

test("requires supported schemas and version instead of guessing columns", () => {
  const r = profile(content()); r.meta.version = 35;
  assert.throws(() => summarizeGeckoProfile(r), /version/u);
  const t = content(); delete t.samples.schema.stack;
  assert.throws(() => summarizeGeckoProfile(profile(t)), /table/u);
});

test("ignores unrelated page marks and exposes sparse sampling explicitly", () => {
  const t = content(); t.samples.data = [];
  t.markers.data.push(mark("start", 30, {name: "private document text"}));
  const r = summarizeGeckoProfile(profile(t));
  assert.equal(r.spans[0].sampleCount, 0);
  assert.deepEqual(r.spans[0].inclusive, []);
  assert.doesNotMatch(JSON.stringify(r), /private document text/u);
});

test("retains Wasm indices separately without turning native samples into Rust self time", () => {
  const t = content();
  t.stringTable[2] = "wasm-function[42] (http://127.0.0.1:1234/assets/breditor_wasm_bg-hash.wasm:1000)";
  const span = summarizeGeckoProfile(profile(t)).spans[0];
  assert.deepEqual(span.wasmInclusive, [{frame: "wasm-function[42]", samples: 2}]);
  assert.deepEqual(span.innermostWasmFrame, span.wasmInclusive);
  assert.deepEqual(span.innermostFixtureFrame, [{frame: "inner:20", samples: 2}]);
  t.stringTable[2] = "breditor_core::action::prepare (http://127.0.0.1:1234/assets/breditor_wasm_bg-hash.wasm:1000)";
  assert.deepEqual(summarizeGeckoProfile(profile(t)).spans[0].wasmInclusive,
    [{frame: "breditor_core::action::prepare", samples: 2}]);
});
