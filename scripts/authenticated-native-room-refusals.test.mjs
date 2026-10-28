/** Actual selected native server and complete current room owners. No synthetic authentication replies. */
import test,{before,after} from 'node:test';import assert from 'node:assert/strict';import {join} from 'node:path';
import {completeControlFixtures} from './fixtures/physical-recovery-control/complete-fixtures.mjs';
import {originalReviewTransport} from './fixtures/original-review/transport.mjs';
import {authenticatedRoomUnionFixture} from './fixtures/native-room-union/authenticated.mjs';
import {foreignRoomFork} from './fixtures/native-room-union/fork.mjs';
import {names} from './fixtures/native-room-union/session.mjs';
import {inspectAuthenticatedNativeRoomUnion as inspect,inspectNativeRoomUnion as original} from '../packages/breditor-collaboration/dist/native_room_union/coordinator.js';
import {saveEvidence} from './candidate-release/evidence.mjs';
let fixtures,transport;
before(async()=>{fixtures=await completeControlFixtures(new URL('../',import.meta.url).pathname);transport=originalReviewTransport(fixtures.manifest);});
after(async()=>{transport?.restore();await fixtures?.close();if(fixtures){const rows=[];for(const item of fixtures.manifest.cases){let code;try{await fetch(item.endpoint,{signal:AbortSignal.timeout(2000)});}catch(error){code=error.cause?.code;}rows.push({endpoint:item.endpoint,closed:code==='ECONNREFUSED'});}saveEvidence(join(fixtures.directory,'room-auth-refusal-endpoints-closed.json'),{rows});assert.equal(rows.length,10);assert.ok(rows.every(row=>row.closed));}});
test('new authenticated room choices stay closed and cannot use supplied grants or a saved server reply',async()=>{
 const f=await authenticatedRoomUnionFixture(fixtures,{documentSegmented:false,reviewSegmented:false});
 try{const before=f.nativeState(),databases=await names(),authentication=f.authentication,query=authentication.originalReview[0],attempt=async input=>{await assert.rejects(async()=>inspect(f.owner,f.input(),input));assert.deepEqual(f.nativeState(),before);assert.deepEqual(await names(),databases);};
  await attempt({...f.preview,authorizations:f.options.authorizations});await attempt({...f.preview,authentication:{...authentication,host:f.accepted}});await attempt({...f.preview,authentication:{...authentication,originalReview:[]}});await attempt({...f.preview,authentication:{...authentication,originalReview:[query,query]}});await attempt({...f.preview,authentication:{...authentication,originalReview:[{...query,id:'different-member'}]}});let getters=0;const accessor={...f.preview,get authentication(){getters++;return authentication;}};await attempt(accessor);assert.equal(getters,0);await assert.rejects(async()=>original(f.owner,f.input(),f.preview));assert.deepEqual(f.nativeState(),before);assert.deepEqual(await names(),databases);
 }finally{await f.close();}
});
test('unknown offline rights keep the whole room pending and omitting the unknown query cannot bypass native proof',async()=>{
 const f=await authenticatedRoomUnionFixture(fixtures,{documentSegmented:true,reviewSegmented:true});
 try{const before=f.nativeState(),databases=await names(),fork=await foreignRoomFork(f,f.retained,{label:'Unknown offline room peer'}),query=f.authentication.originalReview[0],grant=fork.authorizations[0].authorizations[0],authentication={host:f.host,originalReview:[{id:query.id,query:{binding:query.query.binding,ranges:[...query.query.ranges,{actor:grant.source.actor,principal:grant.source.principal,from:grant.from,through:grant.through}].sort((a,b)=>a.actor<b.actor?-1:a.actor>b.actor?1:0)}}]};
  await assert.rejects(inspect(f.owner,f.input(),{...f.preview,retained:fork.retained,authentication}),error=>{assert.equal(error.code,'room_union_original_rights_pending');assert.equal(error.pending.length,1);assert.equal(error.pending[0].read.authorizations.windows.length,0);assert.equal(error.pending[0].read.authorizations.kind,'pending');return true;});
  await assert.rejects(inspect(f.owner,f.input(),{...f.preview,retained:fork.retained}));assert.deepEqual(f.nativeState(),before);assert.deepEqual(await names(),databases);
 }finally{await f.close();}
});
test('closing the genuine controller after rights arrive refuses the final reconstruction without changing a source',async()=>{
 const f=await authenticatedRoomUnionFixture(fixtures,{documentSegmented:false,reviewSegmented:true});
 try{const before=f.nativeState(),databases=await names(),initial=transport.reads.length;let closed=0;const reads=f.input().reads.map(row=>{if(row.id!=='original')return row;const restore=row.read.restore;return{...row,read:{...row.read,restore(...args){const value=restore.apply(row.read,args);if(!closed&&transport.reads.length>initial){closed++;f.host.close();}return value;}}};});await assert.rejects(inspect(f.owner,{...f.input(),reads},f.preview),error=>error.code==='control_closed');assert.equal(closed,1);assert.deepEqual(f.nativeState(),before);assert.deepEqual(await names(),databases);
 }finally{await f.close();}
});
