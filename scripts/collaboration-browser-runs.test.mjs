import {test} from "node:test";import assert from "node:assert/strict";
import config from "../experiments/collaboration/browser/playwright.config.mjs";
import {collaborationBrowserRuns} from "./collaboration-browser-runs.mjs";
test("process isolation keeps every configured file exactly once in each engine",()=>{
 const runs=collaborationBrowserRuns(config.testMatch);assert.deepEqual(runs[0],{projects:["chromium","firefox"],specs:[]});
 const webkit=runs.slice(1);assert.equal(webkit.length,config.testMatch.length);assert.deepEqual(webkit.flatMap(run=>run.specs),config.testMatch);
 for(const run of webkit){assert.deepEqual(run.projects,["webkit"]);assert.equal(run.specs.length,1);}
});
test("missing duplicated and nonliteral spec plans reject rather than silently dropping coverage",()=>{
 for(const value of[[],["x.spec.mjs","x.spec.mjs"],["*.spec.mjs"],undefined])assert.throws(()=>collaborationBrowserRuns(value));
});
