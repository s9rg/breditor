/** Actual shared release Wasm through the explicit programmatic SDK; no DOM/storage claim. */
import assert from "node:assert/strict";
import {readFileSync,realpathSync} from "node:fs";
import {createHash} from "node:crypto";
import {resolve} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
import {SharedRichEditor,createSharedDocumentEditor} from "../packages/breditor-collaboration/dist/core.js";
import {restoreSharedDocumentEditor} from "../packages/breditor-collaboration/dist/profile.js";
import {coverageSeed} from "./fixtures/editor-consumer/coverage-seed.mjs";
export async function probeDocumentSelectionSdk(directory){
 const bytes=readFileSync(resolve(directory,"breditor_shared_bg.wasm")),module=await import(pathToFileURL(resolve(directory,"breditor_shared.js")));await module.default({module_or_path:bytes});
 const profile=module.SharedRichProfile.from_standard_configuration_json_v3(JSON.stringify({format:"breditor/shared-rich-profile",formatVersion:3,schema:{name:"example/document-sdk",version:1},extensions:[]}));
 let trials=0,restores=0,future=0,pureCopies=0,queuedRemotes=0;
 try{
  const seed=coverageSeed(JSON.parse(profile.descriptor_json()));
  for(const natural of [false,true])for(const hidden of [false,true]){
   const source=JSON.parse(seed);if(hidden)source.root.children=source.root.children.filter(n=>n.properties["breditor/block-id"]==="hidden");
   const a=createSharedDocumentEditor(profile.create(JSON.stringify(source),"101"));let recovered,peer;
   try{
    if(natural)a.enableTypingHistory();peer=new SharedRichEditor(profile.join_frame("room","202",a.updateFrame()));
    a.selectDocument();const before=a.documentJson(),selected=a.checkpointJson(),copy=a.copyDocument();assert.ok(copy);assert.equal(JSON.parse(copy.richJson).kind,"flow");assert.equal(a.checkpointJson(),selected);pureCopies++;
    const revision=a.view().revision;if(natural){a.replaceDocumentTypingText("whole","Q","1",revision);a.typeUser("🙂","2");a.typeUser("R","3");}else a.replaceDocumentPlainText("whole","Q",revision);
    assert.equal(a.view().format,"breditor/shared-document-view");assert.equal(a.view().undoDepth,1);assert.throws(()=>a.replaceDocumentPlainText("unused","Y",revision));
    const saved=a.checkpointJson();recovered=createSharedDocumentEditor(restoreSharedDocumentEditor(profile,"room",saved,natural?"typing-v1":"explicit"));assert.equal(recovered.checkpointJson(),saved);restores++;
    assert.throws(()=>new SharedRichEditor(restoreSharedDocumentEditor(profile,"room",saved,natural?"typing-v1":"explicit")),/explicit selectionEditing/);
    for(const method of ["undo","redo","undo","redo"]){a[method]();recovered[method]();assert.equal(a.checkpointJson(),recovered.checkpointJson());future++;if(method==="undo"){assert.equal(a.documentJson(),before);assert.deepEqual(a.view().selection,{kind:"document"});}}
    // Both scope and its explicit observer survive a real queued remote publication.
    a.selectDocument();const release=a.holdRemotes();peer.dispatch({commands:[{kind:"insert_blocks",data:{parent:null,before:null,nodes:[{kind:"element",type:"breditor/paragraph",entityId:null,properties:{"breditor/block-id":"peer-new"},children:[{kind:"text",text:"PEER",formats:[]}]}]}}]});const pending=a.receiveFrame(peer.updateFrame());assert.equal(a.pendingRemote().frames,1);release();try{await pending;}catch(error){throw new Error("Queued remote while the whole document is selected was refused",{cause:error});}assert.deepEqual(a.view().selection,{kind:"document"});queuedRemotes++;
    const raw=restoreSharedDocumentEditor(profile,"room",a.checkpointJson(),natural?"typing-v1":"explicit"),again=new SharedRichEditor(raw,{selectionEditing:"document-v1"});try{assert.equal(again.checkpointJson(),a.checkpointJson());restores++;}finally{again.dispose();}
    trials++;
   }finally{recovered?.dispose();peer?.dispose();a.dispose();}
  }
 }finally{profile.free();}
 assert.equal(trials,4);assert.equal(restores,8);assert.equal(future,16);assert.equal(pureCopies,4);assert.equal(queuedRemotes,4);
 return {format:"breditor/document-selection-programmatic-sdk-probe",formatVersion:1,sharedWasmSha256:createHash("sha256").update(bytes).digest("hex"),trials,exactRestores:restores,exactFutureCheckpoints:future,pureCopies,queuedRemotePublications:queuedRemotes,passed:true,scope:"Explicit programmatic shared SDK observer/view/Copy/replacement/first-key typing/recovery and real queued remotes. Original defaults stay closed. Durable session/storage, DOM/React, rich whole-document paste and document presence/toolbar integration remain incomplete."};
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){const args=process.argv.slice(2);if(args.length!==1)throw Error("Expected shared release Wasm directory");console.log(JSON.stringify(await probeDocumentSelectionSdk(args[0]),null,2));}
