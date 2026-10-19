/** Durable selected room files, actual original native histories, private readonly staging and restart. */
import assert from "node:assert/strict";
import fs from "node:fs";
import {dirname,resolve} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
import {createHash} from "node:crypto";
import * as api from "../packages/breditor-collaboration/dist/index.js";
import * as rich from "../packages/breditor-experimental-rich-content/index.js";
import {environment} from "./fixtures/room-participant-inventory/environment.mjs";
import {recoverParticipant} from "./fixtures/room-participant-inventory/participant.mjs";
import {pixel,secondPixel} from "./fixtures/review-assets/pixels.mjs";
import {thirdPixel,ParticipantFixtureImage} from "./fixtures/review-assets/participant-pixels.mjs";
import {requests,assertFiles,missing,readRecord} from "./fixtures/room-recovery-catalog/storage.mjs";
import {exerciseCatalogFaults} from "./fixtures/room-recovery-catalog/faults.mjs";

export async function probeRoomRecoveryCatalog(directory,nativeReport){
 const report=typeof nativeReport==="string"?JSON.parse(fs.readFileSync(nativeReport,"utf8")):nativeReport;assert.equal(report.passed,true);const manifest=JSON.parse(fs.readFileSync(report.manifest,"utf8"));assert.equal(manifest.cases.length,10);
 const binary=fs.readFileSync(resolve(directory,"breditor_shared_bg.wasm")),wasm=await import(pathToFileURL(resolve(directory,"breditor_shared.js")));await wasm.default({module_or_path:binary});
 const counts={cases:0,storedCatalogs:0,stagedParticipants:0,exactReopens:0,repeatChecks:0,retainedFiles:0,uploadEntries:0,selectionRequiredRefusals:0,occupiedRefusals:0,originLeaseRefusals:0,changedPlanRefusals:0,duplicateCandidateRefusals:0,pendingRetainedCopies:0,lostAcknowledgementResumes:0,parentMarkerAbortResumes:0,planAbortRetries:0,policySnapshots:0,changedTargetRefusals:0,changedFileRefusals:0,fabricatedCompletionRefusals:0,closeDuringRestoreResumes:0,reentrancyRefusals:0,authorityRefusals:0,networkCalls:0,restoredParticipants:0,restoredComponents:0};
 const restoreEnvironment=environment();Object.defineProperty(globalThis,"Image",{value:ParticipantFixtureImage,configurable:true});
 try{for(const item of manifest.cases){
  assert.equal(item.nativeOwnerAuthenticated,true);assert.equal(item.nativeRestoredRegistrationsVerified,true);assert.equal(item.rawCredentialsExported,false);
  const fixture=JSON.parse(fs.readFileSync(item.path,"utf8")),serverPath=resolve(dirname(item.path),"server.backup"),evidence=report.files.filter(row=>row.path===serverPath||serverPath.endsWith("/"+row.path));assert.equal(evidence.length,1);const server=new Blob([fs.readFileSync(serverPath)]),inventory=new Blob([fixture.inventoryJson]),factory=fixture.language===1?"from_configuration_json":fixture.standard?`from_standard_configuration_json_v${fixture.language}`:`from_configuration_json_v${fixture.language}`,profile=wasm.SharedRichProfile[factory](fixture.configuration),tag=`room-catalog-${counts.cases}`,sources=[];let archive,catalog;
  try{
   for(const client of fixture.clients)sources.push(await recoverParticipant({api,rich,profile,fixture,client,tag:`${tag}-${client.principal}`,counts,uploads:[pixel,secondPixel,thirdPixel]}));
   const input={catalog:tag,inventory:{file:inventory,expected:fixture.selected},server:{file:server,expected:{bytes:evidence[0].bytes,sha256:evidence[0].sha256}},participants:sources.map((source,index)=>({id:`client-${index}`,file:source.backup.file(),expected:source.backup.selection()})),checkAuthority(){}};
   const before=JSON.stringify(await indexedDB.databases());archive=await api.captureSharedRoomRecoveryCatalog(input);assert.equal(JSON.stringify(await indexedDB.databases()),before);assert.ok(Object.isFrozen(archive.selection()));assert.ok(Object.isFrozen(archive.metadata().participants));const selected=archive.selection(),db=`${tag}-catalog`,open={database:db,expected:selected,checkAuthority(){}},chosen=requests(sources,tag);
   assert.throws(()=>archive.metadata().participants.push({}));assert.throws(()=>new api.SharedRoomRecoveryCatalogArchive(),e=>e.code==="catalog_closed");assert.throws(()=>new api.SharedRoomRecoveryCatalog(),e=>e.code==="catalog_closed");
   await assert.rejects(api.SharedRoomRecoveryCatalog.resume({...open,database:`${tag}-missing`}),e=>e.code==="catalog_missing");assert.equal(await missing(`${tag}-missing`),true);counts.selectionRequiredRefusals++;
   catalog=await api.SharedRoomRecoveryCatalog.begin({...open,archive});counts.storedCatalogs++;assert.equal((await catalog.progress()).phase,"retained");await assertFiles(api,catalog,archive,counts);
   await assert.rejects(api.SharedRoomRecoveryCatalog.resume(open),e=>e.code==="catalog_in_use");counts.originLeaseRefusals++;
   // The catalog owns its re-admitted files independently of the original source/recovery handles.
   for(const source of sources)await source.close();
   const result=await catalog.stage(chosen);assert.equal(result.kind,"checked");assert.equal(result.coverage.kind,"covered");assert.equal(result.stagedParticipants.length,2);assert.deepEqual(result.unreconciledParticipants,[]);assert.equal((await catalog.progress()).phase,"checked");counts.stagedParticipants+=2;
   const again=await catalog.stage(chosen);assert.deepEqual(again,result);counts.repeatChecks++;
   await assert.rejects(catalog.stage(chosen.slice(0,1)),e=>e.code==="catalog_diverged");counts.changedPlanRefusals++;
   await Promise.all([catalog.close(),catalog.close()]);catalog=undefined;const record=await readRecord(db);assert.equal(record.phase,"checked");
   catalog=await api.SharedRoomRecoveryCatalog.resume(open);assert.equal((await catalog.stage(chosen)).kind,"checked");counts.exactReopens++;await catalog.close();catalog=undefined;
   await assert.rejects(api.SharedRoomRecoveryCatalog.begin({...open,archive}),e=>e.code==="catalog_exists");counts.occupiedRefusals++;
   if(counts.cases===0)await exerciseCatalogFaults({api,archive,sources,tag,counts});
   const pendingInput={...input,catalog:`${tag}-duplicates`,participants:[...input.participants,{...input.participants[0],id:"historic-copy"}]},pending=await api.captureSharedRoomRecoveryCatalog(pendingInput);let holder;
   try{
    const prefix=`${tag}-duplicates`,options={database:`${prefix}-catalog`,expected:pending.selection(),archive:pending,checkAuthority(){}};holder=await api.SharedRoomRecoveryCatalog.begin(options);
    const selectedRequests=requests(sources,prefix),duplicate=[...selectedRequests,{...requests(sources,`${prefix}-extra`)[0],id:"historic-copy"}];await assert.rejects(holder.stage(duplicate),e=>e.code==="catalog_source");assert.equal((await holder.progress()).phase,"retained");counts.duplicateCandidateRefusals++;
    const checked=await holder.stage(selectedRequests);assert.equal(checked.kind,"pending");assert.equal(checked.coverage.kind,"covered");assert.deepEqual(checked.unreconciledParticipants,["historic-copy"]);assert.deepEqual(new Uint8Array(await holder.participantFile("historic-copy").arrayBuffer()),new Uint8Array(await pending.participantFile("historic-copy").arrayBuffer()));counts.pendingRetainedCopies++;
   }finally{await holder?.close();pending.dispose();}
   counts.cases++;
  }finally{await catalog?.discardAndClose();archive?.dispose();for(const source of sources.reverse())await source.close();profile.free();}
 }}finally{restoreEnvironment();}
 for(const [key,value]of Object.entries({cases:10,storedCatalogs:10,stagedParticipants:20,exactReopens:10,repeatChecks:10,retainedFiles:40,uploadEntries:60,selectionRequiredRefusals:10,occupiedRefusals:10,originLeaseRefusals:10,changedPlanRefusals:10,duplicateCandidateRefusals:10,pendingRetainedCopies:10,networkCalls:0}))assert.equal(counts[key],value,key);
 for(const [key,value]of Object.entries({lostAcknowledgementResumes:3,parentMarkerAbortResumes:1,planAbortRetries:1,policySnapshots:1,changedTargetRefusals:1,changedFileRefusals:1,fabricatedCompletionRefusals:1,closeDuringRestoreResumes:1,reentrancyRefusals:1,authorityRefusals:4}))assert.equal(counts[key],value,key);
 return{format:"breditor/room-recovery-catalog-probe",formatVersion:1,passed:true,...counts,sharedWasmSha256:createHash("sha256").update(binary).digest("hex"),scope:"Actual source-stop/native server restore/registration fixtures, retained original server+inventory+participant files, three-image whole-upload states and epochs, original native readonly staging and repeated/reopened exact participant attempts. Duplicate/historic copies remain retained and pending. Node storage/lock/raster fixtures; not a protected credential vault, current provider closure, global activation/handoff, cross-device fence, process kill, browser or generation bridge."};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){if(process.argv.length!==4)throw Error("Expected shared runtime and native source evidence paths");console.log(JSON.stringify(await probeRoomRecoveryCatalog(process.argv[2],process.argv[3]),null,2));}
