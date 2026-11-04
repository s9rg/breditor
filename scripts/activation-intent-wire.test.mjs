/** Real Rust hashing with controlled Node storage; these DATA laws grant no
 * actor, live Native control, authenticated response or serving authority. */
import test,{before,beforeEach,afterEach} from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
import * as native from '../packages/breditor-collaboration/dist/runtime/breditor_shared.js';
import {encodeRoomActivationIntent as encode} from '../packages/breditor-collaboration/dist/room_native_activation_intent/encode.js';
import {decodeRoomActivationIntent as decode} from '../packages/breditor-collaboration/dist/room_native_activation_intent/decode.js';
import {rebindDecodedRoomActivationIntent as rebind} from '../packages/breditor-collaboration/dist/room_native_activation_intent/rebind.js';
import {snapshotRoomActivationEncodedCapture as snapshot} from '../packages/breditor-collaboration/dist/room_native_activation_intent/snapshot_encoded.js';
import {RoomActivationIntentStore as Store} from '../packages/breditor-collaboration/dist/room_native_activation_intent/store.js';
import {roomActivationIntentChoice} from '../packages/breditor-collaboration/dist/room_native_activation_intent/identity.js';
import {nativeActivationSelection} from '../packages/breditor-collaboration/dist/native_activation_control/identity.js';
import {captureFixture} from './fixtures/native-activation/capture.mjs';
import {environment} from './fixtures/room-participant-inventory/environment.mjs';
const sha=value=>createHash('sha256').update(value).digest('hex'),options={wasm:native,checkAuthority(){}};
let base,reset;
before(async()=>{await native.default({module_or_path:readFileSync(new URL('../packages/breditor-collaboration/dist/runtime/breditor_shared_bg.wasm',import.meta.url))});const f=captureFixture({marker:'selected-marker',numeric:{0:'zero',2:'two'},a:new Blob(['same'],{type:'image/png'}),b:new Blob(['same'],{type:'image/webp'})});base=await encode('wire-original',f.activation,f.capture,options);});
beforeEach(()=>{reset=environment();});afterEach(()=>reset());
const fresh=()=>nativeActivationSelection({...base.choice.activation,instance:base.choice.activation.instance==='1'.repeat(64)?'2'.repeat(64):'1'.repeat(64)});
function variant(graph,objects=base.objects){const bytes=Buffer.byteLength(graph);return{choice:roomActivationIntentChoice({...base.choice,graph:{bytes,sha256:sha(graph)},objects:objects.map(file=>({bytes:file.size,sha256:base.choice.objects[base.objects.indexOf(file)].sha256})),totalBytes:base.choice.totalBytes-base.choice.graph.bytes+bytes}),graph,objects};}
function walk(value,visit){if(!Array.isArray(value))return;visit(value);for(const child of value)walk(child,visit);}
async function exact(saved){
 const restored=await decode(saved,options),activation=fresh(),value=await rebind('wire-fresh',activation,restored,options);
 assert.deepEqual(value.choice,{...saved.choice,database:'wire-fresh',activation});assert.equal(value.graph,saved.graph);
 assert.ok(Object.isFrozen(value));assert.ok(Object.isFrozen(value.objects));
 for(let i=0;i<value.objects.length;i++)assert.deepEqual(new Uint8Array(await value.objects[i].arrayBuffer()),new Uint8Array(await saved.objects[i].arrayBuffer()));
 assert.equal(restored.reconciliation.sources.local.samples.a.type,'image/png');assert.equal(restored.reconciliation.sources.local.samples.b.type,'image/webp');
 assert.deepEqual(await indexedDB.databases(),[]);return restored;
}
test('reassociation preserves an admitted graph-header order without changing the canonical fresh encoder',async()=>{
 const raw=JSON.parse(base.graph),saved=variant(JSON.stringify({body:raw.body,formatVersion:raw.formatVersion,format:raw.format}));assert.notEqual(saved.graph,base.graph);
 const restored=await exact(saved),canonical=await encode('wire-fresh',fresh(),restored,options);assert.equal(canonical.graph,base.graph);assert.notEqual(canonical.graph,saved.graph);
});
test('reassociation preserves admitted object-index order and complete byte pins',async()=>{
 const raw=JSON.parse(base.graph),count=base.objects.length;assert.ok(count>1);walk(raw.body,row=>{if(row.length===3&&row[0]==='b'&&typeof row[1]==='number'&&typeof row[2]==='string')row[1]=count-1-row[1];});await exact(variant(JSON.stringify(raw),base.objects.toReversed()));
});
test('reassociation preserves literal numeric-property entry order admitted by the decoder',async()=>{
 const raw=JSON.parse(base.graph);let changed=0;walk(raw.body,row=>{if(row[0]==='o'&&Array.isArray(row[1])&&row[1].length===2&&row[1][0]?.[0]==='0'&&row[1][0]?.[1]==='zero'&&row[1][1]?.[0]==='2'){row[1].reverse();changed++;}});assert.equal(changed,1);await exact(variant(JSON.stringify(raw)));
});
test('canonical capture rebinding retains the same graph and rejects a different Native cut',async()=>{
 const restored=await exact(base),other=structuredClone(base.choice.activation);other.current.server.native.manifest[0]^=1;other.current.participants.source=structuredClone(other.current.server.native);
 await assert.rejects(rebind('wire-other',other,restored,options),error=>error.code==='activation_intent_stale');
});
function swappingModule(mutate){let changed=false;return{SharedArchiveDigest:{version:()=>native.SharedArchiveDigest.version(),maximum_bytes:()=>native.SharedArchiveDigest.maximum_bytes(),maximum_chunk_bytes:()=>native.SharedArchiveDigest.maximum_chunk_bytes(),create(bytes){const owner=native.SharedArchiveDigest.create(bytes);return{update:value=>owner.update(value),finish(){const digest=owner.finish();if(!changed){changed=true;mutate();}return digest;},free:()=>owner.free()};}}};}
test('decoder returns only the graph whose Native hash it checked when a caller changes its DTO',async()=>{
 const input={...base},replacement=base.graph.replace('selected-marker','replaced-marker');assert.notEqual(replacement,base.graph);
 const restored=await decode(input,{...options,wasm:swappingModule(()=>{input.graph=replacement;})});assert.equal(input.graph,replacement);assert.equal(restored.reconciliation.sources.local.samples.marker,'selected-marker');
 const rebound=await rebind('wire-fresh',fresh(),restored,options);assert.equal(rebound.graph,base.graph);
});
test('absent-only storage persists its validated snapshot rather than later caller graph or array values',async()=>{
 for(const changeObjects of [false,true]){
  const choice=roomActivationIntentChoice({...base.choice,database:'wire-mutable-'+changeObjects}),input={choice,graph:base.graph,objects:[...base.objects]},store=new Store(choice,{...options,wasm:swappingModule(()=>{input.graph=base.graph.replace('selected-marker','replaced-marker');if(changeObjects)input.objects[0]=new Blob(['changed']);})});let cold;
  try{const warm=await store.open(input);assert.equal(warm.capture.reconciliation.sources.local.samples.marker,'selected-marker');await store.close();cold=new Store(choice,options);const reopened=await cold.open();const rebound=await rebind('wire-fresh',fresh(),reopened.capture,options);assert.equal(rebound.graph,base.graph);assert.deepEqual(rebound.choice.objects,base.choice.objects);}finally{await cold?.close();await store.close();}
 }
});
test('logical copies cannot invent retained wire provenance and input accessors are not invoked',async()=>{
 const restored=await decode(base,options);let calls=0;const poison=new Proxy({},{get(){calls++;throw Error('No input reflection');},ownKeys(){calls++;throw Error('No input reflection');}});
 for(const copied of [{...restored},new Proxy(restored,{get(){calls++;throw Error('No capture reflection');}})])await assert.rejects(rebind('wire-fresh',poison,copied,poison),error=>error.code==='activation_intent_policy');
 const input={...base};Object.defineProperty(input,'graph',{enumerable:true,get(){calls++;throw Error('No graph getter');}});assert.throws(()=>snapshot(input));assert.equal(calls,0);
});
test('rebinding rehashes original bytes and drains a real digest owner when authority aborts',async()=>{
 const restored=await decode(base,options),stop=new AbortController();let created=0,freed=0;
 const wasm={SharedArchiveDigest:{version:()=>native.SharedArchiveDigest.version(),maximum_bytes:()=>native.SharedArchiveDigest.maximum_bytes(),maximum_chunk_bytes:()=>native.SharedArchiveDigest.maximum_chunk_bytes(),create(bytes){created++;const owner=native.SharedArchiveDigest.create(bytes);return{update:value=>owner.update(value),finish:()=>owner.finish(),free(){owner.free();freed++;}};}}};
 await assert.rejects(rebind('wire-fresh',fresh(),restored,{wasm,signal:stop.signal,checkAuthority(){if(created)stop.abort();}}),error=>error.code==='archive_aborted');assert.equal(created,1);assert.equal(freed,1);assert.deepEqual(await indexedDB.databases(),[]);
});
