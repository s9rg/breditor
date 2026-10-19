/** Exact initial policy, real native recovery families and protected resumable participant cuts. */
import assert from "node:assert/strict";
import fs from "node:fs";
import {createHash} from "node:crypto";
import {resolve} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
import * as api from "../packages/breditor-collaboration/dist/index.js";
import * as rich from "../packages/breditor-experimental-rich-content/index.js";
import {environment} from "./fixtures/room-participant-inventory/environment.mjs";
import {recoverParticipant} from "./fixtures/room-participant-inventory/participant.mjs";

const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==="object"?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const guard=(raw,work)=>{const observed=raw.document_selection_enabled()?raw.observe_document():raw.observe();try{return work(observed);}finally{observed.free();}};
const options=family=>({...(family.search?{searchHistory:"search-v1"}:{}),...(family.reviewed?{reviewedHistory:{binding:"a".repeat(64),principal:"alice",effectWriter:"900"}}:{})});
const adopt=(raw,family)=>family.scope==="document-v1"?api.createSharedDocumentEditor(raw,options(family)):new api.SharedRichEditor(raw,options(family));
function restore(profile,checkpoint,family){
 const method=family.search?"restore_search":family.reviewed?"restore_reviewed":family.scope==="document-v1"?(family.natural?"restore_document_typing":"restore_document"):family.scope==="general-v1"?(family.natural?"restore_general_typing":"restore_general"):(family.natural?"restore_typing":"restore");
 return profile[method]("room",checkpoint);
}
function configure(raw,family){
 if(family.natural)guard(raw,o=>raw.enable_typing_history(o));
 if(family.scope==="general-v1")guard(raw,o=>raw.enable_general_ranges(o));
 if(family.scope==="document-v1")guard(raw,o=>raw.enable_document_selection(o));
 return adopt(raw,family);
}
function policyView(core){const value=core.view();delete value.readOnly;delete value.readOnlyRevision;delete value.revision;return value;}
export async function probeInitialReadOnly(directory,manifestPath){
 const binary=fs.readFileSync(resolve(directory,"breditor_shared_bg.wasm")),wasm=await import(pathToFileURL(resolve(directory,"breditor_shared.js")));await wasm.default({module_or_path:binary});
 const root=canonical(JSON.parse(fs.readFileSync(new URL("../crates/breditor-core/tests/fixtures/rich-local-root.json",import.meta.url),"utf8"))),counts={profiles:0,families:0,initialLocks:0,oneShotRefusals:0,observedOwnerRefusals:0,nativeWriteRefusals:0,sdkWriteRefusals:0,exactRestarts:0,livePolicyInvalidations:0,futureHistoryComparisons:0,protectedParticipants:0,protectedReopens:0,reviewWriteRefusals:0,coveredStreams:0,networkCalls:0,restoredParticipants:0,restoredComponents:0};
 for(const language of [1,2,3])for(const standard of [false,true]){
  const schema={name:"example/initial-read-only",version:1},factory=standard?`from_standard_configuration_json_v${language}`:language===1?"from_configuration_json":`from_configuration_json_v${language}`,profile=wasm.SharedRichProfile[factory](JSON.stringify({format:"breditor/shared-rich-profile",formatVersion:language,schema,extensions:[]}));
  const seed=JSON.stringify({format:"breditor/document",formatVersion:2,schema,schemaFingerprint:JSON.parse(profile.descriptor_json()).schemaFingerprint,root});
  try{for(const scope of ["original","general-v1","document-v1"])for(const natural of [false,true])for(const mode of ["ordinary","search","reviewed"]){
   const family={scope,natural,search:mode==="search",reviewed:mode==="reviewed"};let source,locked,restarted,plain,cut,protectedCut;
   try{
    source=configure(profile.create(seed,"101"),family);const p={block:"p",offset:"1",affinity:"after"};source.select({kind:"text",anchor:p,focus:p});if(natural)source.typeUser("retained🙂","10");else source.type("retained🙂");source.undo();
    const checkpoint=source.checkpointJson(),raw=restore(profile,checkpoint,family);assert.equal(raw.initial_read_only_version(),"1");assert.equal(api.initializeSharedReadOnly(raw,true),raw);counts.initialLocks++;
    for(const value of [false,true]){assert.throws(()=>api.initializeSharedReadOnly(raw,value),/unobserved owner/);counts.oneShotRefusals++;}
    locked=adopt(raw,family);assert.equal(locked.view().readOnly,true);assert.equal(locked.view().readOnlyRevision,undefined);assert.equal(locked.checkpointJson(),checkpoint);assert.deepEqual(policyView(locked),policyView(source));
    cut=api.captureSharedAssetReferences({core:source});protectedCut=api.captureSharedAssetReferences({core:locked});assert.deepEqual(protectedCut.records(),cut.records());
    for(const work of [()=>locked.type("denied"),()=>locked.undo(),()=>locked.redo()]){assert.throws(work,e=>e.code==="read_only");counts.sdkWriteRefusals++;}
    guard(raw,o=>{assert.throws(()=>raw.insert_plain_text(o,"denied"),/read.only/i);counts.nativeWriteRefusals++;});assert.equal(locked.checkpointJson(),checkpoint);
    for(const value of [false,true]){assert.throws(()=>raw.initialize_read_only(value),/unobserved owner/);counts.observedOwnerRefusals++;}
    const issued=restore(profile,checkpoint,family);try{guard(issued,()=>{});assert.throws(()=>issued.initialize_read_only(true),/unobserved owner/);counts.observedOwnerRefusals++;}finally{issued.free();}
    const explicitFalse=restore(profile,checkpoint,family);try{api.initializeSharedReadOnly(explicitFalse,false);assert.throws(()=>explicitFalse.initialize_read_only(true),/unobserved owner/);counts.oneShotRefusals++;}finally{explicitFalse.free();}
    restarted=adopt(api.initializeSharedReadOnly(restore(profile,locked.checkpointJson(),family),true),family);assert.equal(restarted.checkpointJson(),checkpoint);assert.equal(restarted.view().readOnly,true);counts.exactRestarts++;
    plain=adopt(restore(profile,checkpoint,family),family);assert.notEqual(plain.view().readOnly,true);assert.equal(plain.checkpointJson(),checkpoint);
    const before=locked.view().revision;assert.equal(locked.setReadOnly(false),true);assert.notEqual(locked.view().revision,before);assert.throws(()=>protectedCut.check());assert.deepEqual(locked.writerClock("101"),source.writerClock("101"));counts.livePolicyInvalidations++;
    for(const method of ["redo","undo","redo","undo"]){locked[method]();plain[method]();source[method]();assert.deepEqual(policyView(locked),policyView(source));assert.deepEqual(locked.writerClock("101"),source.writerClock("101"));assert.equal(source.checkpointJson(),plain.checkpointJson());counts.futureHistoryComparisons++;}
    const post=locked.checkpointJson(),reopened=adopt(api.initializeSharedReadOnly(restore(profile,post,family),false),family);try{assert.equal(reopened.checkpointJson(),post);assert.notEqual(reopened.view().readOnly,true);counts.exactRestarts++;}finally{reopened.dispose();}
    counts.families++;
   }finally{protectedCut?.dispose();cut?.dispose();plain?.dispose();restarted?.dispose();locked?.dispose();source?.dispose();}
  }counts.profiles++;}finally{profile.free();}
 }
 const manifest=JSON.parse(fs.readFileSync(manifestPath,"utf8"));assert.equal(manifest.cases.length,10);const restoreEnvironment=environment();
 try{for(const item of manifest.cases){
  assert.equal(item.nativeOwnerAuthenticated,true);assert.equal(item.nativeRestoredRegistrationsVerified,true);const fixture=JSON.parse(fs.readFileSync(item.path,"utf8")),factory=fixture.language===1?"from_configuration_json":fixture.standard?`from_standard_configuration_json_v${fixture.language}`:`from_configuration_json_v${fixture.language}`,profile=wasm.SharedRichProfile[factory](fixture.configuration),inventory=await api.readSharedRoomParticipantInventory(new Blob([fixture.inventoryJson]),fixture.selected),sources=[],reopened=[];
  try{
   for(const client of fixture.clients){const value=await recoverParticipant({api,rich,profile,fixture,client,tag:`initial-policy-${counts.protectedParticipants}`,counts,initialReadOnly:true});sources.push(value);assert.equal(value.recovered.session.core.view().readOnly,true);assert.throws(()=>value.recovered.session.core.dispatchReview({kind:"create_thread",data:{anchorJson:value.recovered.session.core.captureReviewAnchor({kind:"document"}),body:"denied"}}),e=>String(e)==="review action not permitted");counts.reviewWriteRefusals++;counts.protectedParticipants++;}
   const checked=inventory.checkSources(sources);assert.equal(checked.kind,"covered");counts.coveredStreams+=4;
   for(const original of sources){const checkpoint=original.recovered.session.core.checkpointJson();original.source.dispose();await original.recovered.close();const attempt=await api.SharedParticipantRecovery.resume(original.recovery);let recovered;try{recovered=await attempt.finish();}finally{await attempt.close();}const source=api.captureSharedAssetReferences(recovered.sources);reopened.push({backup:original.backup,source,recovered});assert.equal(recovered.session.core.view().readOnly,true);assert.equal(recovered.session.core.checkpointJson(),checkpoint);await original.backup.verifyRecovered(source,recovered.uploads);assert.throws(()=>recovered.session.core.redo(),e=>e.code==="read_only");assert.throws(()=>recovered.session.core.dispatchReview({kind:"create_thread",data:{anchorJson:recovered.session.core.captureReviewAnchor({kind:"document"}),body:"denied"}}),e=>String(e)==="review action not permitted");counts.reviewWriteRefusals++;counts.protectedReopens++;}
   assert.equal(inventory.checkSources(reopened).kind,"covered");counts.coveredStreams+=4;
  }finally{for(const value of reopened.reverse()){value.source.dispose();await value.recovered.close();}for(const value of sources.reverse())await value.close();inventory.dispose();profile.free();}
 }}finally{restoreEnvironment();}
 for(const [key,value]of Object.entries({profiles:6,families:108,initialLocks:108,oneShotRefusals:324,observedOwnerRefusals:324,nativeWriteRefusals:108,sdkWriteRefusals:324,exactRestarts:216,livePolicyInvalidations:108,futureHistoryComparisons:432,protectedParticipants:20,protectedReopens:20,reviewWriteRefusals:40,coveredStreams:80,networkCalls:0}))assert.equal(counts[key],value,key);
 return{format:"breditor/initial-read-only-probe",formatVersion:1,passed:true,...counts,sharedWasmSha256:createHash("sha256").update(binary).digest("hex"),scope:"Actual native Wasm one-shot startup policy across six profile constructors and 108 explicitly selected scope/history families; exact native future history and policy invalidation; twenty protected participant restorations and same-attempt exact reopens against ten native inventory fixtures. Node storage/lock fixtures. Not host permission recovery, global activation, cross-device fencing, generation bridging or browser/platform qualification."};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){if(process.argv.length!==4)throw Error("Expected shared runtime directory and native fixture manifest");console.log(JSON.stringify(await probeInitialReadOnly(process.argv[2],process.argv[3]),null,2));}
