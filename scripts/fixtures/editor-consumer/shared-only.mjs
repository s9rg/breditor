import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {readFileSync} from "node:fs";
import {createLayoutSharedProfileV3,createRichSharedProfileV4,createSharedProfile,initializeSharedRuntime,openSharedEditor,SharedRichEditor} from "@breditor/editor/collaboration";
import {createLocalProfileV4,emptyDocumentJson,initializeLocalRuntime} from "@breditor/editor";
import {assertRuntimeNotices} from "./runtime-notices.mjs";
const require=createRequire(import.meta.url);
assertRuntimeNotices(require.resolve("@breditor/collaboration/wasm-binary"),"shared");
assert.throws(()=>require.resolve("react"),{code:"MODULE_NOT_FOUND"});
assert.equal(typeof openSharedEditor,"function");
await initializeSharedRuntime(readFileSync(require.resolve("@breditor/collaboration/wasm-binary")));
const profile=await createSharedProfile();try{assert.equal(JSON.parse(profile.descriptor_json()).modelVersion,11);}finally{profile.free();}
console.log("Installed collaboration SDK initializes without React");

await initializeLocalRuntime(readFileSync(require.resolve("@breditor/experimental-rich-content/wasm-binary")));
const localV4=await createLocalProfileV4();
const sharedV4=await createRichSharedProfileV4();
const sharedV3=await createLayoutSharedProfileV3();
try {
 const binding=JSON.parse(sharedV4.descriptor_json());
 assert.equal(binding.modelVersion,14);
 assert.equal(binding.journalVersion,15);
 assert.equal(binding.schemaFingerprint,localV4.descriptor().schemaFingerprint);
 const first=new SharedRichEditor(sharedV4.create(emptyDocumentJson(localV4.descriptor(),"installed-v4","p"),"101"));
 const second=new SharedRichEditor(sharedV4.join_frame("installed-v4","202",first.updateFrame()));
 try {
  assert.equal(first.insertPageBreak("chapter-end",null),true);
  const edited=first.documentJson();
  assert.match(edited,/breditor\/page-break/);
  await second.receiveFrame(first.updateFrame());
  assert.equal(second.documentJson(),edited);
  first.undo();
  const checkpoint=first.checkpointJson();
  assert.equal(JSON.parse(checkpoint).version,15);
  assert.throws(()=>sharedV3.restore("installed-v4",checkpoint));
  first.dispose();
  const restored=new SharedRichEditor(sharedV4.restore("installed-v4",checkpoint));
  try {
   assert.equal(restored.checkpointJson(),checkpoint);
   restored.redo();
   assert.equal(restored.documentJson(),edited);
  }finally{restored.dispose();}
 }finally{first.dispose();second.dispose();}
}finally{sharedV3.free();sharedV4.free();localV4.dispose();}
console.log("Installed shared V4 restores exact Redo and rejects the journal under V3");
