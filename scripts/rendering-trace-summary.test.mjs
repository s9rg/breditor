import assert from "node:assert/strict";
import test from "node:test";
import {summarizeRenderingTrace} from "./rendering-trace-summary.mjs";

const mark = (edge, ts, extra = {}) => ({name: `breditor-perf:500:0:editMs:${edge}`, cat: "blink.user_timing", ph: "R", ts, pid: 1, tid: 2, ...extra});
const event = (name, ts, dur, extra = {}) => ({name, cat: "devtools.timeline", ph: "X", ts, dur, pid: 1, tid: 2, ...extra});
const summarize = traceEvents => summarizeRenderingTrace({traceEvents});

test("clips nested and overlapping rendering events without double counting", () => {
  const result = summarize([mark("start", 1000), event("Layout", 500, 2500), event("Layout", 1500, 1000),
    event("UpdateLayoutTree", 2000, 2000), event("Paint", 4500, 2000), mark("end", 5000)]).spans[0];
  assert.equal(result.durationMs, 4);
  assert.equal(result.renderingUnionMs, 3.5);
  assert.equal(result.unclassifiedMs, 0.5);
  assert.deepEqual(result.byEvent.Layout, {count: 2, unionMs: 2});
  assert.equal(result.byEvent.UpdateLayoutTree.unionMs, 2);
  assert.equal(result.byEvent.Paint.unionMs, 0.5);
});

test("does not attribute another process, thread, category or phase to the measured span", () => {
  const result = summarize([mark("start", 0), event("Layout", 0, 1000, {tid: 3}), event("Layout", 0, 1000, {pid: 2}),
    event("Layout", 0, 1000, {cat: "other"}), event("Layout", 0, 1000, {ph: "B"}),
    event("FunctionCall", 0, 1000), event("Paint", 2000, 1000), mark("end", 1000)]).spans[0];
  assert.equal(result.renderingUnionMs, 0); assert.equal(result.unclassifiedMs, 1);
});

test("matches interleaved marks by process, thread, size, repetition and metric", () => {
  const other = {name: "breditor-perf:100:2:undoMs:start", tid: 3};
  const result = summarize([mark("start", 0), mark("start", 5, other),
    mark("end", 10, {...other, name: "breditor-perf:100:2:undoMs:end"}), mark("end", 20)]);
  assert.deepEqual(result.spans.map(s => [s.items, s.repetition, s.metric, s.durationMs]),
    [[100, 2, "undoMs", 0.005], [500, 0, "editMs", 0.02]]);
});

test("ignores unrelated or unapproved marks and retains no trace payloads", () => {
  const result = summarize([{...mark("start", 0), name: "private text", args: {text: "private"}},
    mark("start", 0), event("Layout", 0, 1000, {args: {text: "private"}}), mark("end", 1000)]);
  assert.equal(result.spans.length, 1); assert.ok(!JSON.stringify(result).includes("private"));
});

test("fails on missing, reversed, duplicate or unfinished marks instead of reporting a partial pass", () => {
  for (const events of [[mark("end", 1)], [mark("start", 2), mark("end", 1)],
    [mark("start", 0), mark("start", 1)], [mark("start", 0)],
    [mark("start", 0), mark("end", 1), mark("start", 2), mark("end", 3)]]) assert.throws(() => summarize(events));
});

test("rejects malformed complete rendering durations and malformed containers", () => {
  for (const dur of [-1, NaN, Infinity, undefined]) assert.throws(() => summarize([
    mark("start", 0), event("Layout", 0, dur), mark("end", 1)]));
  assert.throws(() => summarizeRenderingTrace({}));
});
