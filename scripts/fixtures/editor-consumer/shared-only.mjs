import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {readFileSync} from "node:fs";
import {createSharedProfile,initializeSharedRuntime,openSharedEditor} from "@breditor/editor/collaboration";
import {assertRuntimeNotices} from "./runtime-notices.mjs";
const require=createRequire(import.meta.url);
assertRuntimeNotices(require.resolve("@breditor/collaboration/wasm-binary"),"shared");
assert.throws(()=>require.resolve("react"),{code:"MODULE_NOT_FOUND"});
assert.equal(typeof openSharedEditor,"function");
await initializeSharedRuntime(readFileSync(require.resolve("@breditor/collaboration/wasm-binary")));
const profile=await createSharedProfile();try{assert.equal(JSON.parse(profile.descriptor_json()).modelVersion,11);}finally{profile.free();}
console.log("Installed collaboration SDK initializes without React");
