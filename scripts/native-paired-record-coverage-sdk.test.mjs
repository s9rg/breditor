/** Complete seven-family archive reads exercise the separate paired branch
 * route in every independent document/comment history combination. Controlled
 * storage is not a crash proof; these extending cuts are not full branch union. */
import test from'node:test';import assert from'node:assert/strict';import{resolve}from'node:path';
import{completeImageNativeFixtures}from'./fixtures/physical-operation-v3/image-seven-native.mjs';
import{completeHistoryFixture}from'./fixtures/operation-read/history-session.mjs';
import{roomAssetChoices}from'./fixtures/room-asset-adoption/bases.mjs';
import{PhysicalRoomAssetAdoption as Stage,transferRoomAssetAdoption as transfer}from'../packages/breditor-collaboration/dist/physical_room_asset_adoption/coordinator.js';
import{RoomAssetApprovalArchive as Approval}from'../packages/breditor-collaboration/dist/physical_room_asset_approval/archive.js';
import{PhysicalRoomRecordCutArchive as Cut}from'../packages/breditor-collaboration/dist/physical_room_record_cut/archive.js';
import{verifySelectedRoomNativeContinuation as exact,verifySelectedRoomNativeBranchCoverage as branch,verifySelectedRoomNativeDataBranchCoverage as dataBranch}from'../packages/breditor-collaboration/dist/selected_room_current/native_continuation.js';
import{sourceNativeRecoveryRead}from'../packages/breditor-collaboration/dist/source_native_read.js';
for(const documentSegmented of[false,true])for(const reviewSegmented of[false,true])test('complete seven-family paired record coverage '+documentSegmented+'/'+reviewSegmented,async()=>{
 const fixtures=await completeImageNativeFixtures(resolve(new URL('../',import.meta.url).pathname)),tag='paired-record-'+documentSegmented+'-'+reviewSegmented;let f,stage,owner,approved,before,after;
 try{
  f=await completeHistoryFixture({fixtures,tag,documentSegmented,reviewSegmented,participantAuthority(){}});const reads={reads:f.reads,checkAuthority(){}},integrity={wasm:fixtures.native,checkAuthority(){}},choices=await roomAssetChoices(f.owner,tag,{keep:'current'});stage=await Stage.begin(f.owner,{database:tag+'-stage',participants:choices.participants,checkAuthority(){}});await stage.finish();const expected=await stage.approvalChoice(reads);f.endOldJob();owner=await transfer(stage,{...reads,expected,approvalDatabase:tag+'-approval',approve:()=>true,checkAssetAuthority(){}});
  for(const row of owner.clients){const point={block:'p',offset:'0',affinity:'after'};row.core.select({kind:'text',anchor:point,focus:point});row.core.type('Preserved paired record ');assert.equal(row.core.redoReview().kind,'committed');}
  const captured=await owner.capture(reads);approved=await Approval.read(captured.approval.file,captured.approval.selection,integrity);const previous=approved.recordCut();before=await Cut.read(previous.file,previous.selection,integrity);after=await Cut.read(captured.root.file,captured.root.selection,integrity);assert.equal(after.root().participants.length,7);
  const pairs=()=>owner.clients.map(row=>[row.id,row.core.checkpointJson(),row.core.reviewHistoryPolicy()==='segmented-v1'?row.core.reviewSegmentedCheckpoint():row.core.reviewCheckpoint()]),unchanged=pairs(),descriptors=new Map(owner.clients.map(row=>[row.id,JSON.stringify(sourceNativeRecoveryRead(row.core).descriptor())]));
  await exact(before,after,reads,owner.clients,()=>{});await branch(before,after,reads,owner.clients,()=>{});await dataBranch(before,after,reads,descriptors,()=>{});const mutableClients=[...owner.clients],mutableDescriptors=new Map(descriptors);await branch(before,after,reads,mutableClients,()=>{mutableClients.length=0;});await dataBranch(before,after,reads,mutableDescriptors,()=>{mutableDescriptors.clear();});assert.equal(mutableClients.length,0);assert.equal(mutableDescriptors.size,0);assert.deepEqual(pairs(),unchanged);
  await assert.rejects(exact(after,before,reads,owner.clients,()=>{}));await assert.rejects(branch(after,before,reads,owner.clients,()=>{}),'Compatible coverage must still reject an unknown own suffix');await assert.rejects(dataBranch(after,before,reads,descriptors,()=>{}));await assert.rejects(branch(before,after,reads,owner.clients.slice(1),()=>{}));const missing=new Map(descriptors);missing.delete(owner.clients[0].id);await assert.rejects(dataBranch(before,after,reads,missing,()=>{}));assert.deepEqual(pairs(),unchanged);assert.equal(f.f.counts.networkCalls,0);
 }finally{after?.dispose();before?.dispose();approved?.dispose();await owner?.discardAndClose();await stage?.close();await f?.close();await fixtures.close();}
});
