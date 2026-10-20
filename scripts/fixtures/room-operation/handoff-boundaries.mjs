/** Aggregate handoff must recheck policy after actual parent/child coordination releases. */
import assert from "node:assert/strict";
import {RecoveryLease} from "../../../packages/breditor-collaboration/dist/participant_recovery/lease.js";
import {requests} from "../room-recovery-catalog/storage.mjs";
async function closeParts(value){for(const {parts:p}of [...value.participants].reverse()){await p.sources.revisions?.close();await p.sources.suggestions?.close();await p.sources.versions?.close();await p.session.close();p.uploads.close();}}
export async function checkRoomHandoffBoundaries(h,{faults=["authority","abort"]}={}){
 const counts={authority:0,abort:0,coldReopens:0,retainedFiles:0,participants:0,lateCohortRefusals:0,lateCohortColdParticipants:0};
 for(const fault of faults){
  const {api}=h,tag=`${h.tag}-handoff-${fault}`,controller=new AbortController();let allowed=true,archive,catalog,owner,parts;
  const checkAuthority=()=>{if(!allowed)throw Error("PRIVATE-ROOM-HANDOFF");};
  try{
   archive=await api.captureSharedRoomRecoveryCatalog({...h.input,catalog:tag});const expected=archive.selection(),chosen=requests(h.sources,tag),targets=chosen.map(row=>({id:row.id,operationDatabase:tag+"-child-"+row.id})),catalogDatabase=tag+"-catalog",database=tag+"-operation";
   catalog=await api.SharedRoomRecoveryCatalog.begin({database:catalogDatabase,archive,expected,checkAuthority(){}});await catalog.stage(chosen);owner=await api.SharedRoomOperationalRecovery.begin({database,catalog,expected,participants:targets,checkAuthority,signal:controller.signal});await catalog.close();catalog=undefined;await owner.finish();
   const originalFiles=new Map();for(const row of archive.metadata().participants)originalFiles.set(row.id,new Uint8Array(await owner.participantFile(row.id).arrayBuffer()));
   const close=RecoveryLease.prototype.close;let fired=false;try{RecoveryLease.prototype.close=async function(...args){await close.apply(this,args);if(!fired){fired=true;if(fault==="authority")allowed=false;else controller.abort();}};await assert.rejects(owner.intoParts().then(value=>{parts=value;}),error=>error.code===(fault==="authority"?"room_operation_authority":"room_operation_aborted")&&!String(error).includes("PRIVATE"));}finally{RecoveryLease.prototype.close=close;}
   assert.equal(fired,true);allowed=true;await assert.rejects(owner.intoParts(),error=>error.code==="room_operation_closed");await owner.close();owner=undefined;
   const resume={database,catalogDatabase,expected,participants:chosen.map((row,index)=>({...targets[index],recovery:row.recovery,currentPolicy:{documentReadOnly:true,reviewAccess:"read_only"}})),checkAuthority};owner=await api.SharedRoomOperationalRecovery.resume(resume);await owner.finish();for(const[id,file]of originalFiles){assert.deepEqual(new Uint8Array(await owner.participantFile(id).arrayBuffer()),file);counts.retainedFiles++;}
   parts=await owner.intoParts();owner=undefined;assert.equal(parts.participants.length,2);for(const row of parts.participants){assert.equal(row.parts.session.core.view().readOnly,true);assert.throws(()=>row.parts.session.core.type("Denied"));counts.participants++;}await closeParts(parts);parts=undefined;counts[fault]++;counts.coldReopens++;
  }finally{allowed=true;if(parts)await closeParts(parts);await owner?.discardAndClose();await catalog?.discardAndClose();archive?.dispose();}
 }
 // Exercise the final synchronous commit independently with two genuine native children.
 // A failed late validation must consume neither; a rejected commit is not retriable.
 const {prepareRoomParticipants}=await import(new URL("./room_operation/custody.js",import.meta.resolve("@breditor/collaboration")).href),tag=h.tag+"-late-cohort",chosen=requests(h.sources,tag),held=[],backups=[];let handoff,released=false,allowed=true;
 try{
  for(const[index,row]of chosen.entries()){const archive=await h.api.readSharedParticipantBackup(h.files[index].file,h.files[index].expected);backups.push(archive);const options={...row.recovery,backup:archive,expected:archive.selection(),checkAuthority(){}},attempt=await h.api.SharedParticipantRecovery.begin(options);let ready;try{ready=await attempt.finish();const operation=await h.api.OperationalSharedParticipant.begin({database:tag+"-op-"+index,recovered:ready,expected:archive.selection(),checkAuthority(){}});const {backup:_backup,database:recoveryDatabase,...base}=options;held.push({id:row.id,operation,resume:{...base,database:tag+"-op-"+index,recoveryDatabase,currentPolicy:{documentReadOnly:true,reviewAccess:"read_only"}}});}finally{await ready?.discardAndClose();await attempt.close();}}
  const denied=Error("controlled late cohort authority");handoff=await prepareRoomParticipants(held,[],[],async()=>{},()=>{if(!allowed)throw denied;},()=>{released=true;});assert.equal(released,true);allowed=false;assert.throws(()=>handoff.commit(),error=>error===denied);assert.throws(()=>handoff.commit(),error=>error.code==="operation_closed");counts.lateCohortRefusals++;
  for(const child of held){await assert.rejects(child.operation.check(),error=>error.code==="operation_closed");assert.deepEqual(child.operation.origin(),child.resume.expected);await child.operation.close();const current=await h.api.OperationalSharedParticipant.resume(child.resume);let parts;try{parts=await current.intoParts();assert.equal(parts.session.core.view().readOnly,true);counts.lateCohortColdParticipants++;}finally{if(parts)await closeParts({participants:[{parts}]});await current.discardAndClose();}}
 }finally{handoff?.abandon();for(const child of held.reverse())await child.operation.discardAndClose();for(const backup of backups)backup.dispose();}
 return counts;
}
