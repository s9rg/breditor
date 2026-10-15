import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),"utf8");
test("candidate editor root keeps optional React/shared entries separate and remains private",()=>{
 const p=JSON.parse(read("packages/breditor-editor/package.json"));assert.equal(p.private,true);for(const peer of ["react","@breditor/collaboration"])assert.equal(p.peerDependenciesMeta[peer].optional,true);
 for(const entry of [".","./react","./collaboration"])assert.ok(p.exports[entry].types&&p.exports[entry].import);
 assert.deepEqual(Object.keys(p.dependencies),["@breditor/experimental-rich-content"]);assert.ok(!("build" in p.scripts)&&!("typecheck" in p.scripts));
 const source=read("packages/breditor-editor/src/index.ts");assert.ok(!source.includes('from "react"')&&!source.includes('from "@breditor/experimental-collaboration"'));
});
test("installed shared package qualification builds its runtime and never injects a repository Wasm module",()=>{
 const check=read("scripts/check-shared-package.mjs"),consumer=read("scripts/fixtures/shared-consumer/runtime.mjs"),host=read("experiments/shared-browser/serve.mjs");assert.ok(check.indexOf('"scripts/build-shared-runtime.mjs"')<check.indexOf('"pack"'));
 assert.ok(!consumer.includes("BREDITOR_PROBE_MODULE")&&!consumer.includes("BREDITOR_PROBE_BINARY"));assert.ok(consumer.includes('from "@breditor/experimental-collaboration/wasm"'));
 assert.ok(host.includes('installed?resolve(shared,"dist/runtime"):artifacts'));
});
