/** Genuine original/generation parents must hold actual whole-upload custody
 * during a native-only borrow too. No source/capture interception is required. */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../../../packages/breditor-collaboration/dist/index.js';
import * as rich from '@breditor/experimental-rich-content';
import {sevenNativeFixtures} from '../physical-operation-v3/seven-native.mjs';
import {sevenFamilyRoomFixture} from '../physical-operation-v3/seven-room.mjs';
import {borrowCompleteNativeRead} from '../../../packages/breditor-collaboration/dist/complete_operation_cohort/native_read.js';
const fixtures=await sevenNativeFixtures();
for(const item of fixtures.manifest.cases.slice(0,2)){
 const wire=fixtures.fixture(item).atomic?2:1;
 test(`original and generation upload custody survives native reads and releases only its temporary hold, wire=${wire}`,{timeout:60000},async()=>{
  const tag='read-upload-custody-'+wire,f=await sevenFamilyRoomFixture({fixtures,item,tag}),parents=[],foreign=[],competing=[],acknowledgements=[];let read,attempt,ready,restoreLocks=()=>{},delayCleanup=false;
  try{
   const original=f.rows.find(row=>row.family==='original'),generation=f.rows.find(row=>row.family==='generation'),selected=f.participants.find(row=>row.family==='generation');
   const a=await api.OperationalSharedParticipant.begin({database:tag+'-original-operation',recovered:original.owner.recovered,expected:original.expected,checkAuthority(){}});parents.push({id:'original',family:'original',operation:a});
   generation.owner.source.dispose();await generation.owner.session.close();generation.owner.uploads.close();
   attempt=await api.SharedGenerationParticipantRecovery.begin({...selected.recovery,expected:generation.expected,backup:generation.owner.backup,checkAuthority(){}});ready=await attempt.finish();
   const b=await api.OperationalSharedGenerationParticipant.begin({database:tag+'-generation-operation',recovered:ready,expected:generation.expected,checkAuthority(){}});parents.push({id:'generation',family:'generation',operation:b});
   foreign.push(await rich.RichAssetStore.openRetained(original.owner.recovery.destinations.uploads),await rich.RichAssetStore.openRetained(selected.recovery.destinations.uploads));
   const locks=navigator.locks,request=locks.request,names=new Set([original.owner.recovery.destinations.uploads,selected.recovery.destinations.uploads].map(name=>'breditor/assets-custody/'+name));let reached;
   const reachedCleanup=new Promise(resolve=>{reached=resolve;});
   locks.request=function(name,options,run){return request.call(this,name,options,async lock=>{const result=await run(lock);if(delayCleanup&&names.has(name)){await new Promise(resolve=>{acknowledgements.push(resolve);if(acknowledgements.length===2)reached();});}return result;});};restoreLocks=()=>{locks.request=request;};
   read=borrowCompleteNativeRead(parents);await read.prepare();
   for(let cycle=0;cycle<2;cycle++){
    await read.verify();read.checkCurrent();const missing=[];
    for(const[index,store]of foreign.entries())try{competing.push(await store.acquireRecoveryCustody());missing.push(parents[index].family);}catch(error){assert.equal(error.code,'asset_custody_busy');}
    for(const lease of competing.splice(0))await lease.close();
    assert.deepEqual(missing,[],'A native read must exclude actual competing upload custody in both legacy families');
   }
   delayCleanup=true;const closing=read.close();await reachedCleanup;
   for(const row of parents)await assert.rejects(row.operation.check(),error=>error.code===(row.family==='original'?'operation_in_use':'generation_operation_busy'));
   delayCleanup=false;for(const acknowledge of acknowledgements.splice(0))acknowledge();await closing;read=undefined;restoreLocks();
   for(const store of foreign){const lease=await store.acquireRecoveryCustody();await lease.close();}
   for(const row of parents)await row.operation.check();
  }finally{
   delayCleanup=false;for(const acknowledge of acknowledgements.splice(0))acknowledge();for(const lease of competing)await lease.close();await read?.close();restoreLocks();for(const store of foreign)store.close();for(const row of parents.toReversed())await row.operation.discardAndClose();await ready?.discardAndClose();await attempt?.close();await f.close();
  }
 });
}
