/** Missing live pixels stay explicit Pending; providers never become upload
 * jobs, and a global immutable asset identity cannot be rebound by generation. */
import test,{before,after} from 'node:test';import assert from 'node:assert/strict';
import * as api from '../packages/breditor-collaboration/dist/index.js';import * as rich from '@breditor/experimental-rich-content';
import {OperationalIndependentLocalParticipant as Participant} from '../packages/breditor-collaboration/dist/independent_local_operation/participant.js';
import {captureLocalOperationBackup as capture} from '../packages/breditor-collaboration/dist/independent_local_operation/portable_capture.js';
import {IndependentLocalOperationBackup as Backup} from '../packages/breditor-collaboration/dist/independent_local_operation/portable_backup.js';
import {localParticipantUnitHost} from './fixtures/independent-local-operation/participant.mjs';import {prepareLocalPortableCase,portableBytes as bytes} from './fixtures/independent-local-operation/portable.mjs';import {secondPixel} from './fixtures/review-assets/pixels.mjs';
const runtime=process.env.BREDITOR_LOCAL_PORTABLE_RUNTIME??new URL('../target/promoted-shared-web/',import.meta.url).pathname;let host;
before(async()=>{host=await localParticipantUnitHost({api,rich,Participant,runtime,fixture:new URL('../crates/breditor-core/tests/fixtures/rich-local-root.json',import.meta.url)});});after(()=>host?.free());
const replace=(value,asset,generation)=>value.source.core.dispatch({commands:[{kind:'replace_image',data:{block:'image-block',asset,generation}}]});
test('new LIVE-only missing bytes remain Pending until an explicit provider supplies them',async()=>{
 const value=await prepareLocalPortableCase(await host.fixture(),capture),asset='portable-live-only',generation='new-pixels';let reopened,resolutions=0;
 try{replace(value,asset,generation);const pending=await value.capture();assert.equal(pending.kind,'pending');assert.ok(pending.pending.some(row=>row.kind==='asset'&&row.reference.asset===asset&&row.reference.generation===generation));const live=value.source.exportRecovery(),ready=await value.capture({resolveAsset(ref){assert.deepEqual(ref,{asset,generation});resolutions++;return{...ref,identity:'host-verified',blob:new Blob([secondPixel],{type:'image/png'}),check(){}};}});assert.equal(ready.kind,'ready');assert.equal(resolutions,1);assert.deepEqual(ready.backup.liveSource(),live);assert.deepEqual(await bytes(ready.backup.blob(asset,generation)),secondPixel);assert.deepEqual(await bytes(await value.parts.uploads.exportBackup()),value.uploads);reopened=await Backup.read(ready.backup.file(),ready.backup.selection(),value.readOptions);assert.deepEqual(await bytes(reopened.blob(asset,generation)),secondPixel);}finally{reopened?.dispose();await value.close();}
});
test('a revoked provider guard refuses complete export without poisoning the next fresh read',async()=>{
 const value=await prepareLocalPortableCase(await host.fixture(),capture),asset='portable-revoked-provider',generation='new-pixels';let checks=0;
 try{replace(value,asset,generation);await assert.rejects(value.capture({resolveAsset(ref){return{...ref,identity:'host-verified',blob:new Blob([secondPixel],{type:'image/png'}),check(){if(++checks>=3)throw Error('Provider revoked');}};}}),error=>error.code==='asset_bytes_provider');assert.ok(checks>=3);assert.equal((await value.capture({resolveAsset(ref){return{...ref,identity:'host-verified',blob:new Blob([secondPixel],{type:'image/png'}),check(){}};}})).kind,'ready');assert.deepEqual(await bytes(await value.parts.uploads.exportBackup()),value.uploads);}finally{await value.close();}
});
test('a new generation cannot rebind an older globally immutable asset to different pixels',async()=>{
 const value=await prepareLocalPortableCase(await host.fixture(),capture);let calls=0;
 try{replace(value,value.f.reference.asset,'different-generation');await assert.rejects(value.capture({resolveAsset(ref){calls++;return{...ref,identity:'host-verified',blob:new Blob([secondPixel],{type:'image/png'}),check(){}};}}),error=>error.code==='asset_bytes_integrity');assert.equal(calls,1);assert.deepEqual(await bytes(await value.parts.uploads.exportBackup()),value.uploads);}finally{await value.close();}
});
