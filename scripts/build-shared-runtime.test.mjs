import assert from "node:assert/strict";
import test from "node:test";
import {join} from "node:path";
import {spawnSync} from "node:child_process";
import {repository,sharedRuntimeBuildPlan,buildSharedRuntime,runtimeFiles} from "./build-shared-runtime.mjs";
test("optional shared runtime has an isolated locked offline build and paired public output names",()=>{
 const p=sharedRuntimeBuildPlan({BREDITOR_CARGO:"/tools/cargo",BREDITOR_WASM_BINDGEN:"/tools/bindgen"});
 assert.equal(p.steps[0].command,"/tools/cargo");assert.deepEqual(p.steps[0].args,["build","--manifest-path","experiments/collaboration/Cargo.toml","--locked","--target","wasm32-unknown-unknown","--release","--offline"]);
 assert.ok(p.steps[1].args.includes("breditor_shared"));assert.equal(p.output,join(repository,"packages/breditor-experimental-collaboration/dist/runtime"));assert.ok(Object.isFrozen(p.steps[0].args));
});
for(const failAt of [1,2])test(`failure at shared build stage ${failAt} cannot copy stale runtime files`,()=>{
 let calls=0,copies=0;assert.throws(()=>buildSharedRuntime({}, {run:()=>{if(++calls===failAt)throw Error("failed");},copy:()=>copies++,mkdir:()=>{}}));assert.equal(copies,0);
});
test("paired runtime copies follow both successful stages and ignore a native target override",()=>{
 const events=[];const p=buildSharedRuntime({CARGO_TARGET_DIR:"/native"},{run:(_c,_a,o)=>{assert.equal(o.env.CARGO_TARGET_DIR,sharedRuntimeBuildPlan().target);events.push("run");},copy:(from,to)=>events.push([from,to]),mkdir:()=>{}});
 assert.deepEqual(events.slice(0,2),["run","run"]);for(const [i,file]of runtimeFiles.entries())assert.deepEqual(events[i+2],[join(p.web,file),join(p.output,file)]);
});
test("shared runtime dry run is read-only and unknown flags reject",()=>{
 const script=join(repository,"scripts/build-shared-runtime.mjs"),a=spawnSync(process.execPath,[script,"--dry-run"],{cwd:"/tmp",encoding:"utf8"});assert.equal(a.status,0);assert.equal(JSON.parse(a.stdout).executed,false);
 assert.equal(spawnSync(process.execPath,[script,"--skip-build"]).status,2);
});
