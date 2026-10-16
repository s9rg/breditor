/** Real pre-capability/current local Wasm interoperability and explicit new-mode admission. */
import assert from "node:assert/strict";
import {readFileSync,realpathSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
import {createHash} from "node:crypto";
import {compileRichProfile,compileStructuralRichProfileV2} from "../packages/breditor-experimental-rich-content/index.js";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==="object"?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
async function load(directory){const bytes=readFileSync(resolve(directory,"breditor_wasm_bg.wasm")),module=await import(pathToFileURL(resolve(directory,"breditor_wasm.js")));await module.default({module_or_path:bytes});return {module,sha256:createHash("sha256").update(bytes).digest("hex")};}
const point={block:"p",offset:"1",affinity:"after"},selection={kind:"text",anchor:point,focus:point};
export async function probeLocalTypingHistory(beforeDirectory,afterDirectory){
 const before=await load(beforeDirectory),after=await load(afterDirectory);let defaultStates=0,futureStates=0;
 for(const language of [1,2]){
  const profiles=[],owners=[];
  try{
   const factory=language===1?compileRichProfile:compileStructuralRichProfileV2,bootstrap=JSON.stringify({format:"breditor/profile-bootstrap",formatVersion:language===1?6:7,schema:{name:"example/local-typing-interop",version:1},extensions:[]});
   const oldProfile=factory(before.module,bootstrap),profile=factory(after.module,bootstrap);profiles.push(oldProfile,profile);assert.deepEqual(oldProfile.descriptor(),profile.descriptor());
   const binding=profile.descriptor(),rootNode=JSON.parse(readFileSync(resolve(root,"crates/breditor-core/tests/fixtures/rich-local-root.json"),"utf8")),document=JSON.stringify({format:"breditor/document",formatVersion:2,schema:binding.schema,schemaFingerprint:binding.schemaFingerprint,root:canonical(rootNode)});
   const old=oldProfile.createEditor(document),current=profile.createEditor(document);owners.push(old,current);
   assert.equal(old.supportsTypingHistory(),false);assert.equal(oldProfile.supportsTypingHistory(),false);const unchanged=old.checkpointJson();assert.throws(()=>old.enableTypingHistory(),e=>e.code==="breditor_rich.typing_history_unavailable");assert.equal(old.checkpointJson(),unchanged);
   for(const command of [{kind:"setSelection",selection},{kind:"insertPlainText",text:"A"},{kind:"insertPlainText",text:"🙂"},{kind:"undo"},{kind:"redo"}]){old.execute(command);current.execute(command);assert.equal(old.checkpointJson(),current.checkpointJson());assert.deepEqual(old.view(),current.view());defaultStates++;}
   current.enableTypingHistory();for(const [text,clockMs]of [["X","9007199254740993"],["Y","9007199254741743"],["Z","9007199254742494"]])current.execute({kind:"insertTypingText",data:{text,clockMs}});
   assert.equal(current.view().undoDepth,4);assert.equal(current.view().historyStepCount,5);assert.equal(current.closeTypingGroup(),true);const checkpoint=current.checkpointJson();assert.equal(JSON.parse(checkpoint).format,"breditor/rich-typing-session");assert.throws(()=>oldProfile.restoreEditor(checkpoint));assert.throws(()=>oldProfile.restoreTypingEditor(checkpoint));assert.throws(()=>profile.restoreEditor(checkpoint));
   const restored=profile.restoreTypingEditor(checkpoint);owners.push(restored);assert.equal(restored.checkpointJson(),checkpoint);
   for(const command of [{kind:"undo"},{kind:"redo"},{kind:"insertTypingText",data:{text:"After recovery",clockMs:"1"}},{kind:"undo"},{kind:"redo"}]){current.execute(command);restored.execute(command);assert.equal(current.checkpointJson(),restored.checkpointJson());assert.deepEqual(current.view(),restored.view());futureStates++;}
  }finally{for(const owner of owners.reverse())owner.dispose();for(const profile of profiles.reverse())profile.dispose();}
 }
 return {format:"breditor/local-typing-history-interoperability",formatVersion:1,languages:[1,2],beforeWasmSha256:before.sha256,afterWasmSha256:after.sha256,oldCapabilityRejected:true,exactDefaultStates:defaultStates,exactGroupedFutureStates:futureStates,passed:true};
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);if(args.length!==2){console.error("Usage: node scripts/probe-local-typing-history.mjs <before-runtime> <after-runtime>");process.exitCode=2;}else console.log(JSON.stringify(await probeLocalTypingHistory(...args),null,2));
}
