/** Development-only real seven-family composition; no durable room activation. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import * as api from '../packages/breditor-collaboration/dist/index.js';
import * as rich from '@breditor/experimental-rich-content';
import {fixture as fiveFixture} from './delivery-operation-cohort.test.mjs';
import {originalOperation} from './fixtures/operation-cohort/original-participant.mjs';
import {generationParticipant} from './fixtures/room-participant-inventory/generation-participant.mjs';
import {insertCleanupText} from './fixtures/owned-core-cleanup/session.mjs';
import {prepareCompleteOperationParticipants as prepare} from '../packages/breditor-collaboration/dist/complete_operation_cohort/cohort.js';
const manifest=JSON.parse(readFileSync('/Users/s/code/breditor/target/room-participant-inventory-native.json')),fixtures=JSON.parse(readFileSync(manifest.manifest)),seed=JSON.parse(readFileSync(fixtures.cases[0].path));let sequence=0;
async function complete({policy=()=>{},oldPolicy=()=>{}}={}){
 let f,original,generation,profile;const counts={networkCalls:0,restoredParticipants:0,restoredComponents:0};
 try{
  f=await fiveFixture({policy});const native=await import(pathToFileURL(new URL('../target/promoted-shared-web/breditor_shared.js',import.meta.url).pathname));await native.default({module_or_path:readFileSync(new URL('../target/promoted-shared-web/breditor_shared_bg.wasm',import.meta.url))});profile=native.SharedRichProfile.from_configuration_json(seed.configuration);
  original=await originalOperation({api,rich,profile,fixture:seed,client:seed.clients[0],tag:'complete-original-'+sequence++,counts},oldPolicy);
  generation=await generationParticipant({api,rich,profile,fixture:seed,client:seed.clients[1],kind:'local',tag:'complete-generation-'+sequence++,counts});await generation.holdOperation(oldPolicy);
  const rows=()=>[{id:'original',family:'original',operation:original.operation},...f.rows.map(r=>({id:r.id,family:r.family,operation:r.parent})),{id:'generation',family:'generation',operation:generation.operation}];
  return{f,original,generation,rows,async close(){try{await generation.close();await original.close();await f.close();assert.equal(counts.networkCalls,0);}finally{profile.free();}}};
 }catch(error){try{await generation?.close();await original?.close();await f?.close();}finally{profile?.free();}throw error;}
}
test('seven genuine families cross one barrier with exact native and upload state',async()=>{
 const h=await complete();let capsule,parts;
 try{
  const expected=[h.original.exportRecovery(),h.generation.exportRecovery()];capsule=await prepare(h.rows(),[],[],async()=>{},()=>{},()=>{});parts=capsule.commit();assert.deepEqual(parts.participants.map(r=>[r.id,r.family]),h.rows().map(r=>[r.id,r.family]));
  h.original.takeParts(parts.participants.find(r=>r.id==='original').parts);h.generation.takeParts(parts.participants.find(r=>r.id==='generation').parts);
  assert.deepEqual(h.original.exportRecovery(),expected[0]);assert.deepEqual(h.generation.exportRecovery(),expected[1]);
  for(const row of parts.participants.filter(r=>r.family!=='original'&&r.family!=='generation')){const before=h.f.rows.find(r=>r.id===row.id);assert.deepEqual(Buffer.from(await(await row.parts.uploads.exportBackup()).arrayBuffer()),before.uploads);}
  for(const[owner,before]of [[h.original,expected[0]],[h.generation,expected[1]]]){await owner.coldOperation();owner.takeParts(await owner.operation.intoParts());assert.deepEqual(owner.exportRecovery(),before);}
 }finally{capsule?.abandon();if(parts)for(const row of parts.participants.filter(r=>r.family!=='original'&&r.family!=='generation')){await row.parts.source.session.discardAndClose();row.parts.uploads.close();}await h.close();}
});
test('a last local callback cannot consume an earlier original native owner after retirement',async()=>{
 let armed=false,changed=false,last=0,h;const freeze=Object.freeze;
 h=await complete({policy(index){if(armed&&index===4&&++last===2){changed=true;h.original.parts.session.core.retire();}}});let capsule;
 try{Object.freeze=function(value){if(value&&Array.isArray(value.participants)&&value.participants.length===7)armed=true;return freeze(value);};capsule=await prepare(h.rows(),[],[],async()=>{},()=>{},()=>{});assert.throws(()=>capsule.commit(),error=>error.code==='retired');Object.freeze=freeze;armed=false;assert.equal(changed,true);await h.f.retryable();}
 finally{Object.freeze=freeze;armed=false;capsule?.abandon();await h.close();}
});
test('an original callback cannot publish a stale complete-delivery source',async()=>{
 let h,armed=false,changed=false;const freeze=Object.freeze;
 h=await complete({oldPolicy(){if(armed&&!changed){changed=true;insertCleanupText(h.f.rows[0].native.core,'Cross seven-family stale source ');}}});let capsule;
 try{Object.freeze=function(value){if(value&&Array.isArray(value.participants)&&value.participants.length===7)armed=true;return freeze(value);};capsule=await prepare(h.rows(),[],[],async()=>{},()=>{},()=>{});assert.throws(()=>capsule.commit(),error=>error.code==='independent_operation_source_changed');Object.freeze=freeze;armed=false;assert.equal(changed,true);await h.f.rows[0].native.flush();await h.f.retryable();}
 finally{Object.freeze=freeze;armed=false;capsule?.abandon();await h.close();}
});
test('invalid cross-family seven-owner inputs leave every actual owner usable',async()=>{
 const h=await complete();
 try{const rows=h.rows();for(const input of [[],Array(3),[rows[0],{...rows[1],id:rows[0].id}],[rows[0],{...rows[6],operation:{ready:true}}],[rows[0],{...rows[1],family:'original'}],[rows[0],{...rows[6],operation:rows[0].operation}]]){await assert.rejects(prepare(input,[],[],async()=>{},()=>{},()=>{}));await h.original.operation.check();await h.generation.operation.check();await h.f.retryable();}}
 finally{await h.close();}
});
