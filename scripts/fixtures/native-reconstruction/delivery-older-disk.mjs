/** Genuine queued packets precede the seven-family room capture. Real failed
 * source writes then leave an older prepared cut on disk and newer LIVE native
 * work only in retained DATA. No checkpoint/queue/journal row is fabricated.
 */
import assert from 'node:assert/strict';
import {IDBObjectStore} from 'fake-indexeddb';
import * as api from '../../../packages/breditor-collaboration/dist/index.js';
import {selectedProviderSession,selectStart} from '../selected-room-provider/session.mjs';
import {attachDelivery,pendingDelivery} from '../independent-delivery/session.mjs';
import {LoadedNativeReconstructionCurrent as Loaded} from '../../../packages/breditor-collaboration/dist/selected_native_reconstruction/loaded_current.js';
import {portableCutRecovery} from '../../../packages/breditor-collaboration/dist/independent_operation/portable_cut.js';
import {waitNativePendingWork} from '../../../packages/breditor-collaboration/dist/native_pending_work.js';
const settled=core=>waitNativePendingWork(core,{check(){},watch(){return()=>{};}});
export async function deliveryOlderDisk(fixtures,tag,{documentSegmented,reviewSegmented}){
 let seeded;
 const s=await selectedProviderSession(fixtures,tag,{documentSegmented,reviewSegmented,async prepareDelivery(session,options){
  const accepted=session.core.documentJson(),packets=await attachDelivery(api,session,options);
  seeded=await pendingDelivery(session,packets);
  await session.retainVersion(session.core.captureVersion('Immutable recovery baseline',options.review.principal,'5'));
  await session.retainVersion(session.core.captureVersion('Second immutable recovery baseline',options.review.principal,'6'));
  await session.flush();assert.equal(session.core.documentJson(),accepted);
 }}),integrity={wasm:fixtures.native,checkAuthority(){}},put=IDBObjectStore.prototype.put,add=IDBObjectStore.prototype.add;
 let basisRead,loaded;
 const pair=core=>({checkpoint:core.checkpointJson(),review:reviewSegmented?core.reviewSegmentedCheckpoint():core.reviewCheckpoint(),document:core.documentJson()});
 try{
  const client=s.owner.clients.find(row=>row.id==='independent-delivery');selectStart(client.core);await settled(client.core);
  const basis=await s.retain();basisRead=await Loaded.read(basis,integrity);
  const member=basisRead.nativeCut().root().participants.find(row=>row.id==='independent-delivery'),database=member.namespaces.find(row=>row.role==='source').database,journal=member.namespaces.find(row=>row.role==='operation').database,before=pair(client.core);
  basisRead.dispose();basisRead=undefined;let failures=0;
  const fault=function(original,args){if(this.transaction.db.name===database){failures++;throw Error('Test-owned delivery source save failed after prepare');}return original.apply(this,args);};
  IDBObjectStore.prototype.put=function(...args){return fault.call(this,put,args);};IDBObjectStore.prototype.add=function(...args){return fault.call(this,add,args);};
  client.core.type('Prepared older pending 🙂 ');await settled(client.core);assert.ok(failures>0);const prepared=pair(client.core);
  client.core.type('Only retained LIVE 🙂 ');client.core.dispatchReview({kind:'create_thread',data:{anchorJson:client.core.captureReviewAnchor({kind:'document'}),body:'Only retained delivery review'}});client.core.undoReview();await settled(client.core);
  const live=pair(client.core),retained=await s.retain();loaded=await Loaded.read(retained,integrity);
  const source=(await loaded.records('independent-delivery')).source;
  assert.ok(seeded);assert.ok(source.live.retained.suggestions.retained.length>0);assert.ok(source.live.retained.revisions.retained.length>0);assert.ok(source.live.retained.versions.packets.length>0);assert.ok(source.live.source.versions.length>0);
  assert.notEqual(source.snapshot.record.current,null);assert.notEqual(source.snapshot.record.pending,null);assert.equal(source.snapshot.observed,source.snapshot.record.current);
  const factory=s.f.reads.find(row=>row.id==='independent-delivery').read.session,pending=await portableCutRecovery({...factory,database,create(){throw Error('Read-only fixture');}},source.identity,source.snapshot.pending);
  assert.equal(pending.source.documentCheckpoint,prepared.checkpoint);assert.equal(pending.source.reviewCheckpoint,prepared.review);assert.deepEqual(pending.retained,source.live.retained);
  assert.equal(source.live.source.documentCheckpoint,live.checkpoint);assert.equal(source.live.source.reviewCheckpoint,live.review);assert.notEqual(live.checkpoint,pending.source.documentCheckpoint);assert.notEqual(live.review,pending.source.reviewCheckpoint);
  IDBObjectStore.prototype.put=put;IDBObjectStore.prototype.add=add;
  await s.owner.discardAndClose();await s.cold(basis);
  const reopened=s.owner.clients.find(row=>row.id==='independent-delivery'),after=pair(reopened.core);
  assert.equal(after.document,prepared.document);assert.notEqual(after.checkpoint,live.checkpoint);assert.notEqual(after.review,live.review);
  return {s,basis,retained,loaded,source,before,prepared,pending,live,after,database,journal,failures,seeded,factory:s.f.reads.find(row=>row.id==='independent-delivery').read.session,async close(){loaded.dispose();await s.close();}};
 }catch(error){IDBObjectStore.prototype.put=put;IDBObjectStore.prototype.add=add;loaded?.dispose();await s.close();throw error;}
 finally{IDBObjectStore.prototype.put=put;IDBObjectStore.prototype.add=add;basisRead?.dispose();}
}
