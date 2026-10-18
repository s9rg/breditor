import assert from "node:assert/strict";
import test from "node:test";
import {mkdtempSync,mkdirSync,existsSync,rmSync,symlinkSync,realpathSync} from "node:fs";
import {tmpdir,homedir} from "node:os";
import {join,resolve} from "node:path";
import {candidateRuntimePaths,physicalBuildPath} from "./candidate-runtime-paths.mjs";
import {assertNoWasmHostPathLeaks} from "./wasm-path-leaks.mjs";
test("logical and physical build roots use stable labels without shell quoting",()=>{
 const result=candidateRuntimePaths("/logical/project with spaces","/logical/project with spaces/target/cache",{CARGO_HOME:"/logical/cargo home"},path=>path.replace("/logical/","/physical/"));
 assert.ok(Object.isFrozen(result)&&Object.isFrozen(result.environment)&&Object.isFrozen(result.forbiddenPrefixes));
 assert.deepEqual(result.environment.CARGO_ENCODED_RUSTFLAGS.split("\u001f"),[
  "--remap-path-prefix=/logical/project with spaces/target/cache=target","--remap-path-prefix=/physical/project with spaces/target/cache=target",
  "--remap-path-prefix=/logical/cargo home=cargo","--remap-path-prefix=/physical/cargo home=cargo",
  "--remap-path-prefix=/logical/project with spaces=breditor","--remap-path-prefix=/physical/project with spaces=breditor",
 ]);assert.equal(result.forbiddenPrefixes.length,6);
});
test("relative Cargo homes resolve at the repository and duplicate physical paths collapse",()=>{
 const p=candidateRuntimePaths("/build/project","/build/project/target",{CARGO_HOME:"cache"},path=>path);assert.equal(p.forbiddenPrefixes.length,3);assert.ok(p.forbiddenPrefixes.includes("/build/project/cache"));
 const relative=candidateRuntimePaths("/build/project","target/cache",{CARGO_HOME:""},path=>path);assert.ok(relative.forbiddenPrefixes.includes("/build/project/target/cache"));assert.ok(relative.forbiddenPrefixes.includes(resolve(homedir(),".cargo")),"Empty CARGO_HOME retains the original default builder's home policy");
});
test("physical target resolution follows symlinked ancestors without creating directories",()=>{
 const base=mkdtempSync(join(tmpdir(),"breditor-remap-contract-"));try{const physical=join(base,"physical project"),logical=join(base,"logical project");mkdirSync(physical);symlinkSync(physical,logical,"dir");const target=join(logical,"not-created/deeper"),wanted=join(realpathSync(physical),"not-created/deeper");assert.equal(physicalBuildPath(target),wanted);assert.equal(existsSync(target),false);const p=candidateRuntimePaths(logical,target,{CARGO_HOME:join(logical,"cargo")});assert.ok(p.forbiddenPrefixes.includes(wanted));assert.equal(existsSync(target),false);}finally{rmSync(base,{recursive:true,force:true});}
});
test("ambiguous compiler paths and custom Rust flags refuse instead of silently changing a candidate",()=>{
 for(const flags of [{RUSTFLAGS:"-C opt-level=0"},{CARGO_ENCODED_RUSTFLAGS:"--cfg=research"}])assert.throws(()=>candidateRuntimePaths("/repo","/repo/target",flags,path=>path),/own their Rust flags/);
 for(const path of ["/bad=path","/bad\u001fpath","/"])assert.throws(()=>candidateRuntimePaths(path,"/target",{CARGO_HOME:"/cargo"},path=>path),/Unsupported path/);
});
test("the binary guard rejects producer roots and common homes but permits useful remapped diagnostics",()=>{
 for(const path of ["/Users/person/src/lib.rs","/home/person/src/lib.rs","/root/.cargo/lib.rs","C:\\Users\\person\\src\\lib.rs"])assert.throws(()=>assertNoWasmHostPathLeaks(Buffer.from(`prefix\0${path}\0suffix`)),/user-home|root-home/);
 assert.throws(()=>assertNoWasmHostPathLeaks(Buffer.from("/build/owned-project/src/lib.rs"),["/build/owned-project"]),/build-root/);
 assert.doesNotThrow(()=>assertNoWasmHostPathLeaks(Buffer.from("breditor/crates/core.rs\0cargo/registry/lib.rs\0/rustc/toolchain/library/core.rs"),["/build/owned-project"]));
});
