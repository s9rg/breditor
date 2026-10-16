/** Real paired release Wasm, exact document-family recovery and an actual previous-runtime peer. */
import assert from "node:assert/strict";
import {readFileSync,realpathSync} from "node:fs";
import {createHash} from "node:crypto";
import {resolve} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
import {coverageSeed,paragraph,range,grid} from "./fixtures/editor-consumer/coverage-seed.mjs";
async function runtime(directory,name){const bytes=readFileSync(resolve(directory,`${name}_bg.wasm`)),module=await import(pathToFileURL(resolve(directory,`${name}.js`)));await module.default({module_or_path:bytes});return {module,sha256:createHash("sha256").update(bytes).digest("hex")};}
function read(result){try{const value=result.takeValue();assert.equal(typeof value,"string","native read failed");return value;}finally{result.free();}}
function localProfile(module,schema){const result=module.BreditorRichProfile.fromStandardLayoutBootstrapJsonV3(JSON.stringify({format:"breditor/profile-bootstrap",formatVersion:8,schema,extensions:[]}));try{const profile=result.takeProfile();assert.ok(profile);return profile;}finally{result.free();}}
function sharedProfile(module,schema){return module.SharedRichProfile.from_standard_configuration_json_v3(JSON.stringify({format:"breditor/shared-rich-profile",formatVersion:3,schema,extensions:[]}));}
function localOwner(profile,source){const result=profile.createEditor(source,"100");try{const owner=result.takeEditor();assert.ok(owner);return owner;}finally{result.free();}}
function localRestore(profile,bytes,natural){const result=natural?profile.restoreDocumentTypingEditor(bytes):profile.restoreDocumentEditor(bytes);try{const owner=result.takeEditor();assert.ok(owner);return owner;}finally{result.free();}}
function local(owner,method,input,status){const observation=owner.observe();let result,next;try{result=input===undefined?owner[method](observation):owner[method](observation,input);assert.equal(result.status,status);next=result.takeObservation();assert.ok(next);}finally{next?.free();result?.free();observation.free();}}
function execute(owner,command,status){local(owner,"execute",JSON.stringify(command),status);}
function shared(owner,method,...args){const observation=owner.document_selection_enabled()?owner.observe_document():owner.observe();try{return owner[method](observation,...args);}finally{observation.free();}}
function lv(owner){const observation=owner.observe();try{return JSON.parse(read(observation.documentViewJson()));}finally{observation.free();}}
function sv(owner){return JSON.parse(owner.document_view_json());}
function save(owner,natural){return natural?owner.document_typing_checkpoint():owner.document_checkpoint();}
function sharedRestore(profile,bytes,natural){return natural?profile.restore_document_typing("room",bytes):profile.restore_document("room",bytes);}
function text(source,id){function find(node){if(node.properties?.["breditor/block-id"]===id)return node.children.filter(n=>n.kind==="text").map(n=>n.text).join("");for(const child of node.children??[]){const found=find(child);if(found!==undefined)return found;}}return find(JSON.parse(source).root);}

