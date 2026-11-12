/** Byte/raster framing tests only. Placeholder reference selections and
 * availability records are not native source or current provider evidence. */
import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
import * as native from '../packages/breditor-collaboration/dist/runtime/breditor_shared.js';
import {LocalMetadataRasterArchive as Archive,encodeLocalMetadataRasters as encode} from '../packages/breditor-collaboration/dist/selected_local_metadata_assets/raster_archive.js';
import {LocalMetadataRecoverableRasterArchive as RecoverableArchive,encodeLocalMetadataRecoverableRasters as encodeRecoverable} from '../packages/breditor-collaboration/dist/selected_local_metadata_assets/recoverable_raster_archive.js';
import {pixel,secondPixel,ReviewFixtureImage} from './fixtures/review-assets/pixels.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),reference={bytes:1,sha256:'a'.repeat(64)},options={wasm:native,checkAuthority(){}};
await native.default({module_or_path:readFileSync(new URL('../packages/breditor-collaboration/dist/runtime/breditor_shared_bg.wasm',import.meta.url))});
const saved=Object.getOwnPropertyDescriptor(globalThis,'Image');Object.defineProperty(globalThis,'Image',{value:ReviewFixtureImage,configurable:true});test.after(()=>{if(saved)Object.defineProperty(globalThis,'Image',saved);else delete globalThis.Image;});
const selectionOf=({bytes,sha256})=>({bytes,sha256});
const values=()=>[pixel,secondPixel].map(bytes=>({info:{asset:'sha256:'+sha(bytes),mime:'image/png',width:1,height:1,bytes:bytes.length},blob:new Blob([bytes],{type:'image/png'})})).sort((a,b)=>a.info.asset.localeCompare(b.info.asset));
async function mutate(source,edit){const raw=Buffer.from(await source.file.arrayBuffer()),magic=new TextEncoder().encode('BREDITOR_METADATA_RASTERS_V1\n'),size=raw.readUInt32LE(magic.length),body=raw.subarray(magic.length+4+size),header=JSON.parse(raw.subarray(magic.length+4,magic.length+4+size).toString('utf8'));edit(header);const encoded=Buffer.from(JSON.stringify(header)),prefix=Buffer.alloc(magic.length+4);prefix.set(magic);prefix.writeUInt32LE(encoded.length,magic.length);const file=new Blob([prefix,encoded,body]);return{file,bytes:file.size,sha256:sha(Buffer.from(await file.arrayBuffer()))};}
test('full payload bytes roundtrip with exact immutable content metadata',async()=>{
 for(const [write,Reader] of [[encode,Archive],[encodeRecoverable,RecoverableArchive]]){
  const payloads=values(),availability={kind:'fixture-only-data'},references={...reference};
  const expected=await write(references,availability,payloads,options);
  const selected=await write(references,availability,payloads,{...options,checkAuthority(){
   references.sha256='b'.repeat(64);
   availability.kind='updated-during-check';
   payloads.length=0;
  }});
  assert.deepEqual(selectionOf(selected),selectionOf(expected),'Retain the input selected before the authority check');
  assert.deepEqual(await selected.file.arrayBuffer(),await expected.file.arrayBuffer());
  let checks=0;
  const changingOptions={...options,checkAuthority(){
   checks++;
   changingOptions.checkAuthority=()=>{throw Error('Replaced authority callback');};
   changingOptions.wasm=undefined;
  }};
  const pinned=await write(reference,{kind:'fixture-only-data'},values(),changingOptions);
  assert.ok(checks>1);
  assert.deepEqual(selectionOf(pinned),selectionOf(expected));
  const archive=await Reader.read(selected.file,selectionOf(selected),options);
  try{
   assert.deepEqual(archive.metadata().references,reference);
   assert.deepEqual(archive.metadata().availability,{kind:'fixture-only-data'});
   assert.equal(archive.metadata().payloads.length,2);
   for(const row of values())assert.deepEqual(await archive.payload(row.info.asset).arrayBuffer(),await row.blob.arrayBuffer());
   assert.equal(Object.isFrozen(archive.metadata()),true);
   assert.equal('activate'in archive,false);
   assert.equal('verifyNativeSource'in archive,false);
  }finally{archive.dispose();}
  assert.throws(()=>archive.payload(values()[0].info.asset));
 }
});
test('unknown formats/fields, overlapping offsets and mismatched raster metadata refuse',async()=>{const selected=await encode(reference,null,values(),options);for(const edit of [row=>{row.formatVersion=2;},row=>{row.extra=true;},row=>{row.payloads[1].offset=0;},row=>{row.payloads[0].width=2;},row=>{row.payloads.reverse();},row=>{row.payloads[0].asset='opaque';}]){const changed=await mutate(selected,edit);await assert.rejects(Archive.read(changed.file,selectionOf(changed),options));}});
test('whole-file identity and raw pixel hashes both precede a successful read',async t=>{
 for(const [write,Reader] of [[encode,Archive],[encodeRecoverable,RecoverableArchive]]){
  const selected=await write(reference,null,values(),options),raw=Buffer.from(await selected.file.arrayBuffer());
  const headerBytes=raw.readUInt32LE(Buffer.byteLength('BREDITOR_METADATA_RASTERS_V1\n'));
  const read=Blob.prototype.arrayBuffer,reads=[];
  const mock=t.mock.method(Blob.prototype,'arrayBuffer',function(){
   reads.push(this.size);
   return read.call(this);
  });
  try{
   const archive=await Reader.read(selected.file,selectionOf(selected),options);
   archive.dispose();
  }finally{mock.mock.restore();}
  assert.ok(reads.includes(raw.length));
  assert.ok(!reads.includes(headerBytes),'The decoded header must come from the full verified read');
  raw[raw.length-1]^=1;
  const file=new Blob([raw]);
  await assert.rejects(Reader.read(file,selectionOf(selected),options));
  await assert.rejects(Reader.read(file,{bytes:file.size,sha256:sha(raw)},options));
  await assert.rejects(Reader.read(selected.file,{bytes:selected.bytes-1,sha256:selected.sha256},options));
 }
});
test('complete payload budgets refuse a prefix and large headers use bounded reads',async()=>{const payloads=values();await assert.rejects(encode(reference,null,payloads,options,{maxStoredBytes:payloads[0].info.bytes}));await assert.rejects(encode(reference,null,payloads.toReversed(),options));const metadata={kind:'data-only',text:'x'.repeat(1024*1024+200)},selected=await encode(reference,metadata,payloads,options),archive=await Archive.read(selected.file,selectionOf(selected),options);try{assert.deepEqual(archive.metadata().availability,metadata);}finally{archive.dispose();}});
