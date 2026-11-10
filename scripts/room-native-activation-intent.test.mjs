/** Actual normal Rust hashing and controlled Node IDB. No Native activation is inferred. */
import test,{before,beforeEach,afterEach} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {IDBObjectStore} from 'fake-indexeddb';
import {environment} from './fixtures/room-participant-inventory/environment.mjs';
import {assertActivationReopensAfterFailedClose,assertActivationReopensAfterLateClose} from './fixtures/late-activation-intent-open.mjs';
import * as native from '../packages/breditor-collaboration/dist/runtime/breditor_shared.js';
import {encodeRoomActivationIntent as encode} from '../packages/breditor-collaboration/dist/room_native_activation_intent/encode.js';
import {decodeRoomActivationIntent as decode} from '../packages/breditor-collaboration/dist/room_native_activation_intent/decode.js';
import {RoomActivationIntentStore as Store} from '../packages/breditor-collaboration/dist/room_native_activation_intent/store.js';
import {prepareHeldRoomActivation} from '../packages/breditor-collaboration/dist/room_native_activation_intent/prepare.js';
import {nativeActivationSelection} from '../packages/breditor-collaboration/dist/native_activation_control/identity.js';
import {captureFixture} from './fixtures/native-activation/capture.mjs';
import {receipt} from './fixtures/native-activation/transport.mjs';
let reset,base;const options={wasm:native,checkAuthority(){}};
before(async()=>{await native.default({module_or_path:readFileSync(new URL('../packages/breditor-collaboration/dist/runtime/breditor_shared_bg.wasm',import.meta.url))});const f=captureFixture();base=await encode('activation-intent',f.activation,f.capture,options);});
beforeEach(()=>{reset=environment();});afterEach(()=>reset());
const selected=()=>nativeActivationSelection(base.choice.activation),code=value=>e=>{
 if(e?.code!==value)console.error('ACTIVATION_INTENT_UNEXPECTED_REFUSAL '+JSON.stringify({expectedCode:value,actualCode:e?.code,name:e?.name,readFailure:Object.getOwnPropertyDescriptor(e,'readFailure')?.value,stack:e?.stack}));
 return e?.code===value;
};
async function raw(name,upgrade){return new Promise((resolve,reject)=>{const q=indexedDB.open(name,1);q.onupgradeneeded=()=>upgrade?.(q.result);q.onerror=()=>reject(q.error);q.onsuccess=()=>resolve(q.result);});}
async function put(db,key,value){return new Promise((resolve,reject)=>{const tx=db.transaction('activation','readwrite');tx.objectStore('activation').put(value,key);tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});}
test('tagged graph preserves literal Pending data, marker-shaped arrays, undefined, negative zero and Blob MIME',async()=>{
 const samples={text:'日本 🙂',optional:undefined,negative:-0,array:['b',0,'n','o'],a:new Blob(['same'],{type:'image/png'}),b:new Blob(['same'],{type:'image/webp'})};Object.defineProperty(samples,'__proto__',{value:{keep:'data'},enumerable:true});const f=captureFixture(samples),saved=await encode('activation-intent',f.activation,f.capture,options),restored=await decode(saved,options),value=restored.reconciliation.sources.local.samples;
 assert.equal(restored.recovery.kind,'pending');assert.deepEqual(restored.reconciliation.pending,[{kind:'sources'}]);assert.equal(value.text,samples.text);assert.ok(Object.hasOwn(value,'optional'));assert.equal(value.optional,undefined);assert.ok(Object.is(value.negative,-0));assert.deepEqual(value.array,samples.array);assert.deepEqual(value.__proto__,{keep:'data'});assert.equal(Object.getPrototypeOf(value),Object.prototype);assert.equal(value.a.type,'image/png');assert.equal(value.b.type,'image/webp');assert.equal(await value.a.text(),'same');assert.equal(await value.b.text(),'same');assert.ok(Object.isFrozen(value));assert.ok(Object.isFrozen(value.a));assert.equal(saved.choice.objects.filter(pin=>pin.bytes===4).length,1);
});
test('decoded capture remains immutable and exactly re-encodes for an explicitly fresh Native association',async()=>{
 const samples={optional:undefined,negative:-0,array:['b',0,'n','o'],a:new Blob(['same'],{type:'image/png'}),b:new Blob(['same'],{type:'image/webp'})};
 Object.defineProperty(samples,'__proto__',{value:{literal:'日本 🙂'},enumerable:true});
 const f=captureFixture(samples),saved=await encode('activation-intent',f.activation,f.capture,options),restored=await decode(saved,options);
 assert.ok(Object.isFrozen(restored),'The decoder must preserve the encoder\'s immutable root contract');
 assert.throws(()=>Object.defineProperty(restored,'extra',{value:true}),TypeError);
 const same=await encode(saved.choice.database,saved.choice.activation,restored,options);
 assert.deepEqual(same.choice,saved.choice);assert.equal(same.graph,saved.graph);
 for(let i=0;i<same.objects.length;i++)assert.deepEqual(new Uint8Array(await same.objects[i].arrayBuffer()),new Uint8Array(await saved.objects[i].arrayBuffer()));
 const next=nativeActivationSelection({...saved.choice.activation,instance:saved.choice.activation.instance==='1'.repeat(64)?'2'.repeat(64):'1'.repeat(64)});
 const fresh=await encode('fresh-activation-intent',next,restored,options);
 assert.deepEqual(fresh.choice,{...saved.choice,database:'fresh-activation-intent',activation:next});assert.equal(fresh.graph,saved.graph);
 assert.deepEqual(await indexedDB.databases(),[]);assert.equal(Object.isFrozen(restored),true);
});
test('changed same-length object bytes and altered graph bytes refuse without normalization',async()=>{
 const bad={...base,objects:[...base.objects]},first=bad.objects[0],bytes=new Uint8Array(await first.arrayBuffer());bytes[0]^=1;bad.objects[0]=new Blob([bytes],{type:first.type});await assert.rejects(decode(bad,options));await assert.rejects(decode({...base,graph:base.graph+' '},options));
});
test('a foreign native target cannot be paired with otherwise valid retained source bytes',async()=>{const f=captureFixture(),other=structuredClone(f.activation);other.current.server.native.manifest[0]^=1;other.current.participants.source=structuredClone(other.current.server.native);await assert.rejects(encode('activation-intent',other,f.capture,options));});
test('input accessors are refused without invoking them',async()=>{const f=captureFixture(),root={...f.capture};let calls=0;Object.defineProperty(root,'binding',{enumerable:true,get(){calls++;return f.capture.binding;}});Object.freeze(root);await assert.rejects(encode('activation-intent',f.activation,root,options));assert.equal(calls,0);});
test('Pending byte recovery never invokes host provisioning or choice persistence',async()=>{const f=captureFixture();let calls=0;await assert.rejects(prepareHeldRoomActivation(f.capture,{database:'intent',selectActivation(){calls++;throw 0;},retainChoice(){calls++;}},options,()=>{}),code('activation_intent_incomplete'));assert.equal(calls,0);assert.deepEqual(await indexedDB.databases(),[]);});
test('absent-only full retention and existing-only reopen preserve advisory state',async()=>{const a=new Store(base.choice,options);let b;try{const opened=await a.open(base);assert.equal(opened.state.phase,'prepared');const started=await a.markRequestStarted();assert.equal(started.state.phase,'request-started');const done=await a.markReceiptObserved(JSON.parse(receipt(selected())));assert.equal(done.state.phase,'receipt-observed');assert.equal(done.state.revision,2);await a.close();b=new Store(base.choice,options);const cold=await b.open();assert.equal(cold.state.phase,'receipt-observed');assert.equal(cold.capture.recovery.kind,'pending');assert.equal('activate'in cold,false);assert.equal('ready'in cold,false);assert.deepEqual(cold.choice,base.choice);assert.ok(Object.isFrozen(cold.capture));const reencoded=await encode('cold-reassociated-intent',cold.choice.activation,cold.capture,options);assert.equal(reencoded.graph,base.graph);assert.deepEqual(reencoded.choice.objects,base.choice.objects);}finally{await b?.close();await a.close();}});
test('missing existing-only intent does not create a placeholder namespace',async()=>{const s=new Store(base.choice,options);try{await assert.rejects(s.open(),code('activation_intent_missing'));assert.equal((await indexedDB.databases()).some(row=>row.name==='activation-intent'),false);}finally{await s.close();}});
test('occupied data is never overwritten by first-time preparation',async()=>{const a=new Store(base.choice,options);await a.open(base);await a.close();const add=IDBObjectStore.prototype.add,putMethod=IDBObjectStore.prototype.put;let calls=0;const b=new Store(base.choice,options);try{IDBObjectStore.prototype.add=IDBObjectStore.prototype.put=function(...args){calls++;return args.length&&putMethod.apply(this,args);};await assert.rejects(b.open(base),code('activation_intent_exists'));assert.equal(calls,0);}finally{IDBObjectStore.prototype.add=add;IDBObjectStore.prototype.put=putMethod;await b.close();}});
test('same-length changed durable bytes refuse on fresh read and remain unrepaired',async()=>{const s=new Store(base.choice,options);let db;try{await s.open(base);db=await raw(base.choice.database);const pin=base.choice.objects[0],bytes=new Uint8Array(pin.bytes);await put(db,'blob:'+pin.sha256,new Blob([bytes]));await assert.rejects(s.read());const tx=db.transaction('activation','readonly'),q=tx.objectStore('activation').get('blob:'+pin.sha256);const data=await new Promise((resolve,reject)=>{q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});assert.deepEqual(new Uint8Array(await data.arrayBuffer()),bytes);}finally{db?.close();await s.close();}});
test('cancellation during the creation transaction aborts the complete intent atomically',async()=>{const stop=new AbortController(),s=new Store(base.choice,{...options,signal:stop.signal}),add=IDBObjectStore.prototype.add;let hit=false;try{IDBObjectStore.prototype.add=function(...args){const result=add.apply(this,args);if(this.name==='activation'){hit=true;stop.abort();}return result;};await assert.rejects(s.open(base));assert.ok(hit);assert.equal((await indexedDB.databases()).some(row=>row.name===base.choice.database),false);}finally{IDBObjectStore.prototype.add=add;await s.close();}});
test('a late cancelled Native intent open permits a new owner after the request settles',()=>assertActivationReopensAfterLateClose({
 database:base.choice.database,
 createStore:signal=>new Store(base.choice,signal?{...options,signal}:options),
 create:store=>store.open(base),
 busyCode:'activation_intent_busy',
 closedCode:'activation_intent_closed',
}));
test('a fresh Native intent owner drains a failed database close and reads the exact prior observation',()=>assertActivationReopensAfterFailedClose({
 database:base.choice.database,
 createStore:()=>new Store(base.choice,options),
 create:store=>store.open(base),
 advance:store=>store.markRequestStarted(),
 stateOf:result=>result.state,
}));
