/** Exact metadata bodies survive portable DATA roundtrips. No saved file grants
 * Native, storage or publication authority; live admission is tested separately. */
import test,{before}from'node:test';import assert from'node:assert/strict';import{createHash}from'node:crypto';import{readFileSync}from'node:fs';
import * as native from'../packages/breditor-collaboration/dist/runtime/breditor_shared.js';
import{captureMetadataContinuationPinArchive as capture}from'../packages/breditor-collaboration/dist/metadata_continuation_pins/capture_archive.js';
import{readMetadataContinuationPinArchive as read}from'../packages/breditor-collaboration/dist/metadata_continuation_pins/read_archive.js';
import{metadataPinsFixture}from'./fixtures/metadata-pins/read.mjs';
const fixture=metadataPinsFixture(),options=()=>({wasm:native,checkAuthority(){}}),sha=data=>createHash('sha256').update(data).digest('hex');let complete;
before(async()=>{await native.default({module_or_path:readFileSync(new URL('../packages/breditor-collaboration/dist/runtime/breditor_shared_bg.wasm',import.meta.url))});complete=await capture(fixture.evidence.at(-1),options());});
for(const[index,evidence]of fixture.evidence.entries())test('archive phase '+index+' '+evidence.phase+' retains and reconstructs both exact canonical snapshots',async()=>{
 const archive=await capture(evidence,options());assert.ok(Object.isFrozen(archive));
 for(const key of['review','metadata'])if(evidence[key]===null)assert.equal(archive[key],null);else{
  assert.ok(Object.isFrozen(archive[key]));const bytes=Buffer.from(await archive[key].arrayBuffer());assert.equal(bytes.toString('utf8'),evidence[key]);assert.deepEqual(archive.pins[key],{bytes:bytes.length,sha256:sha(bytes)});
 }
 // Structured transport deliberately loses JS identity; the complete owned
 // byte copies and independently retained expected pins still reconstruct DATA.
 const transported=structuredClone(archive),restored=await read(transported,structuredClone(archive.pins),options());
 assert.deepEqual(restored,evidence);assert.ok(Object.isFrozen(restored));assert.ok(Object.isFrozen(restored.choice));assert.equal('check'in restored,false);
});
test('archive capture detaches caller data before callbacks and asynchronous work',async()=>{
 const input=structuredClone(fixture.evidence.at(-1));let calls=0;const pending=capture(input,{wasm:native,checkAuthority(){calls++;input.metadata='{}';input.choice.database='changed';}});input.review='{}';
 const result=await pending;assert.ok(calls>0);assert.deepEqual(result.pins,complete.pins);assert.equal(await result.review.text(),fixture.evidence.at(-1).review);assert.equal(await result.metadata.text(),fixture.evidence.at(-1).metadata);
});
test('archive read detaches files and independent selection before callbacks and awaits',async()=>{
 const input=structuredClone(complete),expected=structuredClone(complete.pins);let changed=false;
 const pending=read(input,expected,{wasm:native,checkAuthority(){if(!changed){changed=true;input.review=new Blob(['{}']);input.metadata=null;input.pins.choice.database='changed';expected.metadata.sha256='0'.repeat(64);}}});
 input.format='changed';assert.deepEqual(await pending,fixture.evidence.at(-1));assert.ok(changed);
});
test('same-size changed body is refused against the independent original hash',async()=>{
 const input=structuredClone(complete),bytes=Buffer.from(await input.review.arrayBuffer());bytes[bytes.length-1]^=1;input.review=new Blob([bytes]);
 await assert.rejects(read(input,complete.pins,options()),error=>error.code==='metadata_pins_stale');
});
test('mismatched independent pins, missing bodies, length and combined budget refuse before callbacks',async()=>{
 let calls=0;const opts={wasm:native,checkAuthority(){calls++;}};
 const changed=structuredClone(complete.pins);changed.review.sha256='0'.repeat(64);await assert.rejects(read(complete,changed,opts));
 for(const edit of[value=>value.metadata=null,value=>value.review=new Blob(['{}']),value=>value.pins.metadata.bytes=32*1024*1024,value=>value.extra=true,value=>value.formatVersion=2]){
  const input=structuredClone(complete);edit(input);await assert.rejects(read(input,complete.pins,opts));
 }
 assert.equal(calls,0);
});
test('closed archive accessors are rejected without execution or callbacks',async()=>{
 let calls=0;const input=structuredClone(complete);Object.defineProperty(input,'review',{enumerable:true,get(){calls++;throw Error('No getter');}});
 await assert.rejects(read(input,complete.pins,{wasm:native,checkAuthority(){calls++;}}));assert.equal(calls,0);
});
test('native Blob bytes determine selection, without subclass size, type or read accessors',async()=>{
 let calls=0;class MisleadingBlob extends Blob{get size(){calls++;return 1;}get type(){calls++;throw Error('No type getter');}arrayBuffer(){calls++;throw Error('No read method');}slice(){calls++;throw Error('No slice method');}}
 const input={...complete,review:new MisleadingBlob([await complete.review.arrayBuffer()]),metadata:new MisleadingBlob([await complete.metadata.arrayBuffer()])};
 assert.deepEqual(await read(input,complete.pins,options()),fixture.evidence.at(-1));assert.equal(calls,0);
});
test('even independently matching hashes cannot admit noncanonical JSON, a BOM or invalid UTF-8',async()=>{
 const original=Buffer.from(await complete.review.arrayBuffer());
 for(const bytes of[Buffer.concat([original,Buffer.from(' ')]),Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),original]),Buffer.from([0xff,0xfe])]){
  const pins=structuredClone(complete.pins);pins.review={bytes:bytes.length,sha256:sha(bytes)};
  await assert.rejects(read({...complete,pins,review:new Blob([bytes])},pins,options()));
 }
});
test('a valid body selected under the wrong original binding is rejected',async()=>{
 const other=structuredClone(complete.pins);other.choice.review.database+='-other';
 await assert.rejects(read({...complete,pins:other},other,options()));
});
test('cancelled archive admission returns no reconstructed evidence',async()=>{
 const stop=new AbortController();let calls=0;
 await assert.rejects(read(complete,complete.pins,{wasm:native,signal:stop.signal,checkAuthority(){if(++calls===4)stop.abort();}}),error=>error.code==='archive_aborted');assert.equal(calls,4);
});

test('the bytes used to verify the snapshot are the bytes decoded into evidence', async () => {
 const original = fixture.evidence.at(-1).metadata;
 const changed = JSON.parse(original);
 const revision = changed.current.revision;
 changed.current.revision++;
 const substituted = new TextEncoder().encode(JSON.stringify(changed));
 assert.equal(substituted.byteLength, complete.pins.metadata.bytes);
 assert.notEqual(sha(substituted), complete.pins.metadata.sha256);
 assert.ok(substituted.byteLength <= 1024 * 1024);
 const readBuffer = Blob.prototype.arrayBuffer;
 let reads = 0;
 try {
  // An I/O fault returns a valid but different snapshot on the second read.
  // The first read still matches the independently selected digest.
  Blob.prototype.arrayBuffer = function () {
   if (this.size === substituted.byteLength && ++reads === 2) return Promise.resolve(substituted.buffer.slice(0));
   return readBuffer.call(this);
  };
  const restored = await read(complete, complete.pins, options());
  assert.equal(JSON.parse(restored.metadata).current.revision, revision);
  assert.equal(reads, 1);
 } finally {
  Blob.prototype.arrayBuffer = readBuffer;
 }
});