export async function probeDocumentSelectionSharedNative(localDirectory,sharedDirectory,previousSharedDirectory){
 const current=await runtime(sharedDirectory,"breditor_shared"),localRuntime=await runtime(localDirectory,"breditor_wasm"),previous=await runtime(previousSharedDirectory,"breditor_shared");
 const schema={name:"example/document-paired-native",version:1},lp=localProfile(localRuntime.module,schema),sp=sharedProfile(current.module,schema),old=sharedProfile(previous.module,schema);
 let trials=0,documents=0,restores=0,future=0,originalBytes=0,peerDocuments=0,oldFamilyRefusals=0,pureCopies=0;
 try{
  const seed=coverageSeed(JSON.parse(read(lp.descriptorJson())));
  assert.equal(sp.document_selection_version(),"1");
  for(const natural of [false,true])for(const hidden of [false,true])for(const mode of natural?["delete","plain","typing"]:["delete","plain"]){
   const source=JSON.parse(seed);if(hidden)source.root.children=source.root.children.filter(n=>n.properties["breditor/block-id"]==="hidden");
   let a,b,ar,br;
   try{
    b=localOwner(lp,JSON.stringify(source));const seedObservation=b.observe();try{a=sp.create(read(seedObservation.documentJson()),"101");}finally{seedObservation.free();}
    assert.equal(a.document_selection_version(),"1");assert.equal(a.document_typing_version(),"1");assert.equal(b.documentTypingVersion(),"1");
    shared(a,"enable_document_selection");
    if(natural){shared(a,"enable_typing_history");const o=b.observe();try{assert.equal(read(b.enableTypingHistory(o)),"true");}finally{o.free();}}
    shared(a,"select_document");local(b,"selectDocument",undefined,"selection");
    assert.equal(sv(a).format,"breditor/shared-document-view");assert.deepEqual(sv(a).selection,{kind:"document"});
    assert.throws(()=>a.observe());assert.throws(()=>a.view_json());
    const ca=save(a,natural),cb=read(b.documentCheckpointJson()),o=b.observe();
    try{const l=JSON.parse(read(o.generalClipboardJson())),s=JSON.parse(shared(a,"copy_document_clipboard"));assert.equal(s.richJson,l.structuredJson);assert.equal(s.plainText,l.plainText);assert.equal(l.kind,"flow");}finally{o.free();}
    assert.equal(save(a,natural),ca);assert.equal(read(b.documentCheckpointJson()),cb);pureCopies+=2;
    const input=JSON.stringify({paragraph:"whole",text:mode==="delete"?"":"Q",...(mode==="typing"?{clockMs:"1"}:{})});
    shared(a,mode==="typing"?"replace_document_typing_text":"replace_document_plain_text",input);
    local(b,mode==="typing"?"replaceDocumentTypingText":"replaceDocumentPlainText",input,"content");
    if(mode==="typing")for(const [text,clock] of [["🙂","2"],["R","3"]]){shared(a,"insert_typing_text",JSON.stringify({text,clockMs:clock}));execute(b,{kind:"insertTypingText",data:{text,clockMs:clock}},"content");}
    assert.equal(sv(a).documentJson,lv(b).documentJson);documents++;assert.equal(sv(a).undoDepth,1);assert.equal(lv(b).undoDepth,1);
    for(const method of ["checkpoint","typing_checkpoint","general_checkpoint","general_typing_checkpoint"]){assert.throws(()=>a[method]());oldFamilyRefusals++;}
    const sa=save(a,natural),sb=read(b.documentCheckpointJson());for(const method of ["restore","restore_typing","restore_general","restore_general_typing"])assert.throws(()=>old[method]("room",sa));
    ar=sharedRestore(sp,sa,natural);br=localRestore(lp,sb,natural);assert.equal(save(ar,natural),sa);assert.equal(read(br.documentCheckpointJson()),sb);restores+=2;
    for(const command of ["undo","redo","undo","redo"]){
     shared(a,`${command}_observed`);shared(ar,`${command}_observed`);execute(b,{kind:command},command);execute(br,{kind:command},command);
     assert.equal(sv(a).documentJson,lv(b).documentJson);documents++;
     assert.equal(save(a,natural),save(ar,natural));assert.equal(read(b.documentCheckpointJson()),read(br.documentCheckpointJson()));future+=2;
     if(command==="undo"){assert.deepEqual(sv(a).selection,{kind:"document"});assert.deepEqual(lv(b).selection,{kind:"document"});}
    }
    trials++;
   }finally{ar?.free();br?.free();a?.free();b?.free();}
  }
  // Byte-for-byte original checkpoint compatibility against an actual earlier application module.
  for(const natural of [false,true]){
   const a=sp.create(seed,"101"),b=old.create(seed,"101");
   try{
    if(natural){shared(a,"enable_typing_history");const o=b.observe();try{b.enable_typing_history(o);}finally{o.free();}}
    for(const [method,arg] of [["set_selection",JSON.stringify(range("q1",1))],["insert_plain_text","X🙂"],["undo_observed"],["redo_observed"],["set_selection",JSON.stringify({kind:"node",block:"image"})],["set_selection",JSON.stringify(grid())]]){
     shared(a,method,...(arg===undefined?[]:[arg]));const o=b.observe();try{b[method](o,...(arg===undefined?[]:[arg]));}finally{o.free();}
     assert.equal(natural?a.typing_checkpoint():a.checkpoint(),natural?b.typing_checkpoint():b.checkpoint());originalBytes++;
    }
   }finally{a.free();b.free();}
  }
  // An original-runtime offline peer never stores document-selection UI or a new command.
  for(const natural of [false,true]){
   const a=sp.create(seed,"101"),b=old.join_frame("room","202",a.update_frame());let ar,br;
   try{
    shared(a,"enable_document_selection");if(natural)shared(a,"enable_typing_history");shared(a,"select_document");
    const o=b.observe();try{b.dispatch(o,JSON.stringify({commands:[{kind:"insert_blocks",data:{parent:null,before:null,nodes:[paragraph("peer-root","OFFLINE")]}},{kind:"insert_text",data:{block:"q1",offset:1,text:"PEER"}}]}));}finally{o.free();}
    shared(a,"replace_document_plain_text",JSON.stringify({paragraph:"whole",text:"Q"}));a.receive_frame(b.update_frame());b.receive_frame(a.update_frame());
    assert.equal(sv(a).documentJson,JSON.parse(b.view_json()).documentJson);assert.equal(text(sv(a).documentJson,"peer-root"),"OFFLINE");peerDocuments++;
    const ca=save(a,natural),cb=b.checkpoint();ar=sharedRestore(sp,ca,natural);br=old.restore("room",cb);assert.equal(save(ar,natural),ca);assert.equal(br.checkpoint(),cb);restores+=2;
    for(const command of ["undo_observed","redo_observed","undo_observed","redo_observed"]){
     shared(a,command);shared(ar,command);const frame=a.update_frame();b.receive_frame(frame);br.receive_frame(frame);
     assert.equal(save(a,natural),save(ar,natural));assert.equal(b.checkpoint(),br.checkpoint());future+=2;
     assert.equal(sv(a).documentJson,JSON.parse(b.view_json()).documentJson);peerDocuments++;
     assert.equal(text(sv(a).documentJson,"peer-root"),"OFFLINE");if(command==="undo_observed")assert.ok(text(sv(a).documentJson,"q1").includes("PEER"));
    }
   }finally{ar?.free();br?.free();a.free();b.free();}
  }
 }finally{lp.free();sp.free();old.free();}
 assert.equal(trials,10);assert.equal(documents,50);assert.equal(restores,24);assert.equal(future,96);assert.equal(originalBytes,12);assert.equal(peerDocuments,10);assert.equal(pureCopies,20);assert.equal(oldFamilyRefusals,40);
 return {format:"breditor/document-selection-shared-native-probe",formatVersion:1,localWasmSha256:localRuntime.sha256,sharedWasmSha256:current.sha256,previousSharedWasmSha256:previous.sha256,trials,exactLocalSharedDocuments:documents,exactDocumentFamilyRestores:restores,exactFutureCheckpoints:future,byteIdenticalOriginalCheckpoints:originalBytes,originalPeerDocumentComparisons:peerDocuments,pureCopies,originalFamilyRefusals:oldFamilyRefusals,passed:true,scope:"Direct paired release Wasm scope/Copy/deletion/plain and first-key typing, hidden-only documents, exact explicit/natural recovery, and actual previous-runtime offline peer with owned root visibility edits. SDK/storage/DOM document routing, whole-document rich paste and composition remain required. No release acceptance inferred."};
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){const args=process.argv.slice(2);if(args.length!==3)throw Error("Expected current local/shared and preserved previous shared Wasm directories");console.log(JSON.stringify(await probeDocumentSelectionSharedNative(...args),null,2));}
