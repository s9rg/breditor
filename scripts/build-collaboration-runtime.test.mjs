import assert from "node:assert/strict";
import test from "node:test";
import {join} from "node:path";
import {spawnSync} from "node:child_process";
import {repository,collaborationRuntimeBuildPlan,buildCollaborationRuntime,runtimeFiles} from "./build-collaboration-runtime.mjs";
test("application runtime selects canonical Rust and explicitly excludes research defaults",()=>{
 const p=collaborationRuntimeBuildPlan({BREDITOR_CARGO:"/tools/cargo",BREDITOR_WASM_BINDGEN:"/tools/bindgen"});
 assert.deepEqual(p.steps[0].args,["build","--manifest-path","crates/breditor-collaboration/Cargo.toml","--locked","--no-default-features","--target","wasm32-unknown-unknown","--release","--offline"]);
 assert.ok(p.steps[1].args.at(-1).endsWith("breditor_collaboration.wasm"));assert.deepEqual(p.steps[2].args,["scripts/check-collaboration-runtime-surface.mjs",p.web]);assert.equal(p.output,join(repository,"packages/breditor-collaboration/dist/runtime"));
});
for(const failAt of [1,2,3])test(`application build stage ${failAt} failure cannot copy stale artifacts`,()=>{
 let calls=0,copies=0;assert.throws(()=>buildCollaborationRuntime({}, {run:()=>{if(++calls===failAt)throw Error("failed");},copy:()=>copies++,mkdir:()=>{}}));assert.equal(copies,0);
});
test("application files copy only after binary export admission, in a separate target",()=>{
 const events=[];const p=buildCollaborationRuntime({CARGO_TARGET_DIR:"/native"},{run:(_c,_a,o)=>{assert.equal(o.env.CARGO_TARGET_DIR,collaborationRuntimeBuildPlan().target);events.push("run");},copy:(from,to)=>events.push([from,to]),mkdir:()=>{}});
 assert.deepEqual(events.slice(0,3),["run","run","run"]);for(const [i,file]of runtimeFiles.entries())assert.deepEqual(events[i+3],[join(p.web,file),join(p.output,file)]);
});
test("application runtime dry run is read-only and ambiguous flags reject",()=>{
 const script=join(repository,"scripts/build-collaboration-runtime.mjs"),result=spawnSync(process.execPath,[script,"--dry-run"],{cwd:"/tmp",encoding:"utf8"});assert.equal(result.status,0);assert.equal(JSON.parse(result.stdout).executed,false);assert.equal(spawnSync(process.execPath,[script,"--research"]).status,2);
});
