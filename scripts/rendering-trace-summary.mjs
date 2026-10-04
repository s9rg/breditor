// Diagnostic only: Chrome complete rendering events clipped to same-thread
// fixture marks. Union avoids counting nested rendering work twice. The rest
// is deliberately unclassified, not mislabeled JavaScript or Rust time.
import assert from "node:assert/strict";

const renderingNames = ["Layout", "UpdateLayoutTree", "RecalculateStyles", "PrePaint", "Paint"];
function unionDuration(intervals) {
  let duration = 0, end = -Infinity;
  for (const [start, stop] of intervals.sort((a, b) => a[0] - b[0])) {
    duration += Math.max(0, stop - Math.max(start, end));
    end = Math.max(end, stop);
  }
  return duration;
}

export function summarizeRenderingTrace(trace) {
  assert.ok(Array.isArray(trace.traceEvents), "traceEvents missing");
  const starts = new Map(), completed = new Set(), spans = [];
  const events = trace.traceEvents;
  for (const event of events) {
    const match = /^breditor-perf:(5|10|100|500):(-1|0|1|2):(selectionMs|editMs|undoMs|checkpointMs|disposeMs|redoMs):(start|end)$/u.exec(event.name ?? "");
    if (!match || !["R", "I"].includes(event.ph) || !event.cat?.split(",").includes("blink.user_timing")) continue;
    assert.ok(Number.isFinite(event.ts), "invalid mark timestamp");
    const key = JSON.stringify([event.pid, event.tid, ...match.slice(1, 4)]);
    if (match[4] === "start") {
      assert.ok(!starts.has(key) && !completed.has(key), "duplicate start mark"); starts.set(key, event); continue;
    }
    const start = starts.get(key);
    assert.ok(start && event.ts >= start.ts, "missing or reversed start mark");
    starts.delete(key);
    completed.add(key);
    const allIntervals = [];
    const byEvent = Object.fromEntries(renderingNames.map(name => {
      const intervals = [];
      for (const candidate of events) {
        if (candidate.name !== name || candidate.ph !== "X" || candidate.pid !== event.pid || candidate.tid !== event.tid ||
            !candidate.cat?.split(",").includes("devtools.timeline")) continue;
        assert.ok(Number.isFinite(candidate.ts) && Number.isFinite(candidate.dur) && candidate.dur >= 0, "invalid rendering duration");
        const from = Math.max(start.ts, candidate.ts), to = Math.min(event.ts, candidate.ts + candidate.dur);
        if (to > from) intervals.push([from, to]);
      }
      allIntervals.push(...intervals);
      return [name, {count: intervals.length, unionMs: unionDuration(intervals) / 1000}];
    }));
    const durationMs = (event.ts - start.ts) / 1000;
    const renderingUnionMs = unionDuration(allIntervals) / 1000;
    spans.push({items: Number(match[1]), repetition: Number(match[2]), metric: match[3],
      durationMs, renderingUnionMs, unclassifiedMs: Math.max(0, durationMs - renderingUnionMs), byEvent});
  }
  assert.equal(starts.size, 0, "unfinished fixture marks");
  return {method: "Same-thread complete (X) rendering events clipped to fixture marks; interval union, not additive self time. Unclassified time includes JS, Wasm, native work and instrumentation. Chromium diagnosis only, not Firefox attribution or release latency qualification.", spans};
}
