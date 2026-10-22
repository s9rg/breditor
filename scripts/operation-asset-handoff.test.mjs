/** Real native owners and actual second upload handles; synthetic IDB/locks are explicit. */
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
let profile,sequence=0,saved,locks;
before(async()=>{const native=await import(pathToFileURL(runtime+'/breditor_shared.js'));await native.default({module_or_path:readFileSync(runtime+'/breditor_shared_bg.wasm')});profile=nativeProfile(native);});
after(()=>profile?.free());
beforeEach(()=>{saved=new Map();locks=assetLockHost();for(const[name,value]of Object.entries({indexedDB:new IDBFactory(),navigator:{locks:locks.locks},Image:ReviewFixtureImage})){saved.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{value,configurable:true});}});
afterEach(async()=>{await new Promise(resolve=>setImmediate(resolve));assert.equal(locks.held.size,0,'Actual native, coordinator and upload locks must all finish');for(const[name,value]of saved)if(value)Object.defineProperty(globalThis,name,value);else delete globalThis[name];});
for(const family of ['original','paired','generation','generation-paired'])for(const operation of [false,true])test(`actual upload custody spans ${operation?'operational':'recovered'} handoff: ${family}`,async()=>{
 const h=await assetOperationParticipant({api,rich,profile,family,tag:'asset-handoff-'+sequence++,operation}),foreign=await rich.RichAssetStore.openRetained(h.uploadsDatabase),close=RecoveryLease.prototype.close;let fired=false,blocked,parts;
 try{
  RecoveryLease.prototype.close=async function(...args){if(!fired){fired=true;try{await foreign.retry(h.asset);}catch(error){blocked=error.code;}}return close.apply(this,args);};
  parts=h.take(await h.owner.intoParts());
  assert.equal(fired,true);assert.equal(blocked,'asset_custody_busy','Another actual store must not change the verified upload cut during coordinator release');
  assert.deepEqual(Buffer.from(await(await parts.uploads.exportBackup()).arrayBuffer()),h.expectedUploads);h.verifyFuture(parts);
  await parts.uploads.retry(h.asset);assert.equal((await parts.uploads.list()).find(row=>row.asset===h.asset).status,'pending','The returned handle must work immediately');
 }finally{RecoveryLease.prototype.close=close;foreign.close();await h.close();}
});
test('a mixed original/generation cohort holds both actual upload stores through its final callback',async()=>{
 const first=await assetOperationParticipant({api,rich,profile,family:'paired',tag:'asset-mixed-a',writer:'101'}),second=await assetOperationParticipant({api,rich,profile,family:'generation-paired',tag:'asset-mixed-b',writer:'202'}),a=await rich.RichAssetStore.openRetained(first.uploadsDatabase),b=await rich.RichAssetStore.openRetained(second.uploadsDatabase),blocked=[];let handoff;
 try{
  handoff=await prepareMixedRoomParticipants([{id:'a',family:'original',operation:first.owner},{id:'b',family:'generation',operation:second.owner}],[],[],async()=>{for(const[store,h]of [[a,first],[b,second]])try{await store.retry(h.asset);blocked.push('mutated');}catch(error){blocked.push(error.code);}},()=>{},()=>{});
  const result=handoff.commit();first.take(result.participants[0].parts);second.take(result.participants[1].parts);
  assert.deepEqual(blocked,['asset_custody_busy','asset_custody_busy']);first.verifyFuture(result.participants[0].parts);second.verifyFuture(result.participants[1].parts);
 }finally{handoff?.abandon();a.close();b.close();await first.close();await second.close();}
});
