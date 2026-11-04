/** Compact DATA contracts, native hashing and admission refusal. Actual live
 * journal/Native ownership coverage remains a separate functional workset. */
import test,{before}from'node:test';import assert from'node:assert/strict';import{createHash}from'node:crypto';import{readFileSync}from'node:fs';
import * as native from'../packages/breditor-collaboration/dist/runtime/breditor_shared.js';
import{captureMetadataContinuationPins as capture}from'../packages/breditor-collaboration/dist/metadata_continuation_pins/capture.js';
import{compareMetadataContinuationPins as compare}from'../packages/breditor-collaboration/dist/metadata_continuation_pins/compare.js';
import{metadataContinuationEvidencePins as admit}from'../packages/breditor-collaboration/dist/metadata_continuation_pins/identity.js';
import{withHeldMetadataContinuationPins}from'../packages/breditor-collaboration/dist/metadata_continuation_pins/held_evidence.js';
import{jointReassociationPriorMetadataList}from'../packages/breditor-collaboration/dist/native_room_joint_reassociation/identity.js';
import{metadataPinsFixture}from'./fixtures/metadata-pins/read.mjs';
const sha=data=>createHash('sha256').update(data).digest('hex'),size=value=>Buffer.byteLength(JSON.stringify(value));
const fixture=metadataPinsFixture(),options=()=>({wasm:native,checkAuthority(){}});let completed;
before(async()=>{await native.default({module_or_path:readFileSync(new URL('../packages/breditor-collaboration/dist/runtime/breditor_shared_bg.wasm',import.meta.url))});completed=await capture(fixture.evidence.at(-1),options());});
for(const[index,evidence]of fixture.evidence.entries())test('canonical source phase '+index+' '+evidence.phase+' preserves exact text lengths and native hashes',async()=>{
 const result=await capture(evidence,options());assert.equal(result.phase,evidence.phase);assert.deepEqual(result.choice,evidence.choice);
 for(const key of['review','metadata']){
  assert.deepEqual(result[key],evidence[key]===null?null:{bytes:Buffer.byteLength(evidence[key]),sha256:sha(evidence[key])});if(result[key])assert.ok(Object.isFrozen(result[key]));
 }
 assert.ok(Object.isFrozen(result));assert.equal('takeOwner'in result,false);assert.equal('ready'in result,false);
 assert.deepEqual(await compare(result,evidence,options()),result);
});
test('complete metadata is compact without dropping journal identity, revisions or source text pins',async()=>{
 assert.ok(size(fixture.evidence.at(-1))>1024*1024);assert.ok(size(completed)<64*1024);assert.equal(completed.choice.database,fixture.evidence.at(-1).choice.database);
 assert.ok(completed.review.bytes>0&&completed.metadata.bytes>0);assert.equal(typeof completed.review,'object');assert.equal(typeof completed.metadata,'object');
});
test('same-size wrong snapshot digest or length cannot pass comparison',async()=>{
 for(const edit of[value=>value.review.sha256='0'.repeat(64),value=>value.metadata.bytes++,value=>value.choice.database+='-other']){
  const selected=structuredClone(completed);edit(selected);await assert.rejects(compare(selected,fixture.evidence.at(-1),options()));
 }
});
test('a canonical later journal revision is stale against an earlier compact observation',async()=>{
 const current=structuredClone(fixture.evidence.at(-1)),review=JSON.parse(current.review);review.current.revision++;current.review=JSON.stringify(review);
 await assert.rejects(compare(completed,current,options()),error=>error.code==='metadata_pins_stale');
});
test('new compact records and original text observations remain separate closed families',async()=>{
 assert.throws(()=>jointReassociationPriorMetadataList([completed]));assert.throws(()=>admit(fixture.evidence.at(-1)));
 for(const edit of[value=>value.formatVersion=2,value=>value.ready=true,value=>value.metadata='payload',value=>value.review.bytes=0,value=>value.phase='review']){
  const value=structuredClone(completed);edit(value);assert.throws(()=>admit(value));
 }
});
test('caller changes after invocation and during authority checking cannot replace captured data',async()=>{
 const input=structuredClone(fixture.evidence.at(-1));let changed=false;
 const pending=capture(input,{wasm:native,checkAuthority(){if(!changed){changed=true;input.review='{}';input.metadata='{}';input.choice.database='changed';}}});
 input.phase='absent';const result=await pending;assert.ok(changed);assert.deepEqual(result,completed);
});
test('input accessors are refused without execution or authority callbacks',async()=>{
 let calls=0;const input=structuredClone(fixture.evidence.at(-1));Object.defineProperty(input,'review',{enumerable:true,get(){calls++;throw Error('No getter');}});
 await assert.rejects(capture(input,{wasm:native,checkAuthority(){calls++;}}));assert.equal(calls,0);
});
test('noncanonical or malformed original text is rejected rather than normalized',async()=>{
 for(const text of['{}',fixture.evidence.at(-1).review+' ','not JSON']){
  const input=structuredClone(fixture.evidence.at(-1));input.review=text;await assert.rejects(capture(input,options()));
 }
});
test('cancelled hashing supplies no compact result',async()=>{
 const stop=new AbortController();stop.abort();await assert.rejects(capture(fixture.evidence.at(-1),{...options(),signal:stop.signal}));
});
test('copied live contexts fail before reflecting expected data or entering any visitor',async()=>{
 let reflected=0,visited=0;const poison=new Proxy({},{ownKeys(){reflected++;throw Error('No reflection');},get(){reflected++;throw Error('No reflection');}});
 await assert.rejects(withHeldMetadataContinuationPins({}, {},poison,()=>{visited++;throw Error('No visit');}),error=>error.code==='metadata_continuation_closed');
 assert.equal(reflected,0);assert.equal(visited,0);
});
