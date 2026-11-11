/** Interrupt a real target transaction and reconstruct with fresh actors. */
import assert from 'node:assert/strict';
import {IDBObjectStore} from 'fake-indexeddb';
import {ColdJointRoomActivationAttempt as Cold} from '../../../packages/breditor-collaboration/dist/native_room_joint_activation/cold_attempt.js';
import {LoadedNativeReconstructionCurrent as Loaded} from '../../../packages/breditor-collaboration/dist/selected_native_reconstruction/loaded_current.js';

export async function reopenJointHandoverReplacement({joint,plan,run,session,recover,native}){
 const add=IDBObjectStore.prototype.add,put=IDBObjectStore.prototype.put;
 const originalDocument=run.options.expected.execution.plan.preparation.plan.participants
  .find(row=>row.id==='original').namespaces.find(ns=>ns.role==='document').database;
 let interrupted=false;
 const abortFirstWrite=function(method,args){
  const request=method.apply(this,args);
  if(!interrupted&&this.transaction.db.name===originalDocument){
   interrupted=true;
   this.transaction.abort();
  }
  return request;
 };
 try{
  IDBObjectStore.prototype.add=function(...args){return abortFirstWrite.call(this,add,args);};
  IDBObjectStore.prototype.put=function(...args){return abortFirstWrite.call(this,put,args);};
  await assert.rejects(joint.recoverReplacement(recover));
  assert.equal(interrupted,true);
 }finally{
  IDBObjectStore.prototype.add=add;
  IDBObjectStore.prototype.put=put;
 }
 await joint.close();

 const loaded=await Loaded.read(run.f.retained,{wasm:native,checkAuthority(){}});
 try{
  const catalogDatabase=loaded.nativeCut().root().source.catalogDatabase;
  const {signal,checkAuthority,...original}=session.f.options;
  return Cold.resumeAcrossHandover({expected:plan,execution:{
   original:{...original,catalogDatabase,checkAuthority(){}},
   run:run.options,reads:run.reads,sourceIntentDatabase:'actual-joint-cold-source-custody',
  }});
 }finally{loaded.dispose();}
}
