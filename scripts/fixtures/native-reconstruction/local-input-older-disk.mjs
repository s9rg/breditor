/** A real native-input failed save, prepared PENDING, newer retained LIVE,
 * and genuine older cold source. No head, ACK or native lane is fabricated. */
import assert from 'node:assert/strict';
import {IDBObjectStore} from 'fake-indexeddb';
import {selectedProviderSession,selectStart} from '../selected-room-provider/session.mjs';
import {LoadedNativeReconstructionCurrent as Loaded} from '../../../packages/breditor-collaboration/dist/selected_native_reconstruction/loaded_current.js';
import {readOperationCut} from '../../../packages/breditor-collaboration/dist/independent_operation/cut_codec.js';
import {readRestoredLocalHead} from '../../../packages/breditor-collaboration/dist/restored_local_operation/head.js';
import {readFlatLocalHead} from '../../../packages/breditor-collaboration/dist/flat_local_operation/head.js';
import {waitNativePendingWork} from '../../../packages/breditor-collaboration/dist/native_pending_work.js';
import {sourceNativeRecoveryRead} from '../../../packages/breditor-collaboration/dist/source_native_read.js';
const settled=core=>waitNativePendingWork(core,{check(){},watch(){return()=>{};}});
export async function localInputOlderDisk(fixtures,tag,{family,documentSegmented,reviewSegmented}){
 assert.ok(['local-operation-snapshot','local-operation-flat'].includes(family));
 const s=await selectedProviderSession(fixtures,tag,{documentSegmented,reviewSegmented,async prepareLocalInput(session,options){await session.retainVersion(session.core.captureVersion('Second local-input immutable baseline',options.review.principal,'12'));await session.flush();}}),integrity={wasm:fixtures.native,checkAuthority(){}},put=IDBObjectStore.prototype.put,add=IDBObjectStore.prototype.add;let basisRead,loaded;
 const pair=core=>({checkpoint:core.checkpointJson(),review:reviewSegmented?core.reviewSegmentedCheckpoint():core.reviewCheckpoint(),document:core.documentJson()});
 try{
  const client=s.owner.clients.find(row=>row.id===family);selectStart(client.core);await settled(client.core);const basis=await s.retain();basisRead=await Loaded.read(basis,integrity);
  const member=basisRead.nativeCut().root().participants.find(row=>row.id===family),database=member.namespaces.find(row=>row.role==='source').database,journal=member.namespaces.find(row=>row.role==='journal').database,before=pair(client.core);basisRead.dispose();basisRead=undefined;let failures=0;
  const fault=function(original,args){if(this.transaction.db.name===database){failures++;throw Error('Test-owned local-input source save failed after prepare');}return original.apply(this,args);};IDBObjectStore.prototype.put=function(...args){return fault.call(this,put,args);};IDBObjectStore.prototype.add=function(...args){return fault.call(this,add,args);};
  client.core.type('Local input prepared pending 🙂 ');await settled(client.core);assert.ok(failures>0);const prepared=pair(client.core);
  client.core.type('Local input retained LIVE 🙂 ');client.core.dispatchReview({kind:'create_thread',data:{anchorJson:client.core.captureReviewAnchor({kind:'document'}),body:'Only retained local input review'}});client.core.undoReview();await settled(client.core);
  const live=pair(client.core),retained=await s.retain();loaded=await Loaded.read(retained,integrity);const source=(await loaded.records(family)).source;
  assert.equal(source.live.versions.length,2);assert.notEqual(source.snapshot.record.current,null);assert.notEqual(source.snapshot.record.pending,null);assert.equal(source.snapshot.observed,source.snapshot.record.current);
  const pending=await readOperationCut(source.snapshot.pending,head=>(family==='local-operation-snapshot'?readRestoredLocalHead:readFlatLocalHead)(head,source.identity));assert.equal(pending.documentCheckpoint,prepared.checkpoint);assert.equal(pending.reviewCheckpoint,prepared.review);
  assert.equal(source.live.documentCheckpoint,live.checkpoint);assert.equal(source.live.reviewCheckpoint,live.review);assert.notEqual(live.checkpoint,pending.documentCheckpoint);assert.notEqual(live.review,pending.reviewCheckpoint);
  IDBObjectStore.prototype.put=put;IDBObjectStore.prototype.add=add;await s.owner.discardAndClose();await s.cold(basis);const reopened=s.owner.clients.find(row=>row.id===family),after=pair(reopened.core);assert.equal(after.document,prepared.document);assert.notEqual(after.checkpoint,live.checkpoint);assert.notEqual(after.review,live.review);
  const factory=s.f.reads.find(row=>row.id===family).read.session;
  return{s,family,basis,retained,loaded,source,before,prepared,pending,live,after,database,journal,failures,factory,descriptor:JSON.stringify(sourceNativeRecoveryRead(reopened.core).descriptor()),async close(){loaded.dispose();await s.close();}};
 }catch(error){IDBObjectStore.prototype.put=put;IDBObjectStore.prototype.add=add;loaded?.dispose();await s.close();throw error;}finally{IDBObjectStore.prototype.put=put;IDBObjectStore.prototype.add=add;basisRead?.dispose();}
}
