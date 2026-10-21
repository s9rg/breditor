/** One retired child must refuse the entire genuine native room handoff. */
import assert from "node:assert/strict";
import {RecoveryLease} from "../../../packages/breditor-collaboration/dist/participant_recovery/lease.js";
import {requests,database,dump} from "../room-recovery-catalog/storage.mjs";
async function discardParts(value){for(const {parts:p}of [...value.participants].reverse()){await p.sources.revisions?.discardAndClose();await p.sources.suggestions?.discardAndClose();await p.sources.versions?.discardAndClose();await p.session.discardAndClose();p.uploads.close();}}
export async function checkRoomManagedHandoffs(h,{indices=[0,1],late=true}={}){
 const counts={sourceUpgradeRefusals:0,unchangedStoredRecords:0,retainedFiles:0,freshParticipants:0,lateRetiredChildRefusals:0,lateCohortColdParticipants:0};
 for(const index of indices){
  const {api}=h,tag=`${h.tag}-managed-child-${index}`;let archive,catalog,owner,parts;
  try{
   archive=await api.captureSharedRoomRecoveryCatalog({...h.input,catalog:tag});const expected=archive.selection(),chosen=requests(h.sources,tag),targets=chosen.map(row=>({id:row.id,operationDatabase:tag+"-child-"+row.id}));
   catalog=await api.SharedRoomRecoveryCatalog.begin({database:tag+"-catalog",archive,expected,checkAuthority(){}});await catalog.stage(chosen);owner=await api.SharedRoomOperationalRecovery.begin({database:tag+"-operation",catalog,expected,participants:targets,checkAuthority(){}});await catalog.close();catalog=undefined;await owner.finish();
   const files=new Map();for(const row of archive.metadata().participants)files.set(row.id,new Uint8Array(await owner.participantFile(row.id).arrayBuffer()));const name=chosen[index].recovery.destinations.document,before=await dump(name);
   const close=RecoveryLease.prototype.close;let fired=false;try{RecoveryLease.prototype.close=async function(...args){await close.apply(this,args);if(!fired){fired=true;const db=await database(name,2);db.close();}};await assert.rejects(owner.intoParts().then(value=>{parts=value;}),error=>error.code==="room_operation_admission");}finally{RecoveryLease.prototype.close=close;}
   assert.equal(fired,true);const after=await dump(name);assert.equal(after.version,2);assert.deepEqual(after.stores,before.stores);counts.unchangedStoredRecords++;
   for(const[id,file]of files){assert.deepEqual(new Uint8Array(await owner.participantFile(id).arrayBuffer()),file);counts.retainedFiles++;}await assert.rejects(owner.intoParts(),error=>error.code==="room_operation_closed");await owner.discardAndClose();owner=undefined;
   const fresh=requests(h.sources,tag+"-fresh");for(const[j,row]of fresh.entries()){const backup=await api.readSharedParticipantBackup(h.files[j].file,h.files[j].expected);let attempt,ready,p;try{attempt=await api.SharedParticipantRecovery.begin({...row.recovery,backup,expected:backup.selection(),checkAuthority(){}});ready=await attempt.finish();p=await ready.intoParts();assert.equal(p.session.core.checkpointJson(),backup.records().find(r=>r.kind==="document").json);counts.freshParticipants++;}finally{if(p)await discardParts({participants:[{parts:p}]});await ready?.discardAndClose();await attempt?.close();backup.dispose();}}
   counts.sourceUpgradeRefusals++;
  }finally{if(parts)await discardParts(parts);await owner?.discardAndClose();await catalog?.discardAndClose();archive?.dispose();}
 }
 if(!late)return counts;
 // Retirement in the LAST host guard occurs after every native-origin check.
 // The aggregate's synchronous consumption must still check every child first.
 const {prepareRoomParticipants}=await import(new URL("./room_operation/custody.js",import.meta.resolve("@breditor/collaboration")).href),tag=h.tag+"-managed-late",chosen=requests(h.sources,tag),held=[],backups=[];let handoff,escaped,guards=0;
 try{
  for(const[index,row]of chosen.entries()){const backup=await h.api.readSharedParticipantBackup(h.files[index].file,h.files[index].expected);backups.push(backup);const selected={...row.recovery,backup,expected:backup.selection(),checkAuthority(){}},attempt=await h.api.SharedParticipantRecovery.begin(selected);let ready;try{ready=await attempt.finish();const core=ready.session.core,checkpoint=core.checkpointJson(),operation=await h.api.OperationalSharedParticipant.begin({database:tag+"-op-"+index,recovered:ready,expected:backup.selection(),checkAuthority(){}}),{backup:_backup,database:recoveryDatabase,...base}=selected;held.push({id:row.id,operation,core,checkpoint,resume:{...base,database:tag+"-op-"+index,recoveryDatabase,currentPolicy:{documentReadOnly:true,reviewAccess:"read_only"}}});}finally{await ready?.discardAndClose();await attempt.close();}}
  handoff=await prepareRoomParticipants(held,[],[],async()=>{},()=>{if(++guards===2)held[0].core.retire();},()=>{});assert.throws(()=>{escaped=handoff.commit();},error=>error.code==="retired");assert.equal(guards,2);assert.throws(()=>handoff.commit(),error=>error.code==="operation_closed");counts.lateRetiredChildRefusals++;
  for(const child of held){assert.equal(child.core.checkpointJson(),child.checkpoint);assert.deepEqual(child.operation.origin(),child.resume.expected);await child.operation.discardAndClose();const current=await h.api.OperationalSharedParticipant.resume(child.resume);let p;try{p=await current.intoParts();assert.equal(p.session.core.view().readOnly,true);assert.equal(p.session.core.checkpointJson(),child.checkpoint);counts.lateCohortColdParticipants++;}finally{if(p)await discardParts({participants:[{parts:p}]});await current.discardAndClose();}}
 }finally{handoff?.abandon();if(escaped)await discardParts(escaped);for(const child of held.reverse())await child.operation.discardAndClose();for(const backup of backups)backup.dispose();}
 return counts;
}

/** Explicit developer diagnostics for unexpected fixture failures only. Public
 * exceptions remain sanitized; the SDK never logs private causes itself. */
export async function roomFailureDiagnostic(error){
 try{const{internalFailureChain}=await import(new URL("./internal_failure_cause.js",import.meta.resolve("@breditor/collaboration")).href);return internalFailureChain(error).map(value=>({name:typeof value.name==='string'?value.name.slice(0,200):'Error',code:typeof value.code==='string'?value.code.slice(0,200):null,message:typeof value.message==='string'?value.message.slice(0,2000):null,stack:typeof value.stack==='string'?value.stack.slice(0,8000):null}));}catch{return[{name:'DiagnosticUnavailable'}];}
}
