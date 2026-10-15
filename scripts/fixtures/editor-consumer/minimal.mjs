import assert from "node:assert/strict";
import {readFileSync,existsSync} from "node:fs";
import {createRequire} from "node:module";
import {initializeLocalRuntime,createLocalProfile,emptyDocumentJson} from "@breditor/editor";
const require=createRequire(import.meta.url);
assert.equal(existsSync("node_modules/@breditor/experimental-collaboration"),false);
assert.equal(existsSync("node_modules/@breditor/collaboration"),false);
assert.equal(existsSync("node_modules/react"),false);
await initializeLocalRuntime(readFileSync(require.resolve("@breditor/experimental-rich-content/wasm-binary")));
const profile=await createLocalProfile();try{
 const owner=profile.createEditor(emptyDocumentJson(profile.descriptor(),"minimal-document","p"));try{owner.execute({kind:"setSelection",selection:{kind:"text",anchor:{block:"p",offset:"0",affinity:"after"},focus:{block:"p",offset:"0",affinity:"after"}}});owner.execute({kind:"insertPlainText",text:"Installed 🙂"});const after=owner.documentJson();owner.execute({kind:"undo"});const restored=profile.restoreEditor(owner.checkpointJson());try{restored.execute({kind:"redo"});assert.equal(restored.documentJson(),after);}finally{restored.dispose();}}finally{owner.dispose();}
}finally{profile.dispose();}
console.log("Minimal SDK consumer passed without React, collaboration or repository runtime paths");
