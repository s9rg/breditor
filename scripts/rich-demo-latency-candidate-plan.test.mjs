import assert from "node:assert/strict";
import test from "node:test";
import {candidateReleasePlan} from "./candidate-release/plan.mjs";
import {measuredBrowserLatency,richDemoLatencyReport} from "./record-rich-demo-latency.mjs";

test("full qualification retains browser latency samples from all engines",()=>{
 const stage=candidateReleasePlan().checks.find(row=>row.id==="rich-demo-latency");
 assert.deepEqual(stage.artifacts,[{path:richDemoLatencyReport,fresh:true,retain:true}]);
 assert.ok(!candidateReleasePlan({profile:"functional"}).checks.some(row=>row.id===stage.id));
 const metric={samples:25,p50:3,p95:5};
 const wasmSha256="5".repeat(64),glueSha256="7".repeat(64),documentSha256="a".repeat(64);
 const runtime={wasmSha256,glueSha256};
 const make=(browser,overrides={})=>JSON.stringify({
  format:"breditor/rich-demo-latency",formatVersion:2,browser,browserVersion:"1",node:"v22",platform:"linux",arch:"x64",readyMs:32,
  host:{cpu:"Fixture processor",logicalCpus:8,memoryBytes:8_000_000_000,osRelease:"6",osVersion:"Linux fixture"},
  fixture:{documentBytes:1420,topLevelBlocks:5,documentSha256},...runtime,
  commands:{insert:metric,undo:metric,redo:metric},
  clipboard:{method:"synthetic-plain-text-paste-event",bytes:1000,...metric},...overrides,
 });
 const output=["firefox","chromium","webkit"].map(make).join("\n");
 assert.deepEqual(measuredBrowserLatency(output,runtime).map(row=>row.browser),["chromium","firefox","webkit"]);
 assert.throws(()=>measuredBrowserLatency(output+"\n"+make("webkit"),runtime),/one latency sample set/);
 assert.throws(()=>measuredBrowserLatency(output.replace('"samples":25','"samples":0'),runtime));
 const withWebKit=overrides=>["firefox","chromium"].map(engine=>make(engine))
  .concat(make("webkit",overrides)).join("\n");
 assert.throws(()=>measuredBrowserLatency(withWebKit({wasmSha256:"6".repeat(64)}),runtime),/different Wasm bytes/);
 assert.throws(()=>measuredBrowserLatency(withWebKit({glueSha256:"6".repeat(64)}),runtime),/different runtime glue/);
 assert.throws(()=>measuredBrowserLatency(withWebKit({fixture:{documentBytes:1420,topLevelBlocks:5,documentSha256:"b".repeat(64)}}),runtime),
  /same document/);
 assert.throws(()=>measuredBrowserLatency(withWebKit({host:{cpu:"Fixture processor"}}),runtime));
});
