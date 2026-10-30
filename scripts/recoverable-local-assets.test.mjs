/** Byte-union/framing laws only. These fixtures do not authenticate a host or
 * replace the genuine Native owner tests. */
import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
import * as native from '../packages/breditor-collaboration/dist/runtime/breditor_shared.js';
import {localMetadataRecoverableRequirements as union} from '../packages/breditor-collaboration/dist/selected_local_metadata_assets/recoverable_requirements.js';
import {LocalMetadataRasterArchive as V1,encodeLocalMetadataRasters as encodeV1} from '../packages/breditor-collaboration/dist/selected_local_metadata_assets/raster_archive.js';
import {LocalMetadataRecoverableRasterArchive as V2,encodeLocalMetadataRecoverableRasters as encodeV2} from '../packages/breditor-collaboration/dist/selected_local_metadata_assets/recoverable_raster_archive.js';
import {pixel,secondPixel,ReviewFixtureImage} from './fixtures/review-assets/pixels.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),info=bytes=>({asset:'sha256:'+sha(bytes),mime:'image/png',bytes:bytes.length,width:1,height:1}),a=info(pixel),b=info(secondPixel),options={wasm:native,checkAuthority(){}};
await native.default({module_or_path:readFileSync(new URL('../packages/breditor-collaboration/dist/runtime/breditor_shared_bg.wasm',import.meta.url))});
const saved=Object.getOwnPropertyDescriptor(globalThis,'Image');Object.defineProperty(globalThis,'Image',{value:ReviewFixtureImage,configurable:true});test.after(()=>{if(saved)Object.defineProperty(globalThis,'Image',saved);else delete globalThis.Image;});
test('local bytes complete a union while the original provider still reports missing uploads',()=>{
 const reference={asset:b.asset,generation:'unpublished'},provider={assets:[a],resolutions:[{reference,contentAsset:b.asset}],missing:[{kind:'uploadBytes',contentAsset:b.asset},{kind:'bytes',reference,contentAsset:b.asset}]},before=JSON.stringify(provider),read=union([reference],new Map([[a.asset,a],[b.asset,b]]),provider);
 assert.equal(read.payloads.length,2);assert.deepEqual(read.unavailable,[]);assert.deepEqual(read.unresolved,[]);assert.equal(JSON.stringify(provider),before);
});
test('opaque mappings cannot be guessed from local blobs and missing bytes cannot become a complete prefix',()=>{
 const reference={asset:'opaque',generation:'g'},provider={assets:[a],resolutions:[],missing:[{kind:'mapping',reference}]};let result=union([reference],new Map([[a.asset,a]]),provider);assert.deepEqual(result.unresolved,[reference]);
 result=union([reference],new Map([[a.asset,a]]),{...provider,resolutions:[{reference,contentAsset:b.asset}]});assert.deepEqual(result.unresolved,[]);assert.deepEqual(result.unavailable,[b.asset]);
 assert.throws(()=>union([] ,new Map([[a.asset,{...a,width:2}]]),{assets:[a],resolutions:[]}));
});
test('separately framed V2 roundtrips missing-server observations without reinterpreting V1 bytes',async()=>{
 const refs={bytes:1,sha256:'a'.repeat(64)},availability={kind:'pending',note:'Recorded data only'},payloads=[{info:a,blob:new Blob([pixel],{type:'image/png'})},{info:b,blob:new Blob([secondPixel],{type:'image/png'})}].sort((x,y)=>x.info.asset<y.info.asset?-1:1),v1=await encodeV1(refs,availability,payloads,options),v2=await encodeV2(refs,availability,payloads,options),selection=({bytes,sha256})=>({bytes,sha256});
 await assert.rejects(V1.read(v2.file,selection(v2),options));await assert.rejects(V2.read(v1.file,selection(v1),options));
 const old=await V1.read(v1.file,selection(v1),options),next=await V2.read(v2.file,selection(v2),options);
 try{assert.equal(old.metadata().formatVersion,1);assert.equal(old.metadata().scope,'client-metadata-cut-and-recorded-provider-rasters');assert.equal(next.metadata().formatVersion,2);assert.equal(next.metadata().scope,'complete-client-cut-and-local-provider-raster-union');assert.deepEqual(next.metadata().availability,availability);for(const row of payloads)assert.deepEqual(await next.payload(row.info.asset).arrayBuffer(),await row.blob.arrayBuffer());}finally{old.dispose();next.dispose();}
});
test('the original V1 reader still admits actual previously captured Native fixture bytes',async()=>{
 const bytes=readFileSync(new URL('./fixtures/local-metadata/v1-materialized-rasters.archive',import.meta.url));assert.equal(bytes.length,18805);assert.equal(sha(bytes),'d644ea5ac7a61061ec22cfb35058af449c34a33b32bc9913a73fcea0b94354df');
 const archive=await V1.read(new Blob([bytes]),{bytes:18805,sha256:'d644ea5ac7a61061ec22cfb35058af449c34a33b32bc9913a73fcea0b94354df'},options);
 try{assert.equal(archive.metadata().formatVersion,1);assert.equal(archive.metadata().scope,'client-metadata-cut-and-recorded-provider-rasters');assert.equal(archive.metadata().payloads.length,2);assert.equal(archive.metadata().availability.uploads.length,14);}finally{archive.dispose();}
});
