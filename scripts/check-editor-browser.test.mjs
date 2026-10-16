import test from "node:test";
import assert from "node:assert/strict";
import {readdirSync,readFileSync} from "node:fs";
import config from "../experiments/editor-browser/playwright.config.mjs";
import {editorBrowserRuns,editorBrowserPlan} from "./check-editor-browser.mjs";
test("installed SDK matrices include every discovered spec once without project deadline or retry overrides",()=>{
 const names=readdirSync(new URL("../experiments/editor-browser",import.meta.url)).filter(n=>n.endsWith(".spec.mjs")),runs=editorBrowserRuns(names);
 assert.deepEqual(runs.flat().sort(),names.sort());assert.deepEqual(runs[1],["shared-structural-network.spec.mjs"]);
 assert.deepEqual(config.projects.map(project=>project.name),["chromium","firefox","webkit"]);assert.equal(config.retries,0);assert.equal(config.timeout,60_000);assert.equal(config.globalTimeout,300_000);
 for(const [_command,args]of editorBrowserPlan().runs){assert.equal(args.includes("--project"),false);assert.equal(args.includes("--timeout"),false);assert.equal(args.includes("--retries"),false);}
 const source=readFileSync(new URL("./check-editor-browser.mjs",import.meta.url),"utf8");assert.ok(source.includes("[plan.build,...plan.runs]"));assert.ok(source.includes("shell:false"));
});
test("an ambiguous or incomplete SDK matrix inventory rejects instead of hiding cases",()=>{
 for(const value of [[],["x.spec.mjs"],["shared-structural-network.spec.mjs"],["../x.spec.mjs"],["shared-structural-network.spec.mjs","x.spec.mjs","x.spec.mjs"]])assert.throws(()=>editorBrowserRuns(value));
});
