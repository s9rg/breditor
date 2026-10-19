/** Actual catalog-staged native factories must compose with retained operational recovery. */
import assert from "node:assert/strict";
import fs from "node:fs";
import {dirname,resolve} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
import * as api from "../packages/breditor-collaboration/dist/index.js";
import * as rich from "../packages/breditor-experimental-rich-content/index.js";
import {catalogArchiveState} from "../packages/breditor-collaboration/dist/room_recovery_catalog/archive.js";
import {prepareStage} from "../packages/breditor-collaboration/dist/room_recovery_catalog/prepare_stage.js";
import {environment} from "./fixtures/room-participant-inventory/environment.mjs";
import {recoverParticipant} from "./fixtures/room-participant-inventory/participant.mjs";
import {requests} from "./fixtures/room-recovery-catalog/storage.mjs";
import {pixel,secondPixel} from "./fixtures/review-assets/pixels.mjs";
import {thirdPixel,ParticipantFixtureImage} from "./fixtures/review-assets/participant-pixels.mjs";

async function closeParts(parts){await parts.sources.revisions?.close();await parts.sources.suggestions?.close();await parts.sources.versions?.close();await parts.session.close();parts.uploads.close();}
async function discardParts(parts){await parts.sources.revisions?.discardAndClose();await parts.sources.suggestions?.discardAndClose();await parts.sources.versions?.discardAndClose();await parts.session.discardAndClose();parts.uploads.close();}
export async function probeCatalogParticipantOperation(directory,nativeReport,{checkReceiver=true}={}){
 const report=typeof nativeReport==="string"?JSON.parse(fs.readFileSync(nativeReport,"utf8")):nativeReport;assert.equal(report.passed,true);const manifest=JSON.parse(fs.readFileSync(report.manifest,"utf8"));assert.equal(manifest.cases.length,10);
 const wasm=await import(pathToFileURL(resolve(directory,"breditor_shared.js")));await wasm.default({module_or_path:fs.readFileSync(resolve(directory,"breditor_shared_bg.wasm"))});
 const restoreEnvironment=environment(),counts={cases:0,participants:0,restoredParticipants:0,restoredComponents:0,sourceReceiverCalls:0,transfers:0,readonlyReopens:0,currentReopens:0,protectedWriteRefusals:0,continuedEdits:0,retainedRedo:0,retainedUploadRecords:0,networkCalls:0};Object.defineProperty(globalThis,"Image",{value:ParticipantFixtureImage,configurable:true});
 try{for(const item of manifest.cases){
  assert.equal(item.nativeOwnerAuthenticated,true);assert.equal(item.nativeRestoredRegistrationsVerified,true);const fixture=JSON.parse(fs.readFileSync(item.path,"utf8")),serverPath=resolve(dirname(item.path),"server.backup"),evidence=report.files.find(row=>row.path===serverPath||serverPath.endsWith("/"+row.path));assert.ok(evidence);
  const factory=fixture.language===1?"from_configuration_json":fixture.standard?`from_standard_configuration_json_v${fixture.language}`:`from_configuration_json_v${fixture.language}`,profile=wasm.SharedRichProfile[factory](fixture.configuration),tag=`catalog-operation-${counts.cases}`,sources=[];let archive;
  try{
   for(const client of fixture.clients)sources.push(await recoverParticipant({api,rich,profile,fixture,client,tag:`${tag}-${client.principal}`,counts,uploads:[pixel,secondPixel,thirdPixel]}));
   archive=await api.captureSharedRoomRecoveryCatalog({catalog:tag,inventory:{file:new Blob([fixture.inventoryJson]),expected:fixture.selected},server:{file:new Blob([fs.readFileSync(serverPath)]),expected:{bytes:evidence.bytes,sha256:evidence.sha256}},participants:sources.map((source,index)=>({id:`client-${index}`,file:source.backup.file(),expected:source.backup.selection()})),checkAuthority(){}});
   const selected=requests(sources,tag);for(const row of selected){const o=row.recovery.session.options,original=o.restore;o.restore=function(...args){if(checkReceiver){assert.equal(this.room,o.room);assert.equal(this.writer,o.writer);}counts.sourceReceiverCalls++;return original.apply(this,args);};}
   for(const source of sources)await source.close();
   const prepared=await prepareStage(selected,catalogArchiveState(archive),`${tag}-catalog`,()=>{});
   for(const [index,row]of prepared.policies.entries()){
    let attempt,ready,operation,parts;const input=row.options,expected=input.expected,original=input.backup.records(),database=`${tag}-operation-${index}`;
    try{
     attempt=await api.SharedParticipantRecovery.begin(input);ready=await attempt.finish();await attempt.close();attempt=undefined;assert.equal(ready.session.core.view().readOnly,true);
     operation=await api.OperationalSharedParticipant.begin({database,recovered:ready,expected,checkAuthority(){}});await ready.close();ready=undefined;await operation.check();parts=await operation.intoParts();operation=undefined;assert.equal(parts.session.core.view().readOnly,true);counts.transfers++;
     const saved=parts.session.core.checkpointJson();counts.retainedUploadRecords+=(await parts.uploads.list()).length;await closeParts(parts);parts=undefined;
     const {backup:_backup,database:recoveryDatabase,...base}=input,resume={...base,database,recoveryDatabase,currentPolicy:{documentReadOnly:true,reviewAccess:"read_only"}};
     operation=await api.OperationalSharedParticipant.resume(resume);await operation.check();parts=await operation.intoParts();operation=undefined;assert.equal(parts.session.core.checkpointJson(),saved);assert.equal(parts.session.core.view().readOnly,true);assert.throws(()=>parts.session.core.type("Denied"));counts.readonlyReopens++;await closeParts(parts);parts=undefined;
     const protectedWriter=sources[index].readOnly;operation=await api.OperationalSharedParticipant.resume({...resume,currentPolicy:{documentReadOnly:protectedWriter,reviewAccess:protectedWriter?"read_only":"comment"}});parts=await operation.intoParts();operation=undefined;assert.equal(parts.session.core.view().readOnly===true,protectedWriter===true);assert.equal(parts.session.core.checkpointJson(),saved);counts.currentReopens++;
     if(protectedWriter){assert.throws(()=>parts.session.core.type("Denied"));counts.protectedWriteRefusals++;}
     else{const core=parts.session.core,point={block:"p",offset:"1",affinity:"after"};core.select({kind:"text",anchor:point,focus:point});core.type("Continued catalog participant🙂");core.undo();await parts.session.flush();const pending=core.checkpointJson();await closeParts(parts);parts=undefined;operation=await api.OperationalSharedParticipant.resume({...resume,currentPolicy:{documentReadOnly:false,reviewAccess:"comment"}});parts=await operation.intoParts();operation=undefined;assert.equal(parts.session.core.checkpointJson(),pending);parts.session.core.redo();assert.ok(parts.session.core.documentJson().includes("Continued catalog participant🙂"));counts.continuedEdits++;counts.retainedRedo++;counts.currentReopens++;}
     assert.deepEqual(input.backup.records(),original);await closeParts(parts);parts=undefined;counts.participants++;
    }finally{if(parts)await discardParts(parts);await operation?.discardAndClose();await ready?.discardAndClose();await attempt?.close();}
   }
   counts.cases++;
  }finally{archive?.dispose();for(const source of sources.reverse())await source.close();profile.free();}
 }}finally{restoreEnvironment();}
 assert.equal(counts.cases,10);assert.equal(counts.participants,20);assert.equal(counts.transfers,20);assert.equal(counts.readonlyReopens,20);assert.equal(counts.continuedEdits+counts.protectedWriteRefusals,20);assert.equal(counts.retainedRedo,counts.continuedEdits);assert.equal(counts.currentReopens,20+counts.continuedEdits);assert.equal(counts.retainedUploadRecords,60);assert.equal(counts.networkCalls,0);
 return{format:"breditor/catalog-participant-operation-probe",formatVersion:1,passed:true,receiverChecks:checkReceiver,...counts,scope:"Actual native original catalog-staged factories compose with participant operational handoff, fresh explicit policy, retained old images and cold saved Redo across ten native compilers/transports. Node storage/lock/raster fixtures; not parent catalog transfer, current authenticated activation, provider closure, process or browser qualification."};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){if(process.argv.length!==4&&!(process.argv.length===5&&process.argv[4]==="--without-receiver-check"))throw Error("Expected current shared runtime and native fixture report paths");console.log(JSON.stringify(await probeCatalogParticipantOperation(process.argv[2],process.argv[3],{checkReceiver:process.argv.length===4}),null,2));}
