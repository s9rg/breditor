/** Actual exclusive Wasm/SDK calls, with exact independently pinned earlier recovery readers. */
import assert from "node:assert/strict";
import {readFileSync,realpathSync} from "node:fs";
import {createHash} from "node:crypto";
import {resolve} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
import {compileStandardRichProfileV1,compileStandardStructuralRichProfileV2,compileStandardLayoutRichProfileV3} from "../packages/breditor-experimental-rich-content/index.js";
import {SharedRichEditor,createSharedDocumentEditor} from "../packages/breditor-collaboration/dist/core.js";
import {restoreSharedGeneralEditor,restoreSharedDocumentEditor,restoreSharedTypingEditor,restoreSharedReviewedEditor,restoreSharedSearchEditor} from "../packages/breditor-collaboration/dist/profile.js";
import {paragraph,range} from "./fixtures/editor-consumer/coverage-seed.mjs";

const expected={local:"223162260274b7e05bc50985bfc5f121d7b935466c6aa4bdc5423eafbe0a5572",shared:"ec92c59007ac71822025747547a5324d8b6c42602b0e838e8c5512a261059921"};
const reviewed={binding:"a".repeat(64),principal:"alice",effectWriter:"303"};
const localFactories=[compileStandardRichProfileV1,compileStandardStructuralRichProfileV2,compileStandardLayoutRichProfileV3];
const sharedFactories=["from_standard_configuration_json_v1","from_standard_configuration_json_v2","from_standard_configuration_json_v3"];
async function load(directory,name,digest){
 const bytes=readFileSync(resolve(directory,`${name}_bg.wasm`)),sha256=createHash("sha256").update(bytes).digest("hex");
 if(digest)assert.equal(sha256,digest,"The independent earlier reader must not be replaced by a new build");
 const module=await import(pathToFileURL(resolve(directory,`${name}.js`)));await module.default({module_or_path:bytes});return{module,sha256};
}
function seed(binding,text){return JSON.stringify({format:"breditor/document",formatVersion:2,schema:binding.schema,schemaFingerprint:binding.schemaFingerprint,root:{kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"room"},children:[paragraph("body",text),paragraph("other","untouched")]}});}
function body(owner){const root=JSON.parse(owner.documentJson()).root;const find=node=>node.properties?.["breditor/block-id"]==="body"?node:node.children?.map(find).find(Boolean);return find(root).children.map(n=>n.text??"").join("");}
function cases(language){return [["#"," ",""],["-"," ",""],["7."," ",""],["**猫🙂*","*","猫🙂"],...(language===1?[]:[ [">"," ",""],["[x]"," ",""],["```rust"," ",""],["---"," ",""] ])];}
function type(owner,natural,key,namespace="fresh",clock="100",revision=owner.view().revision){return natural?owner.insertTypingTextWithMarkdownRules(key,clock,namespace,revision):owner.insertPlainTextWithMarkdownRules(key,namespace,revision);}
function sharedRestore(p,saved,scope,natural,owned,search){return search?restoreSharedSearchEditor(p,"room",saved):owned?restoreSharedReviewedEditor(p,"room",saved):scope==="document-v1"?restoreSharedDocumentEditor(p,"room",saved,natural?"typing-v1":"explicit"):scope==="general-v1"?restoreSharedGeneralEditor(p,"room",saved,natural?"typing-v1":"explicit"):natural?restoreSharedTypingEditor(p,"room",saved):p.restore("room",saved);}
export async function probeInputRulesSdk(localDirectory,sharedDirectory,oldLocalDirectory,oldSharedDirectory){
 const local=await load(localDirectory,"breditor_wasm"),shared=await load(sharedDirectory,"breditor_shared"),oldLocal=await load(oldLocalDirectory,"breditor_wasm",expected.local),oldShared=await load(oldSharedDirectory,"breditor_shared",expected.shared);
 assert.notEqual(local.sha256,oldLocal.sha256);assert.notEqual(shared.sha256,oldShared.sha256);
 let localCases=0,sharedCases=0,exactEarlierRestores=0,exactFutureCheckpoints=0,earlierCapabilityRefusals=0,finalOnlyPublications=0,reentrantRefusals=0,acceptedLiteralRefusals=0,queuedRemotes=0,rawBoundaryRefusals=0;
 for(const language of [1,2,3]){
  const bootstrap=JSON.stringify({format:"breditor/profile-bootstrap",formatVersion:language+5,schema:{name:`example/input-sdk-${language}`,version:1},extensions:[]}),p=localFactories[language-1](local.module,bootstrap),old=localFactories[language-1](oldLocal.module,bootstrap);
  try{for(const natural of [false,true])for(const document of [false,true]){
   const [source,key,converted]=cases(language)[localCases%cases(language).length],a=document?p.createDocumentEditor(seed(p.descriptor(),source)):p.createEditor(seed(p.descriptor(),source));let earlier;
   try{
    assert.equal(a.supportsMarkdownInputRules(),true);if(natural)a.enableTypingHistory();a.execute({kind:"setSelection",selection:range("body",source.length)});
    const revision=a.view().revision;assert.equal(type(a,natural,key),"applied");assert.equal(body(a),converted);assert.equal(a.view().undoDepth,2);
    const saved=a.checkpointJson();assert.throws(()=>type(a,natural,key,"unused","101",revision));assert.equal(a.checkpointJson(),saved);
    earlier=document?(natural?old.restoreDocumentTypingEditor(saved):old.restoreDocumentEditor(saved)):(natural?old.restoreTypingEditor(saved):old.restoreEditor(saved));assert.equal(earlier.checkpointJson(),saved);exactEarlierRestores++;
    assert.equal(earlier.supportsMarkdownInputRules(),false);assert.throws(()=>type(earlier,natural,"x"),e=>e.code==="breditor_rich.input_rules_unavailable");assert.equal(earlier.checkpointJson(),saved);earlierCapabilityRefusals++;
    for(const method of ["undo","redo","undo","redo"]){a.execute({kind:method});earlier.execute({kind:method});assert.equal(a.checkpointJson(),earlier.checkpointJson());if(method==="undo")assert.equal(body(a),source+key);exactFutureCheckpoints++;}
    a.setReadOnly(true);const locked=a.checkpointJson();assert.throws(()=>type(a,natural,"x"));assert.equal(a.checkpointJson(),locked);localCases++;
   }finally{earlier?.dispose();a.dispose();}
  }}finally{p.dispose();old.dispose();}
 }
 for(const language of [1,2,3]){
  const configuration=JSON.stringify({format:"breditor/shared-rich-profile",formatVersion:language,schema:{name:`example/input-sdk-${language}`,version:1},extensions:[]}),p=shared.module.SharedRichProfile[sharedFactories[language-1]](configuration),old=oldShared.module.SharedRichProfile[sharedFactories[language-1]](configuration),binding=JSON.parse(p.descriptor_json());
  try{for(const natural of [false,true])for(const scope of ["original","general-v1","document-v1"])for(const owned of [false,true])for(const search of [false,true]){
   const options={...(owned?{reviewedHistory:reviewed}:{}),...(search?{searchHistory:"search-v1"}:{})},[source,key,converted]=cases(language)[sharedCases%cases(language).length],a=scope==="document-v1"?createSharedDocumentEditor(p.create(seed(binding,source),"101"),options):new SharedRichEditor(p.create(seed(binding,source),"101"),options);let earlier;
   try{
    assert.equal(a.supportsMarkdownInputRules(),true);if(natural)a.enableTypingHistory();if(scope==="general-v1")a.enableGeneralRanges();a.select(range("body",source.length));
    let calls=0;const stop=a.subscribe(event=>{calls++;assert.equal(event.source,"local");assert.equal(body(a),converted);assert.equal(event.view.undoDepth,2);assert.throws(()=>a.select(range("other",0)),e=>e.code==="reentrant_publication");reentrantRefusals++;});
    const revision=a.view().revision;try{assert.equal(type(a,natural,key),"applied");}finally{stop();}assert.equal(calls,1);finalOnlyPublications++;
    const saved=a.checkpointJson();assert.throws(()=>type(a,natural,"x","unused","101",revision));assert.equal(a.checkpointJson(),saved);
    const raw=sharedRestore(old,saved,scope,natural,owned,search);assert.equal(typeof raw.markdown_input_rules_version,"undefined");earlier=scope==="document-v1"?createSharedDocumentEditor(raw,options):new SharedRichEditor(raw,options);assert.equal(earlier.checkpointJson(),saved);exactEarlierRestores++;
    assert.equal(earlier.supportsMarkdownInputRules(),false);assert.throws(()=>type(earlier,natural,"x"),e=>e.code==="input_rules_unavailable");assert.equal(earlier.checkpointJson(),saved);earlierCapabilityRefusals++;
    for(const method of ["undo","redo","undo","redo"]){a[method]();earlier[method]();assert.equal(a.checkpointJson(),earlier.checkpointJson());if(method==="undo")assert.equal(body(a),source+key);exactFutureCheckpoints++;}
    a.setReadOnly(true);const locked=a.checkpointJson();assert.throws(()=>type(a,natural,"x"));assert.equal(a.checkpointJson(),locked);sharedCases++;
   }finally{earlier?.dispose();a.dispose();}
  }}finally{p.free();old.free();}
 }
 // Explicit accepted-input/refused-conversion result through both actual SDKs.
 for(const natural of [false,true]){
  const configuration=JSON.stringify({format:"breditor/shared-rich-profile",formatVersion:3,schema:{name:"example/input-refusal",version:1},extensions:[]}),p=shared.module.SharedRichProfile.from_standard_configuration_json_v3(configuration),a=new SharedRichEditor(p.create(seed(JSON.parse(p.descriptor_json()),"-"),"101"));
  const bootstrap=JSON.stringify({format:"breditor/profile-bootstrap",formatVersion:8,schema:{name:"example/input-refusal",version:1},extensions:[]}),lp=compileStandardLayoutRichProfileV3(local.module,bootstrap),b=lp.createEditor(seed(lp.descriptor(),"-"));
  try{for(const owner of [a,b]){if(natural)owner.enableTypingHistory();if(owner===a)owner.select(range("body",1));else owner.execute({kind:"setSelection",selection:range("body",1)});assert.equal(type(owner,natural," ","bad namespace"),"refused");assert.equal(body(owner),"- ");assert.equal(owner.view().undoDepth,1);acceptedLiteralRefusals++;}}
  finally{a.dispose();b.dispose();p.free();lp.dispose();}
 }
 // The existing coordinator holds remote frames across both exclusive native commits.
 const p=shared.module.SharedRichProfile.from_standard_configuration_json_v1(JSON.stringify({format:"breditor/shared-rich-profile",formatVersion:1,schema:{name:"example/input-remote",version:1},extensions:[]})),a=new SharedRichEditor(p.create(seed(JSON.parse(p.descriptor_json()),"#"),"101"));let peer;
 try{a.select(range("body",1));peer=new SharedRichEditor(p.join_frame("room","202",a.updateFrame()));peer.dispatch({commands:[{kind:"insert_text",data:{block:"other",offset:0,text:"PEER"}}]});const release=a.holdRemotes(),pending=a.receiveFrame(peer.updateFrame());assert.equal(a.pendingRemote().frames,1);assert.equal(type(a,false," "),"applied");assert.ok(!a.documentJson().includes("PEER"));release();await pending;assert.ok(a.documentJson().includes("PEER"));await peer.receiveFrame(a.updateFrame());assert.equal(a.documentJson(),peer.documentJson());a.undo();await peer.receiveFrame(a.updateFrame());assert.equal(a.documentJson(),peer.documentJson());assert.equal(body(a),"# ");assert.ok(a.documentJson().includes("PEER"));queuedRemotes++;}
 finally{peer?.dispose();a.dispose();p.free();}
 // Actual shared Wasm rejects malformed payloads and old-union widening before mutation.
 const bp=shared.module.SharedRichProfile.from_standard_configuration_json_v1(JSON.stringify({format:"breditor/shared-rich-profile",formatVersion:1,schema:{name:"example/input-boundary",version:1},extensions:[]})),raw=bp.create(seed(JSON.parse(bp.descriptor_json()),"#"),"404");let observed=raw.observe(),stale;
 try{
  raw.set_selection(observed,JSON.stringify(range("body",1)));stale=observed;observed=raw.observe();const before=raw.checkpoint();
  for(const [method,input] of [["insert_plain_text_with_markdown_rules","confidential malformed payload"],["insert_plain_text_with_markdown_rules",JSON.stringify({text:" ",namespace:"fresh",extra:true})],["insert_plain_text_with_markdown_rules",JSON.stringify({text:" "})],...[1,"01","-1","18446744073709551616"].map(clockMs=>["insert_typing_text_with_markdown_rules",JSON.stringify({text:" ",namespace:"fresh",clockMs})])]){assert.throws(()=>raw[method](observed,input),e=>!String(e).includes("confidential"));assert.equal(raw.checkpoint(),before);rawBoundaryRefusals++;}
  assert.throws(()=>raw.insert_plain_text_with_markdown_rules(stale,"not json"),e=>String(e).includes("stale"));assert.equal(raw.checkpoint(),before);rawBoundaryRefusals++;
  assert.throws(()=>raw.dispatch(observed,JSON.stringify({commands:[{kind:"insert_plain_text_with_markdown_rules",data:{text:" ",namespace:"fresh"}}]})));assert.equal(raw.checkpoint(),before);rawBoundaryRefusals++;
  raw.set_read_only(observed,true);observed.free();observed=raw.observe();const locked=raw.checkpoint();assert.throws(()=>raw.insert_plain_text_with_markdown_rules(observed,"not json"),e=>String(e).includes("read-only"));assert.equal(raw.checkpoint(),locked);rawBoundaryRefusals++;
 }finally{observed.free();stale?.free();raw.free();bp.free();}
 assert.equal(localCases,12);assert.equal(sharedCases,72);assert.equal(exactEarlierRestores,84);assert.equal(exactFutureCheckpoints,336);assert.equal(earlierCapabilityRefusals,84);assert.equal(finalOnlyPublications,72);assert.equal(reentrantRefusals,72);assert.equal(acceptedLiteralRefusals,4);assert.equal(queuedRemotes,1);
 assert.equal(rawBoundaryRefusals,10);
 return{format:"breditor/input-rules-sdk-probe",formatVersion:1,passed:true,localWasmSha256:local.sha256,sharedWasmSha256:shared.sha256,earlierWasmSha256:{local:oldLocal.sha256,shared:oldShared.sha256},localCases,sharedCases,exactEarlierRestores,exactFutureCheckpoints,earlierCapabilityRefusals,finalOnlyPublications,reentrantRefusals,acceptedLiteralRefusals,queuedRemotes,rawBoundaryRefusals,scope:"Actual current local/shared Wasm through optional compiled SDKs; three grammars, local/document and shared original/general/document, explicit/natural/reviewed/search histories, accepted literal refusal, final-only callback publication, reentrant rejection, queued remote convergence, strict request/clock/old-union refusal, and exact independently pinned earlier-binary recovery with future Undo/Redo. No DOM/React auto-routing, installed archives, physical browser/input, latency or V1 release approval."};
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){if(process.argv.length!==6)throw Error("Expected current local/shared and pinned earlier local/shared runtime directories");console.log(JSON.stringify(await probeInputRulesSdk(...process.argv.slice(2)),null,2));}
