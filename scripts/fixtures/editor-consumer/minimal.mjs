import assert from "node:assert/strict";
import {readFileSync,existsSync} from "node:fs";
import {createRequire} from "node:module";
import {initializeLocalRuntime,createLocalProfile,createStructuralLocalProfileV2,emptyDocumentJson} from "@breditor/editor";
import {assertRuntimeNotices} from "./runtime-notices.mjs";
const require=createRequire(import.meta.url);
assertRuntimeNotices(require.resolve("@breditor/experimental-rich-content/wasm-binary"),"rich");
assert.equal(existsSync("node_modules/@breditor/experimental-collaboration"),false);
assert.equal(existsSync("node_modules/@breditor/collaboration"),false);
assert.equal(existsSync("node_modules/react"),false);
await initializeLocalRuntime(readFileSync(require.resolve("@breditor/experimental-rich-content/wasm-binary")));
const profile=await createLocalProfile();try{
 const owner=profile.createEditor(emptyDocumentJson(profile.descriptor(),"minimal-document","p"));try{owner.execute({kind:"setSelection",selection:{kind:"text",anchor:{block:"p",offset:"0",affinity:"after"},focus:{block:"p",offset:"0",affinity:"after"}}});owner.execute({kind:"insertPlainText",text:"Installed 🙂"});const after=owner.documentJson();owner.execute({kind:"undo"});const restored=profile.restoreEditor(owner.checkpointJson());try{restored.execute({kind:"redo"});assert.equal(restored.documentJson(),after);}finally{restored.dispose();}}finally{owner.dispose();}
}finally{profile.dispose();}
console.log("Minimal SDK consumer passed without React, collaboration or repository runtime paths");
const structural=await createStructuralLocalProfileV2();try{
 assert.equal(structural.descriptor().richLanguageVersion,2);
 const owner=structural.createEditor(emptyDocumentJson(structural.descriptor(),"v2-minimal","p"));try{
  assert.equal(owner.richLanguageVersion(),2);owner.execute({kind:"setSelection",selection:{kind:"text",anchor:{block:"p",offset:"0",affinity:"after"},focus:{block:"p",offset:"0",affinity:"after"}}});
  owner.execute({kind:"insertPlainText",text:"Plain 🙂"});owner.execute({kind:"setCodeBlock",data:{block:"p",language:"Rust",formatPolicy:"rejectFormatted"}});assert.equal(owner.inlineFormatState("breditor/strong").state.kind,"unavailable");
  const saved=owner.checkpointJson(),copy=structural.restoreEditor(saved);try{assert.equal(copy.checkpointJson(),saved);for(const kind of ["undo","redo"]){owner.execute({kind});copy.execute({kind});assert.equal(copy.checkpointJson(),owner.checkpointJson());}}finally{copy.dispose();}
 }finally{owner.dispose();}
}finally{structural.dispose();}
console.log("Minimal structural V2 owner and exact future history passed without optional peers");
