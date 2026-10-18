import assert from "node:assert/strict";
import test from "node:test";
import {spawnSync} from "node:child_process";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {repository,runtimeNoticePlan,renderRuntimeNotices,runtimeNoticeFiles} from "./build-runtime-notices.mjs";
test("notice plans select exact offline runtime graphs and keep executable overrides as paths",()=>{
 for(const kind of ["rich","shared"]){const p=runtimeNoticePlan(kind,{BREDITOR_CARGO:"/tool path/cargo",BREDITOR_RUSTC:"/tool path/rustc"});assert.equal(p.cargo,"/tool path/cargo");assert.equal(p.rustc,"/tool path/rustc");assert.ok(Object.isFrozen(p)&&Object.isFrozen(p.args));assert.equal(p.args[p.args.indexOf("--filter-platform")+1],"wasm32-unknown-unknown");for(const arg of ["--locked","--offline"])assert.ok(p.args.includes(arg));assert.deepEqual(p.args.slice(-1),[kind==="shared"?"--no-default-features":"experimental-rich-content"]);assert.ok(p.output.startsWith(join(repository,"target")));}
 assert.throws(()=>runtimeNoticePlan("default"));assert.deepEqual(runtimeNoticeFiles,["breditor_dependency_inventory.json","THIRD_PARTY_NOTICES.txt","RUST_COPYRIGHT-library.html"]);
});
test("notice rendering preserves exact texts and exposes gaps without granting release approval",()=>{
 const text="Upstream exact copyright 🙂\n\nPermission text.\n",rendered=renderRuntimeNotices({inventory:{root:"root@1",sha256:"1".repeat(64),packages:[{key:"dependency@1",license:"MIT",source:"crates.io"}],gaps:[{package:"missing@1",reason:"no-notice-text-in-cargo-source"}]},noticeTexts:[{package:"dependency@1",path:"src/NOTICE",sha256:"2".repeat(64),text}]});
 assert.ok(rendered.includes(text));assert.match(rendered,/not publication approval/);assert.match(rendered,/missing@1: no-notice-text-in-cargo-source/);assert.match(rendered,/dependency@1 \/ src\/NOTICE/);assert.ok(rendered.includes("1".repeat(64)));
});
test("ambiguous runtime notice CLI options cannot write staged artifacts",()=>{
 const file=join(repository,"scripts/build-runtime-notices.mjs");for(const args of [[],["--approved"],["shared","rich"]]){const r=spawnSync(process.execPath,[file,...args],{cwd:tmpdir(),encoding:"utf8"});assert.equal(r.status,2);assert.equal(r.stdout,"");assert.match(r.stderr,/not release approval/);}
});
