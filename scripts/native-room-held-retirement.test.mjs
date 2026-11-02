/** Same genuine selected source lifetime through full recipe verification and
 * actual old-writer retirement. Controlled IDB/locks are not crash durability,
 * Native activation or public serving qualification. */
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {completeControlFixtures} from './fixtures/physical-recovery-control/complete-fixtures.mjs';
import {acceptedControlTransport} from './fixtures/physical-recovery-control/accepted-transport.mjs';
import {preparedRetirement,databaseNames} from './fixtures/native-room-retirement/session.mjs';
import {sourceByteSnapshots,assertSourceBytesUnchanged} from './fixtures/native-actor-custody/storage_bytes.mjs';
import {reserveSelectedActorExecution,releaseSelectedActorExecution,withReservedSelectedActorRetirement,takeReservedSelectedActors,selectedOwnerHasRetiredActors,retryReservedSelectedActorCleanup} from '../packages/breditor-collaboration/dist/physical_room_asset_successor/owner.js';
import {selectedNativeDeliverySources} from '../packages/breditor-collaboration/dist/relay/native_delivery.js';
import {verifyHeldPreparedRoomRetirement} from '../packages/breditor-collaboration/dist/native_room_retirement/held_scope.js';
import {SharedWriterLease} from '../packages/breditor-collaboration/dist/persistence/writer_lease.js';
import {ReviewWriterLease} from '../packages/breditor-collaboration/dist/persistence/review_writer_lease.js';
import {saveEvidence} from './candidate-release/evidence.mjs';
let fixtures,transport;
before(async()=>{fixtures=await completeControlFixtures(new URL('../',import.meta.url).pathname);transport=acceptedControlTransport(fixtures.manifest);});
after(async()=>{transport?.restore();await fixtures?.close();});
const next=()=>new Promise(resolve=>setImmediate(resolve));
async function assertActorsHeld(f){for(const row of f.s.f.f.rows){await assert.rejects(SharedWriterLease.acquire(row.owner.options.room,row.client.writer),e=>e.code==='writer_in_use');await assert.rejects(ReviewWriterLease.acquire(row.owner.options.room,row.client.actor),e=>e.code==='review_writer_in_use');}}
async function cleanup(owner,reservation,actors){if(!actors&&selectedOwnerHasRetiredActors(owner)){await retryReservedSelectedActorCleanup(reservation);actors=takeReservedSelectedActors(reservation);}await actors?.close();releaseSelectedActorExecution(reservation);}
for(const policies of[{documentSegmented:true,reviewSegmented:false},{documentSegmented:false,reviewSegmented:true}])test('held preparation keeps all seven actual sources and fourteen actor locks through '+JSON.stringify(policies),async()=>{
 const tag='held-retirement-'+policies.documentSegmented+'-'+policies.reviewSegmented,f=await preparedRetirement(fixtures,tag,policies),reservation=reserveSelectedActorExecution(f.s.owner);let actors;
 try{const before=await sourceByteSnapshots(),names=await databaseNames();let sourceScope,decisions=0;
  await assert.rejects(f.s.owner.close(),e=>e.code==='asset_adoption_busy');
  const result=await withReservedSelectedActorRetirement(f.s.owner,reservation,f.s.input(),async scope=>{
   sourceScope=scope;const sources=selectedNativeDeliverySources(scope);assert.equal(sources.length,7);for(const row of sources)assert.equal(row.source.core,f.clients.find(client=>client.id===row.id).core);
   // An independent callback/await cannot open any old document writer. The
   // existing selected source objects remain identical after the preflight.
   for(const row of sources)assert.throws(()=>row.source.core.type('must stay excluded'));
   await next();scope.check();await assertActorsHeld(f);
   const result=await verifyHeldPreparedRoomRetirement(scope,{retained:f.retained,expected:f.data.choice,async approve(choice){decisions++;assert.deepEqual(choice,f.data.choice);await next();for(const row of sources)assert.throws(()=>row.source.core.type('no approval reentry'));scope.check();return true;}});
   assert.equal(result.state,'complete-original-cut-verified');assert.equal(result.scope,'same-held-native-source-lifetime');assert.deepEqual(selectedNativeDeliverySources(scope),sources);scope.check();await next();for(const row of sources)assert.throws(()=>row.source.core.type('no postapproval gap'));return result;
  });
  actors=takeReservedSelectedActors(reservation);assert.equal(decisions,1);assert.equal(result.state,'complete-original-cut-verified');assert.throws(()=>sourceScope.check());assert.throws(()=>f.s.owner.clients);await assertActorsHeld(f);await assertSourceBytesUnchanged(before);assert.deepEqual(await databaseNames(),names);
  saveEvidence(fixtures.directory+'/'+tag+'.json',{passed:true,actualSources:7,actualActorLocks:14,policies,sameNativeSourceLifetime:true,oldSourcesUnchanged:true,oldWriterRetirementComplete:true,nativeActivationComplete:false,wholeRoomActivated:false});
 }finally{await cleanup(f.s.owner,reservation,actors);await f.close();}
});
test('refused approval and cancelled held inspection preserve the same source session for an explicit retry',async()=>{
 const f=await preparedRetirement(fixtures,'held-retirement-refusals'),reservation=reserveSelectedActorExecution(f.s.owner);let actors;
 try{const before=await sourceByteSnapshots();let refused=0;
  await withReservedSelectedActorRetirement(f.s.owner,reservation,f.s.input(),async scope=>{
   const options={retained:f.retained,expected:f.data.choice,approve(){refused++;return false;}};
   await assert.rejects(verifyHeldPreparedRoomRetirement(scope,options));assert.equal(refused,1);scope.check();assert.equal(selectedNativeDeliverySources(scope).length,7);
   const controller=new AbortController();controller.abort();await assert.rejects(Promise.resolve().then(()=>verifyHeldPreparedRoomRetirement(scope,{...options,assets:{signal:controller.signal},approve(){throw Error('Cancelled inspection invoked approval');}})),e=>e.code==='native_reconstruction_aborted');scope.check();
   await verifyHeldPreparedRoomRetirement(scope,{...options,approve:()=>true});scope.check();
  });actors=takeReservedSelectedActors(reservation);await assertSourceBytesUnchanged(before);await assertActorsHeld(f);
 }finally{await cleanup(f.s.owner,reservation,actors);await f.close();}
});
test('copied or proxy-shaped scopes cannot borrow a source or reflect caller options',()=>{
 let reflected=0;const options=new Proxy({},{ownKeys(){reflected++;throw Error('must not reflect options');},get(){reflected++;throw Error('must not read options');}});
 for(const scope of[{},Object.freeze({check(){throw Error('not a genuine source');}}),new Proxy({},{get(){throw Error('must use registry admission first');}})])assert.throws(()=>verifyHeldPreparedRoomRetirement(scope,options),e=>e.code==='native_delivery_closed');assert.equal(reflected,0);
});
