import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {completeControlFixtures} from './fixtures/physical-recovery-control/complete-fixtures.mjs';
import {acceptedControlTransport} from './fixtures/physical-recovery-control/accepted-transport.mjs';
import {selectedProviderSession} from './fixtures/selected-room-provider/session.mjs';
import {sourceByteSnapshots,assertSourceBytesUnchanged} from './fixtures/native-actor-custody/storage_bytes.mjs';
import {beginCompletedRoomRecovery as begin} from '../packages/breditor-collaboration/dist/cold_room_recovery/attempt.js';
import {IndependentOperationCutJournal as DeliveryJournal} from '../packages/breditor-collaboration/dist/independent_operation/cut_journal.js';
import {IndependentLocalOperationCutJournal as LocalJournal} from '../packages/breditor-collaboration/dist/independent_local_operation/cut_journal.js';
import {SharedIndependentHistoryPersistentSession as Native} from '../packages/breditor-collaboration/dist/independent_history/session.js';
import {SharedIndependentDeliverySession as Delivery} from '../packages/breditor-collaboration/dist/independent_delivery/session.js';
import {ReviewWriterLease} from '../packages/breditor-collaboration/dist/persistence/review_writer_lease.js';
import {saveEvidence} from './candidate-release/evidence.mjs';
let fixtures,transport;
before(async()=>{fixtures=await completeControlFixtures(new URL('../',import.meta.url).pathname);transport=acceptedControlTransport(fixtures.manifest);});
after(async()=>{transport?.restore();await fixtures?.close();if(fixtures){const rows=[];for(const row of fixtures.manifest.cases){let code;try{await fetch(row.endpoint,{signal:AbortSignal.timeout(2000)});}catch(error){code=error.cause?.code;}rows.push({endpoint:row.endpoint,closed:code==='ECONNREFUSED'});}saveEvidence(fixtures.directory+'/unreturned-siblings-endpoints-closed.json',{rows});assert.ok(rows.every(row=>row.closed));}});
for(const afterClaim of [false,true])for(const family of ['independent-local','independent-delivery'])test((afterClaim?'post-claim ':'pre-claim ')+family+' retains an unreturned native source through one real cleanup refusal',async()=>{
 const tag='journal-opening-'+(afterClaim?'after-':'before-')+family,s=await selectedProviderSession(fixtures,tag,{documentSegmented:true,reviewSegmented:true});
 const Journal=family==='independent-local'?LocalJournal:DeliveryJournal,binding=Journal.prototype.bindingType;
 const discard=Native.prototype.discardAndClose,discardDelivery=Delivery.prototype.discardAndClose,closeJournal=Journal.prototype.close,closeReview=ReviewWriterLease.prototype.close;
 let cold,source,journal,armed=false,hits=0,secondError,secondSettled=false,second;
 try{
  const basis=await s.retain();await s.owner.close();const bytes=await sourceByteSnapshots(),{signal,checkAuthority,...chosen}=s.f.options;
  Journal.prototype.bindingType=function(){const value=binding.call(this);if(value.sourceDatabase!==tag+'-active-'+family+'-source')return value;return{...value,reserve:()=>{const actual=value.reserve();return{claim:owner=>{if(afterClaim)actual.claim(owner);source=owner;journal=this;armed=true;throw Error('Probe refused admission after actual native construction');},abandon:()=>actual.abandon()};}};};
  ReviewWriterLease.prototype.close=function(){if(armed&&hits===0){hits++;return Promise.reject(Error('One actual review-actor cleanup refusal'));}return closeReview.call(this);};
  cold=begin({root:{...chosen,catalogDatabase:tag+'-catalog',checkAuthority(){}},basis,reads:s.input(),intentDatabase:tag+'-inspection-intent'});
  await assert.rejects(cold.open());assert.ok(source);assert.ok(journal);assert.equal(hits,1);
  Journal.prototype.bindingType=binding;ReviewWriterLease.prototype.close=closeReview;
  second=cold.close().then(()=>{secondSettled=true;},error=>{secondSettled=true;secondError=error;});
  await Promise.race([second,new Promise(resolve=>setTimeout(resolve,3000))]);
  const result={family,afterClaim,actualNativeConstructed:true,actualCleanupFailures:hits,retrySettled:secondSettled,retryError:secondError?.code??secondError?.message??null,probeOnlyCleanupNotYetUsed:true};
  saveEvidence(fixtures.directory+'/'+tag+'.json',result);
  console.log(JSON.stringify(result));
  assert.equal(secondSettled,true,'Close retry must settle without a probe-only source handle');
  assert.equal(secondError,undefined,'Close retry must close the actual unreturned source');
  await assertSourceBytesUnchanged(bytes);
 }finally{
  Journal.prototype.bindingType=binding;ReviewWriterLease.prototype.close=closeReview;
  try{if(source){if(family==='independent-local')await discard.call(source);else await discardDelivery.call(source);}if(journal)await closeJournal.call(journal);await second;await cold?.close();}finally{await s.close();}
 }
});
