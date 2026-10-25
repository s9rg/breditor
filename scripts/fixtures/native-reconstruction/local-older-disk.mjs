/** Actual older source, prepared pending journal, newer LIVE native history and
 * genuine cold reopen. The first failed attempt is retained, never hand-written. */
import assert from 'node:assert/strict';
import {IDBObjectStore} from 'fake-indexeddb';
import {selectedProviderSession,selectStart} from '../selected-room-provider/session.mjs';
import {LoadedNativeReconstructionCurrent as Loaded} from '../../../packages/breditor-collaboration/dist/selected_native_reconstruction/loaded_current.js';
import {localPortableCutRecovery} from '../../../packages/breditor-collaboration/dist/independent_local_operation/portable_cut.js';
import {waitNativePendingWork} from '../../../packages/breditor-collaboration/dist/native_pending_work.js';
const settled=core=>waitNativePendingWork(core,{check(){},watch(){return()=>{};}});
export async function localOlderDisk(fixtures,tag,{documentSegmented,reviewSegmented}){
 const s=await selectedProviderSession(fixtures,tag,{documentSegmented,reviewSegmented}),integrity={wasm:fixtures.native,checkAuthority(){}},put=IDBObjectStore.prototype.put,add=IDBObjectStore.prototype.add;let basisRead,loaded;
 const pair=core=>({checkpoint:core.checkpointJson(),review:reviewSegmented?core.reviewSegmentedCheckpoint():core.reviewCheckpoint(),document:core.documentJson()});
 try{
  const client=s.owner.clients.find(row=>row.id==='independent-local');selectStart(client.core);await settled(client.core);const basis=await s.retain();basisRead=await Loaded.read(basis,integrity);const member=basisRead.nativeCut().root().participants.find(row=>row.id==='independent-local'),database=member.namespaces.find(row=>row.role==='source').database,journal=member.namespaces.find(row=>row.role==='journal').database,before=pair(client.core);basisRead.dispose();basisRead=undefined;let failures=0;
  const fault=function(original,args){if(this.transaction.db.name===database){failures++;throw Error('Test-owned local source save failed after prepare');}return original.apply(this,args);};
  IDBObjectStore.prototype.put=function(...args){return fault.call(this,put,args);};IDBObjectStore.prototype.add=function(...args){return fault.call(this,add,args);};
  client.core.type('Prepared older pending 🙂 ');await settled(client.core);assert.ok(failures>0);const prepared=pair(client.core);
  client.core.type('Only retained LIVE 🙂 ');client.core.dispatchReview({kind:'create_thread',data:{anchorJson:client.core.captureReviewAnchor({kind:'document'}),body:'Only retained local review'}});client.core.undoReview();await settled(client.core);
  const live=pair(client.core),retained=await s.retain();loaded=await Loaded.read(retained,integrity);const source=(await loaded.records('independent-local')).source;assert.notEqual(source.snapshot.record.current,null);assert.notEqual(source.snapshot.record.pending,null);assert.equal(source.snapshot.observed,source.snapshot.record.current);const pending=await localPortableCutRecovery(source.identity,source.snapshot.pending);assert.equal(pending.documentCheckpoint,prepared.checkpoint);assert.equal(pending.reviewCheckpoint,prepared.review);assert.equal(source.live.documentCheckpoint,live.checkpoint);assert.equal(source.live.reviewCheckpoint,live.review);assert.notEqual(live.checkpoint,pending.documentCheckpoint);assert.notEqual(live.review,pending.reviewCheckpoint);
  IDBObjectStore.prototype.put=put;IDBObjectStore.prototype.add=add;await s.owner.discardAndClose();await s.cold(basis);const reopened=s.owner.clients.find(row=>row.id==='independent-local'),after=pair(reopened.core);assert.equal(after.document,prepared.document);assert.notEqual(after.checkpoint,live.checkpoint);assert.notEqual(after.review,live.review);
  return{s,basis,retained,loaded,source,before,prepared,pending,live,after,database,journal,failures,factory:s.f.reads.find(row=>row.id==='independent-local').read.session,async close(){loaded.dispose();await s.close();}};
 }catch(error){IDBObjectStore.prototype.put=put;IDBObjectStore.prototype.add=add;loaded?.dispose();await s.close();throw error;}finally{IDBObjectStore.prototype.put=put;IDBObjectStore.prototype.add=add;basisRead?.dispose();}
}
