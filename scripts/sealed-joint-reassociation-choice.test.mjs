/** Real retained whole-room choices with new control/receipt DATA. The local
 * journal checks make no request and cannot confer Native serving authority. */
import test,{before,beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {IDBFactory,IDBObjectStore,forceCloseDatabase} from 'fake-indexeddb';
import * as native from '../packages/breditor-collaboration/dist/runtime/breditor_shared.js';
import {jointHandoverReassociationPlan,jointHandoverReassociationChoice,handoverReassociationPredecessorChoice} from '../packages/breditor-collaboration/dist/native_room_joint_reassociation/handover_identity.js';
import {JointHandoverReassociationIntentStore as Store,JointReassociationIntentStore as Ordinary,jointReassociationPublicationBinding as binding} from '../packages/breditor-collaboration/dist/native_room_joint_reassociation/intent_store.js';
import {persistHandoverReassociation} from '../packages/breditor-collaboration/dist/native_room_joint_reassociation/handover_persist.js';
import {prepareJointHandoverReassociation,resumeJointHandoverReassociationPreparation} from '../packages/breditor-collaboration/dist/native_room_joint_reassociation/handover_prepare.js';
import {ColdJointRoomActivationAttempt,prepareColdJointHandoverRestart,resumeColdJointHandoverRestartPreparation,confirmColdJointHandoverRestart,continueColdJointHandoverRestartMetadata,publishColdJointHandoverRestart} from '../packages/breditor-collaboration/dist/native_room_joint_activation/cold_attempt.js';
import {JointRoomActivationIntentStore as OriginalJointStore,jointRoomPublicationBinding as originalBinding} from '../packages/breditor-collaboration/dist/native_room_joint_activation/intent_store.js';
import {confirmHeldColdNative} from '../packages/breditor-collaboration/dist/native_room_joint_activation/cold_variant.js';
import {confirmJointHandoverReassociation,checkHandoverReassociationConfirmation} from '../packages/breditor-collaboration/dist/native_room_joint_reassociation/handover_confirm.js';
import {continueHandoverReassociationMetadata,publishHandoverReassociation} from '../packages/breditor-collaboration/dist/native_room_joint_reassociation/handover_publish.js';
import {RoomHandoverActivationIntentStore as NativeStore} from '../packages/breditor-collaboration/dist/room_native_handover_activation_intent/store.js';
import {heldHandoverActivationPath} from '../packages/breditor-collaboration/dist/room_native_handover_activation_intent/path.js';
import {nativeActivationHostPort} from '../packages/breditor-collaboration/dist/native_activation_control/host.js';
import {prepareHeldHandoverActivationReassociation,resumeHeldHandoverActivationReassociation} from '../packages/breditor-collaboration/dist/room_native_handover_activation_intent/reassociate.js';
import {withHandoverActivationControls} from './fixtures/native-activation/handover-controls.mjs';
import {environment} from './fixtures/room-participant-inventory/environment.mjs';
import {databaseByteSnapshot} from './fixtures/native-actor-custody/storage_bytes.mjs';

const digest=value=>createHash('sha256').update(value).digest('hex');
const options=()=>({wasm:native,checkAuthority(){}});
const code=expected=>error=>error?.code===expected;
const policy=code('joint_activation_intent_policy');
const integrity=code('joint_activation_intent_integrity');
const namespace=name=>indexedDB.databases().then(rows=>rows.some(row=>row.name===name));
let root,continued,directory,reset;
before(async()=>{
 await native.default({module_or_path:readFileSync(new URL('../packages/breditor-collaboration/dist/runtime/breditor_shared_bg.wasm',import.meta.url))});
 directory=process.env.BREDITOR_SEALED_RESTART_CHOICES;
 assert.ok(directory,'Select the output directory of the actual sealed whole-room fixture');
 const read=suffix=>JSON.parse(readFileSync(join(directory,'actual-joint-complete-'+suffix+'.json'),'utf8'));
 root=read('independent-plan');
 continued=read('continued-choice');
 const bytes=JSON.stringify(root.plan);
 assert.equal(root.bytes,Buffer.byteLength(bytes));
 assert.equal(root.sha256,digest(bytes));
});
beforeEach(()=>{reset=environment();});
afterEach(()=>reset());

function draft(tag,{previous,child=false,evidence=false}={}){
 const prior=previous?.plan??root.plan;
 const activation=structuredClone(prior.activation);
 activation.database=tag+'-native';
 activation.activation.instance=digest(tag+'-native-instance');
 activation.handover.current.instance=digest(tag+'-path-instance');
 if(child){
  const wire=activation.activation;
  wire.previous=structuredClone(wire.planned);
  wire.planned={...wire.planned,generation:String(BigInt(wire.planned.generation)+1n),owner:digest(tag+'-child-owner')};
  wire.checkpointSha256=[...Buffer.from(digest(tag+'-checkpoint'),'hex')];
 }
 const predecessors=[];
 if(previous){
  const {format,formatVersion,original,predecessors:earlier,...record}=structuredClone(previous.plan);
  predecessors.push(...earlier,{...record,bytes:previous.bytes,sha256:previous.sha256});
 }
 const priorMetadata=evidence
  ?{format:'breditor/handover-metadata-continuation-evidence',formatVersion:1,choice:structuredClone(continued),phase:'intent',review:null,metadata:null}
  :{format:'breditor/metadata-continuation-absence',formatVersion:1,destinations:structuredClone(prior.destinations)};
 return{format:'breditor/joint-native-handover-reassociation-plan',formatVersion:1,database:tag+'-intent',original:structuredClone(root),predecessors,
  activation,publication:{...structuredClone(prior.publication),instance:digest(tag+'-publication-instance'),activation:structuredClone(activation.activation)},
  destinations:{database:tag+'-continuation',preparationDatabase:tag+'-preparation',reviewDatabase:tag+'-review',metadataDatabase:tag+'-metadata'},prior:priorMetadata};
}
function select(input){
 const plan=jointHandoverReassociationPlan(input),text=JSON.stringify(plan);
 return jointHandoverReassociationChoice({format:'breditor/joint-native-handover-reassociation-intent',formatVersion:1,plan,bytes:Buffer.byteLength(text),sha256:digest(text)});
}
const open=async(choice,create=false)=>{
 const store=new Store(choice,options());
 try{return await store.open(create);}finally{await store.close();}
};

function originalEncoding(){
 const base=join(directory,'actual-joint-prepared-native-intent-evidence');
 const choice=root.plan.activation;
 assert.deepEqual(JSON.parse(readFileSync(join(base,'choice.json'),'utf8')),choice);
 const read=(name,pin)=>{
  const bytes=readFileSync(join(base,name));
  assert.equal(bytes.length,pin.bytes);
  assert.equal(digest(bytes),pin.sha256);
  return bytes;
 };
 const graph=read('graph.json',choice.graph).toString('utf8');
 const objects=choice.objects.map(pin=>new Blob([read(pin.sha256+'.bin',pin)]));
 return {choice,graph,objects};
}

test('the real original choice binds fresh sealed controllers and a linear direct-child checkpoint',async()=>{
 const first=select(draft('first',{evidence:true}));
 const child=select(draft('child',{previous:first,child:true}));
 assert.deepEqual(first.plan.original,root);
 assert.deepEqual(first.plan.activation.graph,root.plan.activation.graph);
 assert.deepEqual(first.plan.activation.objects,root.plan.activation.objects);
 assert.deepEqual(first.plan.prior.choice,continued);
 assert.deepEqual(child.plan.activation.activation.previous,first.plan.activation.activation.planned);
 assert.deepEqual(handoverReassociationPredecessorChoice(child.plan,0),first);
 assert.equal((await open(child,true)).phase,'prepared');
 assert.equal((await open(child)).receipt,null);
});

test('a new descriptor refuses namespace aliases, foreign seal evidence and changed activation or publication pins',()=>{
 const first=select(draft('selected'));
 for(const change of [
  plan=>{plan.database=root.plan.sourceNamespaces[0];},
  plan=>{plan.destinations.reviewDatabase=first.plan.destinations.reviewDatabase;},
  plan=>{plan.activation.graph.sha256=digest('changed literal graph');},
  plan=>{plan.activation.handover.current.instance=first.plan.activation.handover.current.instance;},
  plan=>{plan.activation.handover.current.instance=root.plan.activation.handover.current.instance;},
  plan=>{plan.activation.handover.path.seal.owner=digest('foreign seal');},
  plan=>{plan.publication.activation.instance=digest('foreign Native activation');},
  plan=>{plan.publication.instance=root.plan.publication.instance;},
  plan=>{plan.publication.listener='127.0.0.1:1234';},
  plan=>{plan.prior.destinations.database='another-continuation';},
 ]){
  const raw=draft('refused',{previous:first,child:true});
  change(raw);
  assert.throws(()=>select(raw),policy);
 }
 for(const change of [
  plan=>{plan.prior.choice.handover.path.seal.owner=digest('foreign evidence seal');},
  plan=>{plan.prior.choice.continuation.origin.metadata.sha256=digest('foreign source facts');},
  plan=>{plan.prior.phase='absent';},
 ]){
  const raw=draft('refused-evidence',{evidence:true});
  change(raw);
  assert.throws(()=>select(raw),policy);
 }
});

test('the journal refuses changed original or predecessor digests and invalid saved journal bodies before creating anything',async()=>{
 const first=select(draft('pin-parent'));
 const badRoot=draft('wrong-original');
 badRoot.original.sha256=digest('changed original');
 const badPredecessor=draft('wrong-predecessor',{previous:first,child:true});
 badPredecessor.predecessors[0].sha256=digest('changed predecessor');
 const badJournal=draft('wrong-journal',{evidence:true});
 badJournal.prior.phase='review';
 badJournal.prior.review='{}';
 for(const [raw,error] of [[badRoot,integrity],[badPredecessor,integrity],[badJournal,undefined]]){
  await assert.rejects(open(select(raw),true),error);
  assert.equal(await namespace(raw.database),false);
 }
});

test('a sealed publication observation is exact and a cold retry cannot reset or overwrite it',async()=>{
 const choice=select(draft('observed')),store=new Store(choice,options());
 try{
  const selected=await store.open(true);
  assert.equal(selected.format,'breditor/joint-native-handover-reassociation-state');
  const receipt={format:'breditor/native-room-publication-receipt',formatVersion:1,selection:choice.plan.publication,joint:binding(choice),scope:'actual-held-native-service-and-bound-listener; joint-association-only'};
  await assert.rejects(store.markPublicationObserved(receipt),policy);
  await store.markPublicationStarted();
  const other=structuredClone(receipt);
  other.joint.sha256[0]^=1;
  await assert.rejects(store.markPublicationObserved(other));
  assert.deepEqual((await store.markPublicationObserved(receipt)).receipt,receipt);
 }finally{await store.close();}
 const original=await databaseByteSnapshot(choice.plan.database);
 await assert.rejects(open(choice,true),code('joint_activation_intent_exists'));
 assert.throws(()=>new Ordinary(choice,options()),policy);
 assert.equal((await open(choice)).phase,'receipt-observed');
 assert.deepEqual(await databaseByteSnapshot(choice.plan.database),original);
});

for(const family of ['native','original publication','restart publication']){
 test(family+' aborts an observation when custody ends before the transaction commits',async()=>{
  const choice=select(draft('observation-revoked'));
  const nativeFamily=family==='native',originalFamily=family==='original publication';
  const store=nativeFamily?new NativeStore(choice.plan.activation,options()):originalFamily?OriginalJointStore.acrossHandover(root,options()):new Store(choice,options());
  const namespace=nativeFamily?choice.plan.activation.database:originalFamily?root.plan.database:choice.plan.database;
  const selected=originalFamily?root:choice;
  const receipt=nativeFamily
   ?{format:'breditor/durable-native-activation-control-receipt',formatVersion:1,selection:choice.plan.activation.activation,scope:'actual-held-native-service-only'}
   :{format:'breditor/native-room-publication-receipt',formatVersion:1,selection:selected.plan.publication,
    joint:originalFamily?originalBinding(root):binding(choice),scope:'actual-held-native-service-and-bound-listener; joint-association-only'};
  const start=guard=>nativeFamily?store.markRequestStarted(guard):store.markPublicationStarted(guard);
  const record=guard=>nativeFamily?store.markReceiptObserved(receipt,guard):store.markPublicationObserved(receipt,guard);
  const state=async()=>{const read=await store.read();return nativeFamily?read.state:read;};
  const put=IDBObjectStore.prototype.put;
  async function revokeBeforeCommit(mark,phase){
   const before=await databaseByteSnapshot(namespace);
   const custody=new AbortController();
   let writes=0,error;
   try{
    IDBObjectStore.prototype.put=function(value,key){
     const request=put.call(this,value,key);
     if(this.transaction.db.name===namespace&&key==='state'){writes++;custody.abort();}
     return request;
    };
    try{await mark({check:()=>custody.signal.throwIfAborted(),signal:custody.signal});}
    catch(cause){error=cause;}
   }finally{IDBObjectStore.prototype.put=put;}
   assert.equal(writes,1,'Revocation must happen after a state write is queued');
   assert.equal((await state()).phase,phase,'The aborted observation must leave the previous durable state');
   assert.deepEqual(await databaseByteSnapshot(namespace),before);
   assert.ok(error,'The revoked operation must refuse');
  }
  try{
   if(nativeFamily)await store.open({...originalEncoding(),choice:choice.plan.activation});
   else await store.open(true);
   await revokeBeforeCommit(start,'prepared');
   const live=new AbortController(),guard={check:()=>live.signal.throwIfAborted(),signal:live.signal};
   await start(guard);
   assert.equal((await state()).revision,1);
   await revokeBeforeCommit(record,'request-started');
   await record(guard);
   assert.deepEqual((await state()).receipt,receipt);
   assert.equal((await state()).revision,2);
  }finally{await store.close();}
 });
}

test('revoking the selected connection ends its journal guard and leaves the exact sealed choice retryable',async()=>{
 const choice=select(draft('revoked')),store=new Store(choice,options());
 const openDatabase=IDBFactory.prototype.open;
 let connection;
 try{
  IDBFactory.prototype.open=function(...args){
   const request=openDatabase.apply(this,args);
   if(args[0]===choice.plan.database)request.addEventListener('success',()=>{connection=request.result;},{once:true});
   return request;
  };
  await store.open(true);
  assert.ok(connection);
  forceCloseDatabase(connection);
  await new Promise(resolve=>setImmediate(resolve));
  assert.throws(store.check,code('joint_activation_intent_closed'));
 }finally{
  IDBFactory.prototype.open=openDatabase;
  await store.close();
 }
 assert.equal((await open(choice)).phase,'prepared');
});

test('an interrupted paired write retains exact Native bytes and resumes the missing journal without controllers',async()=>{
 const choice=select(draft('paired-retry',{child:true,evidence:true}));
 const encoding=originalEncoding(),source=new NativeStore(encoding.choice,options());
 try{
  await source.open(encoding);
  const original=await databaseByteSnapshot(encoding.choice.database);
  let retained,interrupted=false;
  const add=IDBObjectStore.prototype.add;
  try{
   IDBObjectStore.prototype.add=function(...args){
    const result=add.apply(this,args);
    if(!interrupted&&this.transaction.db.name===choice.plan.database){
     interrupted=true;
     this.transaction.abort();
    }
    return result;
   };
   await withHandoverActivationControls({handover:choice.plan.activation.handover},choice.plan.activation.activation,async controllers=>{
    await assert.rejects(persistHandoverReassociation(choice,options(),false,async()=>{
     await prepareHeldHandoverActivationReassociation(source,{
      previous:encoding.choice,database:choice.plan.activation.database,activation:controllers.activation,path:controllers.path,
      async retainChoice(actual){
       assert.deepEqual(actual,choice.plan.activation);
       assert.equal(await namespace(actual.database),false);
       assert.equal(await namespace(choice.plan.database),false);
       retained=choice;
      },
     },options());
    }),()=>interrupted);
    assert.equal(controllers.requests.length,0);
   });
  }finally{IDBObjectStore.prototype.add=add;}
  assert.equal(interrupted,true);
  assert.deepEqual(retained,choice);
  assert.equal(await namespace(choice.plan.database),false);
  const exactNative=await databaseByteSnapshot(choice.plan.activation.database);
  const retry=()=>persistHandoverReassociation(retained,options(),true,async()=>{
   await resumeHeldHandoverActivationReassociation(source,{previous:encoding.choice,expected:retained.plan.activation},options());
  });
  assert.deepEqual(await retry(),retained);
  assert.deepEqual(await retry(),retained);
  assert.equal((await open(choice)).phase,'prepared');
  assert.deepEqual(await databaseByteSnapshot(choice.plan.activation.database),exactNative);
  assert.deepEqual(await databaseByteSnapshot(encoding.choice.database),original);
 }finally{await source.close();}
});

test('an invalid complete pin or an orphaned journal cannot write the Native destination',async()=>{
 const choice=select(draft('pair-refusal'));
 let writes=0;
 const write=async()=>{writes++;};
 await assert.rejects(persistHandoverReassociation({...choice,sha256:digest('tampered pair pin')},options(),true,write),integrity);
 assert.equal(await namespace(choice.plan.database),false);
 await open(choice,true);
 await assert.rejects(persistHandoverReassociation(choice,options(),true,write),code('joint_activation_intent_exists'));
 assert.equal(await namespace(choice.plan.activation.database),false);
 assert.equal(writes,0);
});

test('a forged cold origin cannot prepare or confirm a sealed restart before actual admission',async()=>{
 let reflections=0;
 const poison=new Proxy({},{ownKeys(){reflections++;throw Error('Unexpected input reflection');}});
 const forged=Object.freeze({choice:root,check(){reflections++;}});
 await assert.rejects(prepareJointHandoverReassociation({},forged,poison,poison),code('joint_activation_state'));
 await assert.rejects(resumeJointHandoverReassociationPreparation({},forged,poison,poison,()=>{reflections++;}),code('joint_activation_state'));
 await assert.rejects(confirmJointHandoverReassociation({},forged,poison,poison,poison),code('joint_activation_state'));
 const saved=Object.freeze({choice:select(draft('saved-only')),receipt:poison});
 assert.throws(()=>checkHandoverReassociationConfirmation(saved),code('joint_activation_state'));
 const context={scope:{},origin:forged,confirmation:saved};
 await assert.rejects(continueHandoverReassociationMetadata(context,poison,true),code('joint_activation_state'));
 await assert.rejects(publishHandoverReassociation(context,poison,poison,poison),code('joint_activation_state'));
 const copied=Object.create(ColdJointRoomActivationAttempt.prototype);
 await assert.rejects(prepareColdJointHandoverRestart(copied,poison),policy);
 await assert.rejects(resumeColdJointHandoverRestartPreparation(copied,poison,()=>{reflections++;}),policy);
 await assert.rejects(confirmColdJointHandoverRestart(copied,poison,poison),policy);
 await assert.rejects(continueColdJointHandoverRestartMetadata(copied,poison),policy);
 await assert.rejects(publishColdJointHandoverRestart(copied,poison,poison),policy);
 assert.equal(reflections,0);
});

test('sealed confirmation requires a fresh decision and authenticated reply even after an observed receipt',async()=>{
 const choice=select(draft('fresh-confirmation',{child:true})),encoding=originalEncoding();
 const original=new NativeStore(encoding.choice,options()),target=new NativeStore(choice.plan.activation,options());
 try{
  await original.open(encoding);
  const saved=await databaseByteSnapshot(encoding.choice.database);
  await target.open({...encoding,choice:choice.plan.activation});
  await withHandoverActivationControls({handover:choice.plan.activation.handover},choice.plan.activation.activation,async controllers=>{
   const path=heldHandoverActivationPath(controllers.path,choice.plan.activation.handover);
   const activation=nativeActivationHostPort(controllers.activation);
   let scope=new AbortController();
   let inspections=0,phase='prepared';
   const journal={
    check:target.check,revocations:[target.revoked],
    async observeNativeStarted(guard){phase=(await target.markRequestStarted(guard)).state.phase;},
    async observeNativeReceipt(receipt,guard){phase=(await target.markReceiptObserved(receipt,guard)).state.phase;},
   };
   const confirm=approve=>confirmHeldColdNative(scope,journal,activation,approve,original.check,async()=>{inspections++;},path);
   await assert.rejects(confirm(()=>false),code('asset_adoption_policy'));
   assert.equal(inspections,1);
   assert.equal(controllers.requests.length,0);
   assert.equal((await target.read()).state.phase,'prepared');

   const put=IDBObjectStore.prototype.put;
   let cancelled=0;
   try{
    IDBObjectStore.prototype.put=function(value,key){
     const request=put.call(this,value,key);
     if(this.transaction.db.name===choice.plan.activation.database&&key==='state'){cancelled++;scope.abort();}
     return request;
    };
    await assert.rejects(confirm(()=>true),code('activation_outcome_unknown'));
   }finally{IDBObjectStore.prototype.put=put;}
   assert.equal(cancelled,1);
   assert.equal((await target.read()).state.phase,'prepared');
   assert.equal(controllers.requests.length,0);
   scope=new AbortController();

   controllers.respond(()=>{
    assert.equal(phase,'request-started');
    throw Error('Test-owned lost activation reply');
   });
   await assert.rejects(confirm(()=>true),code('activation_outcome_unknown'));
   assert.equal((await target.read()).state.phase,'request-started');
   assert.equal(controllers.requests.length,1);

   const receipt={format:'breditor/durable-native-activation-control-receipt',formatVersion:1,
    selection:choice.plan.activation.activation,scope:'actual-held-native-service-only'};
   controllers.respond(()=>new Response(JSON.stringify(receipt),{headers:{'content-type':'application/json'}}));
   assert.deepEqual(await confirm(()=>true),receipt);
   assert.equal((await target.read()).state.phase,'receipt-observed');
   await assert.rejects(confirm(()=>false),code('asset_adoption_policy'));
   assert.equal(controllers.requests.length,2);
   assert.deepEqual(await confirm(()=>true),receipt);
   assert.equal(controllers.requests.length,3);
   assert.equal(inspections,10);
  });
  assert.deepEqual(await databaseByteSnapshot(encoding.choice.database),saved);
 }finally{await target.close();await original.close();}
});
