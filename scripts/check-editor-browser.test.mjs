import test from "node:test";
import assert from "node:assert/strict";
import {readdirSync,readFileSync} from "node:fs";
import config from "../experiments/editor-browser/playwright.config.mjs";
import {editorBrowserRuns,editorBrowserPlan} from "./check-editor-browser.mjs";
test("installed SDK matrices include every discovered spec once without project deadline or retry overrides",()=>{
 const names=readdirSync(new URL("../experiments/editor-browser",import.meta.url)).filter(n=>n.endsWith(".spec.mjs")),runs=editorBrowserRuns(names);
 assert.deepEqual(runs.flat().sort(),names.sort());assert.deepEqual(runs.at(-1),["shared-structural-network.spec.mjs"]);
 assert.ok(runs.slice(0,-1).every(run=>run.length<=4));
 assert.deepEqual(config.projects.map(project=>project.name),["chromium","firefox","webkit"]);assert.equal(config.retries,0);assert.equal(config.timeout,60_000);assert.equal(config.globalTimeout,300_000);
 for(const [_command,args]of editorBrowserPlan().runs){assert.equal(args.includes("--project"),false);assert.equal(args.includes("--timeout"),false);assert.equal(args.includes("--retries"),false);}
 const source=readFileSync(new URL("./check-editor-browser.mjs",import.meta.url),"utf8");assert.ok(source.includes("[plan.build,...plan.runs]"));assert.ok(source.includes("shell:false"));
});
test("editing partition is deterministic and complete beyond one bounded batch",()=>{
 const names=["z.spec.mjs","a.spec.mjs","d.spec.mjs","b.spec.mjs","c.spec.mjs","shared-structural-network.spec.mjs"];
 assert.deepEqual(editorBrowserRuns(names),[["a.spec.mjs","b.spec.mjs","c.spec.mjs","d.spec.mjs"],["z.spec.mjs"],["shared-structural-network.spec.mjs"]]);
 assert.deepEqual(editorBrowserRuns([...names].reverse()),editorBrowserRuns(names));
});
test("an ambiguous or incomplete SDK matrix inventory rejects instead of hiding cases",()=>{
 for(const value of [[],["x.spec.mjs"],["shared-structural-network.spec.mjs"],["../x.spec.mjs"],["shared-structural-network.spec.mjs","x.spec.mjs","x.spec.mjs"]])assert.throws(()=>editorBrowserRuns(value));
});
test("shared typing matrices keep their own process budget without dropping other editing coverage",()=>{
 const names=["shared-typing-history.spec.mjs","shared-typing-boundaries.spec.mjs","a.spec.mjs","b.spec.mjs","shared-structural-network.spec.mjs"];
 assert.deepEqual(editorBrowserRuns(names),[["a.spec.mjs","b.spec.mjs"],["shared-typing-boundaries.spec.mjs"],["shared-typing-history.spec.mjs"],["shared-structural-network.spec.mjs"]]);
});
test("code-exit exact-replay checks use a dedicated complete three-engine process",()=>{
 const names=["code-exit.spec.mjs","a.spec.mjs","shared-structural-network.spec.mjs"];
 assert.deepEqual(editorBrowserRuns(names),[["a.spec.mjs"],["code-exit.spec.mjs"],["shared-structural-network.spec.mjs"]]);
});
test("native flow navigation has a separate complete three-engine process budget",()=>{
 const names=["flow-navigation.spec.mjs","code-exit.spec.mjs","a.spec.mjs","shared-structural-network.spec.mjs"];
 assert.deepEqual(editorBrowserRuns(names),[["a.spec.mjs"],["code-exit.spec.mjs"],["flow-navigation.spec.mjs"],["shared-structural-network.spec.mjs"]]);
});
test("dynamic SDK imports cannot execute another installed fixture page's bootstrap",()=>{
 const source=readFileSync(new URL("./fixtures/editor-consumer/vite.config.mjs",import.meta.url),"utf8");
 assert.ok(source.includes('preserveEntrySignatures:"strict"'));
 assert.ok(source.includes('strictExecutionOrder:true'));
});
test("native atom-edit checks retain a dedicated complete three-engine process",()=>{
 assert.deepEqual(editorBrowserRuns(["atom-edit.spec.mjs","a.spec.mjs","shared-structural-network.spec.mjs"]),[["a.spec.mjs"],["atom-edit.spec.mjs"],["shared-structural-network.spec.mjs"]]);
});
test("native selection formatting retains a dedicated complete three-engine process",()=>{
 assert.deepEqual(editorBrowserRuns(["selection-formatting.spec.mjs","a.spec.mjs","shared-structural-network.spec.mjs"]),[["a.spec.mjs"],["selection-formatting.spec.mjs"],["shared-structural-network.spec.mjs"]]);
});
