/** Server-slot boundary/hash/lifetime component checks. Dummy selected files
 * here do not prove Native server replay, a genuine controller or activation. */
import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
import * as native from '../packages/breditor-collaboration/dist/runtime/breditor_shared.js';
import {prepareRecoveryServerInputs,recoveryBytesServerSelection} from '../packages/breditor-collaboration/dist/selected_local_metadata_assets/recovery_server_inputs.js';
import {prepareLocalMetadataRecoveryBytesInput} from '../packages/breditor-collaboration/dist/selected_local_metadata_assets/recovery_bytes_input.js';
import {captureLocalMetadataRecoveryFiles} from '../packages/breditor-collaboration/dist/selected_local_metadata_assets/recovery_bytes_capture.js';
import {localMetadataAvailabilityHost} from '../packages/breditor-collaboration/dist/selected_local_metadata_assets/availability_host.js';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
await native.default({module_or_path:readFileSync(new URL('../packages/breditor-collaboration/dist/runtime/breditor_shared_bg.wasm',import.meta.url))});
test('copied readers cannot invoke public callbacks as private selected-file authority',()=>{
 let calls=0;const copied={file(){calls++;return new Blob(['x']);},identity(){calls++;return{};}};assert.throws(()=>prepareRecoveryServerInputs(copied,copied,{}));assert.equal(calls,0);
});
test('closed input descriptors and actual host brands are required before IO',()=>{
 let calls=0;const row={host:{selection(){calls++;}},transport:{readBytes(){calls++;}},server:{},inventory:{}};assert.throws(()=>prepareLocalMetadataRecoveryBytesInput(row));assert.equal(calls,0);
 const accessor={};Object.defineProperty(accessor,'host',{enumerable:true,get(){calls++;return row.host;}});assert.throws(()=>prepareLocalMetadataRecoveryBytesInput(accessor));assert.equal(calls,0);
 const value=recoveryBytesServerSelection({kind:'source',selection:{source:{fixtureOnly:true}}});assert.deepEqual(value,{fixtureOnly:true});assert.throws(()=>localMetadataAvailabilityHost(value));
});
test('actual Native hashes cover both complete files between host checks',async()=>{
 const server=new Blob(['server component bytes']),inventory=new Blob(['inventory component bytes']),serverSha=sha(Buffer.from(await server.arrayBuffer())),inventorySha=sha(Buffer.from(await inventory.arrayBuffer()));let checks=0,hostChecks=0;
 const selected={server,inventory,identity:{archiveSha256:[...Buffer.from(serverSha,'hex')]},participants:{sha256:[...Buffer.from(inventorySha,'hex')]},check(){checks++;}},result=await captureLocalMetadataRecoveryFiles({fixtureOnly:true},selected,{wasm:native,checkAuthority(){}},()=>{},async()=>{hostChecks++;});
 assert.equal(result.server.sha256,serverSha);assert.equal(result.inventory.sha256,inventorySha);assert.equal(hostChecks,2);assert.ok(checks>0);assert.equal('activate'in result,false);
 await assert.rejects(captureLocalMetadataRecoveryFiles({fixtureOnly:true},{...selected,server:new Blob(['modified component bytes'])},{wasm:native,checkAuthority(){}},()=>{},async()=>{}));
});
test('an ended selected-reader lifetime cannot return a byte bundle after an awaited host check',async()=>{
 let alive=true;const selected={server:new Blob(['x']),inventory:new Blob(['y']),identity:{archiveSha256:[]},participants:{sha256:[]},check(){if(!alive)throw Error('Selected reader ended');}};
 await assert.rejects(captureLocalMetadataRecoveryFiles({fixtureOnly:true},selected,{wasm:native,checkAuthority(){}},()=>{},async()=>{alive=false;}));
});
