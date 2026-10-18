import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {join} from "node:path";
import test from "node:test";
import {buildRichRuntime,repository,richRuntimeBuildPlan,runtimeFiles} from "./build-rich-runtime.mjs";
import {runtimeNoticeFiles} from "./build-runtime-notices.mjs";

test("rich runtime plan fixes the exact opt-in Rust feature target and generated module pairing",()=>{
 const plan=richRuntimeBuildPlan({BREDITOR_CARGO:"/tools with spaces/cargo",BREDITOR_WASM_BINDGEN:"/tools with spaces/wasm-bindgen"});
 assert.equal(plan.steps[0].command,"/tools with spaces/cargo");
 assert.deepEqual(plan.steps[0].args,["build","-p","breditor-wasm","--locked","--features","experimental-rich-content","--target","wasm32-unknown-unknown","--release","--offline"]);
 assert.equal(plan.steps[1].command,"/tools with spaces/wasm-bindgen");
 assert.deepEqual(plan.steps[2].args.slice(0,2),["scripts/wasm-path-leaks.mjs",join(plan.web,"breditor_wasm_bg.wasm")]);assert.ok(plan.steps[2].args.includes(repository));
 assert.deepEqual(plan.steps[3].args,["scripts/build-runtime-notices.mjs","rich"]);
 assert.ok(plan.rustEnvironment.CARGO_ENCODED_RUSTFLAGS.includes(`--remap-path-prefix=${repository}=breditor`));
 assert.ok(plan.steps[1].args.includes(join(plan.target,"wasm32-unknown-unknown/release/breditor_wasm.wasm")));
 assert.equal(plan.output,join(repository,"packages/breditor-experimental-rich-content/dist"));
 assert.ok(Object.isFrozen(plan)&&Object.isFrozen(plan.steps)&&plan.steps.every(step=>Object.isFrozen(step.args)));
});
test("successful commands precede copies and cannot inherit a native Cargo cache",()=>{
 const events=[];
 const plan=buildRichRuntime({CARGO_TARGET_DIR:"/wrong/native-target"},{run:(command,args,options)=>{
  assert.equal(options.shell,false);assert.equal(options.cwd,repository);assert.equal(options.env.CARGO_TARGET_DIR,richRuntimeBuildPlan({}).target);assert.equal(options.env.CARGO_ENCODED_RUSTFLAGS,richRuntimeBuildPlan({}).rustEnvironment.CARGO_ENCODED_RUSTFLAGS);events.push(["run",command,args]);
 },copy:(from,to)=>events.push(["copy",from,to]),mkdir:path=>events.push(["mkdir",path])});
 const copies=events.filter(event=>event[0]==="copy");assert.equal(copies.length,5+runtimeNoticeFiles.length);
 assert.deepEqual(copies.slice(0,4).map(event=>event[1]),runtimeFiles.map(file=>join(plan.web,file)));
 assert.deepEqual(copies.slice(5).map(event=>event.slice(1)),runtimeNoticeFiles.map(file=>[join(plan.web,file),join(plan.output,file)]));
 assert.ok(events.findIndex(event=>event[0]==="copy")>events.findLastIndex(event=>event[0]==="run"));
});
for(const failAt of [1,2,3,4])test(`failed build stage ${failAt} never copies old generated files`,()=>{
 let runs=0,copies=0;
 assert.throws(()=>buildRichRuntime({}, {run:()=>{if(++runs===failAt)throw Error("build failure");},copy:()=>copies++,mkdir:()=>{}}),/build failure/);
 assert.equal(copies,0);assert.equal(runs,failAt);
});
test("dry run is read-only and package qualification invokes the builder before npm pack",()=>{
 const run=spawnSync(process.execPath,[join(repository,"scripts/build-rich-runtime.mjs"),"--dry-run"],{cwd:"/tmp",encoding:"utf8"});
 assert.equal(run.status,0,run.stderr);assert.equal(JSON.parse(run.stdout).executed,false);
 const source=readFileSync(join(repository,"scripts/check-shared-package.mjs"),"utf8");
 const build=source.indexOf('"scripts/build-rich-runtime.mjs"'),pack=source.indexOf('"pack"');
 assert.ok(build>=0&&pack>build);
 const invalid=spawnSync(process.execPath,[join(repository,"scripts/build-rich-runtime.mjs"),"--skip-build"],{encoding:"utf8"});assert.equal(invalid.status,2);
});
