/** Real retained byte corpus and normal Rust hashing; synthetic lineage and
 * activation declarations exercise storage laws, never Native permission. */
import test,{before,beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {IDBFactory,IDBObjectStore,forceCloseDatabase} from 'fake-indexeddb';
import {environment} from './fixtures/room-participant-inventory/environment.mjs';
import {retainedActivationData} from './fixtures/activation-retention/actual-intent.mjs';
import {handoverCaptureData} from './fixtures/native-activation/handover-data.mjs';
import {handoverDeliveryPathSelection} from '../packages/breditor-collaboration/dist/generation_delivery_path_control/handover.js';
import {assertActivationReopensAfterFailedClose,assertActivationReopensAfterLateClose} from './fixtures/late-activation-intent-open.mjs';
import {encodeRoomActivationIntent as legacyEncode} from '../packages/breditor-collaboration/dist/room_native_activation_intent/encode.js';
import {decodeRoomActivationIntent as legacyDecode} from '../packages/breditor-collaboration/dist/room_native_activation_intent/decode.js';
import {RoomActivationIntentStore as LegacyStore} from '../packages/breditor-collaboration/dist/room_native_activation_intent/store.js';
import {roomActivationIntentChoice as legacyChoice} from '../packages/breditor-collaboration/dist/room_native_activation_intent/identity.js';
import {RoomHandoverActivationIntentStore as Store} from '../packages/breditor-collaboration/dist/room_native_handover_activation_intent/store.js';
import {encodeRoomHandoverActivationIntent as encode} from '../packages/breditor-collaboration/dist/room_native_handover_activation_intent/encode.js';
import {decodeRoomHandoverActivationIntent as decode} from '../packages/breditor-collaboration/dist/room_native_handover_activation_intent/decode.js';
import {roomHandoverActivationIntentChoice as choose} from '../packages/breditor-collaboration/dist/room_native_handover_activation_intent/identity.js';
let normal,activation,capture,encoded,native,reset;
const sha=value=>createHash('sha256').update(value).digest('hex'),code=value=>error=>error?.code===value;
const options=()=>({wasm:native,checkAuthority(){}});
before(async()=>{
 const actual=await retainedActivationData();native=actual.native;normal=actual.capture;activation=actual.choice.activation;
 capture=handoverCaptureData(normal,activation);
 encoded=await encode('handover-intent-base',activation,capture.handover,capture,options());
});
beforeEach(()=>{reset=environment();});afterEach(()=>reset?.());
const select=name=>choose({...encoded.choice,database:name});
async function raw(name,visit){const db=await new Promise((resolve,reject)=>{const q=indexedDB.open(name,1);q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});try{return await new Promise((resolve,reject)=>{const tx=db.transaction('activation','readwrite');visit(tx.objectStore('activation'),tx);tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});}finally{db.close();}}
async function checkBytes(actual,expected){for(let i=0;i<actual.length;i++)assert.deepEqual(new Uint8Array(await actual[i].arrayBuffer()),new Uint8Array(await expected[i].arrayBuffer()));}

test('complete lineage, original Pending facts and every retained byte survive cold exact reopen',async()=>{
 const choice=select('handover-cold-exact'),a=new Store(choice,options());
 try{const warm=await a.open({...encoded,choice});assert.deepEqual(warm.capture.handover,capture.handover);assert.deepEqual(warm.capture.capture.reconciliation.original,normal.reconciliation.original);assert.equal(warm.state.phase,'prepared');}finally{await a.close();}
 const b=new Store(choice,options());try{
  const cold=await b.open();assert.deepEqual(cold.choice,choice);assert.deepEqual(cold.capture.handover,capture.handover);
  const again=await encode(choice.database,choice.activation,choice.handover,cold.capture,options());assert.deepEqual(again.choice,choice);assert.equal(again.graph,encoded.graph);await checkBytes(again.objects,encoded.objects);
  assert.equal('activate'in b,false);assert.equal('takeOwner'in b,false);assert.equal('approve'in b,false);
 }finally{await b.close();}
});
test('original graph bytes stay literal and the two format families cannot substitute for each other',async()=>{
 const original=await legacyEncode('legacy-kept-literal',activation,normal,options());
 assert.throws(()=>legacyChoice(encoded.choice));assert.throws(()=>choose(original.choice));
 await assert.rejects(legacyDecode({...encoded,choice:original.choice},options()));
 await assert.rejects(decode({...original,choice:encoded.choice},options()));
 const restored=await legacyDecode(original,options()),again=await legacyEncode('legacy-kept-literal',activation,restored,options());assert.deepEqual(again.choice,original.choice);assert.equal(again.graph,original.graph);await checkBytes(again.objects,original.objects);
});
test('a missing existing-only handover intent creates no namespace and an existing original intent is preserved',async()=>{
 const missing=select('handover-missing'),a=new Store(missing,options());try{await assert.rejects(a.open(),code('activation_intent_missing'));}finally{await a.close();}assert.equal((await indexedDB.databases()).length,0);
 const original=await legacyEncode('handover-shared-refused',activation,normal,options()),old=new LegacyStore(original.choice,options());try{await old.open(original);}finally{await old.close();}
 const next=new Store(select(original.choice.database),options());try{await assert.rejects(next.open({...encoded,choice:nextChoice(original.choice.database)}));}finally{await next.close();}
 const verify=new LegacyStore(original.choice,options());try{assert.deepEqual((await verify.open()).choice,original.choice);}finally{await verify.close();}
});
const nextChoice=name=>select(name);
test('choice admission rejects accessors and unsupported fields without invoking application code',()=>{
 let calls=0;const input={...encoded.choice};Object.defineProperty(input,'handover',{enumerable:true,get(){calls++;throw Error('No property hook');}});
 assert.throws(()=>choose(input));assert.throws(()=>choose({...encoded.choice,activate(){calls++;}}));assert.equal(calls,0);
});
test('a changed seal or removed ancestry observation cannot be hidden behind freshly pinned graph bytes',async()=>{
 for(const mutate of [v=>{v.handover.path.seal.owner=sha('other-seal');},v=>{v.handover.path.successor.ancestors=[];v.handover.current.path.ancestors=[];}]){
  const value=JSON.parse(JSON.stringify(capture.handover));mutate({handover:value});
  await assert.rejects(encode('handover-different-lineage',activation,value,capture,options()));
 }
 const changed=structuredClone(encoded.choice);changed.activation.current.server.archiveSha256[0]^=1;assert.throws(()=>choose(changed));
 assert.deepEqual(await indexedDB.databases(),[]);
});
test('a reselected controller preserves the captured observation and must include every original ancestor in order',async()=>{
 const path=structuredClone(capture.handover);path.current.instance=sha('fresh-controller');path.current.current.instance=sha('fresh-delivery');path.current.current.current.instance=sha('fresh-native');
 const selected=await encode('handover-reselected',activation,path,capture,options()),saved=await decode(selected,options());
 assert.deepEqual(saved.handover,capture.handover);assert.notDeepEqual(selected.choice.handover,saved.handover);
 const duplicate=structuredClone(capture.handover);duplicate.path.successor.ancestors.push(duplicate.path.successor.ancestors[0]);duplicate.current.path.ancestors.push(duplicate.current.path.ancestors[0]);
 const repeated=Object.freeze({...capture,handover:handoverDeliveryPathSelection(duplicate)});
 await encode('handover-duplicate-path',activation,repeated.handover,repeated,options());
 await assert.rejects(encode('handover-omitted-repeat',activation,capture.handover,repeated,options()));
});
test('graph and object corruption refuse before absent-only creation and do not overwrite a stored intent',async()=>{
 const choice=select('handover-corruption');
 for(const input of [{...encoded,choice,graph:encoded.graph+' '},{...encoded,choice,objects:encoded.objects.map((file,index)=>index===0?new Blob(['truncated']):file)}]){const store=new Store(choice,options());try{await assert.rejects(store.open(input));}finally{await store.close();}assert.deepEqual(await indexedDB.databases(),[]);}
 const a=new Store(choice,options());try{await a.open({...encoded,choice});}finally{await a.close();}
 await raw(choice.database,s=>s.put(encoded.graph+' ','graph'));
 const b=new Store(choice,options());try{await assert.rejects(b.open());}finally{await b.close();}
});
test('handover decoder keeps its original integrity context through final lineage admission',async()=>{
 let swapped=false,lateChecks=0;const supplied={wasm:undefined,checkAuthority(){}};
 supplied.wasm={SharedArchiveDigest:{version:()=>native.SharedArchiveDigest.version(),maximum_bytes:()=>native.SharedArchiveDigest.maximum_bytes(),maximum_chunk_bytes:()=>native.SharedArchiveDigest.maximum_chunk_bytes(),create(bytes){const owner=native.SharedArchiveDigest.create(bytes);return{update:value=>owner.update(value),finish(){const result=owner.finish();if(!swapped){swapped=true;supplied.checkAuthority=()=>{lateChecks++;throw Error('Do not recapture options after hashing');};}return result;},free:()=>owner.free()};}}};
 const result=await decode(encoded,supplied);assert.deepEqual(result.handover,capture.handover);assert.equal(swapped,true);assert.equal(lateChecks,0);
});
test('interrupted creation rolls back atomically; a lost committed completion remains recoverable',async()=>{
 const add=IDBObjectStore.prototype.add;
 for(const committed of [false,true]){
  const choice=select('handover-create-interrupt-'+committed),stop=new AbortController();let changed=false;
  const a=new Store(choice,{...options(),signal:stop.signal,checkAuthority(){if(changed)throw Error('Lost committed completion');}});
  try{IDBObjectStore.prototype.add=function(...args){const result=add.apply(this,args);if(this.transaction.db.name===choice.database){if(committed)this.transaction.addEventListener('complete',()=>{changed=true;},{once:true});else stop.abort();}return result;};await assert.rejects(a.open({...encoded,choice}));}finally{IDBObjectStore.prototype.add=add;await a.close();}
  assert.equal((await indexedDB.databases()).some(row=>row.name===choice.database),committed);
  const b=new Store(choice,options());try{assert.equal((await b.open(committed?undefined:{...encoded,choice})).state.phase,'prepared');}finally{await b.close();}
 }
});
test('uncertain and receipt observations preserve all lineage and require the exact selected receipt',async()=>{
 const choice=select('handover-observations'),a=new Store(choice,options());
 const receipt={format:'breditor/durable-native-activation-control-receipt',formatVersion:1,selection:choice.activation,scope:'actual-held-native-service-only'};
 try{await a.open({...encoded,choice});const pending=await a.markRequestStarted();assert.equal(pending.state.phase,'request-started');await assert.rejects(a.markReceiptObserved({...receipt,selection:{...receipt.selection,instance:sha('other-request')}}));assert.deepEqual((await a.read()).capture.handover,capture.handover);await a.markReceiptObserved(receipt);}finally{await a.close();}
 const b=new Store(choice,options());try{const cold=await b.open();assert.equal(cold.state.phase,'receipt-observed');assert.deepEqual(cold.state.receipt,receipt);assert.deepEqual(cold.capture.handover,capture.handover);assert.deepEqual((await b.markRequestStarted()).state,cold.state);}finally{await b.close();}
});
test('unexpected connection closure revokes the new owner and leaves the exact intent retryable',async()=>{
 const choice=select('handover-forced-close'),open=IDBFactory.prototype.open;let connection;
 IDBFactory.prototype.open=function(...args){const q=open.apply(this,args);if(args[0]===choice.database)q.addEventListener('success',()=>{connection=q.result;},{once:true});return q;};
 const a=new Store(choice,options());try{await a.open({...encoded,choice});forceCloseDatabase(connection);await new Promise(resolve=>setImmediate(resolve));assert.equal(a.revoked.aborted,true);await assert.rejects(a.read(),code('activation_intent_closed'));}finally{IDBFactory.prototype.open=open;await a.close();}
 const b=new Store(choice,options());try{assert.deepEqual((await b.open()).choice,choice);}finally{await b.close();}
});
test('late cancelled opens and failed close cleanup retain their original namespace custody',async()=>{
 for(const late of [true,false]){
  const choice=select('handover-close-'+late),input={database:choice.database,createStore:signal=>new Store(choice,{...options(),...(signal?{signal}:{})}),create:store=>store.open({...encoded,choice}),busyCode:'activation_intent_busy',closedCode:'activation_intent_closed',advance:store=>store.markRequestStarted(),stateOf:value=>value.state};
  if(late)await assertActivationReopensAfterLateClose(input);else await assertActivationReopensAfterFailedClose(input);
 }
});
