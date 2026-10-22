/** Complete native cut guards survive late public capture-facade replacement. */
import test,{before,after,beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {IDBFactory} from 'fake-indexeddb';
import * as api from '../packages/breditor-collaboration/dist/index.js';
import * as rich from '@breditor/experimental-rich-content';
import {RecoveryLease} from '../packages/breditor-collaboration/dist/participant_recovery/lease.js';
import {prepareMixedRoomParticipants} from '../packages/breditor-collaboration/dist/mixed_room_operation/custody.js';
import {nativeProfile} from './fixtures/owned-core-cleanup/session.mjs';
import {ReviewFixtureImage} from './fixtures/review-assets/pixels.mjs';
import {assetLockHost} from './fixtures/asset-custody/locks.mjs';
import {assetOperationParticipant} from './fixtures/asset-custody/operation.mjs';
const runtime=process.env.BREDITOR_OPERATION_ASSET_RUNTIME??new URL('../target/promoted-shared-web/',import.meta.url).pathname;
let profile,saved,host,sequence=0;
before(async()=>{const native=await import(pathToFileURL(runtime+'/breditor_shared.js'));await native.default({module_or_path:readFileSync(runtime+'/breditor_shared_bg.wasm')});profile=nativeProfile(native);});after(()=>profile?.free());
beforeEach(()=>{saved=new Map();host=assetLockHost();for(const[name,value]of Object.entries({indexedDB:new IDBFactory(),navigator:{locks:host.locks},Image:ReviewFixtureImage})){saved.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{value,configurable:true});}});
afterEach(async()=>{await new Promise(resolve=>setImmediate(resolve));assert.equal(host.held.size,0);for(const[name,value]of saved)if(value)Object.defineProperty(globalThis,name,value);else delete globalThis[name];});
for(const family of ['original','paired','generation','generation-paired'])for(const operation of [false,true])test(`canonical native guard refuses changed ${operation?'operational':'recovered'} handoff: ${family}`,async()=>{
 const h=await assetOperationParticipant({api,rich,profile,family,operation,tag:'native-handoff-'+sequence++}),type=h.generation?api.SharedGenerationSourceCapture:api.SharedAssetReferenceCapture,capture=type.capture,check=type.prototype.check,dispose=type.prototype.dispose,close=RecoveryLease.prototype.close;let actual,fired=false,facades=0,escaped;
 const origin=Buffer.from(await h.recovery.backup.file().arrayBuffer());
 try{
  type.capture=function(input){actual=h.generation?input.session.core:input.core;return capture.call(this,input);};
  RecoveryLease.prototype.close=async function(...args){if(!fired){fired=true;assert.ok(actual);actual.redo();type.prototype.check=()=>{};type.prototype.dispose=()=>{facades++;};}return close.apply(this,args);};
  await assert.rejects(h.owner.intoParts().then(value=>{escaped=h.take(value);}),error=>!String(error).includes('mutable'));
  assert.equal(fired,true);assert.equal(escaped,undefined);assert.equal(facades,0,'Final verification and cleanup must not dispatch through replaced public capture methods');assert.notEqual(actual.checkpointJson(),h.native[0]);assert.deepEqual(Buffer.from(await h.recovery.backup.file().arrayBuffer()),origin);
 }finally{type.capture=capture;type.prototype.check=check;type.prototype.dispose=dispose;RecoveryLease.prototype.close=close;await h.close();}
});
test('a mixed cohort refuses a changed later native owner even after public guard replacement',async()=>{
 const a=await assetOperationParticipant({api,rich,profile,family:'paired',tag:'native-mixed-a',writer:'101'}),b=await assetOperationParticipant({api,rich,profile,family:'generation-paired',tag:'native-mixed-b',writer:'202'}),type=api.SharedGenerationSourceCapture,capture=type.capture,check=type.prototype.check,dispose=type.prototype.dispose;let actual,facades=0,cap,escaped;
 try{
  type.capture=function(input){actual=input.session.core;return capture.call(this,input);};cap=await prepareMixedRoomParticipants([{id:'a',family:'original',operation:a.owner},{id:'b',family:'generation',operation:b.owner}],[],[],async()=>{},()=>{},()=>{});
  actual.redo();type.prototype.check=()=>{};type.prototype.dispose=()=>{facades++;};
  assert.throws(()=>{escaped=cap.commit();for(const row of escaped.participants)(row.family==='original'?a:b).take(row.parts);});assert.equal(escaped,undefined);assert.equal(facades,0);await assert.rejects(a.owner.intoParts());await assert.rejects(b.owner.intoParts());
 }finally{type.capture=capture;type.prototype.check=check;type.prototype.dispose=dispose;cap?.abandon();await a.close();await b.close();}
});
