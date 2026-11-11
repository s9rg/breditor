/** Exact retained bytes, actual SDK handles and controlled HTTP/IndexedDB.
 * Real relay process recovery is covered by the separate Native suite. */
import test,{before,beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {IDBObjectStore} from 'fake-indexeddb';
import {retainedActivationData} from './fixtures/activation-retention/actual-intent.mjs';
import {handoverCaptureData} from './fixtures/native-activation/handover-data.mjs';
import {withHandoverActivationControls as controls} from './fixtures/native-activation/handover-controls.mjs';
import {environment} from './fixtures/room-participant-inventory/environment.mjs';
import {encodeRoomHandoverActivationIntent as encode} from '../packages/breditor-collaboration/dist/room_native_handover_activation_intent/encode.js';
import {roomHandoverActivationIntentChoice as choose} from '../packages/breditor-collaboration/dist/room_native_handover_activation_intent/identity.js';
import {RoomHandoverActivationIntentStore as Store} from '../packages/breditor-collaboration/dist/room_native_handover_activation_intent/store.js';
import {prepareHandoverActivationReassociation as prepare,resumeHandoverActivationReassociation as resume} from '../packages/breditor-collaboration/dist/room_native_handover_activation_intent/reassociate.js';

const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
let native,activation,capture,original,reset;
const options=()=>({wasm:native,checkAuthority(){}});
before(async()=>{
 const data=await retainedActivationData();
 native=data.native;activation=data.choice.activation;capture=handoverCaptureData(data.capture,activation);
 const canonical=await encode('reassociation-original',activation,capture.handover,capture,options());
 const raw=JSON.parse(canonical.graph),count=canonical.objects.length;
 assert.ok(count>1);
 function reorder(value){
  if(!Array.isArray(value))return;
  if(value.length===3&&value[0]==='b'&&typeof value[1]==='number'&&typeof value[2]==='string')value[1]=count-1-value[1];
  for(const child of value)reorder(child);
 }
 reorder(raw.body);
 const graph=JSON.stringify({body:raw.body,formatVersion:raw.formatVersion,format:raw.format});
 assert.notEqual(graph,canonical.graph);
 const bytes=Buffer.byteLength(graph);
 const choice=choose({...canonical.choice,graph:{bytes,sha256:digest(graph)},objects:canonical.choice.objects.toReversed(),totalBytes:canonical.choice.totalBytes-canonical.choice.graph.bytes+bytes});
 original=Object.freeze({choice,graph,objects:Object.freeze(canonical.objects.toReversed())});
});
beforeEach(()=>{reset=environment();});afterEach(()=>reset());

const pending=()=>({...activation,instance:digest('restarted activation instance')});
const child=()=>({...pending(),previous:activation.planned,planned:{...activation.planned,generation:String(BigInt(activation.planned.generation)+1n),owner:digest('restarted child owner')},checkpointSha256:[...Buffer.from(digest('child checkpoint'),'hex')]});
function freshPath(){
 const path=structuredClone(capture.handover);
 path.current.instance=digest('restarted path instance');
 path.current.current.instance=digest('restarted delivery instance');
 path.current.current.current.instance=digest('restarted recovery instance');
 return path;
}
function withFresh(next,run,path=freshPath()){
 return controls({...capture,handover:path},next,run);
}
function input(actual,previous,database,retainChoice=()=>{}){
 return {previous,database,activation:actual.activation,path:actual.path,retainChoice};
}
async function storeOriginal({phase='prepared',path=original.choice.handover}={}){
 const choice=choose({...original.choice,handover:path}),store=new Store(choice,options());
 try{
  let state=(await store.open({...original,choice})).state;
  if(phase!=='prepared')state=(await store.markRequestStarted()).state;
  if(phase==='receipt-observed')state=(await store.markReceiptObserved({format:'breditor/durable-native-activation-control-receipt',formatVersion:1,selection:choice.activation,scope:'actual-held-native-service-only'})).state;
  return {choice,state};
 }finally{await store.close();}
}
async function read(choice){
 const store=new Store(choice,options());
 try{return await store.openRetainedEncoding();}finally{await store.close();}
}
async function exact(choice){
 const {intent,encoding}=await read(choice);
 assert.deepEqual(intent.capture.handover,capture.handover);
 assert.deepEqual(encoding.choice,choice);
 assert.equal(encoding.graph,original.graph);
 assert.deepEqual(encoding.choice.graph,original.choice.graph);
 assert.deepEqual(encoding.choice.objects,original.choice.objects);
 for(let i=0;i<encoding.objects.length;i++){
  assert.deepEqual(Buffer.from(await encoding.objects[i].arrayBuffer()),Buffer.from(await original.objects[i].arrayBuffer()));
 }
 return intent.state;
}
const exists=async database=>(await indexedDB.databases()).some(row=>row.name===database);

test('a restarted pending checkpoint retains literal graph and object order in a fresh namespace',async()=>{
 const previous=await storeOriginal({phase:'request-started'}),database='reassociated-pending';
 let retained;
 const selected=await withFresh(pending(),async actual=>{
  const result=await prepare(input(actual,previous.choice,database,async choice=>{
   retained=choice;
   assert.equal(await exists(database),false);
   assert.equal(actual.requests.length,0);
  }),options());
  assert.equal(actual.requests.length,0);
  return result;
 });
 assert.deepEqual(selected,retained);
 assert.deepEqual(selected.activation.planned,previous.choice.activation.planned);
 assert.equal((await exact(selected)).phase,'prepared');
 assert.deepEqual(await exact(previous.choice),previous.state);
});

test('a direct child checkpoint retains the original observed receipt separately from the new intent',async()=>{
 const previous=await storeOriginal({phase:'receipt-observed'});
 const selected=await withFresh(child(),actual=>prepare(input(actual,previous.choice,'reassociated-child'),options()));
 assert.deepEqual(selected.activation.previous,previous.choice.activation.planned);
 assert.equal((await exact(selected)).receipt,null);
 assert.deepEqual(await exact(previous.choice),previous.state);
});

test('a restart refuses reused controls, namespace aliases, a skipped epoch, a changed seal or an omitted prior cut',async()=>{
 const oldPath=freshPath();
 oldPath.path.successor.ancestors.push(oldPath.path.successor.ancestors.at(-1));
 oldPath.current.path.ancestors.push(oldPath.current.path.ancestors.at(-1));
 const previous=await storeOriginal({path:oldPath});
 const fullPath=structuredClone(oldPath);fullPath.current.instance=digest('new path distinct from earlier selection');
 let retains=0;
 const run=(next,path,database)=>withFresh(next,async actual=>{
  await assert.rejects(prepare(input(actual,previous.choice,database,()=>{retains++;}),options()));
  assert.equal(actual.requests.length,0);
 },path);
 await run(pending(),fullPath,previous.choice.database);
 await run(activation,fullPath,'reused-activation');
 await run(pending(),oldPath,'reused-path');
 const skipped=child();
 skipped.previous={...skipped.previous,generation:String(BigInt(skipped.previous.generation)+1n),owner:digest('skipped owner')};
 skipped.planned={...skipped.planned,generation:String(BigInt(skipped.previous.generation)+1n)};
 await run(skipped,fullPath,'skipped-epoch');
 const foreign=structuredClone(fullPath);foreign.path.seal.owner=digest('foreign seal');
 await run(pending(),foreign,'foreign-seal');
 const omitted=freshPath();omitted.current.instance=digest('different incomplete controller');
 await run(pending(),omitted,'omitted-prior-cut');
 assert.equal(retains,0);
 assert.deepEqual((await indexedDB.databases()).map(row=>row.name),[previous.choice.database]);
 assert.deepEqual(await exact(previous.choice),previous.state);
});

test('a retained choice can finish a missing write after the controllers close and cannot reset an existing observation',async()=>{
 const previous=await storeOriginal(),database='reassociated-missing-write';
 let expected;
 await withFresh(pending(),async actual=>{
  await assert.rejects(prepare(input(actual,previous.choice,database,choice=>{
   expected=choice;
   throw Error('Interrupted before destination write');
  }),options()),/Interrupted before destination write/);
 });
 assert.equal(await exists(database),false);
 await assert.rejects(resume({previous:previous.choice,expected:{...expected,graph:{...expected.graph,sha256:digest('other graph')}}},options()),{code:'activation_intent_stale'});
 assert.equal(await exists(database),false);
 assert.deepEqual(await resume({previous:previous.choice,expected},options()),expected);
 const store=new Store(expected,options());
 let unknown;
 try{await store.open();unknown=(await store.markRequestStarted()).state;}finally{await store.close();}
 await resume({previous:previous.choice,expected},options());
 assert.deepEqual(await exact(expected),unknown);
 assert.deepEqual(await exact(previous.choice),previous.state);
});

test('an uncertain committed create reopens exactly without overwriting a different existing choice',async()=>{
 const previous=await storeOriginal(),database='reassociated-uncertain-create';
 const add=IDBObjectStore.prototype.add;
 let committed=false,expected;
 try{
  IDBObjectStore.prototype.add=function(...args){
   const result=add.apply(this,args);
   if(this.transaction.db.name===database)this.transaction.addEventListener('complete',()=>{committed=true;},{once:true});
   return result;
  };
  await withFresh(pending(),async actual=>{
   await assert.rejects(prepare(input(actual,previous.choice,database,choice=>{expected=choice;}),{
    ...options(),checkAuthority(){if(committed)throw Error('Lost create completion');},
   }));
  });
 }finally{IDBObjectStore.prototype.add=add;}
 assert.equal(committed,true);
 assert.equal(await exists(database),true);
 assert.deepEqual(await resume({previous:previous.choice,expected},options()),expected);
 const changed={...expected,activation:{...expected.activation,instance:digest('other restart instance')}};
 await assert.rejects(resume({previous:previous.choice,expected:changed},options()));
 assert.equal((await exact(expected)).phase,'prepared');
 assert.deepEqual(await exact(previous.choice),previous.state);
});

test('closing the selected path ends a pending retention callback without creating a destination',{timeout:30000},async()=>{
 const previous=await storeOriginal(),database='reassociated-closed-path';
 await withFresh(pending(),async actual=>{
  const entered=Promise.withResolvers(),late=Promise.withResolvers();
  const job=prepare(input(actual,previous.choice,database,()=>{entered.resolve();return late.promise;}),options());
  try{
   await entered.promise;
   actual.close('path');
   await assert.rejects(job);
   assert.equal(await exists(database),false);
  }finally{late.resolve();await job.catch(()=>{});}
  assert.equal(actual.requests.length,0);
 });
 assert.deepEqual(await exact(previous.choice),previous.state);
});
