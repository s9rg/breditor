import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,readdirSync,existsSync} from "node:fs";
const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),"utf8");
test("optional shared workspace leaves the default Rust and npm build graphs independent",()=>{
 const root=read("Cargo.toml"),manifest=read("crates/breditor-collaboration/Cargo.toml");
 assert.match(root,/members = \["crates\/breditor-core", "crates\/breditor-wasm"\]/);assert.ok(!read("Cargo.lock").includes('name = "loro"'));
 assert.match(manifest,/default = \[\]/);assert.match(manifest,/research = \[\]/);assert.match(manifest,/publish = false/);
 const pkg=JSON.parse(read("packages/breditor-collaboration/package.json"));assert.equal(pkg.private,true);assert.ok(!("build" in pkg.scripts)&&!("typecheck" in pkg.scripts));assert.deepEqual(Object.keys(pkg.dependencies),["@breditor/experimental-rich-content"]);
});
test("legacy Rust and browser builds share canonical sources rather than maintaining a fork",()=>{
 assert.match(read("experiments/collaboration/Cargo.toml"),/path = "\.\.\/\.\.\/crates\/breditor-collaboration\/src\/lib.rs"/);assert.match(read("experiments/collaboration/Cargo.toml"),/default = \["research"\]/);
 assert.equal(existsSync(new URL("../experiments/collaboration/src",import.meta.url)),false);assert.equal(existsSync(new URL("../packages/breditor-experimental-collaboration/src",import.meta.url)),false);
 const config=JSON.parse(read("packages/breditor-experimental-collaboration/tsconfig.json"));assert.equal(config.compilerOptions.rootDir,"../breditor-collaboration/src");
 const expected=read("experiments/collaboration/Cargo.lock").replace('name = "breditor-collab-feasibility"\nversion = "0.1.0"','name = "breditor-collaboration"\nversion = "0.3.0-alpha.22"').replace(/(\[\[package\]\]\nname = "loro"\nversion = "1\.16\.2")\nsource = "[^"\n]+"\nchecksum = "[^"\n]+"/,"$1");assert.equal(read("crates/breditor-collaboration/Cargo.lock").trimEnd(),expected.trimEnd(),"Promotion may change the facade to its retained path, never dependency versions");
});
test("native dependencies retain the ordering patch without a downstream root override",()=>{
 const manifest=read("crates/breditor-collaboration/Cargo.toml");assert.ok(!manifest.includes("[patch.crates-io]"));assert.match(manifest,/loro = \{[^\n]*path = "vendor\/loro-1\.16\.2"/);assert.match(manifest,/loro-internal = \{[^\n]*path = "vendor\/loro-internal-1\.16\.2"/);
 assert.match(read("crates/breditor-collaboration/vendor/loro-1.16.2/Cargo.toml"),/\[dependencies\.loro-internal\]\nversion = "1\.16\.2"\npath = "\.\.\/loro-internal-1\.16\.2"/);
});
test("all promoted shared conformance files also run through the research compatibility manifest",()=>{
 const names=readdirSync(new URL("../crates/breditor-collaboration/tests",import.meta.url)).filter(name=>name.endsWith(".rs"));assert.ok(names.length>=27,"Retain the original conformance floor and check every additive file");
 for(const name of names){const shim=read(`experiments/collaboration/tests/${name}`);assert.match(shim,/extern crate breditor_collab_feasibility as breditor_collaboration;/);assert.ok(shim.includes(`../../../crates/breditor-collaboration/tests/${name}`));assert.ok(shim.split("\n").length<10);assert.ok(!read(`crates/breditor-collaboration/tests/${name}`).includes("breditor_collab_feasibility"));}
});
test("SDK shared entry uses the promoted optional package and application-only runtime",()=>{
 const pkg=JSON.parse(read("packages/breditor-editor/package.json"));assert.equal(pkg.peerDependenciesMeta["@breditor/collaboration"].optional,true);assert.equal(pkg.peerDependencies["@breditor/experimental-collaboration"],undefined);
 const source=read("packages/breditor-editor/src/shared_profile.ts");assert.ok(source.includes('import("@breditor/collaboration/wasm")'));assert.ok(!source.includes("@breditor/experimental-collaboration"));
});
test("application installed-network matrix preserves every existing case and strict deadline",()=>{
 const source=read("experiments/shared-browser/application-network.config.mjs");assert.ok(source.includes('from "./installed-network.config.mjs"'));assert.ok(source.includes('BREDITOR_SHARED_INSTALLED:"application"'));for(const setting of ["testMatch:","retries:","timeout:","projects:"])assert.equal(source.includes(setting),false);
});
