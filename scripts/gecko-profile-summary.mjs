// Operation-scoped sample counts, not exact CPU durations. Read only the
// content thread containing our static UserTiming marks. Native frames remain
// unsymbolicated; the innermost fixture frame is not claimed as true self time.
import assert from "node:assert/strict";

const markPattern = /^breditor-perf:(5|10|100|500):(-1|0|1|2):(selectionMs|editMs|undoMs|checkpointMs|disposeMs|redoMs):(start|end)$/u;
const fixtureFramePattern = /^(.*?) \(http:\/\/127\.0\.0\.1:\d+\/assets\/[^/]+\.js:(\d+):\d+\)\[\d+\]$/u;
const wasmFramePattern = /^(.+) \(http:\/\/127\.0\.0\.1:\d+\/assets\/breditor_wasm_bg-[^/]+\.wasm:\d+\)$/u;
const ranked = counts => [...counts].map(([frame, samples]) => ({frame, samples}))
  .sort((a, b) => b.samples - a.samples || a.frame.localeCompare(b.frame));
const indexOf = (table, field) => {
  const index = table?.schema?.[field];
  assert.ok(Number.isSafeInteger(index) && index >= 0 && Array.isArray(table.data), `invalid ${field} table`);
  return index;
};

export function summarizeGeckoProfile(profile) {
  const spans = [];
  function visit(process) {
    assert.equal(process.meta?.version, 34, "unsupported Gecko profile version");
    for (const thread of process.threads ?? []) {
      if (thread.name !== "GeckoMain" || thread.processType !== "tab") continue;
      const markers = thread.markers;
      const payloadIndex = indexOf(markers, "data"), timeIndex = indexOf(markers, "startTime"), phaseIndex = indexOf(markers, "phase");
      const starts = new Map(), completed = new Set(), intervals = [];
      for (const row of markers.data) {
        const payload = row[payloadIndex];
        if (payload?.type !== "UserTiming" || payload.entryType !== "mark" || row[phaseIndex] !== 0) continue;
        const match = markPattern.exec(payload.name ?? "");
        if (!match) continue;
        const time = row[timeIndex];
        assert.ok(Number.isFinite(time) && Number.isSafeInteger(payload.innerWindowID), "invalid fixture mark");
        const key = JSON.stringify([payload.innerWindowID, ...match.slice(1, 4)]);
        if (match[4] === "start") {
          assert.ok(!starts.has(key) && !completed.has(key), "duplicate fixture start");
          starts.set(key, time);
        } else {
          const start = starts.get(key);
          assert.ok(start !== undefined && time >= start, "missing or reversed fixture start");
          starts.delete(key); completed.add(key);
          intervals.push({items: Number(match[1]), repetition: Number(match[2]), metric: match[3], start, end: time});
        }
      }
      assert.equal(starts.size, 0, "unfinished fixture marks");
      if (intervals.length === 0) continue;
      const sampleStack = indexOf(thread.samples, "stack"), sampleTime = indexOf(thread.samples, "time");
      const prefixIndex = indexOf(thread.stackTable, "prefix"), frameIndex = indexOf(thread.stackTable, "frame");
      const locationIndex = indexOf(thread.frameTable, "location");
      const framesByStack = new Map();
      const framesFor = stack => {
        if (stack === null) return {fixture: [], wasm: []};
        if (framesByStack.has(stack)) return framesByStack.get(stack);
        const frames = {fixture: [], wasm: []}, seen = new Set();
        for (let current = stack; current !== null;) {
          assert.ok(Number.isSafeInteger(current) && current >= 0 && current < thread.stackTable.data.length && !seen.has(current), "invalid or cyclic stack");
          seen.add(current);
          const row = thread.stackTable.data[current], frame = row[frameIndex];
          assert.ok(Number.isSafeInteger(frame) && frame >= 0 && frame < thread.frameTable.data.length, "invalid frame index");
          const location = thread.frameTable.data[frame][locationIndex];
          assert.ok(Number.isSafeInteger(location) && location >= 0 && location < thread.stringTable.length, "invalid frame location");
          const match = fixtureFramePattern.exec(thread.stringTable[location]);
          if (match) frames.fixture.push(`${match[1]}:${match[2]}`);
          const wasmMatch = wasmFramePattern.exec(thread.stringTable[location]);
          if (wasmMatch) frames.wasm.push(wasmMatch[1]);
          current = row[prefixIndex];
        }
        framesByStack.set(stack, frames);
        return frames;
      };
      let previous = -Infinity;
      for (const row of thread.samples.data) {
        assert.ok(Number.isFinite(row[sampleTime]) && row[sampleTime] >= previous, "invalid sample time");
        previous = row[sampleTime];
      }
      for (const interval of intervals) {
        let sampleCount = 0, withoutFixtureFrame = 0;
        const inclusive = new Map(), innermost = new Map();
        const wasmInclusive = new Map(), innermostWasm = new Map();
        for (const row of thread.samples.data) {
          if (row[sampleTime] < interval.start || row[sampleTime] >= interval.end) continue;
          sampleCount += 1;
          const frames = framesFor(row[sampleStack]);
          if (frames.fixture.length === 0) withoutFixtureFrame += 1;
          else innermost.set(frames.fixture[0], (innermost.get(frames.fixture[0]) ?? 0) + 1);
          for (const frame of new Set(frames.fixture)) inclusive.set(frame, (inclusive.get(frame) ?? 0) + 1);
          if (frames.wasm.length > 0) innermostWasm.set(frames.wasm[0], (innermostWasm.get(frames.wasm[0]) ?? 0) + 1);
          for (const frame of new Set(frames.wasm)) wasmInclusive.set(frame, (wasmInclusive.get(frame) ?? 0) + 1);
        }
        spans.push({...interval, durationMs: interval.end - interval.start, sampleCount, withoutFixtureFrame,
          inclusive: ranked(inclusive), innermostFixtureFrame: ranked(innermost),
          wasmInclusive: ranked(wasmInclusive), innermostWasmFrame: ranked(innermostWasm)});
      }
    }
    for (const child of process.processes ?? []) visit(child);
  }
  visit(profile);
  return {method: "Same-content-thread samples within static operation marks [start,end). Inclusive counts are non-additive, recursion counts once per sample. Innermost fixture/Wasm frames include any deeper native work and are not true self time. Wasm indices belong only to the recorded artifact; symbol maps require verified executable-section equality. Counts are not CPU milliseconds. Unminified profiled execution has overhead; no release latency claim. URLs and document content are excluded from this summary, not necessarily the raw profile.", spans};
}
