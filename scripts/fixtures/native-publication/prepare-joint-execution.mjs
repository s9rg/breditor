/** Concrete joint-test preparation with an explicitly selected immutable byte
 * resolver. Missing bytes remain Pending; no cache insertion, queue mutation or
 * upload acknowledgement substitutes for materializing a retained image. */
import assert from 'node:assert/strict';
import {writeFileSync,readFileSync} from 'node:fs';import {join} from 'node:path';
import {LoadedNativeReconstructionCurrent as Loaded} from '../../../packages/breditor-collaboration/dist/selected_native_reconstruction/loaded_current.js';
import {inspectRoomPreparation,prepareRoomReconstruction} from '../../../packages/breditor-collaboration/dist/native_room_preparation/coordinator.js';
import {RoomExecutionArchive} from '../../../packages/breditor-collaboration/dist/native_room_execution/archive.js';
import {prepareRoomExecution} from '../../../packages/breditor-collaboration/dist/native_room_execution/coordinator.js';
import {sourceNativeRecoveryRead} from '../../../packages/breditor-collaboration/dist/source_native_read.js';
import {nativePair,selectedPolicy} from '../native-room-retirement/session.mjs';
import {selectJointExecutionAssets} from './select-execution-assets.mjs';
import {retainJointPreparationInput} from './retain-preparation-input.mjs';
export async function prepareJointExecution({session,host,assetTransport,native},tag){
 const retained=await session.retain(),integrity={wasm:native,checkAuthority(){}},bytes=new Map();let loaded,archive,downloads=0;
 const resolveAsset=async(reference,signal)=>{
  assert.match(reference.asset,/^sha256:[a-f0-9]{64}$/);let value=bytes.get(reference.asset);
  if(!value){value=await assetTransport.readBytes(reference.asset,signal);if(!value)return undefined;bytes.set(reference.asset,value);downloads++;}
  return{asset:reference.asset,generation:reference.generation,identity:'content-addressed',blob:value.blob,check(){assert.equal(bytes.get(reference.asset),value);}};
 };
 try{
  await retainJointPreparationInput(host.directory,retained.current);
  loaded=await Loaded.read(retained,integrity);const sourceNamespaces=[loaded.nativeCut().root().database,loaded.nativeCut().root().source.catalogDatabase,...loaded.nativeCut().root().participants.flatMap(row=>row.namespaces.map(ns=>ns.database)),loaded.approval().choice.adoption.database,...loaded.approval().choice.adoption.participants.map(row=>row.targetDatabase)];
  const participants=loaded.nativeCut().root().participants.map(row=>({id:row.id,sourceFamily:row.family,family:row.family==='local-operation-snapshot'?'local-operation-flat':row.family,namespaces:row.namespaces.map(ns=>({role:ns.role,database:tag+'-replacement-'+row.id+'-'+ns.role}))})),input={retained,database:tag+'-preparation',participants};
  const missing=await inspectRoomPreparation(session.owner,session.input(),input);
  const retain=(name,value)=>{const file=join(host.directory,name),content=Buffer.from(JSON.stringify(value,null,2)+'\n');writeFileSync(file,content,{flag:'wx',mode:0o600});assert.deepEqual(readFileSync(file),content);return file;};
  if(missing.kind==='pending')console.log('JOINT_PREPARATION_PENDING '+JSON.stringify({file:retain('joint-original-missing-preparation.json',missing),participants:missing.participants.length,kinds:[...new Set(missing.participants.flatMap(row=>row.pending.map(p=>p.kind)))]}));
  const preview=await inspectRoomPreparation(session.owner,session.input(),{...input,resolveAsset});
  if(preview.kind!=='prepared-data'){
   console.log('JOINT_PREPARATION_STILL_PENDING '+JSON.stringify({file:retain('joint-resolved-missing-preparation.json',preview),downloads}));
   assert.fail('Complete joint preparation remains Pending; inspect the saved actual requirements');
  }
  const data=await prepareRoomReconstruction(session.owner,session.input(),{retained,expected:preview.data.choice,resolveAsset}),clients=session.owner.clients.map(row=>({...row,pair:nativePair(row.core),document:row.core.documentJson(),descriptor:sourceNativeRecoveryRead(row.core).descriptor()})),reads={...integrity,reads:session.input().reads},layout={database:tag+'-target-execution',catalogDatabase:tag+'-target-catalog',operationDatabase:tag+'-target-operation',adoptionDatabase:tag+'-target-adoption',approvalDatabase:tag+'-target-approval',participants:data.choice.plan.participants.map(row=>({id:row.id,selectedUploadsDatabase:tag+'-target-selected-'+row.id}))};
  const decisions=await selectJointExecutionAssets(data,reads,session.owner,retain);
  archive=await RoomExecutionArchive.capture({preparation:data,layout,decisions},reads);
  const execution=await prepareRoomExecution(session.owner,session.input(),{retained,expected:archive.choice(),resolveAsset});assert.deepEqual(execution.choice,archive.choice());
  retain('joint-execution-choice.json',execution.choice);retain('joint-original-source-namespaces.json',sourceNamespaces);
  const expected={format:'breditor/native-room-run',formatVersion:1,database:tag+'-run',execution:execution.choice},policies=execution.choice.plan.preparation.plan.participants.map(row=>selectedPolicy(session.f.participants.find(old=>old.id===row.id),row));
  console.log('JOINT_PREPARATION_READY '+JSON.stringify({downloadedImmutableImages:downloads,payloads:bytes.size,sourceCacheWrites:0,uploadAcknowledgementsInvented:0}));
  return{f:{s:session,data,retained,clients,integrity,sourceNamespaces},data:execution,reads,layout,options:{expected,participants:policies},async close(){archive?.dispose();loaded?.dispose();}};
 }catch(error){archive?.dispose();loaded?.dispose();throw error;}
}
