import assert from "node:assert/strict";
import test from "node:test";
import {candidateReleasePlan} from "./candidate-release/plan.mjs";
import {measuredBrowserLatency,richDemoLatencyReport} from "./record-rich-demo-latency.mjs";

test("full qualification retains browser latency samples from all engines",()=>{
 const stage=candidateReleasePlan().checks.find(row=>row.id==="rich-demo-latency");
 assert.deepEqual(stage.artifacts,[{path:richDemoLatencyReport,fresh:true,retain:true}]);
 assert.ok(!candidateReleasePlan({profile:"functional"}).checks.some(row=>row.id===stage.id));
 const metric={samples:25,p50:3,p95:5};
 const make=browser=>JSON.stringify({
  format:"breditor/rich-demo-latency",formatVersion:1,browser,browserVersion:"1",node:"v22",platform:"linux",arch:"x64",readyMs:32,
  commands:{insert:metric,undo:metric,redo:metric},
  clipboard:{method:"synthetic-plain-text-paste-event",bytes:1000,...metric},
 });
 const output=["firefox","chromium","webkit"].map(make).join("\n");
 assert.deepEqual(measuredBrowserLatency(output).map(row=>row.browser),["chromium","firefox","webkit"]);
 assert.throws(()=>measuredBrowserLatency(output+"\n"+make("webkit")),/one latency sample set/);
 assert.throws(()=>measuredBrowserLatency(output.replace('"samples":25','"samples":0')));
});
