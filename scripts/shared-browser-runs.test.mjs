import {test} from "node:test";import assert from "node:assert/strict";
import {readdirSync} from "node:fs";
import config from "../experiments/shared-browser/playwright.config.mjs";
import {sharedBrowserRuns} from "./shared-browser-runs.mjs";
const discovered=readdirSync(new URL("../experiments/shared-browser/",import.meta.url)).filter(name=>name.endsWith(".spec.mjs"));
test("shared matrix includes every discovered spec once in each engine with unchanged strict deadlines",()=>{
 const runs=sharedBrowserRuns(config.testMatch,discovered);assert.deepEqual(runs[0],{projects:["chromium","firefox"],specs:[],patterns:[]});
 assert.deepEqual(runs.slice(1).flatMap(run=>run.specs),config.testMatch);
 for(const run of runs.slice(1)){assert.deepEqual(run.projects,["webkit*"]);assert.equal(run.patterns.length,1);assert.equal(run.specs.length,1);}
 // Per-test deadline is unchanged; the whole-run cap covers a plain three-engine run of every spec.
 assert.equal(config.retries,0);assert.equal(config.timeout,60_000);assert.equal(config.globalTimeout,2_700_000);
});
test("WebKit browser groups hold every configured spec exactly once and at most five files each",()=>{
 const groups=config.projects.filter(project=>project.name.startsWith("webkit"));
 assert.deepEqual(groups.flatMap(project=>project.testMatch).map(match=>match.replace("**/","")).sort(),[...config.testMatch].sort());
 for(const group of groups)assert.ok(group.testMatch.length<=5);
});
test("missing new files duplicate plans and nonliteral file names reject instead of reducing coverage",()=>{
 for(const [configured,actual]of[[[],[]],[["x.spec.mjs"],["x.spec.mjs","y.spec.mjs"]],[["x.spec.mjs","x.spec.mjs"],["x.spec.mjs"]],[["*.spec.mjs"],["x.spec.mjs"]]])assert.throws(()=>sharedBrowserRuns(configured,actual));
});
test("overlapping spec names have exact anchored CLI filters rather than duplicated suffix matches",()=>{
 const names=["profile.spec.mjs","custom-profile.spec.mjs"],runs=sharedBrowserRuns(names,names).slice(1);
 for(const name of names){
  for(const path of [`/test/${name}`,`C:\\test\\${name}`]){
   assert.equal(runs.filter(run=>new RegExp(run.patterns[0]).test(path)).length,1,path);
  }
 }
});


test("custom shared ports move both the browser and its fixture host",async()=>{
 const previous=process.env.BREDITOR_SHARED_PORT;
 try{
  process.env.BREDITOR_SHARED_PORT="50844";
  const {default:isolated}=await import("../experiments/shared-browser/playwright.config.mjs?custom-port");
  assert.equal(isolated.use.baseURL,"http://127.0.0.1:50844");
  assert.equal(isolated.webServer.url,"http://127.0.0.1:50844/");
 }finally{
  if(previous===undefined)delete process.env.BREDITOR_SHARED_PORT;
  else process.env.BREDITOR_SHARED_PORT=previous;
 }
});
