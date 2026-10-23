/** Genuine five-family owners plus controlled internal parent-reservation hooks.
 * Tests barrier composition, not a real durable coordinator or room activation. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './delivery-operation-cohort.test.mjs';
import {prepareCompleteOperationParticipants as prepare} from '../packages/breditor-collaboration/dist/complete_operation_cohort/cohort.js';
import {PhysicalOperationV3Cancellation} from '../packages/breditor-collaboration/dist/physical_room_operation_v3/storage_cancellation.js';
import {insertCleanupText} from './fixtures/owned-core-cleanup/session.mjs';
const input=f=>f.rows.map(r=>({id:r.id,family:r.family,operation:r.parent}));
function parent({current=()=>{},dispose=()=>{},consume=()=>{}}={}){let released=false,finished=false;return{states:[],assetStores:[],async verify(){},markReleased(){released=true;},checkBindings(){assert.equal(finished,false);},checkCurrent(){assert.equal(released,true);current();},disposeAuxiliaries(){dispose();},checkManaged(){current();},consume(){finished=true;consume();},abandon(){}};}
async function retire(parts){for(const row of parts?.participants??[]){await row.parts.source.session.discardAndClose();row.parts.uploads.close();}}
test('coordinator parent cancellation runs after the last child callback and consumes none',async()=>{
 let armed=false,last=0;const freeze=Object.freeze,controller=new AbortController(),cancel=new PhysicalOperationV3Cancellation(controller.signal);let f,capsule,consumed=false;
 try{f=await fixture({policy(index){if(armed&&index===4&&++last===2)controller.abort();}});const reservation=parent({current:()=>cancel.check(),consume(){consumed=true;}});Object.freeze=function(value){if(value&&Array.isArray(value.participants)&&value.participants.length===5)armed=true;return freeze(value);};capsule=await prepare(input(f),[],[],async()=>{},()=>{},()=>{},reservation);assert.throws(()=>capsule.commit(),e=>e.code==='physical_operation_v3_aborted');Object.freeze=freeze;armed=false;assert.equal(consumed,false);await f.retryable();}
 finally{Object.freeze=freeze;armed=false;capsule?.abandon();cancel.close();await f?.close();}
});
test('coordinator parent native-reader cleanup cannot publish a changed child',async()=>{
 const f=await fixture();let changed=false,consumed=false,capsule;
 try{const reservation=parent({dispose(){changed=true;insertCleanupText(f.rows[0].native.core,'Parent reader disposal changed a source ');},consume(){consumed=true;}});capsule=await prepare(input(f),[],[],async()=>{},()=>{},()=>{},reservation);assert.throws(()=>capsule.commit(),e=>e.code==='independent_operation_source_changed');assert.equal(changed,true);assert.equal(consumed,false);await f.rows[0].native.flush();await f.retryable();}
 finally{capsule?.abandon();await f.close();}
});
test('coordinator parent cleanup refusal consumes no child and leaves actual custody retryable',async()=>{
 const f=await fixture();let capsule,consumed=false;
 try{const reservation=parent({dispose(){throw Error('Temporary reader cleanup failed');},consume(){consumed=true;}});capsule=await prepare(input(f),[],[],async()=>{},()=>{},()=>{},reservation);assert.throws(()=>capsule.commit(),/Temporary reader cleanup failed/);assert.equal(consumed,false);await f.retryable();}
 finally{capsule?.abandon();await f.close();}
});
test('coordinator parent retirement does not revoke independently selected client lifetimes',async()=>{
 const f=await fixture();let capsule,parts,jobOpen=true;
 try{const reservation=parent({current(){assert.equal(jobOpen,true);},consume(){jobOpen=false;}});capsule=await prepare(input(f),[],[],async()=>{},()=>{},()=>{},reservation);parts=capsule.commit();assert.equal(jobOpen,false);for(const row of parts.participants){insertCleanupText(row.parts.source.session.core,'Editor remains usable after its coordinator retires ');await row.parts.source.session.flush();assert.match(row.parts.source.session.core.documentJson(),/Editor remains usable after its coordinator retires/);}}
 finally{capsule?.abandon();await retire(parts);await f.close();}
});
