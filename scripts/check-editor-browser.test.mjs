import test from "node:test";
import assert from "node:assert/strict";
import {readdirSync,readFileSync,realpathSync} from "node:fs";
import config from "../experiments/editor-browser/playwright.config.mjs";
import {editorBrowserPort} from "../experiments/editor-browser/port.mjs";
import {editorBrowserRuns,editorBrowserPlan,installedBrowserEnvironment} from "./check-editor-browser.mjs";
test("the installed consumer and Playwright use the same configurable loopback port",async()=>{
 const previous=process.env.BREDITOR_EDITOR_PORT;
 try{
  delete process.env.BREDITOR_EDITOR_PORT;
  assert.equal(editorBrowserPort(),49784);
  process.env.BREDITOR_EDITOR_PORT="50818";
  const {default:configured}=await import("../experiments/editor-browser/playwright.config.mjs?custom-port");
  assert.equal(configured.use.baseURL,"http://127.0.0.1:50818");
  assert.equal(configured.webServer.url,"http://127.0.0.1:50818/");
  assert.equal(editorBrowserPort(),50818);
  for(const value of ["", "invalid", "0", "65536", "50818.5"])assert.throws(()=>editorBrowserPort(value),/Invalid installed editor browser port/);
 }finally{
  if(previous===undefined)delete process.env.BREDITOR_EDITOR_PORT;
  else process.env.BREDITOR_EDITOR_PORT=previous;
 }
});
test("installed SDK matrices include every discovered spec once without project deadline or retry overrides",()=>{
 const names=readdirSync(new URL("../experiments/editor-browser",import.meta.url)).filter(n=>n.endsWith(".spec.mjs")),runs=editorBrowserRuns(names);
 assert.deepEqual(runs.flat().sort(),names.sort());assert.deepEqual(runs.at(-1),["shared-structural-network.spec.mjs"]);
 assert.ok(runs.slice(0,-1).every(run=>run.length<=4));
 assert.deepEqual(config.projects.map(project=>project.name),["chromium","firefox","webkit"]);assert.equal(config.retries,0);assert.equal(config.timeout,60_000);assert.equal(config.globalTimeout,300_000);
 for(const [_command,args]of editorBrowserPlan().runs){assert.equal(args.includes("--project"),false);assert.equal(args.includes("--timeout"),false);assert.equal(args.includes("--retries"),false);}
 const source=readFileSync(new URL("./check-editor-browser.mjs",import.meta.url),"utf8");assert.ok(source.includes("execFileSync(...plan.build,options)"));assert.ok(source.includes("shell:false"));
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
test("native V3 layout and durable recovery retain every engine in a dedicated process",()=>{
 assert.deepEqual(editorBrowserRuns(["layout-headless.spec.mjs","a.spec.mjs","shared-structural-network.spec.mjs"]),[["a.spec.mjs"],["layout-headless.spec.mjs"],["shared-structural-network.spec.mjs"]]);
});
test("V3 visual and structure matrices have separate budgets without hiding any engine",()=>{
 assert.deepEqual(editorBrowserRuns(["layout-visual.spec.mjs","layout-structure.spec.mjs","a.spec.mjs","shared-structural-network.spec.mjs"]),[["a.spec.mjs"],["layout-structure.spec.mjs"],["layout-visual.spec.mjs"],["shared-structural-network.spec.mjs"]]);
});
test("durable general range editing retains a dedicated complete three-engine process",()=>{
 assert.deepEqual(editorBrowserRuns(["general-range.spec.mjs","a.spec.mjs","shared-structural-network.spec.mjs"]),[["a.spec.mjs"],["general-range.spec.mjs"],["shared-structural-network.spec.mjs"]]);
});

test("installed browser filters match each spec once, including shared structural suffixes",()=>{
 const names=readdirSync(new URL("../experiments/editor-browser",import.meta.url)).filter(name=>name.endsWith(".spec.mjs"));
 const filters=editorBrowserPlan().runs.flatMap(([,args])=>args.slice(3).map(filter=>new RegExp(filter)));
 assert.equal(filters.length,names.length);
 for(const name of names){
  for(const path of [`/checkout/specs/${name}`,`C:\\checkout\\specs\\${name}`]){
   assert.equal(filters.filter(filter=>filter.test(path)).length,1,path);
  }
 }
 const structural=filters.find(filter=>filter.test("/checkout/structural-v2.spec.mjs"));
 assert.ok(structural);
 assert.equal(structural.test("/checkout/shared-structural-v2.spec.mjs"),false);
 assert.equal(structural.test("/checkout/structural-v2_spec.mjs"),false);
});

test("qualification binds the fresh installation even with an inherited consumer override",()=>{
 const fixture=realpathSync(new URL("../experiments/editor-browser/",import.meta.url));
 const env={BREDITOR_EDITOR_CONSUMER:"/stale-install",BREDITOR_EDITOR_PORT:"50852"};
 const result=installedBrowserEnvironment({consumer:fixture},env);
 assert.equal(result.BREDITOR_EDITOR_CONSUMER,fixture);
 assert.equal(result.BREDITOR_EDITOR_PORT,"50852");
 assert.equal(env.BREDITOR_EDITOR_CONSUMER,"/stale-install");
 assert.throws(()=>installedBrowserEnvironment({}),/Missing freshly installed editor consumer/);
});
